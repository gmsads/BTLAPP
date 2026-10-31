// src/utils/reportExporter.js
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import { Alert, Platform } from 'react-native';
import API from './api';
import { formatServiceType, getCampaignDayNumber } from './theme';

const escapeHtml = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

const sanitizeFileName = (name) => {
  return String(name || 'Service_Report')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_');
};

const normalizeImageItem = (img) => {
  if (!img) return null;
  if (typeof img === 'string') {
    return {
      url: img,
      locationAddress: '',
      takenAt: null,
      latitude: null,
      longitude: null,
    };
  }
  const url = img.url || img.file_url || '';
  if (!url) return null;
  const lat = img.latitude ?? img.location?.lat ?? img.location?.coordinates?.lat ?? null;
  const lng = img.longitude ?? img.location?.lng ?? img.location?.coordinates?.lng ?? null;
  const locationAddress =
    img.locationAddress ||
    img.simpleAddress ||
    img.location?.address ||
    img.location?.locationName ||
    (lat && lng ? `GPS: ${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}` : '');
  return {
    ...img,
    url,
    latitude: lat,
    longitude: lng,
    locationAddress,
    takenAt: img.takenAt || img.uploadedAt || img.captured_at || img.createdAt || null,
  };
};

const hydrateServicesIfNeeded = async (servicesInput) => {
  const rawList = Array.isArray(servicesInput)
    ? servicesInput.filter(Boolean)
    : servicesInput
    ? [servicesInput]
    : [];

  const hydrated = [];
  for (const srv of rawList) {
    let current = { ...srv };
    const imgs = Array.isArray(current.images) ? current.images : [];
    const hasMissingAddr = imgs.some(
      (i) =>
        typeof i === 'object' &&
        !i.locationAddress &&
        !i.simpleAddress &&
        !i.location?.address
    );
    const srvId = current.originalServiceId || current._originalId || current._id;
    if ((imgs.length === 0 || hasMissingAddr) && srvId && typeof srvId === 'string' && !srvId.includes('_')) {
      try {
        const res = await API.get(`/services/${srvId}`);
        const fullSrv = res.data?.service || res.data;
        if (fullSrv) {
          if (
            current.isMultiService &&
            current.serviceIndex !== undefined &&
            current.serviceIndex !== null &&
            Array.isArray(fullSrv.services) &&
            fullSrv.services[current.serviceIndex]
          ) {
            const sub = fullSrv.services[current.serviceIndex];
            const parentMatched = (fullSrv.images || []).filter(
              (i) =>
                (i.itemId && sub._id && String(i.itemId) === String(sub._id)) ||
                (i.serviceIndex !== undefined &&
                  i.serviceIndex !== null &&
                  Number(i.serviceIndex) === Number(current.serviceIndex))
            );
            const enrichedSub = (sub.images || [])
              .filter(Boolean)
              .map((sImg) => {
                const match = (fullSrv.images || []).find(
                  (p) =>
                    (p.public_id && sImg.public_id && p.public_id === sImg.public_id) ||
                    (p.url && sImg.url && p.url === sImg.url)
                );
                return match ? { ...sImg, ...match } : sImg;
              });
            const subImgs = [...parentMatched, ...enrichedSub].filter(
              (img, i, arr) =>
                arr.findIndex(
                  (t) =>
                    (t.public_id && t.public_id === img.public_id) ||
                    (t.url && t.url === img.url)
                ) === i
            );
            current.images = subImgs.length > 0 ? subImgs : fullSrv.images || imgs;
          } else {
            current.images = fullSrv.images || imgs;
          }
          if (!current.meterReadings && fullSrv.meterReadings) {
            current.meterReadings = fullSrv.meterReadings;
          }
        }
      } catch (e) {
        // continue with local data
      }
    }
    hydrated.push(current);
  }
  return hydrated;
};

const openHtmlPrintOnWeb = (html) => {
  if (typeof window !== 'undefined') {
    const printWin = window.open('', '_blank');
    if (printWin) {
      printWin.document.open();
      printWin.document.write(html);
      printWin.document.close();
      printWin.focus();
      setTimeout(() => {
        printWin.print();
      }, 600);
      return true;
    }
  }
  return false;
};

/**
 * Writes a base64 file into Expo's scoped cache/document directory using the modern
 * expo-file-system File API (and legacy fallback), shares/previews it, and seamlessly
 * falls back to native Print.printAsync (Save as PDF) so Expo Go never throws
 * 'ExpoSharing.shareAsync: Not allowed to read file under given URL'.
 */
const saveAndShareBase64File = async ({
  base64,
  fileName,
  mimeType,
  uti,
  dialogTitle,
  fallbackHtml,
}) => {
  if (base64) {
    // 1. Try modern expo-file-system File in Paths.cache / Paths.document
    try {
      if (File && Paths?.cache) {
        const targetFile = new File(Paths.cache, fileName);
        if (targetFile.exists) {
          targetFile.delete();
        }
        targetFile.create({ overwrite: true });
        targetFile.write(base64, { encoding: 'base64' });

        try {
          const canShare = await Sharing.isAvailableAsync();
          if (canShare) {
            await Sharing.shareAsync(targetFile.uri, {
              mimeType,
              dialogTitle: dialogTitle || `Download ${fileName}`,
              UTI: uti,
            });
            return true;
          }
        } catch (modernShareErr) {
          // Try built-in FileSystemFile.preview() which uses FileSystemProvider contentUri directly
          if (typeof targetFile.preview === 'function') {
            try {
              await targetFile.preview({ mimeType });
              return true;
            } catch (previewErr) {
              // continue to fallback
            }
          }
        }
      }
    } catch (fsErr) {
      // continue to legacy / print fallback
    }

    // 2. Try legacy documentDirectory / cacheDirectory
    try {
      const baseDir = LegacyFileSystem.cacheDirectory || LegacyFileSystem.documentDirectory;
      if (baseDir) {
        const safeFileUri = `${baseDir}${fileName}`;
        await LegacyFileSystem.writeAsStringAsync(safeFileUri, base64, {
          encoding: LegacyFileSystem.EncodingType?.Base64 || 'base64',
        });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(safeFileUri, {
            mimeType,
            dialogTitle: dialogTitle || `Download ${fileName}`,
            UTI: uti,
          });
          return true;
        }
      }
    } catch (legacyShareErr) {
      // Handled silently — fall back to native system Print / Save as PDF dialog below
    }
  }

  // 3. Guaranteed native system Print / Save as PDF dialog (never uses ExpoSharing)
  if (fallbackHtml) {
    await Print.printAsync({ html: fallbackHtml });
    return true;
  }
  return false;
};

export const exportServiceReportPDF = async (servicesInput, title = 'BTL_Campaign_Report') => {
  try {
    const servicesList = await hydrateServicesIfNeeded(servicesInput);
    if (servicesList.length === 0) {
      Alert.alert('No Data', 'No campaign data available to export.');
      return;
    }

    let sectionsHtml = '';

    servicesList.forEach((service, idx) => {
      const sTitle = formatServiceType(service.serviceType, service.customServiceType);
      const startStr = service.startDate ? new Date(service.startDate).toLocaleDateString() : 'N/A';
      const endStr =
        service.endDate || service.deliveryDate
          ? new Date(service.endDate || service.deliveryDate).toLocaleDateString()
          : 'N/A';
      const addressStr =
        typeof service.location === 'string'
          ? service.location
          : service.serviceLocation?.address ||
            service.location?.address ||
            service.primaryLocation?.address ||
            'Not specified';

      const images = (Array.isArray(service.images) ? service.images : [])
        .map(normalizeImageItem)
        .filter(Boolean);
      const readings = Array.isArray(service.meterReadings)
        ? service.meterReadings
        : Array.isArray(service.dailyStats)
        ? service.dailyStats
        : [];

      let readingsHtml = '';
      if (readings.length > 0) {
        readingsHtml = `
          <h4 style="color:#0151ba; margin:14px 0 8px 0;">Odometer / Meter Readings</h4>
          <table style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:14px;">
            <thead>
              <tr style="background:#0151ba; color:#fff;">
                <th style="padding:6px; border:1px solid #cbd5e1;">Day</th>
                <th style="padding:6px; border:1px solid #cbd5e1;">Date</th>
                <th style="padding:6px; border:1px solid #cbd5e1;">Start (km)</th>
                <th style="padding:6px; border:1px solid #cbd5e1;">End (km)</th>
                <th style="padding:6px; border:1px solid #cbd5e1;">Distance</th>
              </tr>
            </thead>
            <tbody>
              ${readings
                .map((r, rIdx) => {
                  const dist =
                    r.totalDistance !== undefined
                      ? Number(r.totalDistance) || 0
                      : Math.max(0, (Number(r.endReading) || 0) - (Number(r.startReading) || 0));
                  return `
                    <tr>
                      <td style="padding:6px; border:1px solid #cbd5e1; text-align:center;">Day ${
                        r.dayNumber || rIdx + 1
                      }</td>
                      <td style="padding:6px; border:1px solid #cbd5e1; text-align:center;">${
                        r.date ? new Date(r.date).toLocaleDateString() : '-'
                      }</td>
                      <td style="padding:6px; border:1px solid #cbd5e1; text-align:center;">${
                        r.startReading ?? '-'
                      }</td>
                      <td style="padding:6px; border:1px solid #cbd5e1; text-align:center;">${
                        r.endReading ?? '-'
                      }</td>
                      <td style="padding:6px; border:1px solid #cbd5e1; text-align:center; font-weight:bold;">${dist.toFixed(
                        1
                      )} km</td>
                    </tr>
                  `;
                })
                .join('')}
            </tbody>
          </table>
        `;
      }

      let imagesHtml = '';
      if (images.length > 0) {
        imagesHtml = `
          <h4 style="color:#0151ba; margin:14px 0 8px 0;">Campaign Proof Photos (${images.length})</h4>
          <div style="display:flex; flex-wrap:wrap; gap:12px;">
            ${images
              .map((img, iIdx) => {
                const dayNum = service.startDate
                  ? getCampaignDayNumber(img.takenAt, service.startDate)
                  : img.dayNumber || iIdx + 1;
                const locText = escapeHtml(img.locationAddress || addressStr);
                const dateText = img.takenAt ? new Date(img.takenAt).toLocaleString() : '';
                return `
                  <div style="width:47%; border:1px solid #e2e8f0; border-radius:8px; padding:8px; box-sizing:border-box; page-break-inside:avoid; margin-bottom:8px;">
                    <div style="position:relative; width:100%; height:185px; border-radius:6px; overflow:hidden; background:#f1f5f9;">
                      <img src="${escapeHtml(img.url)}" onerror="this.style.opacity='0.2'" style="width:100%; height:185px; object-fit:cover;" />
                      ${
                        locText
                          ? `<div style="position:absolute; bottom:0; left:0; right:0; background:rgba(0,0,0,0.74); color:#fff; font-size:9px; padding:4px 6px; border-left:3px solid #f2c43b; text-align:left;">📍 ${locText}</div>`
                          : ''
                      }
                    </div>
                    <div style="font-size:11px; color:#1e293b; font-weight:bold; margin-top:6px;">
                      Photo #${iIdx + 1} (Day ${dayNum})
                    </div>
                    ${
                      dateText
                        ? `<div style="font-size:10px; color:#64748b; margin-top:2px;">🕒 ${escapeHtml(
                            dateText
                          )}</div>`
                        : ''
                    }
                    ${
                      locText
                        ? `<div style="font-size:10px; color:#0151ba; margin-top:2px;">📍 ${locText}</div>`
                        : ''
                    }
                  </div>
                `;
              })
              .join('')}
          </div>
        `;
      } else {
        imagesHtml = `<p style="font-size:12px; color:#64748b;">No proof images uploaded yet.</p>`;
      }

      const statusText = service.itemStatus || service.status || 'pending';

      sectionsHtml += `
        <div style="border:2px solid #0151ba; border-radius:10px; padding:16px; margin-bottom:24px; page-break-inside:avoid;">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #f2c43b; padding-bottom:10px; margin-bottom:12px;">
            <div>
              <div style="font-size:11px; color:#64748b; text-transform:uppercase;">Campaign #${idx + 1}</div>
              <h2 style="margin:2px 0; color:#0151ba; font-size:18px;">${escapeHtml(
                service.businessName || 'Client'
              )} — ${escapeHtml(sTitle)}</h2>
            </div>
            <span style="background:#0151ba; color:#fff; padding:4px 12px; border-radius:14px; font-size:11px; text-transform:uppercase;">
              ${escapeHtml(statusText)}
            </span>
          </div>
          <div style="font-size:12px; color:#334155; line-height:1.6;">
            <div><strong>Owner / Contact:</strong> ${escapeHtml(service.ownerName || '-')} (${escapeHtml(
        service.contactNumber || '-'
      )})</div>
            <div><strong>Requirement:</strong> ${escapeHtml(sTitle)} (${service.quantity || 1} units)</div>
            <div><strong>Description:</strong> ${escapeHtml(
              service.description || service.notes || '-'
            )}</div>
            <div><strong>Location:</strong> ${escapeHtml(addressStr)}</div>
            <div><strong>Duration:</strong> ${escapeHtml(startStr)} to ${escapeHtml(endStr)}</div>
          </div>
          ${readingsHtml}
          ${imagesHtml}
        </div>
      `;
    });

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(title)}</title>
          <style>
            @page { size: A4 portrait; margin: 14mm; }
            body { font-family: Arial, Helvetica, sans-serif; padding: 10px; color: #1e293b; margin: 0; }
          </style>
        </head>
        <body>
          <div style="background: linear-gradient(135deg, #0151ba, #003a8c); color: white; padding: 18px 24px; border-radius: 10px; margin-bottom: 20px;">
            <h1 style="margin: 0; font-size: 22px;">GMS — BTL Marketing Campaign PDF Report</h1>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #fde68a;">
              Generated on ${new Date().toLocaleString()} • ${servicesList.length} Campaign Item(s)
            </p>
          </div>
          ${sectionsHtml}
        </body>
      </html>
    `;

    if (Platform.OS === 'web') {
      if (!openHtmlPrintOnWeb(html)) {
        await Print.printAsync({ html });
      }
      return;
    }

    const fileName = `${sanitizeFileName(title)}_Service_Report.pdf`;
    try {
      const printRes = await Print.printToFileAsync({ html, base64: true });
      await saveAndShareBase64File({
        base64: printRes.base64,
        fileName,
        mimeType: 'application/pdf',
        uti: 'com.adobe.pdf',
        dialogTitle: `Download ${fileName}`,
        fallbackHtml: html,
      });
    } catch (innerErr) {
      await Print.printAsync({ html });
    }
  } catch (error) {
    console.error('PDF export error:', error);
    Alert.alert('Export Error', error.message || 'Could not generate PDF report');
  }
};

export const exportServiceReportPPT = async (servicesInput, title = 'BTL_Presentation') => {
  try {
    const servicesList = await hydrateServicesIfNeeded(servicesInput);
    if (servicesList.length === 0) {
      Alert.alert('No Data', 'No campaign data available to generate presentation.');
      return;
    }

    // Build fallback/web widescreen presentation HTML matching documentGenerator.js generatePPT
    let slidesHtml = '';

    servicesList.forEach((service) => {
      const bizName = service.businessName || title || 'Service Report';
      const sTitle = formatServiceType(service.serviceType, service.customServiceType);
      const addressStr =
        typeof service.location === 'string'
          ? service.location
          : service.serviceLocation?.address ||
            service.location?.address ||
            service.primaryLocation?.address ||
            'Location Recorded';
      const images = (Array.isArray(service.images) ? service.images : [])
        .map(normalizeImageItem)
        .filter(Boolean);

      slidesHtml += `
        <div class="slide">
          <div style="text-align:center; padding-top:60px;">
            <div style="font-size:34px; font-weight:800; color:#0151ba; letter-spacing:1px;">GMS</div>
            <div style="font-size:38px; font-weight:800; color:#0f172a; margin-top:28px;">${escapeHtml(
              bizName
            )} — ${escapeHtml(sTitle)}</div>
            <div style="font-size:20px; color:#475569; margin-top:22px;">
              Service Report - ${new Date().toLocaleDateString()}
            </div>
            <div style="font-size:16px; color:#0151ba; margin-top:14px; font-weight:600;">
              📍 ${escapeHtml(addressStr)}
            </div>
            <div style="font-size:18px; color:#64748b; margin-top:20px;">
              Total Images: ${images.length} | Quantity: ${service.quantity || 1}
            </div>
          </div>
        </div>
      `;

      const imagesPerSlide = 2;
      const totalPhotoSlides = Math.max(1, Math.ceil(images.length / imagesPerSlide));

      if (images.length === 0) {
        slidesHtml += `
          <div class="slide">
            <div class="slide-header">
              <span style="color:#0151ba; font-weight:800; font-size:16px;">GMS</span>
              <span style="font-weight:700; font-size:18px; color:#0f172a;">${escapeHtml(
                bizName
              )} — ${escapeHtml(sTitle)}</span>
              <span style="font-size:13px; color:#64748b;">Slide 1 of 1</span>
            </div>
            <div style="display:flex; height:380px; align-items:center; justify-content:center; color:#64748b; font-size:18px;">
              No proof images uploaded yet for this service.
            </div>
          </div>
        `;
      } else {
        for (let sIdx = 0; sIdx < totalPhotoSlides; sIdx++) {
          const slidePhotos = images.slice(sIdx * imagesPerSlide, (sIdx + 1) * imagesPerSlide);
          slidesHtml += `
            <div class="slide">
              <div class="slide-header">
                <span style="color:#0151ba; font-weight:800; font-size:16px;">GMS</span>
                <span style="font-weight:700; font-size:18px; color:#0f172a;">${escapeHtml(
                  bizName
                )} - Page ${sIdx + 1} of ${totalPhotoSlides}</span>
                <span style="font-size:12px; color:#64748b;">${new Date().toLocaleDateString()}</span>
              </div>
              <div style="display:flex; flex-direction:row; gap:20px; justify-content:center; align-items:stretch; margin-top:14px;">
                ${slidePhotos
                  .map((photo, pIdx) => {
                    const globalIdx = sIdx * imagesPerSlide + pIdx + 1;
                    const locText = escapeHtml(photo.locationAddress || addressStr);
                    const dateText = photo.takenAt ? new Date(photo.takenAt).toLocaleString() : '';
                    return `
                      <div style="width:48%; border:1px solid #cbd5e1; border-radius:10px; padding:10px; background:#f8fafc; box-sizing:border-box; text-align:center;">
                        <div style="position:relative; width:100%; height:310px; border-radius:8px; overflow:hidden; background:#0f172a;">
                          <img src="${escapeHtml(
                            photo.url
                          )}" onerror="this.style.opacity='0.2'" style="width:100%; height:310px; object-fit:contain;" />
                          ${
                            locText
                              ? `<div style="position:absolute; bottom:0; left:0; right:0; background:rgba(0,0,0,0.75); color:#fff; font-size:10px; padding:5px 8px; border-left:3px solid #f2c43b; text-align:left;">📍 ${locText}</div>`
                              : ''
                          }
                        </div>
                        <div style="font-size:13px; font-weight:800; color:#0f172a; margin-top:8px;">
                          Image ${globalIdx}
                        </div>
                        ${
                          locText
                            ? `<div style="font-size:11px; color:#0151ba; font-weight:600; margin-top:3px;">📍 ${locText}</div>`
                            : ''
                        }
                        ${
                          dateText
                            ? `<div style="font-size:10px; color:#64748b; margin-top:2px;">📅 ${escapeHtml(
                                dateText
                              )}</div>`
                            : ''
                        }
                      </div>
                    `;
                  })
                  .join('')}
              </div>
            </div>
          `;
        }
      }
    });

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(title)}_Presentation</title>
          <style>
            @page { size: 13.33in 7.5in; margin: 0; }
            body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 0; background: #ffffff; color: #0f172a; }
            .slide {
              width: 100%;
              height: 520px;
              box-sizing: border-box;
              padding: 24px 32px;
              page-break-after: always;
              border-bottom: 4px solid #f2c43b;
            }
            .slide-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 2px solid #0151ba;
              padding-bottom: 8px;
            }
          </style>
        </head>
        <body>
          ${slidesHtml}
        </body>
      </html>
    `;

    // 1. Try generating real .pptx via backend /services/:id/export-ppt first
    const firstSrv = servicesList[0];
    const srvId = firstSrv?.originalServiceId || firstSrv?._originalId || firstSrv?._id;
    if (srvId && typeof srvId === 'string' && !srvId.includes('_')) {
      try {
        const res = await API.post(`/services/${srvId}/export-ppt`, {
          returnBase64: true,
          serviceIndex: firstSrv?.isMultiService ? firstSrv?.serviceIndex : undefined,
        });
        if (res.data?.success && res.data?.base64) {
          const pptxFileName =
            res.data.filename || `${sanitizeFileName(title)}_Presentation.pptx`;
          if (Platform.OS === 'web' && typeof document !== 'undefined') {
            const link = document.createElement('a');
            link.href = `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${res.data.base64}`;
            link.download = pptxFileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            return;
          }
          const shared = await saveAndShareBase64File({
            base64: res.data.base64,
            fileName: pptxFileName,
            mimeType:
              'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            uti: 'org.openxmlformats.presentationml.presentation',
            dialogTitle: `Download ${pptxFileName}`,
            fallbackHtml: null,
          });
          if (shared) return;
        }
      } catch (pptBackendErr) {
        console.warn('Backend PPTX note, using local slide export:', pptBackendErr.message);
      }
    }

    if (Platform.OS === 'web') {
      if (!openHtmlPrintOnWeb(html)) {
        await Print.printAsync({ html });
      }
      return;
    }

    // 2. Local widescreen presentation export written into scoped documentDirectory
    const fallbackFileName = `${sanitizeFileName(title)}_Presentation.pdf`;
    try {
      const printRes = await Print.printToFileAsync({
        html,
        width: 960,
        height: 540,
        base64: true,
      });
      await saveAndShareBase64File({
        base64: printRes.base64,
        fileName: fallbackFileName,
        mimeType: 'application/pdf',
        uti: 'com.adobe.pdf',
        dialogTitle: `Download ${fallbackFileName}`,
        fallbackHtml: html,
      });
    } catch (innerErr) {
      await Print.printAsync({ html });
    }
  } catch (error) {
    console.error('PPT export error:', error);
    Alert.alert('Export Error', error.message || 'Could not generate PPT presentation');
  }
};

export const exportServiceReport = (service, format = 'PDF') => {
  const cleanTitle = service?.businessName || 'Service_Report';
  if (String(format).toUpperCase() === 'PPT') {
    return exportServiceReportPPT(service, cleanTitle);
  }
  return exportServiceReportPDF(service, cleanTitle);
};
