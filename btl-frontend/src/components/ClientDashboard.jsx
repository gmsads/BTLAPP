import React, { useState, useEffect } from 'react';
import axios from '../utils/api';

const ClientDashboard = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState('my-services');
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  
  // States for image viewing
  const [selectedService, setSelectedService] = useState(null);
  const [showImageModal, setShowImageModal] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

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
    
    const readingsDays = new Set();
    if (service.meterReadings) {
      service.meterReadings.forEach(reading => {
        if (reading.image && reading.image.url) {
          const day = reading.dayNumber || getCampaignDayNumber(reading.date, startDate);
          if (day >= 1 && day <= totalDays) {
            readingsDays.add(day);
          }
        }
      });
    }
    
    const imagesDays = new Set();
    if (service.images) {
      service.images.forEach(img => {
        const day = getCampaignDayNumber(img.takenAt || img.uploadedAt || img.createdAt, startDate);
        if (day >= 1 && day <= totalDays) {
          imagesDays.add(day);
        }
      });
    }
    
    let completedCount = 0;
    for (let d = 1; d <= totalDays; d++) {
      if (readingsDays.has(d) && imagesDays.has(d)) {
        completedCount++;
      }
    }
    return completedCount;
  };

  // Calculate image upload progress
  const getImageProgress = (service) => {
    const hasCampaign = service.startDate && (service.endDate || service.deliveryDate);
    
    if (hasCampaign) {
      const totalDays = getCampaignTotalDays(service.startDate, service.endDate || service.deliveryDate);
      const completedDays = getCompletedDays(service);
      return {
        current: completedDays,
        total: totalDays,
        progress: totalDays > 0 ? Math.min((completedDays / totalDays) * 100, 100) : 0,
        isComplete: completedDays >= totalDays,
        text: `Day ${completedDays}/${totalDays}`,
        isCampaign: true
      };
    }
    
    const imageCount = service.images?.length || 0;
    const quantity = service.quantity || 0;
    
    return {
      current: imageCount,
      total: quantity,
      progress: quantity > 0 ? (imageCount / quantity) * 100 : 0,
      isComplete: imageCount >= quantity,
      text: `${imageCount}/${quantity} images`,
      isCampaign: false
    };
  };

  // Calculate meter reading progress
  const getMeterReadingProgress = (service) => {
    const readings = service.meterReadings || [];
    const totalDays = calculateDuration(service.startDate, service.deliveryDate);
    
    const totalDistance = readings.reduce((sum, reading) => {
      return sum + (reading.endReading - reading.startReading);
    }, 0);

    return {
      readingsCount: readings.length,
      totalDays: totalDays,
      totalDistance: totalDistance,
      progress: totalDays > 0 ? (readings.length / totalDays) * 100 : 0,
      isComplete: readings.length >= totalDays
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
    setSelectedService(service);
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

  const renderMyServices = () => (
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
          📋 My Services ({services.length})
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
      ) : services.length === 0 ? (
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
          {services.map((service) => {
            const imageProgress = getImageProgress(service);
            const meterProgress = getMeterReadingProgress(service);
            const actualStatus = getServiceStatus(service);
            const duration = calculateDuration(service.startDate, service.deliveryDate);
            
            return (
              <div 
                key={service._id} 
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
                      margin: '0 0 6px 0', 
                      color: colors.primary, 
                      fontSize: '17px',
                      fontWeight: '700',
                      lineHeight: '1.3'
                    }}>
                      {service.businessName}
                    </h4>
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
                        {imageProgress.isCampaign ? '📅 Campaign' : '📷 Images'}
                      </span>
                    </div>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      marginBottom: '6px'
                    }}>
                      <span style={{ 
                        fontSize: '11px', 
                        color: imageProgress.isComplete ? colors.success : colors.primary,
                        fontWeight: '700'
                      }}>
                        {imageProgress.isCampaign ? `Day ${imageProgress.current}/${imageProgress.total}` : `${imageProgress.current}/${imageProgress.total}`}
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
                  </div>

                  {/* Meter Reading Progress */}
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
                        🚗 Distance
                      </span>
                      <span style={{ 
                        fontSize: '11px', 
                        color: meterProgress.isComplete ? colors.success : colors.secondary,
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
                      padding: '6px 12px',
                      background: imageProgress.current > 0 ? 
                        `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)` : 
                        colors.textLight,
                      color: colors.white,
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontWeight: '600',
                      cursor: imageProgress.current > 0 ? 'pointer' : 'default',
                      opacity: imageProgress.current > 0 ? 1 : 0.7,
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px'
                    }}
                    disabled={imageProgress.current === 0}
                  >
                    📷 View Images ({imageProgress.current})
                  </button>
                  
                  {meterProgress.readingsCount > 0 && (
                    <div style={{
                      padding: '6px 12px',
                      background: `linear-gradient(135deg, ${colors.secondary}15 0%, ${colors.secondary}25 100%)`,
                      color: colors.secondaryDark,
                      border: `1px solid ${colors.secondary}30`,
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontWeight: '600',
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px'
                    }}>
                      🚗 {meterProgress.totalDistance.toFixed(2)} km
                    </div>
                  )}
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
                      {service.quantity || '0'}
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
                    borderRadius: '88px',
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
                    🛠️ SERVICE TYPE
                  </div>
                  <div style={{ 
                    fontSize: '13px', 
                    color: colors.white, 
                    fontWeight: '700' 
                  }}>
                    {service.serviceType === 'other' ? service.customServiceType : service.serviceType}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div style={containerStyle}>
      {/* UPDATED: Image Viewing Modal with Location Below Every Image */}
      {showImageModal && selectedService && selectedService.images && selectedService.images.length > 0 && (
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
                src={selectedService.images[currentImageIndex].url} 
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
                <strong>Date:</strong> {new Date(selectedService.images[currentImageIndex].takenAt || selectedService.images[currentImageIndex].createdAt).toLocaleString()}
              </div>

              {/* Progress in Modal */}
              <div style={{ 
                marginTop: '8px', 
                padding: '8px',
                background: 'rgba(255,255,255,0.1)',
                borderRadius: '8px'
              }}>
                <div style={{ fontSize: isMobile ? '11px' : '13px', marginBottom: '4px', fontWeight: '600' }}>
                  <strong>Progress:</strong> {selectedService.images.length}/{selectedService.quantity || 0} images
                </div>
                <div style={{
                  width: '100%',
                  height: '6px',
                  backgroundColor: 'rgba(255,255,255,0.2)',
                  borderRadius: '3px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${getImageProgress(selectedService).progress}%`,
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