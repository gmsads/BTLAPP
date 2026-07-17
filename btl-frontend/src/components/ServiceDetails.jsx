import React, { useState, useEffect } from 'react';
import axios from '../utils/api';
import ImageUpload from './ImageUpload';

const ServiceDetails = ({ service, onBack, onUpdate, userRole = 'worker', currentUser }) => {
  const [currentService, setCurrentService] = useState(service);
  const [activeSection, setActiveSection] = useState('images');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showAddReading, setShowAddReading] = useState(false);
  const [meterReadings, setMeterReadings] = useState([]);
  const [newReading, setNewReading] = useState({
    startReading: '',
    endReading: ''
  });
  const [readingImageFile, setReadingImageFile] = useState(null);

  // Blue/Yellow/White color palette
  const colors = {
    primary: '#0151ba',
    secondary: '#f2c43b',
    background: '#f8fafc',
    white: '#ffffff',
    border: '#e2e8f0',
    text: '#1e293b',
    textLight: '#64748b',
    success: '#10b981',
    warning: '#f59e0b',
    info: '#0151ba',
    danger: '#ef4444'
  };

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Initialize meter readings from service data or create empty array
  useEffect(() => {
    if (currentService && currentService.meterReadings) {
      setMeterReadings(currentService.meterReadings);
    }
  }, [currentService]);

  const handleImagesAdded = (newImages) => {
    const updatedService = {
      ...currentService,
      images: [...(currentService.images || []), ...newImages]
    };
    
    setCurrentService(updatedService);
    
    if (onUpdate) {
      onUpdate();
    }
  };

  // UPDATED: handleAddReading with optional image upload
  const handleAddReading = async () => {
    // Validate readings
    if (!newReading.startReading || !newReading.endReading) {
      setMessage('Please fill both start and end readings');
      return;
    }

    if (parseFloat(newReading.endReading) <= parseFloat(newReading.startReading)) {
      setMessage('End reading must be greater than start reading');
      return;
    }

    // Image is now OPTIONAL - show warning but don't block
    if (!readingImageFile) {
      setMessage('⚠️ No proof photo selected. You can continue without photo, but it\'s recommended to add one.');
      // Allow proceeding without image
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('startReading', newReading.startReading);
      formData.append('endReading', newReading.endReading);
      
      // Only append image if one is selected
      if (readingImageFile) {
        formData.append('image', readingImageFile);
      }

      // Make sure the service ID exists - use currentService._id instead of service._id
      const serviceId = currentService?._id || service?._originalId || service?._id;
      
      if (!serviceId) {
        throw new Error('Service ID is missing');
      }

      console.log('Adding meter reading to service:', serviceId);
      
      const response = await axios.post(`/services/${serviceId}/meter-readings`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      if (response.data.success) {
        setMeterReadings(response.data.service.meterReadings || []);
        setCurrentService(response.data.service);
        setNewReading({
          startReading: '',
          endReading: ''
        });
        setReadingImageFile(null);
        setShowAddReading(false);
        setMessage('✅ Meter reading added successfully!');
        setTimeout(() => setMessage(''), 3000);
        
        if (onUpdate) {
          onUpdate();
        }
      } else {
        setMessage('❌ Failed to add meter reading: ' + (response.data.message || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error adding meter reading:', error);
      if (error.response?.status === 404) {
        setMessage(`❌ Service not found. Please refresh and try again.`);
      } else if (error.response?.status === 403) {
        setMessage('❌ You don\'t have permission to add readings to this service.');
      } else {
        setMessage('Error adding meter reading: ' + (error.response?.data?.message || error.message));
      }
    } finally {
      setLoading(false);
    }
  };

  // UPDATED: handleDeleteReading with proper service ID
  const handleDeleteReading = async (index) => {
    if (!window.confirm('Are you sure you want to delete this reading?')) return;

    setLoading(true);
    try {
      const readingId = meterReadings[index]?._id;
      const serviceId = currentService?._id || service?._originalId || service?._id;
      
      if (!serviceId) {
        throw new Error('Service ID is missing');
      }
      
      if (!readingId) {
        throw new Error('Reading ID is missing');
      }
      
      console.log('Deleting meter reading from service:', serviceId, 'Reading ID:', readingId);
      
      const response = await axios.delete(`/services/${serviceId}/meter-readings/${readingId}`);

      if (response.data.success) {
        setMeterReadings(response.data.service.meterReadings || []);
        setCurrentService(response.data.service);
        setMessage('✅ Meter reading deleted successfully!');
        setTimeout(() => setMessage(''), 3000);
        
        if (onUpdate) {
          onUpdate();
        }
      } else {
        setMessage('❌ Failed to delete meter reading: ' + (response.data.message || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error deleting meter reading:', error);
      if (error.response?.status === 404) {
        setMessage('❌ Service or reading not found. Please refresh and try again.');
      } else if (error.response?.status === 403) {
        setMessage('❌ You don\'t have permission to delete this reading.');
      } else {
        setMessage('Error deleting meter reading: ' + (error.response?.data?.message || error.message));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEditReading = (index) => {
    const reading = meterReadings[index];
    setNewReading({
      startReading: reading.startReading.toString(),
      endReading: reading.endReading.toString()
    });
    setShowAddReading(true);
  };

  // Calculate total consumption from all readings
  const getTotalConsumption = () => {
    return meterReadings.reduce((total, reading) => {
      return total + (reading.endReading - reading.startReading);
    }, 0);
  };

  // Calculate total campaign days
  const getCampaignTotalDays = (startDate, endDate) => {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);
    const diffTime = Math.abs(end - start);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  };

  // Get campaign day number for a given date
  const getCampaignDayNumber = (date, startDate) => {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const current = new Date(date);
    current.setHours(0, 0, 0, 0);
    const diffTime = current - start;
    return Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
  };

  // Get count of completed days
  const getCompletedDays = (serviceObj) => {
    const startDate = serviceObj.startDate;
    const endDate = serviceObj.endDate || serviceObj.deliveryDate;
    if (!startDate || !endDate) return 0;
    
    const totalDays = getCampaignTotalDays(startDate, endDate);
    if (totalDays <= 0) return 0;
    
    const readingsDays = new Set();
    if (serviceObj.meterReadings) {
      serviceObj.meterReadings.forEach(reading => {
        if (reading.image && reading.image.url) {
          const day = reading.dayNumber || getCampaignDayNumber(reading.date, startDate);
          if (day >= 1 && day <= totalDays) {
            readingsDays.add(day);
          }
        }
      });
    }
    
    const imagesDays = new Set();
    if (serviceObj.images) {
      serviceObj.images.forEach(img => {
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

  // Calculate image or day progress
  const getImageProgress = () => {
    if (!currentService) {
      return { current: 0, total: 0, isComplete: false, isCampaign: false };
    }
    
    const hasCampaign = currentService.startDate && (currentService.endDate || currentService.deliveryDate);
    
    if (hasCampaign) {
      const totalDays = getCampaignTotalDays(currentService.startDate, currentService.endDate || currentService.deliveryDate);
      const completedDays = getCompletedDays(currentService);
      return {
        current: completedDays,
        total: totalDays,
        isComplete: totalDays > 0 && completedDays >= totalDays,
        isCampaign: true
      };
    }
    
    const uploadedCount = currentService.images?.length || 0;
    const totalQuantity = currentService.quantity || 0;
    
    return {
      current: uploadedCount,
      total: totalQuantity,
      isComplete: totalQuantity > 0 && uploadedCount >= totalQuantity,
      isCampaign: false
    };
  };

  // Styles
  const containerStyle = {
    background: colors.white,
    padding: isMobile ? '16px' : '24px',
    borderRadius: '12px',
    boxShadow: '0 4px 12px rgba(1, 81, 186, 0.1)',
    border: `1px solid ${colors.border}`,
    fontSize: isMobile ? '14px' : '15px'
  };

  const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '24px',
    flexWrap: 'wrap',
    gap: '16px'
  };

  const tabContainerStyle = {
    display: 'flex',
    gap: isMobile ? '8px' : '12px',
    marginBottom: '24px',
    borderBottom: `2px solid ${colors.border}`,
    flexWrap: 'wrap',
    overflowX: isMobile ? 'auto' : 'visible'
  };

  const tabStyle = {
    padding: isMobile ? '10px 16px' : '12px 20px',
    background: 'none',
    border: 'none',
    borderBottom: `3px solid transparent`,
    fontSize: isMobile ? '14px' : '15px',
    cursor: 'pointer',
    transition: 'all 0.3s',
    color: colors.textLight,
    fontWeight: '500',
    borderRadius: '8px 8px 0 0',
    whiteSpace: 'nowrap',
    minWidth: isMobile ? 'auto' : '140px'
  };

  const activeTabStyle = {
    ...tabStyle,
    borderBottomColor: colors.secondary,
    color: colors.primary,
    fontWeight: '600',
    background: colors.background
  };

  const buttonStyle = (color = colors.secondary, size = 'medium') => ({
    padding: size === 'small' ? (isMobile ? '6px 12px' : '8px 16px') : 
             (isMobile ? '8px 16px' : '10px 20px'),
    background: color,
    color: color === colors.secondary ? colors.primary : colors.white,
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: size === 'small' ? (isMobile ? '12px' : '13px') : 
             (isMobile ? '13px' : '14px'),
    fontWeight: '600',
    transition: 'all 0.2s ease',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    whiteSpace: 'nowrap'
  });

  // Table Styles
  const tableContainerStyle = {
    overflowX: 'auto',
    borderRadius: '8px',
    border: `1px solid ${colors.border}`,
    background: colors.white,
    marginBottom: '20px'
  };

  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: isMobile ? '13px' : '14px',
    minWidth: isMobile ? '500px' : 'auto'
  };

  const thStyle = {
    background: `linear-gradient(135deg, ${colors.primary} 0%, #013b8a 100%)`,
    color: colors.white,
    padding: isMobile ? '12px 8px' : '16px 12px',
    textAlign: 'left',
    border: `1px solid ${colors.primary}`,
    fontSize: isMobile ? '13px' : '14px',
    fontWeight: '600',
    whiteSpace: 'nowrap'
  };

  const tdStyle = {
    padding: isMobile ? '12px 8px' : '16px 12px',
    border: `1px solid ${colors.border}`,
    textAlign: 'left',
    verticalAlign: 'top',
    background: colors.white,
    wordWrap: 'break-word'
  };

  const inputStyle = {
    width: '100%',
    padding: '8px 12px',
    border: `1px solid ${colors.border}`,
    borderRadius: '6px',
    fontSize: '14px',
    backgroundColor: colors.white
  };

  const serviceInfoStyle = {
    background: colors.background,
    padding: '16px',
    borderRadius: '8px',
    marginBottom: '20px',
    border: `1px solid ${colors.border}`,
    textAlign: 'center'
  };

  const progressBarStyle = {
    width: '100%',
    height: '8px',
    backgroundColor: colors.border,
    borderRadius: '4px',
    overflow: 'hidden',
    margin: '10px 0'
  };

  const progressFillStyle = (percentage) => ({
    width: `${percentage}%`,
    height: '100%',
    background: percentage === 100 ? colors.success : colors.primary,
    borderRadius: '4px',
    transition: 'all 0.3s ease'
  });

  const renderServiceInfo = () => {
    if (!currentService) {
      return (
        <div style={serviceInfoStyle}>
          <p style={{ color: colors.textLight }}>Loading service information...</p>
        </div>
      );
    }
    
    const imageProgress = getImageProgress();
    const progressPercentage = imageProgress.total > 0 
      ? Math.min((imageProgress.current / imageProgress.total) * 100, 100)
      : 0;

    return (
      <div style={serviceInfoStyle}>
        <h3 style={{ 
          color: colors.primary, 
          margin: '0 0 8px 0',
          fontSize: isMobile ? '16px' : '18px',
          fontWeight: '600'
        }}>
          {currentService.businessName || 'Service'}
        </h3>
        <p style={{ 
          color: colors.textLight, 
          margin: '0 0 4px 0',
          fontSize: '14px'
        }}>
          {currentService.serviceType === 'other' 
            ? currentService.customServiceType 
            : currentService.serviceType?.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())
          }
        </p>
        
        {/* Image Progress */}
        <div style={{ margin: '15px 0' }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '5px'
          }}>
            <span style={{ 
              fontSize: '14px', 
              color: colors.text,
              fontWeight: '500'
            }}>
              {imageProgress.isCampaign ? '📅 Campaign Progress' : '📸 Images Uploaded'}
            </span>
            <span style={{ 
              fontSize: '14px', 
              color: colors.primary,
              fontWeight: '600'
            }}>
              {imageProgress.isCampaign ? `Day ${imageProgress.current}/${imageProgress.total}` : `${imageProgress.current}/${imageProgress.total}`}
            </span>
          </div>
          
          <div style={progressBarStyle}>
            <div style={progressFillStyle(progressPercentage)}></div>
          </div>
          
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between',
            fontSize: '12px',
            color: colors.textLight,
            marginTop: '4px'
          }}>
            <span>Progress</span>
            <span>{Math.round(progressPercentage)}%</span>
          </div>
        </div>

        {/* Meter Readings Summary */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(2, 1fr)', 
          gap: '10px',
          marginTop: '15px'
        }}>
          <div>
            <div style={{ fontSize: '12px', color: colors.textLight, fontWeight: '600' }}>
              TOTAL READINGS
            </div>
            <div style={{ fontSize: '20px', color: colors.info, fontWeight: '700' }}>
              {meterReadings.length}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: colors.textLight, fontWeight: '600' }}>
              TOTAL DISTANCE
            </div>
            <div style={{ fontSize: '20px', color: colors.success, fontWeight: '700' }}>
              {getTotalConsumption().toFixed(2)} km
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderMeterReadings = () => (
    <div>
      {renderServiceInfo()}

      {/* Add Reading Button */}
      <div style={{ marginBottom: '20px', textAlign: 'center' }}>
        <button
          onClick={() => setShowAddReading(!showAddReading)}
          style={buttonStyle(colors.success)}
        >
          {showAddReading ? '✕ Cancel' : '➕ Add Daily Reading'}
        </button>
      </div>

      {/* Add Reading Form */}
      {showAddReading && (
        <div style={{ 
          background: colors.background,
          padding: '20px',
          borderRadius: '8px',
          marginBottom: '20px',
          border: `1px solid ${colors.border}`
        }}>
          <h4 style={{ 
            color: colors.primary, 
            marginBottom: '16px',
            textAlign: 'center'
          }}>
            📊 Add Daily Meter Reading
          </h4>
          
          <div style={{ 
            textAlign: 'center', 
            marginBottom: '16px',
            padding: '10px',
            background: colors.primary,
            color: colors.white,
            borderRadius: '6px',
            fontWeight: '600'
          }}>
            📅 Today's Date: {new Date().toLocaleDateString()}
          </div>

          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', 
            gap: '12px',
            marginBottom: '16px'
          }}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: colors.primary }}>
                Start Reading (km) *
              </label>
              <input
                type="number"
                step="0.01"
                value={newReading.startReading}
                onChange={(e) => setNewReading(prev => ({ ...prev, startReading: e.target.value }))}
                style={inputStyle}
                placeholder="0.00"
                min="0"
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: colors.primary }}>
                End Reading (km) *
              </label>
              <input
                type="number"
                step="0.01"
                value={newReading.endReading}
                onChange={(e) => setNewReading(prev => ({ ...prev, endReading: e.target.value }))}
                style={inputStyle}
                placeholder="0.00"
                min="0"
              />
            </div>
          </div>
          
          {/* Daily Proof Photo Input - OPTIONAL now */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: colors.primary }}>
              📷 Meter Reading Proof Photo <span style={{ fontSize: '12px', color: colors.textLight }}>(Optional)</span>
            </label>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setReadingImageFile(e.target.files[0])}
              style={{
                width: '100%',
                padding: '10px',
                border: `1px solid ${colors.border}`,
                borderRadius: '8px',
                background: colors.white,
                boxSizing: 'border-box'
              }}
            />
            {readingImageFile ? (
              <div style={{ marginTop: '8px', fontSize: '13px', color: colors.success, fontWeight: '600' }}>
                ✓ Selected: {readingImageFile.name} ({(readingImageFile.size / (1024 * 1024)).toFixed(2)} MB)
              </div>
            ) : (
              <div style={{ marginTop: '8px', fontSize: '12px', color: colors.textLight, fontStyle: 'italic' }}>
                No photo selected (optional)
              </div>
            )}
          </div>
          
          {/* Auto-calculated distance */}
          {newReading.startReading && newReading.endReading && (
            <div style={{ 
              textAlign: 'center', 
              marginBottom: '16px',
              padding: '10px',
              background: colors.success,
              color: colors.white,
              borderRadius: '6px',
              fontWeight: '600'
            }}>
              🚗 Daily Distance: {(parseFloat(newReading.endReading) - parseFloat(newReading.startReading)).toFixed(2)} km
            </div>
          )}

          <div style={{ textAlign: 'center' }}>
            <button
              onClick={handleAddReading}
              disabled={loading}
              style={{
                ...buttonStyle(colors.primary),
                opacity: loading ? 0.6 : 1
              }}
            >
              {loading ? '🔄 Adding...' : '💾 Save Reading'}
            </button>
          </div>
        </div>
      )}

      {/* Meter Readings Table */}
      {meterReadings.length > 0 ? (
        <div style={tableContainerStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Day</th>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Start (km)</th>
                <th style={thStyle}>End (km)</th>
                <th style={thStyle}>Distance</th>
                <th style={thStyle}>Proof Photo</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {meterReadings.map((reading, index) => (
                <tr key={reading._id || index}>
                  <td style={tdStyle}>
                    <strong style={{ color: colors.primary, fontWeight: '600' }}>Day {reading.dayNumber || index + 1}</strong>
                  </td>
                  <td style={tdStyle}>
                    {new Date(reading.date).toLocaleDateString()}
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontWeight: '600' }}>{reading.startReading.toFixed(2)}</span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontWeight: '600' }}>{reading.endReading.toFixed(2)}</span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      color: colors.success,
                      fontWeight: '700'
                    }}>
                      {(reading.endReading - reading.startReading).toFixed(2)} km
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {reading.image && reading.image.url ? (
                      <a 
                        href={reading.image.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          color: colors.primary,
                          fontWeight: '600',
                          textDecoration: 'underline'
                        }}
                      >
                        🖼️ View Photo
                      </a>
                    ) : (
                      <span style={{ color: colors.textLight, fontSize: '12px' }}>No photo</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => handleEditReading(index)}
                        style={{
                          ...buttonStyle(colors.info, 'small'),
                          padding: '4px 8px',
                          fontSize: '12px'
                        }}
                      >
                        ✏️ Edit
                      </button>
                      <button
                        onClick={() => handleDeleteReading(index)}
                        style={{
                          ...buttonStyle(colors.danger, 'small'),
                          padding: '4px 8px',
                          fontSize: '12px'
                        }}
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ 
          textAlign: 'center', 
          padding: '40px', 
          color: colors.textLight,
          background: colors.background,
          borderRadius: '8px',
          border: `1px solid ${colors.border}`
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
          <h4 style={{ color: colors.primary, marginBottom: '8px' }}>
            No Meter Readings Yet
          </h4>
          <p style={{ margin: 0 }}>
            Click "Add Daily Reading" to start tracking daily distance
          </p>
        </div>
      )}
    </div>
  );

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <div style={{flex: 1}}>
          <h2 style={{ 
            color: colors.primary, 
            margin: '0 0 8px 0',
            fontSize: isMobile ? '18px' : '22px',
            fontWeight: '700',
            wordBreak: 'break-word'
          }}>
            {currentService?.serviceName || currentService?.businessName || 'Service Details'}
          </h2>
          <p style={{ 
            color: colors.textLight, 
            margin: 0,
            fontSize: isMobile ? '13px' : '14px'
          }}>
            Focus on Images & Meter Readings
          </p>
        </div>
        <button onClick={onBack} style={buttonStyle(colors.textLight)}>
          ← {isMobile ? 'Back' : 'Back to List'}
        </button>
      </div>

      {message && (
        <div style={{
          padding: isMobile ? '10px 12px' : '12px 16px',
          borderRadius: '8px',
          marginBottom: '20px',
          background: message.includes('✅') || message.includes('success') ? '#d1fae5' : 
                     message.includes('⚠️') ? '#fef3c7' : '#fee2e2',
          color: message.includes('✅') || message.includes('success') ? '#065f46' : 
                 message.includes('⚠️') ? '#92400e' : '#991b1b',
          border: `2px solid ${message.includes('✅') || message.includes('success') ? '#a7f3d0' : 
                   message.includes('⚠️') ? '#fcd34d' : '#fecaca'}`,
          fontSize: isMobile ? '13px' : '14px',
          fontWeight: '600',
          textAlign: 'center'
        }}>
          {message}
        </div>
      )}

      <div style={tabContainerStyle}>
        <button
          onClick={() => setActiveSection('images')}
          style={activeSection === 'images' ? activeTabStyle : tabStyle}
        >
          {isMobile ? '🖼️ Images' : '🖼️ Images'} ({currentService?.images?.length || 0})
        </button>
        <button
          onClick={() => setActiveSection('meter-readings')}
          style={activeSection === 'meter-readings' ? activeTabStyle : tabStyle}
        >
          {isMobile ? '📊 Readings' : '📊 Meter Readings'} ({meterReadings.length})
        </button>
      </div>

      {activeSection === 'images' && (
        <div>
          {renderServiceInfo()}
          <ImageUpload 
            service={currentService} 
            serviceId={currentService?._originalId || currentService?._id}
            userRole={userRole}
            onImagesAdded={handleImagesAdded}
            onImageUploaded={onUpdate}
          />
        </div>
      )}
      {activeSection === 'meter-readings' && renderMeterReadings()}
    </div>
  );
};

export default ServiceDetails;