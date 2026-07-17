/* eslint-disable no-unused-vars */
import React, { useState, useRef, useEffect } from 'react';
import axios from '../utils/api';
import { generateDocument } from '../utils/documentGenerator';
import { getAddressFromCoordinates, getExactAddressFromCoordinates } from '../utils/geocode';

const ImageUpload = ({ service: serviceProp, serviceId, onImagesAdded, onImageUploaded, userRole = 'worker' }) => {
  const effectiveServiceId = serviceProp?._id || serviceId;
  const service = serviceProp || { _id: effectiveServiceId, images: [] };
  // State variables
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [exporting, setExporting] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [stream, setStream] = useState(null);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [currentAddress, setCurrentAddress] = useState('');
  const [serviceImages, setServiceImages] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState(0);
  const [deletingAll, setDeletingAll] = useState(false);
  const [exportType, setExportType] = useState(null);
  const [imageAddresses, setImageAddresses] = useState({});
  const [cameraMode, setCameraMode] = useState(null); // 'device' or 'webcam'
  const [gpsStatus, setGpsStatus] = useState('checking'); // 'checking', 'active', 'error'
  const [gpsCoords, setGpsCoords] = useState(null);
  const [gpsError, setGpsError] = useState('');
  const gpsWatchIdRef = useRef(null);
  
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

  const getGroupedImages = () => {
    const hasCampaign = service?.startDate && (service?.endDate || service?.deliveryDate);
    
    if (!hasCampaign) {
      return { isCampaign: false, images: serviceImages };
    }
    
    const startDate = service.startDate;
    const endDate = service.endDate || service.deliveryDate;
    const totalDays = getCampaignTotalDays(startDate, endDate);
    
    const groups = {};
    for (let d = 1; d <= totalDays; d++) {
      groups[d] = [];
    }
    const overflowImages = [];
    
    serviceImages.forEach(img => {
      const day = getCampaignDayNumber(img.takenAt || img.uploadedAt || img.createdAt, startDate);
      if (day >= 1 && day <= totalDays) {
        groups[day].push(img);
      } else {
        overflowImages.push(img);
      }
    });
    
    return {
      isCampaign: true,
      totalDays,
      groups,
      overflowImages
    };
  };

  const renderImageCard = (image, index) => (
    <div key={image._id || index} style={{
      border: '1px solid #e1e5e9', 
      borderRadius: '10px', 
      overflow: 'hidden',
      background: 'white', 
      position: 'relative',
      width: '100%',
      boxSizing: 'border-box'
    }}>
      <button 
        onClick={() => deleteImage(image._id || image.id)} 
        title="Delete Image"
        style={{
          position: 'absolute', 
          top: '8px', 
          right: '8px',
          background: 'rgba(220,53,69,0.9)', 
          color: 'white', 
          border: 'none',
          borderRadius: '50%', 
          width: '28px', 
          height: '28px', 
          cursor: 'pointer',
          fontSize: '14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        ×
      </button>
      <img
        src={image.url || image.path}
        alt={image.caption}
        style={{ 
          width: '100%', 
          height: '160px', 
          objectFit: 'cover',
          display: 'block'
        }}
        onError={(e) => {
          e.target.src = 'https://via.placeholder.com/300x200?text=Image+Error';
          e.target.onerror = null;
        }}
      />
      <div style={{ 
        padding: '10px', 
        fontSize: '11px',
        wordBreak: 'break-word'
      }}>
        <div style={{ 
          fontWeight: 'bold', 
          marginBottom: '4px',
          fontSize: '12px'
        }}>
          {image.caption}
        </div>
        {getDisplayAddress(image) ? (
          <div style={{ 
            color: '#0151ba', 
            fontSize: '10px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '4px'
          }}>
            <span style={{ flexShrink: 0 }}>📍</span>
            <span>{getDisplayAddress(image)}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
  
  // Refs
  const fileInputRef = useRef(null);
  const bulkFileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const abortControllerRef = useRef(null);
  const uploadStartTimeRef = useRef(null);
  const progressIntervalRef = useRef(null);

  // Initialize service images from database on mount to avoid stale prop cache bugs
  useEffect(() => {
    if (effectiveServiceId) {
      fetchServiceImages();
    }
  }, [effectiveServiceId]);

  // Clean up intervals and camera on unmount
  useEffect(() => {
    return () => {
      // Clean up progress interval
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      
      // Clean up abort controller
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      // Clean up camera stream
      if (stream) {
        stopCamera();
      }
    };
  }, []);

  const triggerGpsWatcher = () => {
    if (gpsWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      gpsWatchIdRef.current = null;
    }

    if (!navigator.geolocation) {
      setGpsStatus('error');
      setGpsError('Geolocation is not supported by this browser.');
      return;
    }

    setGpsStatus('checking');
    gpsWatchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setGpsCoords({ latitude, longitude });
        setGpsStatus('active');
        setGpsError('');
      },
      (error) => {
        console.warn('GPS watch error:', error);
        setGpsStatus('error');
        let errMsg = 'Location access is required to capture photos.';
        if (error.code === error.PERMISSION_DENIED) {
          errMsg = 'Location permission denied. Please allow it in settings.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          errMsg = 'GPS signal lost or turned OFF.';
        } else if (error.code === error.TIMEOUT) {
          errMsg = 'GPS location query timed out.';
        }
        setGpsError(errMsg);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  };

  useEffect(() => {
    triggerGpsWatcher();
    return () => {
      if (gpsWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      }
    };
  }, []);

// Replace the function with this:
const getSimpleAddressFromCoordinates = async (lat, lng, imageId = null) => {
  try {
    if (!lat || !lng) return service?.location?.address || 'Location Captured';
    const address = await getAddressFromCoordinates(lat, lng);
    return address || service?.location?.address || 'Location Captured';
  } catch (err) {
    return service?.location?.address || 'Location Captured';
  }
};
 const getExactAddressFromCoordinates = async (lat, lng) => {
  try {
    if (!lat || !lng) return 'Coordinates unavailable';
    const address = await getExactAddressFromCoordinates(lat, lng);
    return address || `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`;
  } catch (err) {
    return `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`;
  }
};

  // Watermark/Overlay exact GPS coordinates, exact address, timestamp, and service info onto canvas
  const watermarkImage = async (file, lat, lng) => {
    setUploading(true);
    setMessage('📍 Retrieving exact street address...');
    const exactAddress = await getExactAddressFromCoordinates(lat, lng);
    
    setMessage('🎨 Stamping GPS metadata onto image...');
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          // Use natural dimensions
          const width = img.naturalWidth || img.width;
          const height = img.naturalHeight || img.height;
          canvas.width = width;
          canvas.height = height;
          
          // Draw original image
          ctx.drawImage(img, 0, 0, width, height);
          
          // Calculate font sizes and banner sizes dynamically based on image height
          const bannerHeight = Math.max(80, Math.floor(height * 0.13)); // 13% of height, min 80px
          const padding = Math.max(10, Math.floor(bannerHeight * 0.12));
          
          // Semi-transparent black banner background
          ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
          ctx.fillRect(0, height - bannerHeight, width, bannerHeight);
          
          // GPS Map Camera layout text styling
          ctx.textBaseline = 'top';
          ctx.fillStyle = '#ffffff';
          
          // Draw a small decorative accent line (yellow/orange like GPS apps)
          ctx.fillStyle = '#f2c43b'; // Yellow
          ctx.fillRect(0, height - bannerHeight, 8, bannerHeight);
          ctx.fillStyle = '#ffffff'; // Reset to white for text
          
          const fontSizeTitle = Math.max(14, Math.floor(bannerHeight * 0.18));
          const fontSizeText = Math.max(10, Math.floor(bannerHeight * 0.13));
          
          // Title/Service Line
          ctx.font = `bold ${fontSizeTitle}px Arial, Helvetica, sans-serif`;
          const serviceLabel = `Order: ${service.businessName || 'BTL'} | Type: ${service.serviceType === 'other' ? service.customServiceType : (service.serviceType || 'Standard')}`;
          ctx.fillText(serviceLabel, padding + 15, height - bannerHeight + padding);
          
          // Metadata lines configuration
          ctx.font = `${fontSizeText}px Arial, Helvetica, sans-serif`;
          let currentY = height - bannerHeight + padding + fontSizeTitle + 6;
          const lineSpacing = fontSizeText + 4;
          
          // Line 1: Coordinates and timestamp
          const dateStr = new Date().toLocaleString();
          const coordsStr = `GPS Coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)}  |  Timestamp: ${dateStr}`;
          ctx.fillText(coordsStr, padding + 15, currentY);
          currentY += lineSpacing;
          
          // Line 2: Address
          // Wrap text if address is longer than canvas width
          const maxTextWidth = width - (padding * 2) - 40;
          const addressLabel = `Address: ${exactAddress}`;
          
          // Simple wrap text function
          const words = addressLabel.split(' ');
          let currentLine = '';
          const lines = [];
          for (let i = 0; i < words.length; i++) {
            const testLine = currentLine + words[i] + ' ';
            const metrics = ctx.measureText(testLine);
            if (metrics.width > maxTextWidth && i > 0) {
              lines.push(currentLine);
              currentLine = words[i] + ' ';
            } else {
              currentLine = testLine;
            }
          }
          lines.push(currentLine);
          
          // Draw up to 2 wrapped address lines
          lines.slice(0, 2).forEach((line) => {
            ctx.fillText(line, padding + 15, currentY);
            currentY += lineSpacing;
          });
          
          // Convert back to file blob
          canvas.toBlob((blob) => {
            if (blob) {
              const watermarkedFile = new File([blob], file.name, { type: 'image/jpeg' });
              resolve(watermarkedFile);
            } else {
              resolve(file); // Fallback to original on failure
            }
          }, 'image/jpeg', 0.85);
          
        } catch (err) {
          console.error('Error watermarking image:', err);
          resolve(file); // Fallback to original
        }
      };
      
      img.onerror = () => resolve(file); // Fallback to original
      img.src = URL.createObjectURL(file);
    });
  };

  // Get current location from device
  const getCurrentLocation = async () => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ latitude: null, longitude: null, simpleAddress: service?.location?.address || 'Location Captured' });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          const address = await getSimpleAddressFromCoordinates(latitude, longitude);
          resolve({ latitude, longitude, simpleAddress: address });
        },
        (error) => {
          console.warn('Geolocation error:', error);
          resolve({ latitude: null, longitude: null, simpleAddress: service?.location?.address || 'Location Captured' });
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    });
  };

  // Get current location and reject if GPS/location is disabled or permissions are denied
  const requireLocation = async () => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by your browser. Please enable GPS/Location services.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          if (!latitude || !longitude) {
            reject(new Error('Could not fetch GPS coordinates. Please make sure your GPS is turned ON and try again.'));
            return;
          }
          const address = await getSimpleAddressFromCoordinates(latitude, longitude);
          resolve({ latitude, longitude, simpleAddress: address });
        },
        (error) => {
          console.warn('Geolocation error:', error);
          let errMsg = 'Please enable GPS/Location services and grant permission to take photos.';
          if (error.code === error.PERMISSION_DENIED) {
            errMsg = 'Location access denied. Please allow location permissions in your browser settings to take photos.';
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            errMsg = 'Location unavailable. Please make sure your device GPS is turned ON and try again.';
          } else if (error.code === error.TIMEOUT) {
            errMsg = 'Location request timed out. Please ensure you are in a location with good GPS signal and try again.';
          }
          reject(new Error(errMsg));
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 }
      );
    });
  };

  // ========== ULTRA-FAST BULK UPLOAD ==========
  const handleUltraBulkUpload = async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    console.log(`🚀 Starting ULTRA-FAST upload of ${files.length} images`);
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();
    
    setUploading(true);
    setUploadProgress(0);
    setUploadedCount(0);
    setTotalFiles(files.length);
    setUploadSpeed(0);
    uploadStartTimeRef.current = Date.now();
    
    setMessage(`🚀 Preparing ${files.length} images for ultra-fast upload...`);

    try {
      const locationPromise = getCurrentLocation();
      const locationTimeout = setTimeout(() => {
        setCurrentLocation({
          latitude: null,
          longitude: null,
          simpleAddress: 'Location timeout',
          timestamp: new Date().toISOString()
        });
      }, 2000);
      
      let location;
      try {
        location = await locationPromise;
      } catch {
        location = { latitude: null, longitude: null, simpleAddress: 'Location error' };
      }
      clearTimeout(locationTimeout);
      
      const formData = new FormData();
      formData.append('serviceId', service._originalId || service._id);
      formData.append('itemId', service._id || '');
      if (service.serviceIndex !== undefined) {
        formData.append('serviceIndex', service.serviceIndex.toString());
      }
      if (service.serviceType) {
        formData.append('serviceType', service.serviceType);
      }
      formData.append('isUltraBulk', 'true');
      formData.append('totalFiles', files.length.toString());
      
      files.forEach((file, index) => {
        formData.append('images', file);
        formData.append('filenames', file.name);
        formData.append('captions', `Image ${serviceImages.length + index + 1}`);
      });
      
      if (location && location.latitude) {
        formData.append('latitude', location.latitude.toString());
        formData.append('longitude', location.longitude.toString());
        if (location.simpleAddress) {
          formData.append('simpleAddress', location.simpleAddress);
        }
      }
      
      setMessage(`🚀 Uploading ${files.length} images in parallel...`);
      
      const uploadStartTime = Date.now();
      let lastTime = uploadStartTime;
      
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      
      progressIntervalRef.current = setInterval(() => {
        if (!uploading) {
          clearInterval(progressIntervalRef.current);
          return;
        }
        
        const elapsed = Date.now() - uploadStartTime;
        const totalEstimatedTime = Math.max(5, Math.min(20, files.length / 100));
        const percent = Math.min(90, Math.round((elapsed / (totalEstimatedTime * 1000)) * 100));
        
        setUploadProgress(percent);
        
        const currentTime = Date.now();
        const timeDiff = (currentTime - lastTime) / 1000;
        if (timeDiff > 0.5) {
          const avgFileSizeKB = 300;
          const estimatedLoadedKB = (files.length * avgFileSizeKB * percent) / 100;
          const speed = estimatedLoadedKB / timeDiff;
          setUploadSpeed(Math.round(speed));
          lastTime = currentTime;
        }
        
        const estimatedUploaded = Math.round((percent / 100) * files.length);
        setUploadedCount(estimatedUploaded);
        
        setMessage(`🚀 Uploading... ${percent}% (${estimatedUploaded}/${files.length})`);
      }, 500);
      
      const response = await axios.post(
        `/services/${service._originalId || service._id}/bulk-images`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          signal: abortControllerRef.current.signal,
          timeout: 120000,
          onUploadProgress: (progressEvent) => {
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current);
              progressIntervalRef.current = null;
            }
            
            if (progressEvent.total) {
              const percentCompleted = Math.round(
                (progressEvent.loaded * 100) / progressEvent.total
              );
              setUploadProgress(percentCompleted);
              
              const elapsedSeconds = (Date.now() - uploadStartTime) / 1000;
              if (elapsedSeconds > 0.5) {
                const speed = (progressEvent.loaded / elapsedSeconds) / 1024;
                setUploadSpeed(Math.round(speed));
              }
              
              const estimatedUploaded = Math.round((percentCompleted / 100) * files.length);
              setUploadedCount(estimatedUploaded);
              
              if (percentCompleted === 100) {
                setMessage('Processing on server...');
              } else {
                setMessage(`🚀 Uploading... ${percentCompleted}% (${estimatedUploaded}/${files.length})`);
              }
            }
          }
        }
      );

      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }

      if (response.data.success) {
        const uploadedImages = response.data.images || [];
        const stats = response.data.statistics || {};
        const totalTime = (Date.now() - uploadStartTimeRef.current) / 1000;
        
        uploadedImages.forEach(image => {
          if (image.latitude && image.longitude) {
            getSimpleAddressFromCoordinates(image.latitude, image.longitude, image._id || image.id);
          }
        });
        
        setServiceImages(prev => [...prev, ...uploadedImages]);
        
        let successMessage = `🚀 ${uploadedImages.length} images uploaded in ${totalTime.toFixed(1)}s`;
        
        if (stats.imagesPerSecond) {
          successMessage += ` (${parseFloat(stats.imagesPerSecond).toFixed(1)} images/sec)`;
        }
        
        if (location.simpleAddress && !location.simpleAddress.includes('timeout')) {
          successMessage += ` • Location: ${location.simpleAddress}`;
        }
        
        if (stats.failed > 0) {
          successMessage += `\n❌ ${stats.failed} failed`;
        }
        
        if (stats.duplicates > 0) {
          successMessage += `\n🔄 ${stats.duplicates} duplicates skipped`;
        }
        
        if (stats.performance === 'EXCELLENT') {
          successMessage += '\n⭐ SUPER FAST UPLOAD!';
        }
        
        setMessage(successMessage);
        
        if (onImagesAdded) {
          onImagesAdded(uploadedImages);
        }
        if (onImageUploaded) {
          onImageUploaded(uploadedImages);
        }
        
        setTimeout(() => {
          fetchServiceImages();
        }, 1000);
        
        setTimeout(() => {
          setMessage('');
        }, 8000);
        
      } else {
        setMessage(`Upload failed: ${response.data.message}`);
      }

    } catch (error) {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      
      if (error.name === 'AbortError') {
        setMessage('Upload cancelled');
      } else if (error.code === 'ECONNABORTED') {
        setMessage(`Upload timeout after 120 seconds. Try with ${Math.min(1500, totalFiles)} images or less.`);
      } else if (error.response) {
        setMessage(`Server: ${error.response.data?.message || error.response.status}`);
      } else if (error.request) {
        setMessage('No server response');
      } else {
        setMessage(`Error: ${error.message}`);
      }
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setUploadSpeed(0);
      abortControllerRef.current = null;
      
      if (bulkFileInputRef.current) {
        bulkFileInputRef.current.value = '';
      }
    }
  };

  // ========== MAIN UPLOAD HANDLER ==========
  const handleBulkUpload = async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;
    
    await handleUltraBulkUpload(event);
  };

  // Cancel upload
  const cancelUpload = () => {
    if (abortControllerRef.current && uploading) {
      abortControllerRef.current.abort();
      setMessage('Upload cancelled');
      setUploading(false);
      setUploadProgress(0);
      setUploadSpeed(0);
      
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    }
  };

  // ========== FIXED CAMERA FUNCTIONALITY ==========
  
  // OPTION 1: Use Device Camera (Mobile/Desktop with capture)
  const openDeviceCamera = () => {
    console.log('📱 Opening device camera...');
    setCameraMode('device');
    
    if (cameraInputRef.current) {
      cameraInputRef.current.click();
    }
  };

  // OPTION 2: Use Web Camera (Laptop/Desktop webcam)
  const openWebCamera = async () => {
    console.log('💻 Opening web camera...');
    setCameraMode('webcam');
    
    try {
      setShowCameraModal(true);
      setMessage('');

      try {
        const constraints = {
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'environment'
          }
        };

        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        setStream(mediaStream);

        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.srcObject = mediaStream;
            videoRef.current.play().catch(e => console.error('Video play error:', e));
          }
        }, 100);
      } catch (error) {
        console.error('Camera error:', error);
        setMessage('Camera access failed');
        setShowCameraModal(false);
        setCameraMode(null);
      }
    } catch (error) {
      console.error('Camera start error:', error);
      setMessage('Camera not available');
      setCameraMode(null);
    }
  };

  // Stop camera
  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => {
        track.stop();
      });
      setStream(null);
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setShowCameraModal(false);
    setCameraMode(null);
  };

  // Handle BOTH camera types
  const triggerCamera = async () => {
    if (gpsStatus !== 'active') {
      alert('Please turn ON your GPS/Location services to capture photos.');
      return;
    }
    
    console.log('📸 Triggering camera...');
    
    // Check if on mobile device
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobile) {
      // On mobile, use device camera (better quality, GPS, etc.)
      openDeviceCamera();
    } else {
      // On desktop, let user choose
      const useWebcam = window.confirm('Use web camera? Click OK for web camera, Cancel for file picker.');
      if (useWebcam) {
        openWebCamera();
      } else {
        openDeviceCamera();
      }
    }
  };

  // Handle device camera capture (mobile/desktop with capture)
  const handleDeviceCameraCapture = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      console.log('No file selected from device camera');
      return;
    }

    console.log('📸 Device camera file captured:', {
      name: file.name,
      type: file.type,
      size: file.size
    });

    if (gpsCoords) {
      try {
        const stampedFile = await watermarkImage(file, gpsCoords.latitude, gpsCoords.longitude);
        await uploadCameraImage(stampedFile, gpsCoords);
      } catch (err) {
        console.error('Watermark execution failed:', err);
        await uploadCameraImage(file, gpsCoords);
      }
    } else {
      await uploadCameraImage(file, null);
    }
    
    // Reset input
    if (cameraInputRef.current) {
      cameraInputRef.current.value = '';
    }
  };

  // Handle web camera capture
  const captureWebPhoto = async () => {
    if (!videoRef.current || !canvasRef.current) {
      console.error('Video or canvas not ready');
      return;
    }

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      console.log('📸 Capturing photo from webcam...');

      // Set canvas size
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Draw video frame
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Convert to blob
      canvas.toBlob(async (blob) => {
        if (!blob) {
          setMessage('❌ Failed to capture photo');
          return;
        }

        console.log('Webcam blob created:', blob.size, 'bytes');
        
        // Create file from blob
        const file = new File([blob], `webcam-${Date.now()}.jpg`, {
          type: 'image/jpeg'
        });

        console.log('Webcam file created:', file.name);
        
        // Stop camera
        stopCamera();
        
        // Watermark photo and upload
        if (gpsCoords) {
          try {
            const stampedFile = await watermarkImage(file, gpsCoords.latitude, gpsCoords.longitude);
            await uploadCameraImage(stampedFile, gpsCoords);
          } catch (err) {
            console.error('Watermark execution failed:', err);
            await uploadCameraImage(file, gpsCoords);
          }
        } else {
          await uploadCameraImage(file, null);
        }
        
      }, 'image/jpeg', 0.85);

    } catch (error) {
      console.error('Webcam capture error:', error);
      setMessage('❌ Photo capture failed');
      stopCamera();
    }
  };

  // Common upload function for BOTH camera types
  const uploadCameraImage = async (file, passedCoords) => {
    setUploading(true);
    setMessage('📤 Uploading camera image...');

    try {
      const activeCoords = passedCoords || gpsCoords;
      let addressStr = '';
      if (activeCoords) {
        addressStr = await getSimpleAddressFromCoordinates(activeCoords.latitude, activeCoords.longitude);
      }

      // Create FormData
      const formData = new FormData();
      formData.append('images', file);
      formData.append('source', 'camera');
      formData.append('caption', `Camera Image ${serviceImages.length + 1}`);
      formData.append('serviceId', service._originalId || service._id);
      formData.append('itemId', service._id || '');
      if (service.serviceIndex !== undefined) {
        formData.append('serviceIndex', service.serviceIndex.toString());
      }
      if (service.serviceType) {
        formData.append('serviceType', service.serviceType);
      }
      
      // Add location data
      if (activeCoords?.latitude) {
        formData.append('latitude', activeCoords.latitude.toString());
        formData.append('longitude', activeCoords.longitude.toString());
        formData.append('simpleAddress', addressStr || 'Location Captured');
      }

      console.log('📤 Sending to server...');
      
      // Upload
      const response = await axios.post(
        `/services/${service._originalId || service._id}/images`, 
        formData, 
        {
          headers: { 
            'Content-Type': 'multipart/form-data'
          },
          timeout: 30000
        }
      );

      console.log('✅ Server response:', response.data);

      if (response.data.success) {
        const uploadedImages = response.data.images || [];
        
        // Update state
        setServiceImages(prev => [...prev, ...uploadedImages]);
        
        let successMsg = `✅ Camera image uploaded`;
        if (addressStr) {
          successMsg += ` at ${addressStr}`;
        }
        setMessage(successMsg);
        
        if (onImagesAdded) {
          onImagesAdded(uploadedImages);
        }
        if (onImageUploaded) {
          onImageUploaded(uploadedImages);
        }
        
        setTimeout(() => {
          fetchServiceImages();
        }, 1000);
        
      } else {
        setMessage(`❌ ${response.data.message}`);
      }

    } catch (error) {
      console.error('❌ Camera upload error:', error);
      
      let errorMsg = '❌ Camera upload failed';
      if (error.response?.data?.message) {
        errorMsg = `❌ ${error.response.data.message}`;
      }
      
      setMessage(errorMsg);
      
    } finally {
      setUploading(false);
      setCameraMode(null);
    }
  };

  // ========== OTHER FUNCTIONS ==========

  const fetchServiceImages = async () => {
    if (!service?._id && !service?._originalId) return;
    const targetServiceId = service._originalId || service._id;
    
    try {
      console.log('🔄 Fetching service images for:', targetServiceId);
      
      const response = await axios.get(`/services/${targetServiceId}/images`, {
        timeout: 10000
      });
      
      if (response.data.success) {
        let images = response.data.images || [];
        if (service.serviceIndex !== undefined && service.serviceIndex !== null) {
          images = images.filter(img => 
            (img.itemId && img.itemId.toString() === (service._id?.toString())) ||
            (img.serviceIndex !== undefined && img.serviceIndex !== null && Number(img.serviceIndex) === Number(service.serviceIndex))
          );
        }
        console.log(`✅ Fetched ${images.length} images`);
        setServiceImages(images);
      }
      
    } catch (error) {
      console.error('❌ Fetch images error:', error.message);
    }
  };

  const triggerBulkUpload = () => {
    if (bulkFileInputRef.current) {
      bulkFileInputRef.current.click();
    }
  };

  // ========== FIXED DELETE SINGLE IMAGE ==========
  const deleteImage = async (imageId) => {
    console.log('🔄 Delete image request:', {
      imageId: imageId,
      serviceId: service?._id,
      currentImages: serviceImages.length
    });

    if (!imageId || !service?._id) {
      setMessage('❌ Invalid image or service ID');
      return;
    }

    const imageToDelete = serviceImages.find(img => 
      (img._id || img.id)?.toString() === imageId.toString()
    );

    if (!imageToDelete) {
      console.log('❌ Image not found in local state:', imageId);
      setMessage('❌ Image not found');
      return;
    }

    console.log('Image to delete found:', {
      _id: imageToDelete._id || imageToDelete.id,
      caption: imageToDelete.caption,
      public_id: imageToDelete.public_id
    });

    if (!window.confirm(`Delete image: "${imageToDelete.caption}"?`)) return;

    try {
      // Optimistic update
      setServiceImages(prev => prev.filter(img => 
        (img._id || img.id)?.toString() !== imageId.toString()
      ));
      
      setMessage('🗑️ Deleting image...');

      let deleteUrl = `/services/${service._originalId || service._id}/images/${imageId}`;
      
      if (imageToDelete.public_id) {
        deleteUrl += `?public_id=${encodeURIComponent(imageToDelete.public_id)}`;
      }

      console.log('📤 Delete request URL:', deleteUrl);
      
      const response = await axios.delete(deleteUrl, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log('✅ Delete response:', response.data);
      
      if (response.data.success) {
        setMessage(`✅ Deleted: ${imageToDelete.caption || 'Image'}`);
        
        if (onImagesAdded) {
          onImagesAdded([]);
        }
        
        setTimeout(() => {
          fetchServiceImages();
        }, 500);
      } else {
        setMessage(`❌ Delete failed: ${response.data.message}`);
        fetchServiceImages();
      }
      
    } catch (error) {
      console.error('❌ Delete error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      
      fetchServiceImages();
      
      let errorMsg = '❌ Delete failed';
      if (error.response?.data?.message) {
        errorMsg = `❌ ${error.response.data.message}`;
      } else if (error.response?.data?.error) {
        errorMsg = `❌ ${error.response.data.error}`;
      } else if (error.message) {
        errorMsg = `❌ ${error.message}`;
      }
      
      setMessage(errorMsg);
    }
  };

  // DELETE ALL IMAGES (keep as is)
  const deleteAllImages = async () => {
    if (serviceImages.length === 0) {
      setMessage('No images to delete');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete ALL ${serviceImages.length} images? This action cannot be undone.`)) {
      return;
    }

    setDeletingAll(true);
    setMessage(`🚀 Deleting ${serviceImages.length} images...`);

    try {
      const startTime = Date.now();
      
      const response = await axios.delete(`/services/${service._originalId || service._id}/images-all`, {
        timeout: 10000
      });
      
      if (response.data.success) {
        const duration = (Date.now() - startTime) / 1000;
        
        setServiceImages([]);
        setImageAddresses({});
        
        let successMessage = `✅ ${response.data.statistics.totalDeleted} images deleted in ${duration.toFixed(1)}s`;
        
        if (response.data.statistics.cloudinaryFailed > 0) {
          successMessage += ` • ${response.data.statistics.cloudinaryFailed} failed from cloud`;
        }
        
        setMessage(successMessage);
        
        if (onImagesAdded) {
          onImagesAdded([]);
        }
        if (onImageUploaded) {
          onImageUploaded([]);
        }
        
        setTimeout(() => {
          fetchServiceImages();
        }, 500);
        
      } else {
        setMessage(`❌ Delete failed: ${response.data.message}`);
      }

    } catch (error) {
      console.error('Delete all images error:', error);
      
      let errorMsg = '❌ Delete failed';
      if (error.response) {
        errorMsg = `❌ ${error.response.data?.message || `Server error: ${error.response.status}`}`;
      } else if (error.request) {
        errorMsg = '❌ No response from server';
      } else {
        errorMsg = `❌ ${error.message}`;
      }
      
      setMessage(errorMsg);
    } finally {
      setDeletingAll(false);
    }
  };

  // Generate document (keep as is)
  const handleGenerateDocument = async (format) => {
    if (!serviceImages.length) {
      setMessage('No images to export');
      return;
    }

    setExporting(true);
    setExportType(format);
    setMessage(`Generating ${format.toUpperCase()}...`);

    try {
      const photos = serviceImages.map((image, index) => {
        let address = image.simpleAddress;
        if (!address && image.latitude && image.longitude) {
          const cacheKey = `${image.latitude.toFixed(6)},${image.longitude.toFixed(6)}`;
          address = imageAddresses[cacheKey] || `Location (${image.latitude.toFixed(4)}, ${image.longitude.toFixed(4)})`;
        }
        
        return {
          id: image._id || image.id || `img-${index}`,
          file_url: image.url || image.path || '',
          file_name: image.caption || `Image ${index + 1}`,
          captured_at: image.takenAt || new Date().toISOString(),
          latitude: image.latitude,
          longitude: image.longitude,
          location_address: address || 'No location',
          formatted_gps: address || 'No location',
          has_gps: !!(image.latitude && image.longitude)
        };
      }).filter(photo => photo.file_url);

      const title = service.businessName || service.name || 'Service Report';
      await generateDocument(photos, title, format);
      setMessage(`✅ ${format.toUpperCase()} generated with ${photos.length} images`);
    } catch (error) {
      console.error('Document error:', error);
      setMessage(`❌ ${format.toUpperCase()} generation failed`);
    } finally {
      setExporting(false);
      setExportType(null);
    }
  };

  const refreshImages = async () => {
    setMessage('Refreshing...');
    await fetchServiceImages();
    setMessage('✅ Refreshed');
  };

  const getDisplayAddress = (image) => {
    return '';
  };

  // Styles (keep as is)
  const containerStyle = {
    padding: '15px',
    maxWidth: '1200px',
    margin: '0 auto',
    width: '100%',
    boxSizing: 'border-box'
  };

  const uploadSectionStyle = {
    border: '2px dashed #0151ba',
    borderRadius: '12px',
    padding: '20px 15px',
    textAlign: 'center',
    marginBottom: '20px',
    background: '#ffffff',
    width: '100%',
    boxSizing: 'border-box'
  };

  const buttonStyle = {
    padding: '12px 15px',
    margin: '5px',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    color: 'white',
    fontWeight: '600',
    flex: '1',
    minWidth: '100px',
    maxWidth: '200px',
    boxSizing: 'border-box'
  };

  const messageStyle = {
    padding: '12px 15px',
    borderRadius: '10px',
    marginBottom: '15px',
    textAlign: 'center',
    fontSize: '14px',
    fontWeight: '500',
    background: message.includes('✅') || message.includes('🚀') ? '#d4edda' :
      message.includes('❌') ? '#f8d7da' : 
      message.includes('⚠️') ? '#fff3cd' : '#d1ecf1',
    color: message.includes('✅') || message.includes('🚀') ? '#155724' :
      message.includes('❌') ? '#721c24' : 
      message.includes('⚠️') ? '#856404' : '#0c5460',
    border: '1px solid transparent',
    whiteSpace: 'pre-line',
    wordBreak: 'break-word',
    width: '100%',
    boxSizing: 'border-box'
  };

  const progressBarStyle = {
    width: '100%',
    height: '8px',
    backgroundColor: '#e2e8f0',
    borderRadius: '4px',
    margin: '15px 0',
    overflow: 'hidden',
    boxSizing: 'border-box'
  };

  const progressFillStyle = {
    height: '100%',
    backgroundColor: '#10b981',
    width: `${uploadProgress}%`,
    transition: 'width 0.2s ease'
  };

  return (
    <div style={containerStyle}>
      {/* Web Camera Modal */}
      {showCameraModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(0,0,0,0.95)', display: 'flex',
          flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
          zIndex: 1000, padding: '10px', boxSizing: 'border-box'
        }}>
          {currentAddress && (
            <div style={{ 
              color: 'white', 
              marginBottom: '15px', 
              fontSize: '14px', 
              textAlign: 'center',
              padding: '8px 12px',
              backgroundColor: 'rgba(0,0,0,0.6)',
              borderRadius: '8px',
              maxWidth: '90%'
            }}>
              📍 {currentAddress}
            </div>
          )}
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted
            style={{ 
              width: '100%', 
              maxWidth: '100%', 
              height: 'auto',
              maxHeight: '70vh',
              transform: 'scaleX(-1)',
              backgroundColor: '#000'
            }} 
          />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          <div style={{ 
            marginTop: '20px', 
            display: 'flex', 
            gap: '15px',
            flexWrap: 'wrap',
            justifyContent: 'center'
          }}>
            <button onClick={captureWebPhoto} style={{
              padding: '15px', fontSize: '20px', backgroundColor: '#28a745',
              color: 'white', border: 'none', borderRadius: '50%',
              width: '70px', height: '70px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              📷
            </button>
            <button onClick={stopCamera} style={{
              padding: '12px 24px', backgroundColor: '#dc3545',
              color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer',
              fontSize: '16px'
            }}>
              Close
            </button>
          </div>
        </div>
      )}

      <div style={uploadSectionStyle}>
        <h3 style={{ 
          color: '#333', 
          marginBottom: '15px', 
          fontSize: '20px',
          wordBreak: 'break-word'
        }}>
          🚀 Ultra-Fast Image Upload
        </h3>

        {message && <div style={messageStyle}>{message}</div>}

        {/* Progress Bar */}
        {uploading && (
          <div style={{ margin: '15px 0', width: '100%' }}>
            <div style={progressBarStyle}>
              <div style={progressFillStyle}></div>
            </div>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              fontSize: '14px',
              marginTop: '5px'
            }}>
              <span>{uploadedCount}/{totalFiles} files</span>
              <span>{uploadProgress}% {uploadSpeed > 0 && `(${uploadSpeed}KB/s)`}</span>
            </div>
            {uploadProgress < 100 && (
              <button onClick={cancelUpload} style={{
                marginTop: '10px', padding: '10px 20px', backgroundColor: '#ef4444',
                color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer',
                width: '100%', maxWidth: '200px'
              }}>
                Cancel Upload
              </button>
            )}
          </div>
        )}

        {/* GPS Location status bar */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          marginBottom: '12px',
          width: '100%',
          boxSizing: 'border-box'
        }}>
          {gpsStatus === 'checking' && (
            <div style={{
              background: '#fff9db',
              border: '1px solid #f2c43b',
              color: '#666',
              padding: '6px 12px',
              borderRadius: '20px',
              fontSize: '13px',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <span>🛰️</span> GPS: Fetching location...
            </div>
          )}
          {gpsStatus === 'active' && (
            <div style={{
              background: '#ebfbee',
              border: '1px solid #40c057',
              color: '#2b8a3e',
              padding: '6px 12px',
              borderRadius: '20px',
              fontSize: '13px',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <span>✅</span> GPS: Active ({gpsCoords?.latitude.toFixed(4)}, {gpsCoords?.longitude.toFixed(4)})
            </div>
          )}
          {gpsStatus === 'error' && (
            <div 
              onClick={() => triggerGpsWatcher()}
              style={{
                background: '#fff5f5',
                border: '1px solid #fa5252',
                color: '#c92a2a',
                padding: '6px 12px',
                borderRadius: '20px',
                fontSize: '13px',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer'
              }}
              title="Click to retry GPS check"
            >
              <span>❌</span> GPS Error: {gpsError || 'Location unavailable'} (Retry)
            </div>
          )}
        </div>

        {/* Upload Buttons - HORIZONTAL LAYOUT */}
        <div style={{ 
          marginBottom: '15px',
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '10px',
          flexWrap: 'wrap'
        }}>
          {(userRole === 'admin' || userRole === 'owner') && (
            <button
              onClick={triggerBulkUpload}
              disabled={uploading}
              style={{
                ...buttonStyle,
                background: '#0151ba',
                color: '#ffffff',
                opacity: uploading ? 0.6 : 1
              }}
            >
              🚀 Upload 
            </button>
          )}

          <button
            onClick={triggerCamera}
            disabled={uploading || gpsStatus !== 'active'}
            style={{
              ...buttonStyle,
              background: gpsStatus === 'active' ? '#0151ba' : '#cbd5e0',
              color: gpsStatus === 'active' ? '#ffffff' : '#718096',
              cursor: gpsStatus === 'active' ? 'pointer' : 'not-allowed',
              opacity: uploading ? 0.6 : 1
            }}
          >
            {gpsStatus === 'checking' ? '🛰️ Waiting for GPS...' : 
             gpsStatus === 'error' ? '❌ Enable GPS to Photo' : 
             '📷 Take Photo'}
          </button>

          {/* Hidden Inputs */}
          <input 
            type="file" 
            ref={bulkFileInputRef} 
            onChange={handleBulkUpload} 
            accept="image/*" 
            multiple 
            style={{ display: 'none' }} 
          />
          <input 
            type="file" 
            ref={cameraInputRef} 
            onChange={handleDeviceCameraCapture} 
            accept="image/*" 
            capture="environment" 
            style={{ display: 'none' }} 
          />
        </div>
        
        <div style={{ 
          fontSize: '12px', 
          color: '#666', 
          marginTop: '10px',
          textAlign: 'center'
        }}>
          {cameraMode === 'device' && '📱 Using device camera...'}
          {cameraMode === 'webcam' && '💻 Using web camera...'}
        </div>
      </div>

      {/* Export Section */}
      {(userRole === 'admin' || userRole === 'owner') && serviceImages.length > 0 && (
        <div style={{
          background: '#f8fafd',
          border: '1px solid #0151ba',
          padding: '20px 15px',
          borderRadius: '12px',
          marginBottom: '20px',
          width: '100%',
          boxSizing: 'border-box'
        }}>
          <h4 style={{ 
            textAlign: 'center', 
            marginBottom: '15px',
            fontSize: '18px',
            color: '#0151ba'
          }}>
            📊 Export Report
          </h4>
          <div style={{ 
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '10px',
            flexWrap: 'wrap'
          }}>
            <button
              onClick={() => handleGenerateDocument('ppt')}
              disabled={exporting}
              style={{ 
                ...buttonStyle, 
                background: '#0151ba',
                color: '#ffffff',
                opacity: (exporting && exportType === 'ppt') ? 0.6 : 1
              }}
            >
              {(exporting && exportType === 'ppt') ? 'Generating...' : '📊 PowerPoint'}
            </button>
            <button
              onClick={() => handleGenerateDocument('pdf')}
              disabled={exporting}
              style={{ 
                ...buttonStyle, 
                background: '#f2c43b',
                color: '#0151ba',
                opacity: (exporting && exportType === 'pdf') ? 0.6 : 1
              }}
            >
              {(exporting && exportType === 'pdf') ? 'Generating...' : '📄 PDF'}
            </button>
          </div>
        </div>
      )}

      {/* Images Grid */}
      {serviceImages.length > 0 && userRole !== 'worker' && (
        <div style={{ width: '100%', boxSizing: 'border-box' }}>
          <div style={{ 
            display: 'flex', 
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '20px',
            flexWrap: 'wrap'
          }}>
            <h4 style={{ 
              fontSize: '18px',
              margin: 0,
              flex: 1,
              minWidth: '150px'
            }}>
              📷 Service Images ({serviceImages.length})
            </h4>
            
            <div style={{ 
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap'
            }}>
              <button 
                onClick={refreshImages} 
                disabled={deletingAll || uploading}
                style={{
                  padding: '10px 15px', 
                  background: '#6c757d',
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '6px', 
                  cursor: 'pointer',
                  fontSize: '13px',
                  minWidth: '90px',
                  opacity: (deletingAll || uploading) ? 0.6 : 1
                }}
              >
                🔄 Refresh
              </button>
              
              <button 
                onClick={deleteAllImages} 
                disabled={deletingAll || uploading}
                style={{
                  padding: '10px 15px', 
                  background: '#dc3545',
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '6px', 
                  cursor: 'pointer',
                  fontSize: '13px',
                  minWidth: '90px',
                  opacity: (deletingAll || uploading) ? 0.6 : 1
                }}
              >
                {deletingAll ? 'Deleting...' : '🗑️ Delete All'}
              </button>
            </div>
          </div>
          
          {(() => {
            const grouped = getGroupedImages();
            
            if (!grouped.isCampaign) {
              return (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                  gap: '12px',
                  marginTop: '15px',
                  width: '100%'
                }}>
                  {grouped.images.map((image, index) => renderImageCard(image, index))}
                </div>
              );
            }
            
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginTop: '15px', width: '100%' }}>
                {Object.keys(grouped.groups).map((day) => {
                  const dayImages = grouped.groups[day];
                  return (
                    <div key={day} style={{ 
                      border: '1px solid #e2e8f0', 
                      borderRadius: '12px', 
                      padding: '16px', 
                      background: '#f8fafc' 
                    }}>
                      <h4 style={{ 
                        color: '#0151ba', 
                        margin: '0 0 12px 0', 
                        fontWeight: '700',
                        fontSize: '15px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        borderBottom: '2px solid #e2e8f0',
                        paddingBottom: '8px'
                      }}>
                        <span>📅 Day {day}</span>
                        <span style={{ 
                          fontSize: '12px', 
                          background: '#0151ba', 
                          color: 'white', 
                          padding: '3px 8px', 
                          borderRadius: '12px' 
                        }}>
                          {dayImages.length} image{dayImages.length !== 1 ? 's' : ''}
                        </span>
                      </h4>
                      {dayImages.length > 0 ? (
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                          gap: '12px',
                          width: '100%'
                        }}>
                          {dayImages.map((image, index) => renderImageCard(image, index))}
                        </div>
                      ) : (
                        <div style={{ 
                          textAlign: 'center', 
                          padding: '20px', 
                          color: '#64748b', 
                          fontSize: '13px',
                          fontStyle: 'italic'
                        }}>
                          No images uploaded for Day {day}
                        </div>
                      )}
                    </div>
                  );
                })}
                
                {grouped.overflowImages && grouped.overflowImages.length > 0 && (
                  <div style={{ 
                    border: '1px solid #fee2e2', 
                    borderRadius: '12px', 
                    padding: '16px', 
                    background: '#fef2f2' 
                  }}>
                    <h4 style={{ 
                      color: '#ef4444', 
                      margin: '0 0 12px 0', 
                      fontWeight: '700',
                      fontSize: '15px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      borderBottom: '2px solid #fee2e2',
                      paddingBottom: '8px'
                    }}>
                      <span>⚠️ Other Campaign Images</span>
                      <span style={{ 
                        fontSize: '12px', 
                        background: '#ef4444', 
                        color: 'white', 
                        padding: '3px 8px', 
                        borderRadius: '12px' 
                      }}>
                        {grouped.overflowImages.length} image{grouped.overflowImages.length !== 1 ? 's' : ''}
                      </span>
                    </h4>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                      gap: '12px',
                      width: '100%'
                    }}>
                      {grouped.overflowImages.map((image, index) => renderImageCard(image, index))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {serviceImages.length === 0 && !uploading && (
        <div style={{ 
          textAlign: 'center', 
          padding: '40px 15px', 
          color: '#666',
          width: '100%',
          boxSizing: 'border-box'
        }}>
          <div style={{ 
            fontSize: '48px', 
            marginBottom: '15px' 
          }}>
            📷
          </div>
          <h4 style={{ fontSize: '18px', marginBottom: '10px' }}>No Images Yet</h4>
          <p style={{ fontSize: '14px' }}>Upload images using the button above</p>
          <p style={{ fontSize: '12px', color: '#999', marginTop: '10px' }}>
            Supports 1000+ images upload in one go
          </p>
        </div>
      )}
    </div>
  );
};

export default ImageUpload;