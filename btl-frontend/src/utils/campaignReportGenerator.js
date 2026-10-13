// utils/campaignReportGenerator.js
import jsPDF from 'jspdf';
import PPTX from 'pptxgenjs';

// Helper function to resolve absolute URL
const getAbsoluteUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('data:')) return url;
  
  let targetUrl = url;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    const cleanPath = url.startsWith('/') ? url.substring(1) : url;
    targetUrl = `http://localhost:5002/${cleanPath}`;
  }
  
  return `http://localhost:5002/api/services/proxy-image?url=${encodeURIComponent(targetUrl)}`;
};

// Helper function to load image for PDF
const loadImage = (url) => {
  return new Promise((resolve, reject) => {
    const absoluteUrl = getAbsoluteUrl(url);
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => {
      console.error(`Failed to load image at: ${absoluteUrl}`, err);
      reject(err);
    };
    img.src = absoluteUrl;
  });
};

// Helper function to fetch image as Base64 for PPT with better handling
const fetchImageAsBase64 = async (url) => {
  try {
    const absoluteUrl = getAbsoluteUrl(url);
    console.log('Fetching image for PPT:', absoluteUrl);
    
    const response = await fetch(absoluteUrl, {
      mode: 'cors',
      headers: {
        'Accept': 'image/*'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        const match = result.match(/^data:image\/([a-z]+);base64,/);
        const type = match ? match[1] : 'jpg';
        resolve({ 
          data: result, 
          type: type === 'jpeg' ? 'jpg' : type 
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error(`Error converting image to Base64:`, error);
    return null;
  }
};

// Campaign duration helper methods
const getCampaignTotalDays = (startDate, endDate) => {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  const diffTime = Math.abs(end - start);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
};

const getCampaignDayNumber = (date, startDate) => {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const current = new Date(date);
  current.setHours(0, 0, 0, 0);
  const diffTime = current - start;
  return Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
};

// Show a styled loader overlay
const showLoader = (text) => {
  const overlay = document.createElement('div');
  overlay.id = 'report-loader-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    padding: 24px 32px;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(1, 81, 186, 0.3);
    z-index: 9999;
    font-size: 16px;
    font-weight: bold;
    color: #0151ba;
    display: flex;
    align-items: center;
    gap: 12px;
    border: 2px solid #f2c43b;
    font-family: Arial, sans-serif;
  `;
  overlay.innerHTML = `
    <span style="font-size: 24px;">📄</span>
    <span id="report-loader-text">${text}</span>
    <div style="
      width: 20px;
      height: 20px;
      border: 3px solid #f2c43b;
      border-top: 3px solid #0151ba;
      border-radius: 50%;
      animation: report-spin 1s linear infinite;
    "></div>
    <style>
      @keyframes report-spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    </style>
  `;
  document.body.appendChild(overlay);
};

const updateLoaderText = (text) => {
  const textEl = document.getElementById('report-loader-text');
  if (textEl) textEl.textContent = text;
};

const hideLoader = () => {
  const overlay = document.getElementById('report-loader-overlay');
  if (overlay) overlay.remove();
};

export const generateCampaignAuditPDF = async (servicesList, businessName) => {
  try {
    if (!servicesList || servicesList.length === 0) {
      alert('No services to export');
      return;
    }

    showLoader('Preparing PDF Generation...');

    // Sort services chronologically by start date
    const sortedServices = [...servicesList].sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - (margin * 2);
    
    let yPosition = margin;
    let pageCount = 1;

    // Helper to draw common page header
    const drawHeader = (titleText) => {
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(1, 81, 186);
      pdf.text(businessName.toUpperCase(), margin, margin);
      
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(100, 100, 100);
      pdf.text(`Audit Report | ${titleText}`, pageWidth / 2, margin, { align: 'center' });
      pdf.text(`Page ${pageCount}`, pageWidth - margin, margin, { align: 'right' });
      
      pdf.setDrawColor(226, 232, 240);
      pdf.line(margin, margin + 2, pageWidth - margin, margin + 2);
    };

    drawHeader('Overview');
    yPosition = margin + 12;

    // Cover / Title Page details
    pdf.setFontSize(22);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(1, 81, 186);
    pdf.text('SERVICES AUDIT REPORT', pageWidth / 2, yPosition + 15, { align: 'center' });
    yPosition += 25;

    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(60, 60, 60);
    pdf.text(`Client Business: ${businessName}`, pageWidth / 2, yPosition, { align: 'center' });
    pdf.text(`Report Date: ${new Date().toLocaleDateString()}`, pageWidth / 2, yPosition + 8, { align: 'center' });
    pdf.text(`Total Campaigns: ${sortedServices.length}`, pageWidth / 2, yPosition + 16, { align: 'center' });
    yPosition += 35;

    // Render list of campaigns on first page
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(1, 81, 186);
    pdf.text('Campaign Timeline Overview:', margin, yPosition);
    yPosition += 8;

    sortedServices.forEach((service, sIdx) => {
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(50, 50, 50);
      const dateStr = service.startDate ? `${new Date(service.startDate).toLocaleDateString()} - ${new Date(service.endDate || service.deliveryDate).toLocaleDateString()}` : 'N/A';
      const typeStr = service.serviceType === 'other' ? service.customServiceType : service.serviceType;
      pdf.text(`${sIdx + 1}. [${dateStr}] ${typeStr.toUpperCase()} (Qty: ${service.quantity || 0})`, margin + 5, yPosition);
      yPosition += 6;
    });

    // Process each service
    for (let sIdx = 0; sIdx < sortedServices.length; sIdx++) {
      const service = sortedServices[sIdx];
      updateLoaderText(`Processing Campaign ${sIdx + 1} of ${sortedServices.length}...`);

      pdf.addPage();
      pageCount++;
      yPosition = margin + 12;
      const serviceTitle = service.serviceType === 'other' ? service.customServiceType : service.serviceType;
      drawHeader(`${serviceTitle.toUpperCase()} Campaign`);

      // Service summary card
      pdf.setFillColor(248, 250, 252);
      pdf.setDrawColor(226, 232, 240);
      pdf.rect(margin, yPosition, contentWidth, 30, 'FD');
      
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(1, 81, 186);
      pdf.text(`CAMPAIGN DETAILS: ${serviceTitle.toUpperCase()}`, margin + 5, yPosition + 6);
      
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(80, 80, 80);
      const dateStr = service.startDate ? `${new Date(service.startDate).toLocaleDateString()} - ${new Date(service.endDate || service.deliveryDate).toLocaleDateString()}` : 'N/A';
      pdf.text(`Duration: ${dateStr}`, margin + 5, yPosition + 13);
      pdf.text(`Target Quantity: ${service.quantity || 0}`, margin + 5, yPosition + 19);
      pdf.text(`Status: ${(service.status || 'pending').toUpperCase()}`, margin + 5, yPosition + 25);
      
      if (service.location?.address) {
        pdf.text(`Location: ${service.location.address.substring(0, 50)}...`, pageWidth / 2, yPosition + 13);
      }
      yPosition += 38;

      // Group images and meter readings
      const hasCampaign = service.startDate && (service.endDate || service.deliveryDate);
      if (!hasCampaign) {
        // Non-campaign/static service: render normal images list
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(1, 81, 186);
        pdf.text('Uploaded Images:', margin, yPosition);
        yPosition += 8;

        const photos = service.images || [];
        if (photos.length === 0) {
          pdf.setFont('helvetica', 'italic');
          pdf.setFontSize(10);
          pdf.text('No campaign photos uploaded.', margin + 5, yPosition);
          yPosition += 8;
        } else {
          // Render in 2 columns
          const cellWidth = contentWidth / 2;
          const cellHeight = 70;
          for (let pIdx = 0; pIdx < photos.length; pIdx += 2) {
            if (yPosition + cellHeight > pageHeight - margin) {
              pdf.addPage();
              pageCount++;
              yPosition = margin + 12;
              drawHeader(serviceTitle.toUpperCase());
            }

            const rowPhotos = photos.slice(pIdx, pIdx + 2);
            for (let c = 0; c < rowPhotos.length; c++) {
              const photo = rowPhotos[c];
              const x = margin + (c * cellWidth) + 3;
              try {
                const img = await loadImage(photo.url);
                pdf.addImage(img, 'JPEG', x, yPosition, cellWidth - 6, cellHeight - 15);
              } catch (e) {
                pdf.setDrawColor(220, 220, 220);
                pdf.setFillColor(245, 245, 245);
                pdf.rect(x, yPosition, cellWidth - 6, cellHeight - 15, 'FD');
                pdf.setFontSize(8);
                pdf.text('Image Not Available', x + (cellWidth - 6)/2, yPosition + (cellHeight - 15)/2, { align: 'center' });
              }
              pdf.setFontSize(8);
              pdf.setFont('helvetica', 'normal');
              pdf.setTextColor(80, 80, 80);
              pdf.text(photo.caption || `Image ${pIdx + c + 1}`, x + (cellWidth - 6)/2, yPosition + cellHeight - 10, { align: 'center' });
            }
            yPosition += cellHeight;
          }
        }
      } else {
        // Campaign duration service: Render day-wise
        const totalDays = getCampaignTotalDays(service.startDate, service.endDate || service.deliveryDate);
        let serviceTotalImages = 0;

        for (let d = 1; d <= totalDays; d++) {
          // Filter photos and reading for this day
          const dayPhotos = (service.images || []).filter(img => getCampaignDayNumber(img.takenAt || img.uploadedAt || img.createdAt, service.startDate) === d);
          const dayReading = (service.meterReadings || []).find(r => r.dayNumber === d || getCampaignDayNumber(r.date, service.startDate) === d);

          // Header safety check
          if (yPosition > pageHeight - 50) {
            pdf.addPage();
            pageCount++;
            yPosition = margin + 12;
            drawHeader(serviceTitle.toUpperCase());
          }

          // Day divider
          pdf.setFillColor(241, 245, 249);
          pdf.rect(margin, yPosition, contentWidth, 8, 'F');
          pdf.setFontSize(10);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(15, 23, 42);
          pdf.text(`DAY ${d}`, margin + 5, yPosition + 6);
          yPosition += 12;

          // Render meter reading details if exists
          if (dayReading) {
            pdf.setFontSize(9);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(1, 81, 186);
            pdf.text(`Meter Log: Start ${dayReading.startReading} KM - End ${dayReading.endReading} KM (Distance: ${(dayReading.endReading - dayReading.startReading).toFixed(2)} km)`, margin + 5, yPosition);
            yPosition += 6;
          }

          // Gather images of this day (both campaign photos and meter reading photo)
          const allDayImages = [];
          if (dayReading && dayReading.image?.url) {
            allDayImages.push({
              url: dayReading.image.url,
              caption: `[Meter Reading Proof] ${dayReading.startReading}-${dayReading.endReading} KM`,
              isReading: true
            });
            serviceTotalImages++;
          }
          dayPhotos.forEach(p => {
            allDayImages.push({
              url: p.url,
              caption: p.caption || 'Campaign Photo',
              isReading: false
            });
            serviceTotalImages++;
          });

          if (allDayImages.length === 0) {
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(9);
            pdf.setTextColor(120, 120, 120);
            pdf.text('No photos uploaded for this day.', margin + 5, yPosition);
            yPosition += 8;
          } else {
            // Render in 2 columns
            const cellWidth = contentWidth / 2;
            const cellHeight = 70;

            for (let imgIdx = 0; imgIdx < allDayImages.length; imgIdx += 2) {
              if (yPosition + cellHeight > pageHeight - margin) {
                pdf.addPage();
                pageCount++;
                yPosition = margin + 12;
                drawHeader(serviceTitle.toUpperCase());
              }

              const rowImages = allDayImages.slice(imgIdx, imgIdx + 2);
              for (let colIdx = 0; colIdx < rowImages.length; colIdx++) {
                const photo = rowImages[colIdx];
                const x = margin + (colIdx * cellWidth) + 3;

                try {
                  const img = await loadImage(photo.url);
                  pdf.addImage(img, 'JPEG', x, yPosition, cellWidth - 6, cellHeight - 15);
                } catch (e) {
                  pdf.setDrawColor(220, 220, 220);
                  pdf.setFillColor(245, 245, 245);
                  pdf.rect(x, yPosition, cellWidth - 6, cellHeight - 15, 'FD');
                  pdf.setFontSize(8);
                  pdf.setTextColor(150, 150, 150);
                  pdf.text('Image Not Available', x + (cellWidth - 6)/2, yPosition + (cellHeight - 15)/2, { align: 'center' });
                }

                // Caption text wrapping
                pdf.setFontSize(7);
                pdf.setFont('helvetica', photo.isReading ? 'bold' : 'normal');
                if (photo.isReading) {
                  pdf.setTextColor(1, 81, 186);
                } else {
                  pdf.setTextColor(80, 80, 80);
                }
                const captionLines = pdf.splitTextToSize(photo.caption, cellWidth - 10);
                pdf.text(captionLines, x + (cellWidth - 6)/2, yPosition + cellHeight - 11, { align: 'center' });
              }
              yPosition += cellHeight;
            }
          }
          yPosition += 5;
        }

        // Service summary section
        if (yPosition > pageHeight - 30) {
          pdf.addPage();
          pageCount++;
          yPosition = margin + 12;
          drawHeader(serviceTitle.toUpperCase());
        }
        pdf.setFillColor(248, 250, 252);
        pdf.setDrawColor(1, 81, 186);
        pdf.rect(margin, yPosition, contentWidth, 12, 'FD');
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(1, 81, 186);
        pdf.text(`TOTAL CAMPAIGN IMAGES EXPORTED: ${serviceTotalImages}`, margin + 5, yPosition + 8);
        yPosition += 20;
      }
    }

    hideLoader();
    pdf.save(`AuditReport_${businessName.replace(/\s+/g, '_')}.pdf`);
  } catch (error) {
    hideLoader();
    console.error('Failed to generate audit PDF:', error);
    alert(`Error generating PDF: ${error.message}`);
  }
};

export const generateCampaignAuditPPT = async (servicesList, businessName) => {
  try {
    if (!servicesList || servicesList.length === 0) {
      alert('No services to export');
      return;
    }

    showLoader('Preparing PPT Generation...');

    const sortedServices = [...servicesList].sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

    const pptx = new PPTX();
    pptx.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 });
    pptx.layout = 'WIDE';

    // Slide 1: Cover slide
    const coverSlide = pptx.addSlide();
    coverSlide.background = { fill: '0151BA' };
    coverSlide.addText('SERVICES AUDIT REPORT', {
      x: 0.5,
      y: 1.5,
      w: 12.33,
      h: 1.5,
      fontSize: 40,
      bold: true,
      color: 'F2C43B'
    });
    coverSlide.addText(`Client Business: ${businessName.toUpperCase()}`, {
      x: 0.5,
      y: 3.5,
      w: 12.33,
      h: 1.0,
      fontSize: 24,
      color: 'FFFFFF'
    });
    coverSlide.addText(`Generated: ${new Date().toLocaleDateString()}`, {
      x: 0.5,
      y: 4.5,
      w: 12.33,
      h: 0.8,
      fontSize: 18,
      color: 'E2E8F0'
    });

    // Process each service
    for (let sIdx = 0; sIdx < sortedServices.length; sIdx++) {
      const service = sortedServices[sIdx];
      const serviceTitle = service.serviceType === 'other' ? service.customServiceType : service.serviceType;
      updateLoaderText(`Processing PPT Campaign ${sIdx + 1} of ${sortedServices.length}...`);

      // Campaign Divider Slide
      const dividerSlide = pptx.addSlide();
      dividerSlide.background = { fill: 'F8FAFC' };
      dividerSlide.addText(serviceTitle.toUpperCase(), {
        x: 0.5,
        y: 2.0,
        w: 12.33,
        h: 1.2,
        fontSize: 44,
        bold: true,
        color: '0151BA',
        align: 'center'
      });
      
      const dateStr = service.startDate ? `${new Date(service.startDate).toLocaleDateString()} - ${new Date(service.endDate || service.deliveryDate).toLocaleDateString()}` : 'N/A';
      dividerSlide.addText(`Duration: ${dateStr}  |  Quantity: ${service.quantity || 0}  |  Status: ${(service.status || 'pending').toUpperCase()}`, {
        x: 0.5,
        y: 3.5,
        w: 12.33,
        h: 0.6,
        fontSize: 18,
        color: '64748B',
        align: 'center'
      });
      dividerSlide.addText(businessName.toUpperCase(), {
        x: 0.5,
        y: 4.3,
        w: 12.33,
        h: 0.5,
        fontSize: 16,
        color: '94A3B8',
        align: 'center'
      });

      const hasCampaign = service.startDate && (service.endDate || service.deliveryDate);
      if (!hasCampaign) {
        // Flat slides for static service
        const photos = service.images || [];
        const imagesPerSlide = 2;
        const totalSlides = Math.ceil(photos.length / imagesPerSlide);

        for (let slideIdx = 0; slideIdx < totalSlides; slideIdx++) {
          const slide = pptx.addSlide();
          slide.background = { fill: 'FFFFFF' };
          
          slide.addText(`${serviceTitle.toUpperCase()} - ${businessName.toUpperCase()}`, {
            x: 0.5,
            y: 0.2,
            w: 12.33,
            h: 0.6,
            fontSize: 20,
            bold: true,
            color: '0151BA',
            align: 'center'
          });

          const startIndex = slideIdx * imagesPerSlide;
          const endIndex = Math.min(startIndex + imagesPerSlide, photos.length);
          const slidePhotos = photos.slice(startIndex, endIndex);

          // Smaller positions with more padding
          const positions = [
            { x: 1.0, y: 1.2, w: 5.0, h: 4.5 },
            { x: 7.0, y: 1.2, w: 5.0, h: 4.5 }
          ];

          for (let i = 0; i < slidePhotos.length; i++) {
            const photo = slidePhotos[i];
            const pos = positions[i];

            // Background frame with extra padding
            const framePadding = 0.15;
            slide.addShape(pptx.ShapeType.rect, {
              x: pos.x - framePadding,
              y: pos.y - framePadding,
              w: pos.w + (framePadding * 2),
              h: pos.h + (framePadding * 2),
              fill: { color: 'F8F9FA' },
              line: { color: 'CBD5E1', width: 1 }
            });

            // Inner image with more padding
            const innerPadding = 0.25;
            const base64Data = await fetchImageAsBase64(photo.url);
            if (base64Data) {
              slide.addImage({
                data: base64Data.data,
                type: base64Data.type || 'jpg',
                x: pos.x + innerPadding,
                y: pos.y + innerPadding,
                w: pos.w - (innerPadding * 2),
                h: pos.h - (innerPadding * 2),
                sizing: { 
                  type: 'contain', 
                  w: pos.w - (innerPadding * 2), 
                  h: pos.h - (innerPadding * 2) 
                }
              });
            } else {
              slide.addText('Image Not Available', {
                x: pos.x,
                y: pos.y + pos.h / 2 - 0.25,
                w: pos.w,
                h: 0.5,
                fontSize: 14,
                color: '64748B',
                align: 'center',
                valign: 'middle'
              });
            }

            // Caption below image
            slide.addText(photo.caption || 'Campaign Photo', {
              x: pos.x,
              y: pos.y + pos.h + 0.2,
              w: pos.w,
              h: 0.4,
              fontSize: 11,
              align: 'center',
              color: '1E293B',
              bold: true
            });
          }
        }
      } else {
        // Group and render day-wise slides
        const totalDays = getCampaignTotalDays(service.startDate, service.endDate || service.deliveryDate);
        let serviceTotalImages = 0;

        for (let d = 1; d <= totalDays; d++) {
          const dayPhotos = (service.images || []).filter(img => getCampaignDayNumber(img.takenAt || img.uploadedAt || img.createdAt, service.startDate) === d);
          const dayReading = (service.meterReadings || []).find(r => r.dayNumber === d || getCampaignDayNumber(r.date, service.startDate) === d);

          // Gather images of this day
          const allDayImages = [];
          if (dayReading && dayReading.image?.url) {
            allDayImages.push({
              url: dayReading.image.url,
              caption: `📊 Meter Reading: ${dayReading.startReading}-${dayReading.endReading} KM`,
              isReading: true
            });
            serviceTotalImages++;
          }
          dayPhotos.forEach(p => {
            allDayImages.push({
              url: p.url,
              caption: p.caption || 'Campaign Photo',
              isReading: false
            });
            serviceTotalImages++;
          });

          if (allDayImages.length === 0) {
            const slide = pptx.addSlide();
            slide.background = { fill: 'FFFFFF' };
            
            slide.addText(`${serviceTitle.toUpperCase()} - DAY ${d}`, {
              x: 0.5,
              y: 0.2,
              w: 12.33,
              h: 0.6,
              fontSize: 22,
              bold: true,
              color: '0151BA',
              align: 'center'
            });

            slide.addText('No photos uploaded for this day.', {
              x: 0.5,
              y: 2.5,
              w: 12.33,
              h: 1.0,
              fontSize: 18,
              color: '94A3B8',
              align: 'center',
              italic: true
            });
          } else {
            // Render images in slides of 2 images per slide
            const imagesPerSlide = 2;
            const totalSlidesForDay = Math.ceil(allDayImages.length / imagesPerSlide);

            for (let daySlideIdx = 0; daySlideIdx < totalSlidesForDay; daySlideIdx++) {
              const slide = pptx.addSlide();
              slide.background = { fill: 'FFFFFF' };
              
              // Slide Title
              const slideTitle = `${serviceTitle.toUpperCase()} - DAY ${d}`;
              slide.addText(slideTitle, {
                x: 0.5,
                y: 0.2,
                w: 12.33,
                h: 0.6,
                fontSize: 22,
                bold: true,
                color: '0151BA',
                align: 'center'
              });

              const startIndex = daySlideIdx * imagesPerSlide;
              const endIndex = Math.min(startIndex + imagesPerSlide, allDayImages.length);
              const slidePhotos = allDayImages.slice(startIndex, endIndex);

              // Smaller positions with more padding for images
              const positions = [
                { x: 1.0, y: 1.2, w: 5.0, h: 4.5 },
                { x: 7.0, y: 1.2, w: 5.0, h: 4.5 }
              ];

              for (let i = 0; i < slidePhotos.length; i++) {
                const photo = slidePhotos[i];
                const pos = positions[i];

                // Background frame with padding
                const framePadding = 0.15;
                slide.addShape(pptx.ShapeType.rect, {
                  x: pos.x - framePadding,
                  y: pos.y - framePadding,
                  w: pos.w + (framePadding * 2),
                  h: pos.h + (framePadding * 2),
                  fill: { color: 'F8F9FA' },
                  line: { color: photo.isReading ? '0151BA' : 'CBD5E1', width: photo.isReading ? 2 : 1 }
                });

                // Inner image with more padding
                const innerPadding = 0.25;
                const base64Data = await fetchImageAsBase64(photo.url);
                if (base64Data) {
                  slide.addImage({
                    data: base64Data.data,
                    type: base64Data.type || 'jpg',
                    x: pos.x + innerPadding,
                    y: pos.y + innerPadding,
                    w: pos.w - (innerPadding * 2),
                    h: pos.h - (innerPadding * 2),
                    sizing: { 
                      type: 'contain', 
                      w: pos.w - (innerPadding * 2), 
                      h: pos.h - (innerPadding * 2) 
                    }
                  });
                } else {
                  slide.addText('Image Not Available', {
                    x: pos.x,
                    y: pos.y + pos.h / 2 - 0.25,
                    w: pos.w,
                    h: 0.5,
                    fontSize: 14,
                    color: '64748B',
                    align: 'center',
                    valign: 'middle'
                  });
                }

                // Caption with better styling
                const captionColor = photo.isReading ? '0151BA' : '1E293B';
                slide.addText(photo.caption, {
                  x: pos.x,
                  y: pos.y + pos.h + 0.2,
                  w: pos.w,
                  h: 0.4,
                  fontSize: photo.isReading ? 10 : 11,
                  align: 'center',
                  color: captionColor,
                  bold: true
                });
              }
            }
          }
        }
      }
    }

    // Summary Slide
    const summarySlide = pptx.addSlide();
    summarySlide.background = { fill: 'F8FAFC' };
    summarySlide.addText('AUDIT SUMMARY', {
      x: 0.5,
      y: 0.5,
      w: 12.33,
      h: 1.0,
      fontSize: 36,
      bold: true,
      color: '0151BA',
      align: 'center'
    });
    
    let totalCampaigns = sortedServices.length;
    let totalImages = 0;
    sortedServices.forEach(service => {
      if (service.images) totalImages += service.images.length;
      if (service.meterReadings) {
        service.meterReadings.forEach(r => {
          if (r.image?.url) totalImages++;
        });
      }
    });
    
    summarySlide.addText(
      `Client: ${businessName}\n` +
      `Total Campaigns: ${totalCampaigns}\n` +
      `Total Images Documented: ${totalImages}\n` +
      `Report Generated: ${new Date().toLocaleDateString()}\n\n` +
      'GMS - Quality Service Documentation',
      {
        x: 0.5,
        y: 2.0,
        w: 12.33,
        h: 4.0,
        fontSize: 18,
        align: 'center',
        color: '334155'
      }
    );

    hideLoader();
    await pptx.writeFile({ fileName: `AuditReport_${businessName.replace(/\s+/g, '_')}.pptx` });
  } catch (error) {
    hideLoader();
    console.error('Failed to generate audit PPT:', error);
    alert(`Error generating PPT: ${error.message}`);
  }
};