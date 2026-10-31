import React, { useState, useEffect } from 'react';
import axios from '../utils/api';

const ClientDashboard = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState('my-services');
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  
  // States for image viewing and work updates
  const [selectedService, setSelectedService] = useState(null);
  const [showImageModal, setShowImageModal] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [workUpdatesService, setWorkUpdatesService] = useState(null);

  // Blue/Yellow/White color palette
  const colors = {
    primary: '#0151ba',
    primaryLight: '#3b82f6',
    primaryDark: '#013b8a',
    secondary: '#f2c43b',
    secondaryLight: '#fde68a',
    secondaryDark: '#d97706',
    background: '#f8fafc',
    white: '#ffffff',
    lightGrey: '#f8f9fa',
    border: '#e2e8f0',
    text: '#1e293b',
    textLight: '#64748b',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#0151ba'
  };

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    fetchMyServices();
  }, []);

  const fetchMyServices = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/services/my-services');
      if (response.data.success) {
        const normalized = response.data.services.map(s => ({
          ...s,
          deliveryDate: s.deliveryDate || s.endDate
        }));
        setServices(normalized);
      }
    } catch (error) {
      setMessage('Error fetching services: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  // Expand multi-service orders so the client can see every work and update
  const expandServicesList = (rawServices) => {
    if (!rawServices || !Array.isArray(rawServices)) return [];
    const expanded = [];
    rawServices.forEach(service => {
      if (service.services && Array.isArray(service.services) && service.services.length > 0) {
        service.services.forEach((serviceItem, index) => {
          const itemLocAddress = (
            typeof serviceItem.location === 'string'
              ? serviceItem.location
              : (serviceItem.location?.address || '')
          ).trim().toLowerCase();

          // Strictly filter images belonging to this specific location/work item
          const itemImages = [
            ...((serviceItem.images || []).filter(Boolean)),
            ...((service.images || []).filter(img => {
              if (!img) return false;
              // 1. Match by itemId
              if (img.itemId && serviceItem._id && img.itemId.toString() === serviceItem._id.toString()) {
                return true;
              }
              // 2. Match by serviceIndex
              if (img.serviceIndex !== undefined && img.serviceIndex !== null && Number(img.serviceIndex) === index) {
                return true;
              }
              // If image has an explicit itemId or serviceIndex belonging to another item, do NOT match
              if (img.itemId && serviceItem._id && img.itemId.toString() !== serviceItem._id.toString()) {
                return false;
              }
              if (img.serviceIndex !== undefined && img.serviceIndex !== null && Number(img.serviceIndex) !== index) {
                return false;
              }
              // 3. Match by location address if present and both have addresses
              const imgLocAddress = (
                img.locationAddress || 
                img.simpleAddress || 
                (typeof img.location === 'string' ? img.location : img.location?.address) || 
                ''
              ).trim().toLowerCase();
              if (itemLocAddress && imgLocAddress && (imgLocAddress.includes(itemLocAddress) || itemLocAddress.includes(imgLocAddress))) {
                if (img.serviceType && serviceItem.serviceType && img.serviceType !== serviceItem.serviceType) {
                  return false;
                }
                return true;
              }
              return false;
            }))
          ].filter((img, idx, arr) => arr.findIndex(t => (t.public_id && t.public_id === img.public_id) || (t.url && t.url === img.url) || ((t._id || t.id) && (img._id || img.id) && (t._id || t.id).toString() === (img._id || img.id).toString())) === idx);

          const finalImages = service.services.length === 1 
            ? (itemImages.length > 0 ? itemImages : (service.images || [])) 
            : itemImages;

          expanded.push({
            ...service,
            _originalId: service._id,
            _id: serviceItem._id || `${service._id}-${index}`,
            _rowId: `${service._id}-${serviceItem._id || index}`,
            serviceType: serviceItem.serviceType,
            customServiceType: serviceItem.customServiceType,
            quantity: serviceItem.quantity,
            location: serviceItem.location || service.primaryLocation || service.location,
            notes: serviceItem.notes || '',
            status: serviceItem.status || service.status || 'pending',
            assignedTo: serviceItem.assignedTo || (service.assignedTo && !service.services.some(s => s.assignedTo) ? service.assignedTo : null),
            images: finalImages,
            meterReadings: service.meterReadings || [],
            isMultiService: true,
            serviceIndex: index,
            totalServices: service.services.length,
            serviceName: `${service.businessName} - ${serviceItem.serviceType === 'other' ? serviceItem.customServiceType : serviceItem.serviceType}`
          });
        });
      } else {
        expanded.push({
          ...service,
          _originalId: service._id,
          _id: service._id,
          _rowId: service._id,
          isMultiService: false,
          serviceIndex: 0,
          totalServices: 1,
          quantity: service.quantity || 0,
          location: service.location || service.primaryLocation,
          images: service.images || [],
          meterReadings: service.meterReadings || [],
          serviceName: `${service.businessName} - ${service.serviceType === 'other' ? service.customServiceType : service.serviceType}`,
          status: service.status || 'pending'
        });
      }
    });
    return expanded;
  };

  // Helper to get all viewable images for a service item or order - strictly isolated per location
  const getServiceViewableImages = (service) => {
    if (!service) return [];
    if (Array.isArray(service.images)) return service.images;
    return [];
  };

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

  const getCompletedDays = (service) => {
    const startDate = service.startDate;
    const endDate = service.endDate || service.deliveryDate;
    if (!startDate || !endDate) return 0;
    
    const totalDays = getCampaignTotalDays(startDate, endDate);
    if (totalDays <= 0) return 0;
    const isVehicleService = service.serviceType === 'mobile-vans';
    const hasMeterReadings = isVehicleService && service.meterReadings && service.meterReadings.length > 0;
    if (hasMeterReadings) {
      service.meterReadings.forEach(reading => {
        const hasImg = (reading.image && reading.image.url) || 
                       (reading.startImage && reading.startImage.url) || 
                       (reading.endImage && reading.endImage.url) || 
                       (reading.startReading !== undefined);
        if (hasImg) {
          const day = reading.dayNumber || getCampaignDayNumber(reading.date, startDate);
          if (day >= 1 && day <= totalDays) {
            readingsDays.add(day);
          }
        }
      });
    }
    
    const imagesDays = new Set();
    const allImgs = getServiceViewableImages(service);
    if (allImgs && allImgs.length > 0) {
      allImgs.forEach(img => {
        const day = getCampaignDayNumber(img.takenAt || img.uploadedAt || img.createdAt, startDate);
        if (day >= 1 && day <= totalDays) {
          imagesDays.add(day);
        }
      });
    }
    
    let completedCount = 0;
    for (let d = 1; d <= totalDays; d++) {
      if (isVehicleService && hasMeterReadings) {
        if (readingsDays.has(d) && imagesDays.has(d)) {
          completedCount++;
        }
      } else {
        if (imagesDays.has(d)) {
          completedCount++;
        }
      }
    }
    return completedCount;
  };

  // Calculate image upload progress
  const getImageProgress = (service) => {
    const hasCampaign = service.startDate && (service.endDate || service.deliveryDate);
    const viewableImgs = getServiceViewableImages(service);
    
    if (hasCampaign) {
      const totalDays = getCampaignTotalDays(service.startDate, service.endDate || service.deliveryDate);
      const completedDays = getCompletedDays(service);
      return {
        current: completedDays,
        total: totalDays,
        imageCount: viewableImgs.length,
        progress: totalDays > 0 ? Math.min((completedDays / totalDays) * 100, 100) : 0,
        isComplete: completedDays >= totalDays && totalDays > 0,
        text: `Day ${completedDays}/${totalDays}`,
        isCampaign: true
      };
    }
    
    const imageCount = viewableImgs.length;
    const quantity = service.quantity || 0;
    
    return {
      current: imageCount,
      total: quantity,
      imageCount: imageCount,
      progress: quantity > 0 ? Math.min((imageCount / quantity) * 100, 100) : 0,
      isComplete: quantity > 0 ? imageCount >= quantity : imageCount > 0,
      text: `${imageCount}/${quantity} images`,
      isCampaign: false
    };
  };

  // Calculate meter reading progress (only applicable to vehicle campaigns)
  const getMeterReadingProgress = (service) => {
    if (service.serviceType !== 'mobile-vans') {
      return {
        readingsCount: 0,
        totalDays: 0,
        totalDistance: 0,
        progress: 0,
        isComplete: false
      };
    }
    const readings = service.meterReadings || [];
    const totalDays = calculateDuration(service.startDate, service.deliveryDate);
    
    const totalDistance = readings.reduce((sum, reading) => {
      const s = Number(reading.startReading) || 0;
      const e = Number(reading.endReading) || 0;
      return sum + Math.max(0, e - s);
    }, 0);

    return {
      readingsCount: readings.length,
      totalDays: totalDays,
      totalDistance: totalDistance,
      progress: totalDays > 0 ? Math.min((readings.length / totalDays) * 100, 100) : 0,
      isComplete: totalDays > 0 && readings.length >= totalDays
    };
  };

  // Determine service status based on image progress
  const getServiceStatus = (service) => {
    const progress = getImageProgress(service);
    if (progress.isComplete) {
      return 'completed';
    }
    return service.status || 'pending';
  };

  // Handle viewing images for a service
  const handleViewImages = (service) => {
    const imagesToView = getServiceViewableImages(service);
    if (!imagesToView || imagesToView.length === 0) return;
    setSelectedService({
      ...service,
      images: imagesToView
    });
    setCurrentImageIndex(0);
    setShowImageModal(true);
  };

  // Navigate to next image
  const nextImage = () => {
    if (selectedService && selectedService.images) {
      setCurrentImageIndex((prevIndex) => 
        prevIndex === selectedService.images.length - 1 ? 0 : prevIndex + 1
      );
    }
  };

  // Navigate to previous image
  const prevImage = () => {
    if (selectedService && selectedService.images) {
      setCurrentImageIndex((prevIndex) => 
        prevIndex === 0 ? selectedService.images.length - 1 : prevIndex - 1
      );
    }
  };

  // Close image modal
  const closeImageModal = () => {
    setShowImageModal(false);
    setSelectedService(null);
    setCurrentImageIndex(0);
  };

  // Add keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (showImageModal) {
        if (e.key === 'ArrowRight') nextImage();
        if (e.key === 'ArrowLeft') prevImage();
        if (e.key === 'Escape') closeImageModal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showImageModal]);

  // Calculate service duration
  const calculateDuration = (startDate, deliveryDate) => {
    if (!startDate || !deliveryDate) return 0;
    const start = new Date(startDate);
    const delivery = new Date(deliveryDate);
    const days = Math.ceil((delivery - start) / (1000 * 60 * 60 * 24));
    return days;
  };

  // Get location display text
  const getLocationDisplay = (service) => {
    if (service.location?.address) {
      return service.location.address;
    }
    if (service.location?.type === 'automatic') {
      return 'Automatic Location';
    }
    return 'Location not specified';
  };

  // NEW: Get location display for individual image
  const getImageLocation = (image) => {
    if (image.locationAddress) {
      return image.locationAddress;
    }
    if (image.location?.address) {
      return image.location.address;
    }
    if (image.latitude && image.longitude) {
      return `GPS: ${image.latitude.toFixed(6)}, ${image.longitude.toFixed(6)}`;
    }
    if (image.location?.lat && image.location?.lng) {
      return `GPS: ${image.location.lat.toFixed(6)}, ${image.location.lng.toFixed(6)}`;
    }
    return 'Location data not available';
  };

  // NEW: Open Google Maps with coordinates
  const openInGoogleMaps = (image) => {
    let lat, lng;
    
    if (image.latitude && image.longitude) {
      lat = image.latitude;
      lng = image.longitude;
    } else if (image.location?.lat && image.location?.lng) {
      lat = image.location.lat;
      lng = image.location.lng;
    }
    
    if (lat && lng) {
      const url = `https://www.google.com/maps?q=${lat},${lng}`;
      window.open(url, '_blank');
    }
  };

  // Styles - Green/Brown Theme
  const containerStyle = {
    minHeight: '100vh',
    background: `linear-gradient(135deg, ${colors.background} 0%, ${colors.white} 100%)`,
    padding: isMobile ? '12px' : '20px',
    fontFamily: 'Arial, sans-serif',
    fontSize: isMobile ? '14px' : '16px'
  };

  const headerStyle = {
    background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`,
    padding: isMobile ? '16px' : '24px',
    borderRadius: '12px',
    boxShadow: '0 4px 12px rgba(1, 81, 186, 0.2)',
    marginBottom: isMobile ? '16px' : '20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: isMobile ? '12px' : '0'
  };

  const tabContainerStyle = {
    display: 'flex',
    gap: isMobile ? '6px' : '10px',
    marginBottom: isMobile ? '16px' : '20px',
    flexWrap: 'wrap',
    background: colors.white,
    padding: isMobile ? '12px' : '16px',
    borderRadius: '10px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    overflowX: isMobile ? 'auto' : 'visible',
    border: `1px solid ${colors.border}`
  };

  const tabStyle = {
    padding: isMobile ? '10px 16px' : '12px 20px',
    background: colors.white,
    border: `2px solid ${colors.primary}`,
    borderRadius: '8px',
    fontSize: isMobile ? '13px' : '14px',
    cursor: 'pointer',
    transition: 'all 0.3s',
    fontWeight: '600',
    color: colors.primary,
    whiteSpace: 'nowrap',
    flex: isMobile ? '1' : 'none',
    minWidth: isMobile ? 'auto' : '120px'
  };

  const activeTabStyle = {
    ...tabStyle,
    background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`,
    color: colors.white,
    borderColor: colors.primary
  };

  const contentStyle = {
    background: colors.white,
    padding: isMobile ? '16px' : '24px',
    borderRadius: '12px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
    minHeight: '400px',
    border: `1px solid ${colors.border}`
  };

  const cardsContainerStyle = {
    display: 'grid',
    gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: isMobile ? '12px' : '16px',
    marginTop: '20px'
  };

  // Card Style - Blue/Yellow Accents
  const cardStyle = {
    background: colors.white,
    padding: isMobile ? '14px' : '18px',
    borderRadius: '10px',
    boxShadow: '0 2px 8px rgba(1, 81, 186, 0.1)',
    border: `1px solid ${colors.border}`,
    borderLeft: `4px solid ${colors.primary}`,
    transition: 'all 0.3s ease',
    display: 'flex',
    flexDirection: 'column',
    gap: isMobile ? '10px' : '12px'
  };

  // UPDATED: Image Modal Styles - 100% Mobile Responsive
  const modalOverlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    padding: isMobile ? '10px' : '20px',
    boxSizing: 'border-box'
  };

  const modalContentStyle = {
    position: 'relative',
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: isMobile ? '10px' : '20px',
    boxSizing: 'border-box'
  };

  const modalImageStyle = {
    width: '100%',
    maxWidth: '100%',
    height: isMobile ? '60vh' : '70vh',
    objectFit: 'contain',
    borderRadius: '10px',
    marginBottom: isMobile ? '10px' : '15px'
  };

  const navigationButtonStyle = {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'rgba(255, 255, 255, 0.2)',
    color: 'white',
    border: 'none',
    borderRadius: '50%',
    width: isMobile ? '40px' : '50px',
    height: isMobile ? '40px' : '50px',
    fontSize: isMobile ? '16px' : '20px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(10px)',
    zIndex: 1001
  };

  const closeButtonStyle = {
    position: 'absolute',
    top: isMobile ? '10px' : '20px',
    right: isMobile ? '10px' : '20px',
    background: 'rgba(255, 255, 255, 0.2)',
    color: 'white',
    border: 'none',
    borderRadius: '50%',
    width: isMobile ? '35px' : '40px',
    height: isMobile ? '35px' : '40px',
    fontSize: isMobile ? '16px' : '18px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(10px)',
    zIndex: 1001
  };

  const imageInfoStyle = {
    color: 'white',
    textAlign: 'center',
    background: 'rgba(255, 255, 255, 0.1)',
    padding: isMobile ? '12px' : '15px',
    borderRadius: '10px',
    width: '100%',
    maxWidth: '600px',
    marginTop: isMobile ? '8px' : '15px',
    boxSizing: 'border-box'
  };

  const imageCounterStyle = {
    color: 'white',
    fontSize: isMobile ? '14px' : '16px',
    marginBottom: '8px',
    fontWeight: 'bold'
  };

  // NEW: Location bubble style for images
  const locationBubbleStyle = {
    background: 'rgba(1, 81, 186, 0.9)',
    color: colors.white,
    padding: isMobile ? '8px 12px' : '10px 15px',
    borderRadius: '20px',
    fontSize: isMobile ? '12px' : '14px',
    fontWeight: '600',
    marginTop: isMobile ? '8px' : '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    border: `1px solid ${colors.secondary}`,
    width: 'fit-content',
    margin: '8px auto 0 auto'
  };

  const getStatusColor = (status) => {
    const actualStatus = getServiceStatus(status);
    switch (actualStatus) {
      case 'active': return colors.success;
      case 'pending': return colors.warning;
      case 'completed': return colors.info;
      default: return colors.secondary;
    }
  };

  const getStatusIcon = (status) => {
    const actualStatus = getServiceStatus(status);
    switch (actualStatus) {
      case 'active': return '🟢';
      case 'pending': return '🟡';
      case 'completed': return '🔵';
      default: return '⚪';
    }
  };

  const renderMyServices = () => {
    const expandedServices = expandServicesList(services);

    return (
      <div>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: '20px', 
          flexWrap: 'wrap', 
          gap: '10px' 
        }}>
          <h3 style={{ 
            color: colors.primary, 
            margin: 0, 
            fontSize: isMobile ? '18px' : '24px',
            fontWeight: '700'
          }}>
            📋 My Services & Works ({expandedServices.length})
          </h3>
          <button
            onClick={fetchMyServices}
            style={{
              padding: '10px 16px',
              background: `linear-gradient(135deg, ${colors.secondary} 0%, ${colors.secondaryDark} 100%)`,
              color: colors.primary,
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: '600',
              boxShadow: '0 2px 8px rgba(198, 170, 88, 0.3)'
            }}
          >
            🔄 Refresh
          </button>
        </div>

        {loading ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '40px', 
            color: colors.textLight,
            fontSize: '16px'
          }}>
            Loading services...
          </div>
        ) : expandedServices.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '40px', 
            color: colors.textLight 
          }}>
            <div style={{ 
              fontSize: '48px', 
              marginBottom: '20px',
              opacity: 0.7
            }}>
              📋
            </div>
            <h4 style={{ 
              color: colors.primary,
              margin: '0 0 12px 0',
              fontSize: '20px'
            }}>
              No Services Yet
            </h4>
            <p style={{ 
              color: colors.textLight,
              fontSize: '15px',
              margin: 0
            }}>
              Your services will appear here once they are assigned to your business.
            </p>
          </div>
        ) : (
          <div style={cardsContainerStyle}>
            {expandedServices.map((service, sIndex) => {
              const imageProgress = getImageProgress(service);
              const meterProgress = getMeterReadingProgress(service);
              const actualStatus = getServiceStatus(service);
              const duration = calculateDuration(service.startDate, service.deliveryDate);
              const viewableImages = getServiceViewableImages(service);
              const serviceTypeLabel = service.serviceType === 'other' ? service.customServiceType : service.serviceType;
              
              return (
                <div 
                  key={service._rowId || service._id || sIndex} 
                  style={cardStyle}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(1, 81, 186, 0.15)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(1, 81, 186, 0.1)';
                  }}
                >
                  {/* Card Header - Business Name and Status */}
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'flex-start', 
                    gap: '10px' 
                  }}>
                    <div style={{ flex: 1 }}>
                      <h4 style={{ 
                        margin: '0 0 4px 0', 
                        color: colors.primary, 
                        fontSize: '17px',
                        fontWeight: '700',
                        lineHeight: '1.3'
                      }}>
                        {service.businessName}
                      </h4>
                      {service.isMultiService && (
                        <div style={{
                          fontSize: '11px',
                          color: colors.primaryLight,
                          fontWeight: '600',
                          marginBottom: '6px'
                        }}>
                          Work {service.serviceIndex + 1} of {service.totalServices}: {serviceTypeLabel?.toUpperCase()}
                        </div>
                      )}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '8px',
                        marginBottom: '8px',
                        flexWrap: 'wrap'
                      }}>
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: '12px',
                          fontSize: '10px',
                          background: getStatusColor(service),
                          color: colors.white,
                          fontWeight: '700'
                        }}>
                          {getStatusIcon(service)} {actualStatus.toUpperCase()}
                        </span>
                        {service.assignedTo && (
                          <span style={{
                            padding: '4px 8px',
                            borderRadius: '12px',
                            fontSize: '10px',
                            background: colors.background,
                            color: colors.primaryDark,
                            border: `1px solid ${colors.border}`,
                            fontWeight: '600'
                          }}>
                            👷 {service.assignedTo.username || 'Assigned'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Progress Bars Section */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    
                    {/* Image Progress */}
                    <div>
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        marginBottom: '6px'
                      }}>
                        <span style={{ 
                          fontSize: '11px', 
                          color: colors.textLight, 
                          fontWeight: '600',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          {imageProgress.isCampaign ? '📅 Campaign Day' : '📷 Photos Uploaded'}
                        </span>
                        <span style={{ 
                          fontSize: '11px', 
                          color: imageProgress.isComplete ? colors.success : colors.primary,
                          fontWeight: '700'
                        }}>
                          {imageProgress.isCampaign ? `Day ${imageProgress.current}/${imageProgress.total}` : `${imageProgress.imageCount}/${imageProgress.total}`}
                          {imageProgress.isComplete && ' ✅'}
                        </span>
                      </div>
                      <div style={{
                        width: '100%',
                        height: '8px',
                        backgroundColor: colors.border,
                        borderRadius: '4px',
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          width: `${Math.min(imageProgress.progress, 100)}%`,
                          height: '100%',
                          background: imageProgress.isComplete ? 
                            `linear-gradient(135deg, ${colors.success} 0%, #059669 100%)` :
                            imageProgress.progress >= 75 ? 
                            `linear-gradient(135deg, ${colors.info} 0%, #0891b2 100%)` :
                            imageProgress.progress >= 50 ? 
                            `linear-gradient(135deg, ${colors.warning} 0%, #d97706 100%)` : 
                            `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`,
                          borderRadius: '4px',
                          transition: 'all 0.3s ease'
                        }} />
                      </div>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '10px',
                        color: colors.textLight,
                        marginTop: '4px'
                      }}>
                        <span>{viewableImages.length} photo{viewableImages.length !== 1 ? 's' : ''} uploaded</span>
                        <span>{Math.round(imageProgress.progress)}% complete</span>
                      </div>
                    </div>

                    {/* Meter Reading Progress (if vehicle or has readings) */}
                    {(meterProgress.readingsCount > 0 || service.serviceType === 'mobile-vans') && (
                      <div>
                        <div style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          marginBottom: '6px'
                        }}>
                          <span style={{ 
                            fontSize: '11px', 
                            color: colors.textLight, 
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            🚗 Distance Covered
                          </span>
                          <span style={{ 
                            fontSize: '11px', 
                            color: meterProgress.isComplete ? colors.success : colors.secondaryDark,
                            fontWeight: '700'
                          }}>
                            {meterProgress.readingsCount}/{meterProgress.totalDays} days
                            {meterProgress.isComplete && ' ✅'}
                          </span>
                        </div>
                        <div style={{
                          width: '100%',
                          height: '8px',
                          backgroundColor: colors.border,
                          borderRadius: '4px',
                          overflow: 'hidden'
                        }}>
                          <div style={{
                            width: `${Math.min(meterProgress.progress, 100)}%`,
                            height: '100%',
                            background: meterProgress.isComplete ? 
                              `linear-gradient(135deg, ${colors.success} 0%, #059669 100%)` :
                              meterProgress.progress >= 75 ? 
                              `linear-gradient(135deg, ${colors.info} 0%, #0891b2 100%)` :
                              meterProgress.progress >= 50 ? 
                              `linear-gradient(135deg, ${colors.warning} 0%, #d97706 100%)` : 
                              `linear-gradient(135deg, ${colors.secondary} 0%, ${colors.secondaryDark} 100%)`,
                            borderRadius: '4px',
                            transition: 'all 0.3s ease'
                          }} />
                        </div>
                        <div style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          fontSize: '10px', 
                          color: colors.textLight, 
                          marginTop: '4px' 
                        }}>
                          <span>Total: {meterProgress.totalDistance.toFixed(2)} km</span>
                          <span>{Math.round(meterProgress.progress)}% complete</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div style={{ 
                    display: 'flex', 
                    gap: '8px', 
                    flexWrap: 'wrap'
                  }}>
                    <button
                      onClick={() => handleViewImages(service)}
                      style={{
                        padding: '8px 12px',
                        background: viewableImages.length > 0 ? 
                          `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)` : 
                          colors.textLight,
                        color: colors.white,
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: '600',
                        cursor: viewableImages.length > 0 ? 'pointer' : 'default',
                        opacity: viewableImages.length > 0 ? 1 : 0.6,
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                      disabled={viewableImages.length === 0}
                    >
                      📷 View Images ({viewableImages.length})
                    </button>

                    <button
                      onClick={() => setWorkUpdatesService(service)}
                      style={{
                        padding: '8px 12px',
                        background: `linear-gradient(135deg, ${colors.secondary} 0%, ${colors.secondaryDark} 100%)`,
                        color: colors.primaryDark,
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      📋 Work Updates {meterProgress.readingsCount > 0 ? `(${meterProgress.readingsCount})` : ''}
                    </button>
                  </div>

                  {/* Description */}
                  {service.description && (
                    <div style={{ 
                      background: colors.background,
                      padding: '10px 12px',
                      borderRadius: '8px',
                      borderLeft: `3px solid ${colors.secondary}`
                    }}>
                      <div style={{ 
                        fontSize: '11px', 
                        color: colors.primary, 
                        fontWeight: '700', 
                        marginBottom: '4px' 
                      }}>
                        📝 Description
                      </div>
                      <div style={{ 
                        fontSize: '13px', 
                        color: colors.text, 
                        lineHeight: '1.4'
                      }}>
                        {service.description}
                      </div>
                    </div>
                  )}

                  {/* Service Details Grid */}
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: '1fr 1fr', 
                    gap: '10px' 
                  }}>
                    {/* Quantity */}
                    <div style={{ 
                      background: `linear-gradient(135deg, ${colors.background} 0%, ${colors.white} 100%)`,
                      padding: '8px 10px',
                      borderRadius: '8px',
                      textAlign: 'center',
                      border: `1px solid ${colors.border}`
                    }}>
                      <div style={{ 
                        fontSize: '10px', 
                        color: colors.primary, 
                        fontWeight: '700', 
                        marginBottom: '4px' 
                      }}>
                        📦 QUANTITY
                      </div>
                      <div style={{ 
                        fontSize: '14px', 
                        color: colors.primaryDark, 
                        fontWeight: '700' 
                      }}>
                        {service.quantity || '0'} units
                      </div>
                    </div>

                    {/* Duration */}
                    <div style={{ 
                      background: `linear-gradient(135deg, ${colors.background} 0%, ${colors.white} 100%)`,
                      padding: '8px 10px',
                      borderRadius: '8px',
                      textAlign: 'center',
                      border: `1px solid ${colors.border}`
                    }}>
                      <div style={{ 
                        fontSize: '10px', 
                        color: colors.primary, 
                        fontWeight: '700', 
                        marginBottom: '4px' 
                      }}>
                        ⏱️ DURATION
                      </div>
                      <div style={{ 
                        fontSize: '14px', 
                        color: colors.primaryDark, 
                        fontWeight: '700' 
                      }}>
                        {duration} days
                      </div>
                    </div>
                  </div>

                  {/* Location */}
                  <div style={{ 
                    background: colors.background,
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: `1px solid ${colors.border}`
                  }}>
                    <div style={{ 
                      fontSize: '10px', 
                      color: colors.primary, 
                      fontWeight: '700', 
                      marginBottom: '4px' 
                      }}>
                      📍 LOCATION
                    </div>
                    <div style={{ 
                      fontSize: '12px', 
                      color: colors.text,
                      lineHeight: '1.3'
                    }}>
                      {getLocationDisplay(service)}
                    </div>
                  </div>

                  {/* Dates Section */}
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: '1fr 1fr', 
                    gap: '10px' 
                  }}>
                    {/* Start Date */}
                    <div style={{ 
                      background: `linear-gradient(135deg, ${colors.background} 0%, ${colors.white} 100%)`,
                      padding: '8px 10px',
                      borderRadius: '8px',
                      textAlign: 'center',
                      border: `1px solid ${colors.border}`
                    }}>
                      <div style={{ 
                        fontSize: '9px', 
                        color: colors.primary, 
                        fontWeight: '700', 
                        marginBottom: '4px' 
                      }}>
                        🚀 START DATE
                      </div>
                      <div style={{ 
                        fontSize: '12px', 
                        color: colors.text, 
                        fontWeight: '600' 
                      }}>
                        {service.startDate ? new Date(service.startDate).toLocaleDateString() : 'N/A'}
                      </div>
                    </div>

                    {/* Delivery Date */}
                    <div style={{ 
                      background: `linear-gradient(135deg, ${colors.background} 0%, ${colors.white} 100%)`,
                      padding: '8px 10px',
                      borderRadius: '8px',
                      textAlign: 'center',
                      border: `1px solid ${colors.border}`
                    }}>
                      <div style={{ 
                        fontSize: '9px', 
                        color: colors.primary, 
                        fontWeight: '700', 
                        marginBottom: '4px' 
                      }}>
                        📦 DELIVERY DATE
                      </div>
                      <div style={{ 
                        fontSize: '12px', 
                        color: colors.text, 
                        fontWeight: '600' 
                      }}>
                        {service.deliveryDate ? new Date(service.deliveryDate).toLocaleDateString() : 'N/A'}
                      </div>
                    </div>
                  </div>

                  {/* Service Type */}
                  <div style={{ 
                    background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`,
                    padding: '10px 12px',
                    borderRadius: '8px',
                    textAlign: 'center'
                  }}>
                    <div style={{ 
                      fontSize: '10px', 
                      color: colors.white, 
                      fontWeight: '700', 
                      marginBottom: '4px',
                      opacity: 0.9
                    }}>
                      🛠️ WORK TYPE
                    </div>
                    <div style={{ 
                      fontSize: '13px', 
                      color: colors.white, 
                      fontWeight: '700' 
                    }}>
                      {serviceTypeLabel?.toUpperCase()}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={containerStyle}>
      {/* UPDATED: Image Viewing Modal with Location Below Every Image */}
      {showImageModal && selectedService && selectedService.images && selectedService.images.length > 0 && selectedService.images[currentImageIndex] && (
        <div style={modalOverlayStyle} onClick={closeImageModal}>
          <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
            
            {/* Close Button */}
            <button 
              onClick={closeImageModal}
              style={closeButtonStyle}
            >
              ✕
            </button>

            {/* Previous Button */}
            {selectedService.images.length > 1 && (
              <button 
                onClick={prevImage}
                style={{ ...navigationButtonStyle, left: isMobile ? '5px' : '20px' }}
              >
                ‹
              </button>
            )}

            {/* Image Container with Location Below */}
            <div style={{ 
              width: '100%', 
              height: isMobile ? '60vh' : '70vh', 
              display: 'flex', 
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <img 
                src={selectedService.images[currentImageIndex].url || selectedService.images[currentImageIndex].path} 
                alt={selectedService.images[currentImageIndex].caption || `Image ${currentImageIndex + 1}`}
                style={modalImageStyle}
                onError={(e) => {
                  e.target.src = 'https://via.placeholder.com/800x600?text=Image+Not+Found';
                }}
              />

              {/* NEW: Location Bubble Below Every Image */}
              <div 
                style={locationBubbleStyle}
                onClick={() => openInGoogleMaps(selectedService.images[currentImageIndex])}
                onMouseEnter={(e) => {
                  e.target.style.background = 'rgba(1, 81, 186, 1)';
                  e.target.style.transform = 'scale(1.05)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'rgba(1, 81, 186, 0.9)';
                  e.target.style.transform = 'scale(1)';
                }}
              >
                📍 {getImageLocation(selectedService.images[currentImageIndex])}
              </div>
            </div>

            {/* Next Button */}
            {selectedService.images.length > 1 && (
              <button 
                onClick={nextImage}
                style={{ ...navigationButtonStyle, right: isMobile ? '5px' : '20px' }}
              >
                ›
              </button>
            )}

            {/* Image Information */}
            <div style={imageInfoStyle}>
              <div style={imageCounterStyle}>
                Image {currentImageIndex + 1} of {selectedService.images.length}
              </div>
              
              <div style={{ marginBottom: '6px', fontSize: isMobile ? '12px' : '14px' }}>
                <strong>Caption:</strong> {selectedService.images[currentImageIndex].caption || 'No caption'}
              </div>
              
              <div style={{ marginBottom: '6px', fontSize: isMobile ? '12px' : '14px' }}>
                <strong>Date:</strong> {new Date(selectedService.images[currentImageIndex].takenAt || selectedService.images[currentImageIndex].uploadedAt || selectedService.images[currentImageIndex].createdAt || Date.now()).toLocaleString()}
              </div>

              {/* Progress in Modal */}
              <div style={{ 
                marginTop: '8px', 
                padding: '8px',
                background: 'rgba(255,255,255,0.1)',
                borderRadius: '8px'
              }}>
                <div style={{ fontSize: isMobile ? '11px' : '13px', marginBottom: '4px', fontWeight: '600' }}>
                  <strong>Progress:</strong> {currentImageIndex + 1}/{selectedService.images.length} images viewed
                </div>
                <div style={{
                  width: '100%',
                  height: '6px',
                  backgroundColor: 'rgba(255,255,255,0.2)',
                  borderRadius: '3px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${Math.round(((currentImageIndex + 1) / selectedService.images.length) * 100)}%`,
                    height: '100%',
                    background: `linear-gradient(135deg, ${colors.success} 0%, #059669 100%)`,
                    borderRadius: '3px'
                  }} />
                </div>
              </div>
            </div>

            {/* Mobile Instructions */}
            {isMobile && selectedService.images.length > 1 && (
              <div style={{ 
                color: 'rgba(255, 255, 255, 0.6)', 
                fontSize: '12px', 
                marginTop: '8px',
                textAlign: 'center'
              }}>
                Swipe left/right to navigate
              </div>
            )}

            {/* Desktop Instructions */}
            {!isMobile && (
              <div style={{ 
                color: 'rgba(255, 255, 255, 0.6)', 
                fontSize: '12px', 
                marginTop: '8px' 
              }}>
                Use ← → arrow keys to navigate • Esc to close
              </div>
            )}
          </div>
        </div>
      )}

      {/* NEW: Work Updates & Meter Readings Modal */}
      {workUpdatesService && (
        <div style={modalOverlayStyle} onClick={() => setWorkUpdatesService(null)}>
          <div 
            style={{
              background: colors.white,
              borderRadius: '16px',
              padding: isMobile ? '16px' : '24px',
              width: '100%',
              maxWidth: '800px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', borderBottom: `1px solid ${colors.border}`, paddingBottom: '12px' }}>
              <div>
                <h3 style={{ margin: '0 0 6px 0', color: colors.primary, fontSize: isMobile ? '18px' : '22px' }}>
                  📊 Work Updates & Progress
                </h3>
                <div style={{ fontSize: '13px', color: colors.textLight }}>
                  {workUpdatesService.businessName} • <strong style={{ color: colors.primary }}>{workUpdatesService.serviceType === 'other' ? workUpdatesService.customServiceType : workUpdatesService.serviceType}</strong>
                </div>
              </div>
              <button
                onClick={() => setWorkUpdatesService(null)}
                style={{
                  background: colors.border,
                  border: 'none',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  color: colors.text
                }}
              >
                ✕
              </button>
            </div>

            {/* Quick Status Bar */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}>
              <div style={{ background: colors.background, padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: colors.textLight, fontWeight: '600' }}>STATUS</div>
                <div style={{ fontSize: '13px', fontWeight: 'bold', color: getStatusColor(workUpdatesService) }}>
                  {getStatusIcon(workUpdatesService)} {getServiceStatus(workUpdatesService).toUpperCase()}
                </div>
              </div>
              <div style={{ background: colors.background, padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: colors.textLight, fontWeight: '600' }}>QUANTITY</div>
                <div style={{ fontSize: '13px', fontWeight: 'bold', color: colors.primary }}>
                  {workUpdatesService.quantity || 0} units
                </div>
              </div>
              <div style={{ background: colors.background, padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: colors.textLight, fontWeight: '600' }}>ASSIGNED WORKER</div>
                <div style={{ fontSize: '13px', fontWeight: 'bold', color: colors.primaryDark }}>
                  {workUpdatesService.assignedTo?.username || 'Field Team'}
                </div>
              </div>
              <div style={{ background: colors.background, padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: colors.textLight, fontWeight: '600' }}>TOTAL PHOTOS</div>
                <div style={{ fontSize: '13px', fontWeight: 'bold', color: colors.success }}>
                  📷 {getServiceViewableImages(workUpdatesService).length}
                </div>
              </div>
            </div>

            {/* Meter Readings Table (if any vehicle campaign) */}
            {workUpdatesService.serviceType === 'mobile-vans' && workUpdatesService.meterReadings && workUpdatesService.meterReadings.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ color: colors.primary, fontSize: '15px', marginBottom: '10px' }}>
                  🚗 Daily Meter Distance Log ({workUpdatesService.meterReadings.length} entries)
                </h4>
                <div style={{ overflowX: 'auto', border: `1px solid ${colors.border}`, borderRadius: '8px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: colors.background, textAlign: 'left' }}>
                        <th style={{ padding: '8px 10px', borderBottom: `1px solid ${colors.border}` }}>Day</th>
                        <th style={{ padding: '8px 10px', borderBottom: `1px solid ${colors.border}` }}>Date</th>
                        <th style={{ padding: '8px 10px', borderBottom: `1px solid ${colors.border}` }}>Start (km)</th>
                        <th style={{ padding: '8px 10px', borderBottom: `1px solid ${colors.border}` }}>End (km)</th>
                        <th style={{ padding: '8px 10px', borderBottom: `1px solid ${colors.border}` }}>Distance</th>
                        <th style={{ padding: '8px 10px', borderBottom: `1px solid ${colors.border}` }}>Proofs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workUpdatesService.meterReadings.map((reading, idx) => (
                        <tr key={reading._id || idx} style={{ borderBottom: `1px solid ${colors.border}` }}>
                          <td style={{ padding: '8px 10px', fontWeight: 'bold', color: colors.primary }}>
                            Day {reading.dayNumber || idx + 1}
                          </td>
                          <td style={{ padding: '8px 10px', color: colors.textLight }}>
                            {new Date(reading.date).toLocaleDateString()}
                          </td>
                          <td style={{ padding: '8px 10px' }}>{reading.startReading}</td>
                          <td style={{ padding: '8px 10px' }}>{reading.endReading}</td>
                          <td style={{ padding: '8px 10px', fontWeight: 'bold', color: colors.success }}>
                            {Math.max(0, (Number(reading.endReading) || 0) - (Number(reading.startReading) || 0)).toFixed(2)} km
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              {(reading.startImage?.url || reading.image?.url) && (
                                <a 
                                  href={reading.startImage?.url || reading.image?.url} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  style={{ color: colors.primary, textDecoration: 'underline', fontSize: '11px', fontWeight: '600' }}
                                >
                                  Start Photo
                                </a>
                              )}
                              {reading.endImage?.url && (
                                <a 
                                  href={reading.endImage?.url} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  style={{ color: colors.primary, textDecoration: 'underline', fontSize: '11px', fontWeight: '600' }}
                                >
                                  End Photo
                                </a>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Photos Proofs & Live Updates */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                <h4 style={{ color: colors.primary, fontSize: '15px', margin: 0 }}>
                  📷 Work Photos & Updates ({getServiceViewableImages(workUpdatesService).length})
                </h4>
                {getServiceViewableImages(workUpdatesService).length > 0 && (
                  <button
                    onClick={() => {
                      const cur = workUpdatesService;
                      setWorkUpdatesService(null);
                      handleViewImages(cur);
                    }}
                    style={{
                      background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`,
                      color: colors.white,
                      border: 'none',
                      borderRadius: '6px',
                      padding: '6px 12px',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    View Slideshow ↗
                  </button>
                )}
              </div>

              {getServiceViewableImages(workUpdatesService).length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: colors.textLight, background: colors.background, borderRadius: '8px' }}>
                  No photos uploaded for this work yet. Once field workers upload photos, they will appear here live.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px' }}>
                  {getServiceViewableImages(workUpdatesService).map((img, idx) => (
                    <div 
                      key={img._id || idx}
                      onClick={() => {
                        const cur = workUpdatesService;
                        setWorkUpdatesService(null);
                        setSelectedService({ ...cur, images: getServiceViewableImages(cur) });
                        setCurrentImageIndex(idx);
                        setShowImageModal(true);
                      }}
                      style={{
                        border: `1px solid ${colors.border}`,
                        borderRadius: '8px',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        background: colors.white,
                        transition: 'transform 0.2s',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                      onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                    >
                      <img 
                        src={img.url || img.path} 
                        alt={img.caption || `Photo ${idx + 1}`}
                        style={{ width: '100%', height: '110px', objectFit: 'cover' }}
                        onError={(e) => { e.target.src = 'https://via.placeholder.com/300x200?text=Image'; }}
                      />
                      <div style={{ padding: '6px', fontSize: '10px', color: colors.text }}>
                        <div style={{ fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {img.caption || `Image ${idx + 1}`}
                        </div>
                        <div style={{ color: colors.textLight, fontSize: '9px', marginTop: '2px' }}>
                          {new Date(img.takenAt || img.uploadedAt || img.createdAt || Date.now()).toLocaleDateString()}
                        </div>
                        {getImageLocation(img) !== 'Location data not available' && (
                          <div style={{ color: colors.primary, fontSize: '9px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '2px' }}>
                            📍 {getImageLocation(img)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={headerStyle}>
        <div>
          <h1 style={{ 
            color: colors.white, 
            margin: '0 0 6px 0', 
            fontSize: isMobile ? '22px' : '28px',
            fontWeight: '700'
          }}>
            🏢 Client Dashboard
          </h1>
          <p style={{ 
            color: 'rgba(255, 255, 255, 0.9)', 
            margin: 0, 
            fontSize: isMobile ? '13px' : '15px' 
          }}>
            Welcome, {user.username} • {user.businessName}
          </p>
        </div>
        <button 
          onClick={onLogout}
          style={{
            padding: isMobile ? '10px 16px' : '12px 20px',
            background: 'rgba(255, 255, 255, 0.2)',
            color: colors.white,
            border: '1px solid rgba(255, 255, 255, 0.3)',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: isMobile ? '13px' : '14px',
            fontWeight: '600',
            backdropFilter: 'blur(10px)',
            transition: 'all 0.3s'
          }}
          onMouseEnter={(e) => {
            e.target.style.background = 'rgba(255, 255, 255, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.target.style.background = 'rgba(255, 255, 255, 0.2)';
          }}
        >
          {isMobile ? '🚪 Logout' : 'Logout'}
        </button>
      </div>

      {/* Message */}
      {message && (
        <div style={{
          padding: '14px 16px',
          borderRadius: '8px',
          marginBottom: '20px',
          background: message.includes('success') ? 
            `linear-gradient(135deg, ${colors.success}15 0%, ${colors.success}25 100%)` : 
            `linear-gradient(135deg, ${colors.danger}15 0%, ${colors.danger}25 100%)`,
          color: message.includes('success') ? colors.success : colors.danger,
          border: `1px solid ${message.includes('success') ? `${colors.success}30` : `${colors.danger}30`}`,
          fontSize: '14px',
          fontWeight: '500'
        }}>
          {message}
          <button 
            onClick={() => setMessage('')}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              float: 'right',
              fontSize: '18px',
              fontWeight: 'bold'
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div style={tabContainerStyle}>
        <button
          onClick={() => setActiveTab('my-services')}
          style={activeTab === 'my-services' ? activeTabStyle : tabStyle}
        >
          {isMobile ? '📋 My Services' : '📋 My Services'}
        </button>
      </div>

      {/* Content */}
      <div style={contentStyle}>
        {activeTab === 'my-services' && renderMyServices()}
      </div>
    </div>
  );
};

export default ClientDashboard;