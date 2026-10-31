// src/components/NativeImageUpload.js
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  ActivityIndicator,
  Modal,
  ScrollView,
  Linking,
  AppState,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import API from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { COLORS, getCampaignTotalDays, getCampaignDayNumber } from '../utils/theme';
import { exportServiceReportPDF, exportServiceReport } from '../utils/reportExporter';

export default function NativeImageUpload({
  service: serviceProp,
  serviceId,
  serviceType,
  serviceIndex,
  onImagesAdded,
  onUploadSuccess,
  userRole = 'worker',
}) {
  const { user } = useAuth();
  const effectiveRole = user?.role || userRole;
  const isManager = effectiveRole === 'admin' || effectiveRole === 'owner';

  const rawServiceId =
    serviceProp?.originalServiceId ||
    serviceProp?._originalId ||
    serviceId ||
    serviceProp?._id;
  const effectiveServiceId = rawServiceId
    ? String(rawServiceId).replace(/[_-]\d+$/, '')
    : null;
  const [serviceImages, setServiceImages] = useState(serviceProp?.images || []);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [gpsAddress, setGpsAddress] = useState('');
  const [gpsCoords, setGpsCoords] = useState(null);
  const [isLocationOff, setIsLocationOff] = useState(false);
  const [viewerImage, setViewerImage] = useState(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const hasPromptedOffRef = useRef(false);
  const isLocationOffRef = useRef(false);

  const setLocationOffState = (val) => {
    isLocationOffRef.current = val;
    setIsLocationOff((prev) => (prev === val ? prev : val));
  };

  useEffect(() => {
    if (serviceProp?.images) {
      setServiceImages(serviceProp.images);
    }
  }, [serviceProp]);

  const promptEnableLocation = async (forcePrompt = false) => {
    if (hasPromptedOffRef.current && !forcePrompt) return;
    hasPromptedOffRef.current = true;

    try {
      if (Platform.OS === 'android' && Location.enableNetworkProviderAsync) {
        await Location.enableNetworkProviderAsync();
        await fetchCurrentGps();
        return;
      }
    } catch (e) {
      // fallback to alert
    }
    Alert.alert(
      '📍 Turn ON Your Location',
      'Your device Location (GPS) is OFF. Please turn ON your location — without location enabled, you cannot upload images.',
      [
        { text: 'OK', style: 'cancel' },
        {
          text: 'Open Settings',
          onPress: () => {
            if (Linking.openSettings) Linking.openSettings();
          },
        },
      ]
    );
  };

  const resolveAddressFromCoords = async (latitude, longitude) => {
    // 1. Try native OS geocoder first (fast, reliable, no Nominatim rate limits)
    try {
      const geoList = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (Array.isArray(geoList) && geoList.length > 0) {
        const g = geoList[0];
        const parts = [
          g.name && g.name !== g.street ? g.name : '',
          [g.streetNumber, g.street].filter(Boolean).join(' '),
          g.district || g.subregion || '',
          g.city || '',
          g.region || '',
          g.postalCode || '',
        ].filter(Boolean);
        // Deduplicate adjacent identical parts
        const uniqueParts = parts.filter((item, idx) => parts.indexOf(item) === idx);
        if (uniqueParts.length > 0) {
          return uniqueParts.join(', ');
        }
      }
    } catch (err) {
      // fallback to backend reverse geocode
    }

    // 2. Fallback to backend /geocode/reverse
    try {
      const res = await API.get('/geocode/reverse', {
        params: { lat: latitude, lng: longitude },
      });
      if (res.data?.success && res.data?.data?.display_name) {
        return res.data.data.display_name;
      }
    } catch (e) {
      // ignore
    }

    return `Lat: ${Number(latitude).toFixed(5)}, Lng: ${Number(longitude).toFixed(5)}`;
  };

  useEffect(() => {
    let watcher = null;
    let checkInterval = null;
    let mounted = true;

    const startGpsWatch = async () => {
      await fetchCurrentGps();
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        const enabled = await Location.hasServicesEnabledAsync();
        if (status === 'granted' && enabled && !watcher) {
          watcher = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.High,
              timeInterval: 8000,
              distanceInterval: 5,
            },
            async (pos) => {
              if (!mounted || !pos?.coords) return;
              hasPromptedOffRef.current = false;
              setLocationOffState(false);
              setGpsCoords(pos.coords);
              const addr = await resolveAddressFromCoords(
                pos.coords.latitude,
                pos.coords.longitude
              );
              if (mounted && addr) {
                setGpsAddress(addr);
              }
            }
          );
        }
      } catch (e) {
        // ignore watch error
      }
    };

    startGpsWatch();

    // Monitor if device GPS is switched OFF or ON without blinking
    checkInterval = setInterval(async () => {
      if (!mounted) return;
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        const enabled = await Location.hasServicesEnabledAsync();
        if (perm.status !== 'granted' || !enabled) {
          if (!isLocationOffRef.current) {
            setLocationOffState(true);
            setGpsCoords(null);
            promptEnableLocation(false);
          }
        } else if (isLocationOffRef.current) {
          hasPromptedOffRef.current = false;
          setLocationOffState(false);
          fetchCurrentGps();
        }
      } catch (e) {
        // ignore
      }
    }, 4000);

    const appStateSub = AppState.addEventListener('change', async (nextState) => {
      if (nextState === 'active' && mounted) {
        try {
          const perm = await Location.getForegroundPermissionsAsync();
          const enabled = await Location.hasServicesEnabledAsync();
          if (perm.status === 'granted' && enabled) {
            hasPromptedOffRef.current = false;
            setLocationOffState(false);
            fetchCurrentGps();
          }
        } catch (e) {
          // ignore
        }
      }
    });

    return () => {
      mounted = false;
      if (watcher && watcher.remove) {
        watcher.remove();
        watcher = null;
      }
      if (checkInterval) clearInterval(checkInterval);
      appStateSub.remove();
    };
  }, []);

  const withTimeout = (promise, ms = 2500) =>
    Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('GPS timeout')), ms)),
    ]);

  const fetchCurrentGps = async () => {
    try {
      let perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        perm = await Location.requestForegroundPermissionsAsync();
      }
      if (perm.status !== 'granted') {
        setLocationOffState(true);
        setGpsCoords(null);
        return null;
      }

      const enabled = await Location.hasServicesEnabledAsync();
      if (!enabled) {
        setLocationOffState(true);
        setGpsCoords(null);
        return null;
      }

      hasPromptedOffRef.current = false;
      setLocationOffState(false);

      let pos = null;
      try {
        pos = await withTimeout(
          Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          }),
          2500
        );
      } catch (balErr) {
        try {
          pos = await Location.getLastKnownPositionAsync();
        } catch (lastErr) {
          pos = null;
        }
      }

      if (pos?.coords) {
        setGpsCoords(pos.coords);
        resolveAddressFromCoords(pos.coords.latitude, pos.coords.longitude)
          .then((addr) => {
            if (addr) setGpsAddress(addr);
          })
          .catch(() => {});
        return { coords: pos.coords, address: gpsAddress || '' };
      }

      // Location permission & GPS service are ON, even if indoor satellite lock timed out
      if (gpsCoords) {
        return { coords: gpsCoords, address: gpsAddress || '' };
      }
      const fallbackCoords = serviceProp?.location?.coordinates ||
        serviceProp?.primaryLocation?.coordinates || { latitude: 0, longitude: 0 };
      return {
        coords: {
          latitude: Number(fallbackCoords.lat || fallbackCoords.latitude || 0),
          longitude: Number(fallbackCoords.lng || fallbackCoords.longitude || 0),
        },
        address:
          gpsAddress ||
          serviceProp?.location?.address ||
          serviceProp?.primaryLocation?.address ||
          'Live GPS Location Enabled',
      };
    } catch (e) {
      console.warn('GPS fetch note:', e.message);
    }
    return null;
  };

  const ensureLocationBeforeUpload = async (fastOpen = false) => {
    let perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted') {
      perm = await Location.requestForegroundPermissionsAsync();
    }
    if (perm.status !== 'granted') {
      setLocationOffState(true);
      Alert.alert(
        '📍 Location Permission Required',
        'Please allow Location access. Without location enabled, you cannot upload images.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open Settings',
            onPress: () => {
              if (Linking.openSettings) Linking.openSettings();
            },
          },
        ]
      );
      return null;
    }

    const enabled = await Location.hasServicesEnabledAsync();
    if (!enabled) {
      setLocationOffState(true);
      setGpsCoords(null);
      await promptEnableLocation(true);
      return null;
    }

    hasPromptedOffRef.current = false;
    setLocationOffState(false);

    // When opening camera/gallery, don't block the UI waiting for GPS satellite lock
    if (fastOpen) {
      fetchCurrentGps().catch(() => {});
      return {
        coords: gpsCoords || { latitude: 0, longitude: 0 },
        address: gpsAddress || '',
      };
    }

    if (gpsCoords) {
      return { coords: gpsCoords, address: gpsAddress || '' };
    }

    const fresh = await fetchCurrentGps();
    if (fresh?.coords) {
      return fresh;
    }

    return {
      coords: gpsCoords || { latitude: 0, longitude: 0 },
      address:
        gpsAddress ||
        serviceProp?.location?.address ||
        serviceProp?.primaryLocation?.address ||
        'Live GPS Location Enabled',
    };
  };

  const uploadAssetsToBackend = async (assets, sourceType = 'upload') => {
    if (!assets || assets.length === 0) return;
    if (!effectiveServiceId) {
      Alert.alert('Error', 'Service ID is missing');
      return;
    }

    // Require active GPS location before uploading
    const verifiedGps = await ensureLocationBeforeUpload();
    if (!verifiedGps?.coords) {
      setMessage('⚠️ Upload blocked: Turn ON your device Location (GPS) to upload photos.');
      return;
    }

    setUploading(true);
    setUploadProgress(10);
    setMessage(`Uploading ${assets.length} photo(s) with GPS tag...`);

    try {
      let coords = verifiedGps.coords;
      let address = verifiedGps.address || gpsAddress;
      if (coords && coords.latitude && coords.longitude && !address) {
        try {
          address = await withTimeout(
            resolveAddressFromCoords(coords.latitude, coords.longitude),
            2000
          );
        } catch (e) {
          // backend will resolve or fallback
        }
      }

      const formData = new FormData();
      const validSource = sourceType === 'camera' ? 'camera' : 'gallery';

      assets.forEach((asset, idx) => {
        const filename = asset.fileName || `btl_${Date.now()}_${idx}.jpg`;
        const extMatch = /\.(\w+)$/.exec(filename);
        const mimeType = asset.mimeType || (extMatch ? `image/${extMatch[1]}` : 'image/jpeg');

        formData.append('images', {
          uri: asset.uri,
          name: filename,
          type: mimeType,
        });
        formData.append('filenames', filename);
        formData.append('captions', `Campaign proof (${validSource})`);
        formData.append('caption', `Campaign proof (${validSource})`);
        formData.append('source', validSource);
        if (coords?.latitude !== undefined && coords?.latitude !== null) {
          formData.append('latitude', String(coords.latitude));
        }
        if (coords?.longitude !== undefined && coords?.longitude !== null) {
          formData.append('longitude', String(coords.longitude));
        }
        if (address) {
          formData.append('locationAddress', address);
        }
      });

      if (address) {
        formData.append('simpleAddress', address);
      }

      const idxToUse = serviceProp?.serviceIndex ?? serviceIndex;
      if (idxToUse !== undefined && idxToUse !== null) {
        formData.append('serviceIndex', String(idxToUse));
      }
      if (serviceProp?._id && serviceProp._id !== effectiveServiceId) {
        formData.append('itemId', String(serviceProp._id));
      }
      if (serviceProp?.serviceType || serviceType) {
        formData.append('serviceType', String(serviceProp?.serviceType || serviceType));
      }

      // Use /images for <= 10 photos (also updates worker's live GPS location) and /bulk-images for > 10 photos
      const uploadEndpoint =
        assets.length <= 10
          ? `/services/${effectiveServiceId}/images`
          : `/services/${effectiveServiceId}/bulk-images`;

      const response = await API.post(uploadEndpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (evt) => {
          if (evt.total) {
            setUploadProgress(Math.round((evt.loaded * 100) / evt.total));
          }
        },
      });

      if (response.data?.success) {
        const newlyUploaded = response.data.images || [];
        const updatedList = [...serviceImages, ...newlyUploaded];
        setServiceImages(updatedList);
        setMessage(`✅ Uploaded ${newlyUploaded.length} photo(s) successfully!`);
        if (onImagesAdded) onImagesAdded(newlyUploaded);
        if (onUploadSuccess) onUploadSuccess(newlyUploaded);
      } else {
        setMessage(`❌ Upload failed: ${response.data?.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Image upload error:', error);
      setMessage(`❌ Error: ${error.response?.data?.message || error.message}`);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleCaptureCamera = async () => {
    try {
      // Fast check that Location permission + GPS are ON without blocking camera launch
      const verifiedGps = await ensureLocationBeforeUpload(true);
      if (!verifiedGps?.coords) {
        return;
      }

      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera permission is required to capture proof photos.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.65,
      });

      if (!result.canceled && result.assets?.length > 0) {
        await uploadAssetsToBackend(result.assets, 'camera');
      }
    } catch (err) {
      Alert.alert('Camera Error', err.message);
    }
  };

  const handlePickGallery = async () => {
    try {
      const verifiedGps = await ensureLocationBeforeUpload(true);
      if (!verifiedGps?.coords) {
        return;
      }

      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Photo library permission is needed to select images.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.65,
      });

      if (!result.canceled && result.assets?.length > 0) {
        await uploadAssetsToBackend(result.assets, 'gallery');
      }
    } catch (err) {
      Alert.alert('Gallery Error', err.message);
    }
  };

  const handleDeleteSingleImage = (img) => {
    const imgId = img._id || img.id;
    if (!imgId) return;

    Alert.alert('Delete Photo', 'Are you sure you want to delete this photo?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await API.delete(`/services/${effectiveServiceId}/images/${imgId}`);
            if (res.data?.success) {
              setServiceImages((prev) => prev.filter((item) => (item._id || item.id) !== imgId));
              setViewerImage(null);
              if (onImagesAdded) onImagesAdded([]);
            }
          } catch (err) {
            Alert.alert('Error', err.response?.data?.message || err.message);
          }
        },
      },
    ]);
  };

  const handleDeleteAllImages = () => {
    if (serviceImages.length === 0) return;
    Alert.alert(
      'Delete All Photos',
      `Are you sure you want to delete all ${serviceImages.length} photos from this service?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeletingAll(true);
              const res = await API.delete(`/services/${effectiveServiceId}/images-all`);
              if (res.data?.success) {
                setServiceImages([]);
                setMessage('✅ All photos deleted');
                if (onImagesAdded) onImagesAdded([]);
              }
            } catch (err) {
              Alert.alert('Error', err.response?.data?.message || err.message);
            } finally {
              setDeletingAll(false);
            }
          },
        },
      ]
    );
  };

  const openInMaps = (img) => {
    const lat = img.latitude || img.location?.lat || img.location?.coordinates?.lat;
    const lng = img.longitude || img.location?.lng || img.location?.coordinates?.lng;
    const addr = img.locationAddress || img.simpleAddress || img.location?.address || img.location?.locationName;
    if (lat && lng) {
      Linking.openURL(`https://www.google.com/maps?q=${lat},${lng}`);
    } else if (addr) {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`);
    }
  };

  // Group images by campaign day if startDate & endDate exist
  const hasCampaign = serviceProp?.startDate && (serviceProp?.endDate || serviceProp?.deliveryDate);
  const totalDays = hasCampaign
    ? getCampaignTotalDays(serviceProp.startDate, serviceProp.endDate || serviceProp.deliveryDate)
    : 0;

  return (
    <View style={styles.container}>
      {/* GPS Status Banner / Location Off Warning Notification */}
      <View
        style={[
          styles.gpsBanner,
          isLocationOff && {
            backgroundColor: '#fef2f2',
            borderLeftColor: '#dc2626',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          },
        ]}
      >
        <Text
          style={[styles.gpsText, isLocationOff && { color: '#b91c1c', flex: 1 }]}
          numberOfLines={3}
        >
          {isLocationOff
            ? '⚠️ Location (GPS) is OFF! Turn ON your location — without location enabled, you cannot upload images.'
            : gpsCoords
            ? `📍 GPS Ready: ${
                gpsAddress ||
                `${gpsCoords.latitude.toFixed(5)}, ${gpsCoords.longitude.toFixed(5)}`
              }`
            : '📍 Acquiring GPS coordinates for photo geo-tagging...'}
        </Text>
        {isLocationOff && (
          <TouchableOpacity
            style={{
              backgroundColor: '#dc2626',
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 6,
            }}
            onPress={() => promptEnableLocation(true)}
          >
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>📍 Turn ON</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Action Buttons: Worker sees ONLY Take Live Photo; Admin/Owner also see Bulk Upload Gallery */}
      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[
            styles.actionBtn,
            styles.cameraBtn,
            isLocationOff && { backgroundColor: '#94a3b8' },
          ]}
          onPress={handleCaptureCamera}
          disabled={uploading}
        >
          <Text style={styles.cameraBtnText}>📷 Take Live Photo</Text>
        </TouchableOpacity>

        {isManager && (
          <TouchableOpacity
            style={[styles.actionBtn, styles.galleryBtn]}
            onPress={handlePickGallery}
            disabled={uploading}
          >
            <Text style={styles.galleryBtnText}>🖼️ Bulk Upload Gallery</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Report & Delete Actions (Delete All hidden for Worker) */}
      {serviceImages.length > 0 && (
        <View style={styles.secondaryRow}>
          <TouchableOpacity
            style={styles.pdfBtn}
            onPress={() =>
              exportServiceReport(
                { ...serviceProp, images: serviceImages },
                'PDF'
              )
            }
          >
            <Text style={styles.pdfBtnText}>📄 PDF</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.pdfBtn}
            onPress={() =>
              exportServiceReport(
                { ...serviceProp, images: serviceImages },
                'PPT'
              )
            }
          >
            <Text style={styles.pdfBtnText}>📊 PPT</Text>
          </TouchableOpacity>

          {isManager && (
            <TouchableOpacity
              style={styles.deleteAllBtn}
              onPress={handleDeleteAllImages}
              disabled={deletingAll}
            >
              <Text style={styles.deleteAllText}>
                {deletingAll ? 'Deleting...' : `🗑️ Clear All (${serviceImages.length})`}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Upload Progress */}
      {uploading && (
        <View style={styles.progressBox}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={styles.progressText}>
            {message} ({uploadProgress}%)
          </Text>
        </View>
      )}

      {!uploading && !!message && <Text style={styles.statusMsg}>{message}</Text>}

      {/* Image Grid */}
      <Text style={styles.sectionTitle}>
        Uploaded Proof Photos ({serviceImages.length})
        {hasCampaign ? ` • ${totalDays} Day Campaign` : ''}
      </Text>

      {serviceImages.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyIcon}>📸</Text>
          <Text style={styles.emptyText}>No photos uploaded yet.</Text>
          <Text style={styles.emptySub}>
            {isManager
              ? 'Tap "Take Live Photo" or "Bulk Upload Gallery" above.'
              : 'Tap "Take Live Photo" above (Location must be ON).'}
          </Text>
        </View>
      ) : (
        <View style={styles.grid}>
          {serviceImages.map((img, idx) => {
            const dayNum = hasCampaign
              ? getCampaignDayNumber(
                  img.takenAt || img.uploadedAt || img.createdAt,
                  serviceProp.startDate
                )
              : null;
            const fallbackSrvAddr =
              typeof serviceProp?.location === 'string'
                ? serviceProp.location
                : serviceProp?.location?.address ||
                  serviceProp?.serviceLocation?.address ||
                  serviceProp?.primaryLocation?.address ||
                  '';
            const imgAddr =
              img.locationAddress ||
              img.simpleAddress ||
              img.location?.address ||
              img.location?.locationName ||
              (img.latitude && img.longitude
                ? `GPS: ${Number(img.latitude).toFixed(5)}, ${Number(img.longitude).toFixed(5)}`
                : '') ||
              fallbackSrvAddr ||
              gpsAddress;

            return (
              <TouchableOpacity
                key={img._id || img.public_id || idx}
                style={styles.gridItem}
                onPress={() =>
                  setViewerImage({
                    ...img,
                    locationAddress: imgAddr,
                    dayNum,
                    index: idx + 1,
                  })
                }
              >
                <View style={{ position: 'relative' }}>
                  <Image source={{ uri: img.url }} style={styles.thumb} />
                  {!!imgAddr && (
                    <View style={styles.thumbGpsOverlay}>
                      <Text style={styles.thumbGpsOverlayText} numberOfLines={2}>
                        📍 {imgAddr}
                      </Text>
                    </View>
                  )}
                </View>
                {dayNum && (
                  <View style={styles.dayBadge}>
                    <Text style={styles.dayBadgeText}>Day {dayNum}</Text>
                  </View>
                )}
                <View style={styles.thumbFooter}>
                  <Text style={styles.thumbCaption} numberOfLines={2}>
                    📍 {imgAddr || `Photo #${idx + 1}`}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Fullscreen Image Viewer Modal */}
      <Modal
        visible={!!viewerImage}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerImage(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Photo #{viewerImage?.index}
                {viewerImage?.dayNum ? ` • Day ${viewerImage.dayNum}` : ''}
              </Text>
              <TouchableOpacity onPress={() => setViewerImage(null)}>
                <Text style={styles.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>

            {viewerImage?.url && (
              <View style={{ position: 'relative' }}>
                <Image
                  source={{ uri: viewerImage.url }}
                  style={styles.fullImage}
                  resizeMode="contain"
                />
                {!!(viewerImage?.locationAddress || viewerImage?.location?.address) && (
                  <View style={styles.thumbGpsOverlay}>
                    <Text style={styles.thumbGpsOverlayText} numberOfLines={3}>
                      📍 {viewerImage.locationAddress || viewerImage.location?.address}
                    </Text>
                  </View>
                )}
              </View>
            )}

            <ScrollView style={styles.metaScroll}>
              {(viewerImage?.locationAddress || viewerImage?.location?.address) && (
                <Text style={styles.metaText}>
                  📍 {viewerImage.locationAddress || viewerImage.location?.address}
                </Text>
              )}
              {(viewerImage?.takenAt || viewerImage?.uploadedAt) && (
                <Text style={styles.metaSub}>
                  🕒 {new Date(viewerImage.takenAt || viewerImage.uploadedAt).toLocaleString()}
                </Text>
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              {(viewerImage?.latitude || viewerImage?.location?.lat) && (
                <TouchableOpacity
                  style={styles.mapLinkBtn}
                  onPress={() => openInMaps(viewerImage)}
                >
                  <Text style={styles.mapLinkText}>🗺️ View on Google Maps</Text>
                </TouchableOpacity>
              )}
              {isManager && viewerImage?._id && (
                <TouchableOpacity
                  style={styles.deleteSingleBtn}
                  onPress={() => handleDeleteSingleImage(viewerImage)}
                >
                  <Text style={styles.deleteSingleText}>🗑️ Delete Photo</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
  },
  gpsBanner: {
    backgroundColor: '#eff6ff',
    padding: 10,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    marginBottom: 12,
  },
  gpsText: {
    fontSize: 12,
    color: COLORS.primaryDark,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBtn: {
    backgroundColor: COLORS.primary,
  },
  cameraBtnText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 13,
  },
  galleryBtn: {
    backgroundColor: COLORS.secondary,
  },
  galleryBtnText: {
    color: COLORS.primaryDark,
    fontWeight: '700',
    fontSize: 13,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  pdfBtn: {
    flex: 1,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#10b981',
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
  },
  pdfBtnText: {
    color: '#047857',
    fontWeight: '700',
    fontSize: 12,
  },
  deleteAllBtn: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
  },
  deleteAllText: {
    color: COLORS.danger,
    fontWeight: '700',
    fontSize: 12,
  },
  progressBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fefce8',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  progressText: {
    fontSize: 12,
    color: COLORS.text,
    fontWeight: '600',
    flex: 1,
  },
  statusMsg: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '600',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 10,
  },
  emptyBox: {
    backgroundColor: COLORS.lightGrey,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  emptySub: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 4,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  gridItem: {
    width: '48%',
    backgroundColor: COLORS.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    marginBottom: 4,
  },
  thumb: {
    width: '100%',
    height: 125,
    backgroundColor: '#e2e8f0',
  },
  thumbGpsOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    borderLeftWidth: 3,
    borderLeftColor: '#f2c43b',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  thumbGpsOverlayText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '600',
    lineHeight: 12,
  },
  dayBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(1, 81, 186, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  dayBadgeText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: '700',
  },
  thumbFooter: {
    padding: 6,
  },
  thumbCaption: {
    fontSize: 11,
    color: COLORS.textLight,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    overflow: 'hidden',
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    backgroundColor: COLORS.primary,
  },
  modalTitle: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 15,
  },
  closeBtn: {
    color: COLORS.white,
    fontSize: 20,
    fontWeight: '700',
    paddingHorizontal: 6,
  },
  fullImage: {
    width: '100%',
    height: 320,
    backgroundColor: '#000',
  },
  metaScroll: {
    padding: 12,
    maxHeight: 90,
  },
  metaText: {
    fontSize: 12,
    color: COLORS.text,
    fontWeight: '600',
  },
  metaSub: {
    fontSize: 11,
    color: COLORS.textLight,
    marginTop: 4,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  mapLinkBtn: {
    flex: 1,
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  mapLinkText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 12,
  },
  deleteSingleBtn: {
    backgroundColor: COLORS.danger,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  deleteSingleText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 12,
  },
});
