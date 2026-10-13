import React, { useState } from 'react';
import { generateCampaignAuditPDF, generateCampaignAuditPPT } from '../utils/campaignReportGenerator';

const BusinessServicesAudit = ({ businessName, services, colors, isMobile, onBack }) => {
  const [expandedDays, setExpandedDays] = useState({});

  const expandServicesList = (rawServices) => {
    const expanded = [];
    rawServices.forEach(service => {
      if (service.services && Array.isArray(service.services) && service.services.length > 0) {
        service.services.forEach((serviceItem, index) => {
          const itemImages = [
            ...((serviceItem.images || []).filter(Boolean)),
            ...((service.images || []).filter(img =>
              (img.itemId && serviceItem._id && img.itemId.toString() === serviceItem._id.toString()) ||
              (img.serviceIndex !== undefined && img.serviceIndex !== null && Number(img.serviceIndex) === index)
            ))
          ].filter((img, idx, arr) => arr.findIndex(t => (t.public_id && t.public_id === img.public_id) || (t.url && t.url === img.url) || ((t._id || t.id) && (img._id || img.id) && (t._id || t.id).toString() === (img._id || img.id).toString())) === idx);

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
            status: serviceItem.status || 'pending',
            assignedTo: serviceItem.assignedTo || (service.assignedTo && !service.services.some(s => s.assignedTo) ? service.assignedTo : null),
            images: itemImages,
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
          serviceName: `${service.businessName} - ${service.serviceType === 'other' ? service.customServiceType : service.serviceType}`
        });
      }
    });
    return expanded;
  };

  const flattenedServices = expandServicesList(services);

  // Sort services chronologically by start date
  const sortedServices = [...flattenedServices].sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

  const toggleDay = (serviceId, day) => {
    const key = `${serviceId}-${day}`;
    setExpandedDays(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

const getCampaignTotalDays = (startDate, endDate) => {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  const diffTime = Math.abs(end - start);
  const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  // If same day, return 1
  return days === 0 ? 1 : days;
};

  const getCampaignDayNumber = (date, startDate) => {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const current = new Date(date);
    current.setHours(0, 0, 0, 0);
    const diffTime = current - start;
    return Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
  };

  const cardStyle = {
    background: colors.white,
    border: `1px solid ${colors.border}`,
    borderRadius: '12px',
    padding: isMobile ? '16px' : '24px',
    marginBottom: '24px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
    position: 'relative',
    overflow: 'hidden'
  };

  const getStatusBadgeStyle = (status) => {
    const statusLower = (status || 'pending').toLowerCase();
    let bg = '#eff6ff';
    let text = '#1d4ed8';
    
    if (statusLower === 'completed') {
      bg = '#ecfdf5';
      text = '#047857';
    } else if (statusLower === 'in-progress') {
      bg = '#fffbeb';
      text = '#b45309';
    }
    
    return {
      background: bg,
      color: text,
      padding: '4px 10px',
      borderRadius: '20px',
      fontSize: '12px',
      fontWeight: '600',
      display: 'inline-block',
      textTransform: 'uppercase'
    };
  };

  return (
    <div style={{ padding: isMobile ? '12px' : '20px', fontFamily: "'Inter', sans-serif" }}>
      {/* Navigation & Action Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        marginBottom: '24px'
      }}>
        <button
          onClick={onBack}
          style={{
            background: 'transparent',
            border: `1px solid ${colors.border}`,
            color: colors.primary,
            padding: '8px 16px',
            borderRadius: '20px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.target.style.background = '#f1f5f9';
            e.target.style.transform = 'translateX(-3px)';
          }}
          onMouseLeave={(e) => {
            e.target.style.background = 'transparent';
            e.target.style.transform = 'none';
          }}
        >
          ← Back to Dashboard
        </button>

        {/* Combined Downloads */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => generateCampaignAuditPDF(sortedServices, businessName)}
            style={{
              background: colors.success,
              color: colors.white,
              border: 'none',
              padding: '8px 16px',
              borderRadius: '20px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => e.target.style.transform = 'scale(1.03)'}
            onMouseLeave={(e) => e.target.style.transform = 'none'}
          >
            📄 PDF Report (All)
          </button>
          <button
            onClick={() => generateCampaignAuditPPT(sortedServices, businessName)}
            style={{
              background: colors.secondary,
              color: colors.primary,
              border: 'none',
              padding: '8px 16px',
              borderRadius: '20px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => e.target.style.transform = 'scale(1.03)'}
            onMouseLeave={(e) => e.target.style.transform = 'none'}
          >
            📊 PPT Report (All)
          </button>
        </div>
      </div>

      {/* Title block */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{
          color: colors.primary,
          margin: '0 0 6px 0',
          fontSize: isMobile ? '20px' : '26px',
          fontWeight: '800',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          📁 Business Audit Timeline
        </h2>
        <p style={{ color: colors.textLight, margin: 0, fontSize: '14px' }}>
          Audit all services provided to <strong style={{ color: colors.primary }}>{businessName}</strong>. Listed in chronological order.
        </p>
      </div>

      {/* Services List */}
      <div>
        {sortedServices.map((service, sIdx) => {
          const serviceTitle = service.serviceType === 'other' ? service.customServiceType : service.serviceType;
          const hasCampaign = service.startDate && (service.endDate || service.deliveryDate);
          
          return (
            <div key={service._id} style={cardStyle}>
              {/* Card Ribbon border */}
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '4px',
                height: '100%',
                background: colors.primary
              }} />

              {/* Service header */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                flexWrap: 'wrap',
                gap: '12px',
                borderBottom: `1px solid ${colors.border}`,
                paddingBottom: '16px',
                marginBottom: '16px'
              }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: colors.textLight, textTransform: 'uppercase', marginBottom: '4px' }}>
                    Campaign {sIdx + 1}
                  </div>
                  <h3 style={{ margin: '0 0 6px 0', color: colors.primary, fontSize: isMobile ? '16px' : '20px', fontWeight: '700' }}>
                    {serviceTitle.toUpperCase()}
                  </h3>
                  <div style={{ fontSize: '13px', color: colors.textLight, display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <span>📅 Start: {new Date(service.startDate).toLocaleDateString()}</span>
                    <span>•</span>
                    <span>🏁 End: {new Date(service.endDate || service.deliveryDate).toLocaleDateString()}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                  <span style={getStatusBadgeStyle(service.status)}>
                    {service.status}
                  </span>
                  
                  {/* Download single service */}
                  <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                    <button
                      onClick={() => generateCampaignAuditPDF([service], businessName)}
                      style={{
                        background: '#eff6ff',
                        color: colors.primary,
                        border: `1px solid ${colors.border}`,
                        padding: '4px 8px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}
                    >
                      📄 PDF
                    </button>
                    <button
                      onClick={() => generateCampaignAuditPPT([service], businessName)}
                      style={{
                        background: '#eff6ff',
                        color: colors.primary,
                        border: `1px solid ${colors.border}`,
                        padding: '4px 8px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}
                    >
                      📊 PPT
                    </button>
                  </div>
                </div>
              </div>

              {/* Service details columns */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr',
                gap: '16px',
                marginBottom: '20px',
                background: '#f8fafc',
                padding: '12px',
                borderRadius: '8px'
              }}>
                <div>
                  <div style={{ fontSize: '11px', color: colors.textLight, marginBottom: '2px' }}>TARGET QUANTITY</div>
                  <strong style={{ fontSize: '14px', color: colors.primary }}>{service.quantity || 0} units</strong>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: colors.textLight, marginBottom: '2px' }}>ASSIGNED WORKER</div>
                  <strong style={{ fontSize: '14px', color: colors.primary }}>{service.assignedTo?.username || 'Unassigned'}</strong>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: colors.textLight, marginBottom: '2px' }}>CAMPAIGN LOCATION</div>
                  <strong style={{ fontSize: '14px', color: colors.primary, wordBreak: 'break-all' }}>{service.location?.address || 'No location address'}</strong>
                </div>
              </div>

              {/* Day-wise collapsibles */}
              {hasCampaign ? (
                <div>
                  <h4 style={{ color: colors.primary, fontSize: '14px', margin: '0 0 12px 0', borderBottom: `2px solid ${colors.border}`, paddingBottom: '6px' }}>
                    📅 Daily Audit Proofs
                  </h4>
                  
                  {(() => {
                    const totalDays = getCampaignTotalDays(service.startDate, service.endDate || service.deliveryDate);
                    const days = Array.from({ length: totalDays }, (_, i) => i + 1);
                    
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {days.map(day => {
                          const dayKey = `${service._id}-${day}`;
                          const isExpanded = !!expandedDays[dayKey];
                          
                          // Filter campaign photos and reading photo
                          const dayPhotos = (service.images || []).filter(img => getCampaignDayNumber(img.takenAt || img.uploadedAt || img.createdAt, service.startDate) === day);
                          const dayReading = (service.meterReadings || []).find(r => r.dayNumber === day || getCampaignDayNumber(r.date, service.startDate) === day);
                          
                          const totalDayPhotosCount = dayPhotos.length + (dayReading && dayReading.image?.url ? 1 : 0);

                          return (
                            <div key={day} style={{
                              border: `1px solid ${colors.border}`,
                              borderRadius: '8px',
                              overflow: 'hidden',
                              background: '#ffffff'
                            }}>
                              {/* Accordion header */}
                              <div
                                onClick={() => toggleDay(service._id, day)}
                                style={{
                                  padding: '10px 14px',
                                  background: '#f8fafc',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  userSelect: 'none'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ fontSize: '14px', fontWeight: '700', color: colors.primary }}>
                                    Day {day}
                                  </span>
                                  <span style={{
                                    fontSize: '11px',
                                    background: totalDayPhotosCount > 0 ? colors.success : '#94a3b8',
                                    color: '#fff',
                                    padding: '2px 6px',
                                    borderRadius: '10px',
                                    fontWeight: '600'
                                  }}>
                                    {totalDayPhotosCount} photo{totalDayPhotosCount !== 1 ? 's' : ''}
                                  </span>
                                </div>
                                <span style={{ fontSize: '12px', color: colors.primary, fontWeight: '700' }}>
                                  {isExpanded ? '▲ Hide' : '▼ Expand'}
                                </span>
                              </div>

                              {/* Accordion body */}
                              {isExpanded && (
                                <div style={{ padding: '14px', borderTop: `1px solid ${colors.border}` }}>
                                  {/* Meter Reading Log */}
                                  {dayReading ? (
                                    <div style={{
                                      background: '#f0f9ff',
                                      border: `1px solid ${colors.info}`,
                                      borderRadius: '6px',
                                      padding: '10px',
                                      marginBottom: '12px',
                                      fontSize: '13px'
                                    }}>
                                      <strong style={{ color: colors.primary }}>📊 Daily Meter Log:</strong>
                                      <div style={{ marginTop: '4px', color: '#334155' }}>
                                        Start: <strong>{dayReading.startReading} KM</strong> • End: <strong>{dayReading.endReading} KM</strong> • Distance: <strong style={{ color: colors.success }}>{(dayReading.endReading - dayReading.startReading).toFixed(2)} km</strong>
                                      </div>
                                    </div>
                                  ) : (
                                    <div style={{ fontSize: '12px', color: colors.textLight, fontStyle: 'italic', marginBottom: '12px' }}>
                                      No meter reading logged for this day.
                                    </div>
                                  )}

                                  {/* Images Grid */}
                                  {totalDayPhotosCount > 0 ? (
                                    <div style={{
                                      display: 'grid',
                                      gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                                      gap: '12px'
                                    }}>
                                      {/* Meter Reading Proof Image */}
                                      {dayReading && dayReading.image?.url && (
                                        <div style={{ border: `1px solid ${colors.info}`, borderRadius: '6px', overflow: 'hidden', background: '#fff' }}>
                                          <img
                                            src={dayReading.image.url}
                                            alt="Meter Reading Proof"
                                            style={{ width: '100%', height: '120px', objectFit: 'cover' }}
                                          />
                                          <div style={{ padding: '8px', fontSize: '11px', background: '#f0f9ff' }}>
                                            <div style={{ fontWeight: 'bold', color: colors.primary }}>📸 Meter Proof Photo</div>
                                            <div style={{ color: colors.textLight, marginTop: '2px' }}>
                                              {dayReading.startReading} - {dayReading.endReading} KM
                                            </div>
                                          </div>
                                        </div>
                                      )}

                                      {/* Campaign Photos */}
                                      {dayPhotos.map((photo, pIdx) => (
                                        <div key={photo._id || pIdx} style={{ border: `1px solid ${colors.border}`, borderRadius: '6px', overflow: 'hidden', background: '#fff' }}>
                                          <img
                                            src={photo.url}
                                            alt="Campaign Proof"
                                            style={{ width: '100%', height: '120px', objectFit: 'cover' }}
                                          />
                                          <div style={{ padding: '8px', fontSize: '11px' }}>
                                            <div style={{ fontWeight: 'bold', color: colors.primary }}>{photo.caption || 'Campaign Photo'}</div>
                                            {photo.locationAddress && (
                                              <div style={{ color: colors.textLight, marginTop: '4px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={photo.locationAddress}>
                                                📍 {photo.locationAddress}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div style={{ textAlign: 'center', padding: '16px', color: colors.textLight, fontSize: '12px' }}>
                                      No proof photos uploaded for Day {day}.
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                // Static / Quantity-based service
                <div>
                  <h4 style={{ color: colors.primary, fontSize: '14px', margin: '0 0 12px 0', borderBottom: `2px solid ${colors.border}`, paddingBottom: '6px' }}>
                    🖼️ Campaign Photos ({service.images?.length || 0})
                  </h4>
                  {service.images && service.images.length > 0 ? (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                      gap: '12px'
                    }}>
                      {service.images.map((photo, pIdx) => (
                        <div key={photo._id || pIdx} style={{ border: `1px solid ${colors.border}`, borderRadius: '6px', overflow: 'hidden', background: '#fff' }}>
                          <img
                            src={photo.url}
                            alt="Campaign Proof"
                            style={{ width: '100%', height: '120px', objectFit: 'cover' }}
                          />
                          <div style={{ padding: '8px', fontSize: '11px' }}>
                            <div style={{ fontWeight: 'bold', color: colors.primary }}>{photo.caption || 'Campaign Photo'}</div>
                            {photo.locationAddress && (
                              <div style={{ color: colors.textLight, marginTop: '4px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={photo.locationAddress}>
                                📍 {photo.locationAddress}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ padding: '12px', color: colors.textLight, fontStyle: 'italic', fontSize: '13px' }}>
                      No campaign photos uploaded yet.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BusinessServicesAudit;
