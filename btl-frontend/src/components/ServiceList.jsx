// ServiceList Component
import React from 'react';

const ServiceList = ({ services, loading, onServiceSelect, onRefresh, showAssignedOnly }) => {
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

  const containerStyle = {
    background: colors.white,
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 4px 12px rgba(1, 81, 186, 0.1)',
    border: `1px solid ${colors.border}`
  };

  const serviceCardStyle = {
    border: `1px solid ${colors.border}`,
    borderRadius: '10px',
    padding: '20px',
    marginBottom: '16px',
    transition: 'all 0.3s ease',
    background: colors.background,
    cursor: 'default' // Changed from pointer since we'll add specific buttons
  };

  const buttonStyle = (color = colors.secondary, size = 'medium') => ({
    padding: size === 'small' ? '6px 12px' : '8px 16px',
    background: color,
    color: color === colors.secondary ? colors.primary : colors.white,
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: size === 'small' ? '12px' : '14px',
    fontWeight: '600',
    transition: 'all 0.2s ease',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px'
  });

  const startButtonStyle = {
    padding: '8px 16px',
    background: colors.success,
    color: colors.white,
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    transition: 'all 0.2s ease',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px'
  };

  const progressContainerStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap'
  };

  const progressBarContainer = {
    width: '150px',
    height: '8px',
    backgroundColor: colors.border,
    borderRadius: '4px',
    overflow: 'hidden',
    position: 'relative'
  };

  const progressFillStyle = (percentage, color) => ({
    width: `${percentage}%`,
    height: '100%',
    background: color,
    borderRadius: '4px',
    transition: 'all 0.3s ease'
  });

  // Calculate campaign day tracking helpers
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

  // Calculate image progress (uploaded/total) or campaign progress
  const getImageProgress = (service) => {
    const hasCampaign = service.startDate && (service.endDate || service.deliveryDate);
    
    if (hasCampaign) {
      const totalDays = getCampaignTotalDays(service.startDate, service.endDate || service.deliveryDate);
      const completedDays = getCompletedDays(service);
      return {
        text: `Day ${completedDays}/${totalDays}`,
        percentage: totalDays > 0 ? Math.min((completedDays / totalDays) * 100, 100) : 0,
        isCampaign: true
      };
    }
    
    const uploadedCount = service.images?.length || 0;
    const totalQuantity = service.quantity || 0;
    
    if (!totalQuantity || totalQuantity === 0) {
      return {
        text: `${uploadedCount} images`,
        percentage: uploadedCount > 0 ? 100 : 0,
        isCampaign: false
      };
    }
    
    const percentage = Math.min((uploadedCount / totalQuantity) * 100, 100);
    return {
      text: `${uploadedCount}/${totalQuantity} images`,
      percentage: percentage,
      isCampaign: false
    };
  };

  // Get progress color based on completion percentage
  const getProgressColor = (service) => {
    const progressObj = getImageProgress(service);
    const progress = progressObj.percentage;
    
    if (progress >= 100) {
      return colors.success; // Green for completed
    } else if (progress >= 50) {
      return colors.warning; // Yellow for halfway
    } else {
      return colors.danger; // Red for less than halfway
    }
  };

  // Determine service status based on image progress
  const getServiceStatus = (service) => {
    const progressObj = getImageProgress(service);
    if (progressObj.percentage >= 100) {
      return 'completed';
    }
    return service.status || 'pending';
  };


  const statusStyle = (status) => {
    const baseStyle = {
      padding: '6px 16px',
      borderRadius: '20px',
      fontSize: '12px',
      fontWeight: '700',
      display: 'inline-block',
      marginLeft: '12px'
    };

    const actualStatus = getServiceStatus(status);

    switch (actualStatus) {
      case 'active':
        return { ...baseStyle, background: colors.success, color: colors.white };
      case 'pending':
        return { ...baseStyle, background: colors.warning, color: colors.white };
      case 'completed':
        return { ...baseStyle, background: colors.info, color: colors.white };
      default:
        return { ...baseStyle, background: colors.textLight, color: colors.white };
    }
  };

  const calculateDuration = (startDate, deliveryDate) => {
    if (!startDate || !deliveryDate) return 'N/A';
    const start = new Date(startDate);
    const delivery = new Date(deliveryDate);
    const days = Math.ceil((delivery - start) / (1000 * 60 * 60 * 24));
    return `${days} day${days !== 1 ? 's' : ''}`;
  };

  const handleStartClick = (e, service) => {
    e.stopPropagation(); // Prevent card click
    onServiceSelect(service);
  };

  const handleCardClick = (service) => {
    // Optional: You can keep this for viewing details
    onServiceSelect(service);
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center', padding: '60px', color: colors.textLight }}>
          <div style={{ fontSize: '18px', marginBottom: '12px' }}>Loading services...</div>
          <div style={{ fontSize: '24px' }}>🔄</div>
        </div>
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center', padding: '60px', color: colors.textLight }}>
          <div style={{ fontSize: '32px', marginBottom: '16px' }}>📋</div>
          <div style={{ fontSize: '18px', marginBottom: '12px', color: colors.primary, fontWeight: '600' }}>
            {showAssignedOnly ? 'No services assigned to you yet' : 'No services found'}
          </div>
          <div style={{ fontSize: '15px', color: colors.textLight, marginBottom: '20px' }}>
            {showAssignedOnly 
              ? 'Wait for admin to assign services to you' 
              : 'Create your first service to get started'
            }
          </div>
          {!showAssignedOnly && (
            <button
              onClick={onRefresh}
              style={buttonStyle(colors.secondary)}
            >
              🔄 Refresh Services
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '24px',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <h3 style={{ 
          margin: 0, 
          color: colors.primary,
          fontSize: '20px',
          fontWeight: '700'
        }}>
          {showAssignedOnly ? 'My Assigned Services' : 'All Services'} ({services.length})
        </h3>
        <button
          onClick={onRefresh}
          style={buttonStyle(colors.secondary)}
        >
          🔄 Refresh
        </button>
      </div>

      {services.map((service) => {
        const progress = getImageProgress(service);
        const progressColor = getProgressColor(service);
        const serviceStatus = getServiceStatus(service);
        const isCompleted = serviceStatus === 'completed';
        
        return (
          <div
            key={service._id}
            style={serviceCardStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(1, 81, 186, 0.15)';
              e.currentTarget.style.borderColor = colors.secondary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
              e.currentTarget.style.borderColor = colors.border;
            }}
            onClick={() => handleCardClick(service)}
          >
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'flex-start', 
              marginBottom: '16px',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <div style={{ flex: 1 }}>
                <h4 style={{ 
                  margin: '0 0 8px 0', 
                  color: colors.primary,
                  fontSize: '18px',
                  fontWeight: '700',
                  display: 'flex',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '8px'
                }}>
                  {service.businessName}
                  <span style={statusStyle(service)}>
                    {serviceStatus.toUpperCase()}
                  </span>
                  {service.assignedTo && (
                    <span style={{
                      padding: '4px 12px',
                      borderRadius: '20px',
                      fontSize: '11px',
                      background: colors.success,
                      color: colors.white,
                      fontWeight: '600'
                    }}>
                      ✅ ASSIGNED TO YOU
                    </span>
                  )}
                </h4>
                
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                  gap: '12px',
                  marginBottom: '12px'
                }}>
                  <div>
                    <strong style={{ color: colors.primary, fontSize: '13px' }}>Service Type:</strong>
                    <div style={{ color: colors.text, fontWeight: '600', fontSize: '14px' }}>
                      {service.serviceType === 'other' ? service.customServiceType : service.serviceType}
                    </div>
                  </div>
                  <div>
                    <strong style={{ color: colors.primary, fontSize: '13px' }}>Quantity:</strong>
                    <div style={{ color: colors.text, fontWeight: '600', fontSize: '14px' }}>
                      {service.quantity || '0'}
                    </div>
                  </div>
                  <div>
                    <strong style={{ color: colors.primary, fontSize: '13px' }}>Duration:</strong>
                    <div style={{ color: colors.text, fontWeight: '600', fontSize: '14px' }}>
                      {calculateDuration(service.startDate, service.deliveryDate)}
                    </div>
                  </div>
                </div>

                <p style={{ 
                  margin: '0 0 8px 0', 
                  color: colors.textLight, 
                  fontSize: '14px' 
                }}>
                  <strong>Created by:</strong> {service.createdBy.username} • {service.createdBy.email}
                </p>
                
                {service.assignedTo && (
                  <p style={{ 
                    margin: '0 0 8px 0', 
                    color: colors.success, 
                    fontSize: '14px', 
                    fontWeight: '600' 
                  }}>
                    <strong>Assigned to:</strong> {service.assignedTo.username} • {service.assignedTo.email}
                  </p>
                )}
              </div>
              
              <div style={{ textAlign: 'right', minWidth: '180px' }}>
                <div style={{ 
                  fontSize: '13px', 
                  color: colors.textLight, 
                  marginBottom: '12px' 
                }}>
                  {new Date(service.createdAt).toLocaleDateString()}
                </div>
                
                {/* Images Progress with Start Button */}
                <div style={progressContainerStyle}>
                  <div style={{ 
                    background: progressColor, 
                    color: colors.white, 
                    padding: '6px 12px', 
                    borderRadius: '20px', 
                    fontSize: '12px',
                    fontWeight: '700',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    📷 {progress.text}
                  </div>
                  
                  <button
                    onClick={(e) => handleStartClick(e, service)}
                    style={{
                      ...startButtonStyle,
                      background: isCompleted ? colors.info : colors.success
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    ▶️ {isCompleted ? 'View' : 'Start'}
                  </button>
                </div>

                {/* Progress Bar Below */}
                <div style={{ marginTop: '10px', width: '100%' }}>
                  <div style={progressBarContainer}>
                    <div style={progressFillStyle(progress.percentage, progressColor)}></div>
                  </div>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    fontSize: '11px', 
                    color: colors.textLight,
                    marginTop: '4px'
                  }}>
                    <span>Progress</span>
                    <span>{Math.round(progress.percentage)}%</span>
                  </div>
                </div>
              </div>
            </div>
            
            <p style={{ 
              margin: '12px 0', 
              color: colors.text, 
              fontSize: '14px',
              lineHeight: '1.5'
            }}>
              {service.description}
            </p>
            
            <div style={{ 
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px',
              marginTop: '12px',
              padding: '12px',
              background: colors.white,
              borderRadius: '8px',
              border: `1px solid ${colors.border}`,
              fontSize: '13px'
            }}>
              <div>
                <strong style={{ color: colors.primary }}>Location:</strong>{' '}
                {service.location?.address || 'Address not specified'}
              </div>
              <div>
                <strong style={{ color: colors.primary }}>Start Date:</strong>{' '}
                {service.startDate ? new Date(service.startDate).toLocaleDateString() : 'N/A'}
              </div>
              <div>
                <strong style={{ color: colors.primary }}>Delivery Date:</strong>{' '}
                {service.deliveryDate ? new Date(service.deliveryDate).toLocaleDateString() : 'N/A'}
              </div>
              <div>
                <strong style={{ color: colors.primary }}>Contact:</strong>{' '}
                {service.contactNumber || 'Not provided'}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ServiceList;