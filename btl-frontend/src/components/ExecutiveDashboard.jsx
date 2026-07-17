/* eslint-disable no-unused-vars */
import React, { useState, useEffect } from 'react';
import axios from '../utils/api';
import ServiceList from './ServiceList';
import ServiceDetails from './ServiceDetails';
import { FaTasks, FaPlayCircle, FaClock, FaCheckCircle } from 'react-icons/fa';

const WorkerDashboard = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState('services');
  const [selectedService, setSelectedService] = useState(null);
  const [assignedServices, setAssignedServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Blue/Yellow color palette
  const colors = {
    primary: '#0151ba', // Blue
    primaryLight: '#2670e8', // Light Blue
    primaryDark: '#003a8c', // Dark Blue
    secondary: '#f2c43b', // Yellow
    secondaryLight: '#f7d36b', // Light Yellow
    secondaryDark: '#d1a51a', // Dark Yellow
    background: '#f8fafd',
    white: '#ffffff',
    lightGrey: '#f8f9fa',
    border: '#e9ecef',
    text: '#2d3748',
    textLight: '#718096',
    success: '#38a169',
    warning: '#d69e2e',
    danger: '#e53e3e',
    info: '#3182ce'
  };

  useEffect(() => {
    fetchAssignedServices();
    
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchAssignedServices = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/services/assigned-to-me');
      if (response.data.success) {
        const normalized = response.data.services.map(s => ({
          ...s,
          deliveryDate: s.deliveryDate || s.endDate
        }));
        setAssignedServices(normalized);
      }
    } catch (error) {
      console.error('Error fetching assigned services:', error);
    } finally {
      setLoading(false);
    }
  };

  // Expand multi-services assigned to current worker
  const expandAssignedServices = (servicesList) => {
    if (!servicesList || !Array.isArray(servicesList)) return [];
    const expanded = [];
    const currentUserId = (user?._id || user?.id)?.toString();

    servicesList.forEach(service => {
      if (service.services && Array.isArray(service.services) && service.services.length > 0) {
        service.services.forEach((serviceItem, index) => {
          const itemImages = [
            ...((serviceItem.images || []).filter(Boolean)),
            ...((service.images || []).filter(img =>
              (img.itemId && serviceItem._id && img.itemId.toString() === serviceItem._id.toString()) ||
              (img.serviceIndex !== undefined && img.serviceIndex !== null && Number(img.serviceIndex) === index)
            ))
          ].filter((img, i, arr) => arr.findIndex(t => (t.public_id && t.public_id === img.public_id) || (t.url && t.url === img.url) || ((t._id || t.id) && (img._id || img.id) && (t._id || t.id).toString() === (img._id || img.id).toString())) === i);

          const itemAssignedTo = serviceItem.assignedTo || service.assignedTo;
          const isAssignedToMe = (serviceItem.assignedTo?._id || serviceItem.assignedTo)?.toString() === currentUserId || (!serviceItem.assignedTo && (service.assignedTo?._id || service.assignedTo)?.toString() === currentUserId);

          if (isAssignedToMe) {
            expanded.push({
              ...service,
              _originalId: service._id,
              _id: serviceItem._id || `${service._id}-${index}`,
              serviceType: serviceItem.serviceType,
              customServiceType: serviceItem.customServiceType,
              quantity: serviceItem.quantity || 1,
              location: serviceItem.location || service.primaryLocation || service.location,
              notes: serviceItem.notes || '',
              status: serviceItem.status || service.status || 'pending',
              assignedTo: itemAssignedTo || user,
              images: itemImages,
              isMultiService: true,
              serviceIndex: index,
              serviceName: `${service.businessName} - ${serviceItem.serviceType === 'other' ? serviceItem.customServiceType : serviceItem.serviceType}`
            });
          }
        });
      } else {
        const isAssignedToMe = !service.assignedTo || (service.assignedTo?._id || service.assignedTo)?.toString() === currentUserId;
        if (isAssignedToMe) {
          expanded.push({
            ...service,
            _originalId: service._id,
            _id: service._id,
            images: service.images || [],
            isMultiService: false,
            serviceIndex: 0,
            serviceName: `${service.businessName} - ${service.serviceType === 'other' ? service.customServiceType : service.serviceType}`
          });
        }
      }
    });
    return expanded;
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

  // Function to determine actual service status based on image progress or campaign days
  const getServiceStatus = (service) => {
    const hasCampaign = service.startDate && (service.endDate || service.deliveryDate);
    
    if (hasCampaign) {
      const totalDays = getCampaignTotalDays(service.startDate, service.endDate || service.deliveryDate);
      const completedDays = getCompletedDays(service);
      if (totalDays > 0 && completedDays >= totalDays) {
        return 'completed';
      }
    } else {
      const uploadedCount = service.images?.length || 0;
      const totalQuantity = service.quantity || 0;
      if (totalQuantity > 0 && uploadedCount >= totalQuantity) {
        return 'completed';
      }
    }
    return service.status || 'pending';
  };

  // Calculate statistics based on expanded requirement items
  const expandedAssignedServices = expandAssignedServices(assignedServices);
  const activeServices = expandedAssignedServices.filter(s => getServiceStatus(s) === 'active').length;
  const pendingServices = expandedAssignedServices.filter(s => getServiceStatus(s) === 'pending').length;
  const completedServices = expandedAssignedServices.filter(s => getServiceStatus(s) === 'completed').length;
  const totalServices = expandedAssignedServices.length;

  const containerStyle = {
    minHeight: '100vh',
    background: `linear-gradient(135deg, ${colors.primaryLight} 0%, ${colors.primary} 100%)`,
    padding: isMobile ? '16px' : '20px',
    fontFamily: 'Arial, sans-serif'
  };

  const headerStyle = {
    background: colors.white,
    padding: isMobile ? '16px' : '20px',
    borderRadius: '12px',
    boxShadow: '0 5px 15px rgba(1, 81, 186, 0.1)',
    marginBottom: '20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    border: `1px solid ${colors.border}`
  };

  const tabContainerStyle = {
    display: 'flex',
    gap: isMobile ? '8px' : '10px',
    marginBottom: '20px',
    flexWrap: 'wrap'
  };

  const tabStyle = {
    padding: isMobile ? '10px 16px' : '12px 25px',
    background: colors.white,
    border: `1px solid ${colors.border}`,
    borderRadius: '6px',
    fontSize: isMobile ? '14px' : '16px',
    cursor: 'pointer',
    transition: 'all 0.3s',
    fontWeight: '600',
    color: colors.primary
  };

  const activeTabStyle = {
    ...tabStyle,
    background: colors.primary,
    color: colors.white,
    borderColor: colors.primary
  };

  const logoutButtonStyle = {
    padding: isMobile ? '8px 16px' : '10px 20px',
    background: colors.danger,
    color: colors.white,
    border: 'none',
    borderRadius: '6px',
    fontSize: isMobile ? '13px' : '14px',
    cursor: 'pointer',
    fontWeight: '600',
    transition: 'all 0.2s ease'
  };

  // Statistics container
  const statsContainerStyle = {
    display: 'grid',
    gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
    gap: isMobile ? '10px' : '15px',
    marginBottom: '20px'
  };

  // Individual stat box styles
  const statBoxStyle = (type) => {
    let bgColor, iconColor;
    
    switch(type) {
      case 'total':
        bgColor = colors.white;
        iconColor = colors.primary;
        break;
      case 'active':
        bgColor = '#f0fff4';
        iconColor = colors.success;
        break;
      case 'pending':
        bgColor = '#fefcbf';
        iconColor = colors.warning;
        break;
      case 'completed':
        bgColor = '#ebf8ff';
        iconColor = colors.info;
        break;
      default:
        bgColor = colors.white;
        iconColor = colors.primary;
    }
    
    return {
      background: bgColor,
      padding: isMobile ? '16px 12px' : '20px 16px',
      borderRadius: '12px',
      boxShadow: '0 4px 12px rgba(1, 81, 186, 0.08)',
      border: `1px solid ${colors.border}`,
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      alignItems: 'center',
      justifyContent: isMobile ? 'center' : 'flex-start',
      gap: isMobile ? '8px' : '12px',
      textAlign: isMobile ? 'center' : 'left',
      transition: 'all 0.3s ease',
      cursor: 'default'
    };
  };

  const iconContainerStyle = (color) => ({
    width: isMobile ? '40px' : '48px',
    height: isMobile ? '40px' : '48px',
    borderRadius: '50%',
    background: `${color}15`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: isMobile ? '18px' : '20px',
    color: color,
    flexShrink: 0
  });

  const statContentStyle = {
    flex: 1
  };

  const statNumberStyle = {
    fontSize: isMobile ? '24px' : '28px',
    fontWeight: '700',
    margin: '0 0 4px 0',
    lineHeight: '1.2',
    color: colors.primary
  };

  const statNumberColoredStyle = (type) => ({
    ...statNumberStyle,
    color: type === 'total' ? colors.primary :
           type === 'active' ? colors.success :
           type === 'pending' ? colors.warning :
           colors.info
  });

  const statLabelStyle = {
    fontSize: isMobile ? '12px' : '14px',
    color: colors.textLight,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    margin: 0
  };

  const statDescriptionStyle = {
    fontSize: isMobile ? '10px' : '11px',
    color: colors.textLight,
    margin: '4px 0 0 0',
    lineHeight: '1.3'
  };

  const getIcon = (type) => {
    switch(type) {
      case 'total': return <FaTasks />;
      case 'active': return <FaPlayCircle />;
      case 'pending': return <FaClock />;
      case 'completed': return <FaCheckCircle />;
      default: return <FaTasks />;
    }
  };

  const getIconColor = (type) => {
    switch(type) {
      case 'total': return colors.primary;
      case 'active': return colors.success;
      case 'pending': return colors.warning;
      case 'completed': return colors.info;
      default: return colors.primary;
    }
  };

  const getDescription = (type, count) => {
    switch(type) {
      case 'total': return `${count} service${count !== 1 ? 's' : ''} assigned`;
      case 'active': return `${count} currently active`;
      case 'pending': return `${count} waiting to start`;
      case 'completed': return `${count} finished`;
      default: return '';
    }
  };

  const renderContent = () => {
    if (selectedService) {
      return (
        <ServiceDetails 
          service={selectedService} 
          onBack={() => setSelectedService(null)}
          onUpdate={fetchAssignedServices}
          userRole={user?.role || 'worker'}
          currentUser={user}
        />
      );
    }

    const displayedServices = activeTab === 'completed' 
      ? expandedAssignedServices.filter(s => getServiceStatus(s) === 'completed')
      : expandedAssignedServices.filter(s => getServiceStatus(s) !== 'completed');

    return (
      <ServiceList 
        services={displayedServices}
        loading={loading}
        onServiceSelect={setSelectedService}
        onRefresh={fetchAssignedServices}
        showAssignedOnly={true}
        userRole={user?.role || 'worker'}
        currentUser={user}
      />
    );
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <div>
          <h1 style={{ 
            color: colors.primary, 
            margin: '0 0 5px 0',
            fontSize: isMobile ? '22px' : '28px',
            fontWeight: '700'
          }}>
            Worker Dashboard
          </h1>
          <p style={{ 
            color: colors.textLight, 
            margin: 0,
            fontSize: isMobile ? '14px' : '16px',
            fontWeight: '500'
          }}>
            Welcome, {user.name || user.username}
          </p>
        </div>
        <button 
          onClick={onLogout} 
          style={logoutButtonStyle}
          onMouseEnter={(e) => {
            e.target.style.background = '#c53030';
            e.target.style.transform = 'translateY(-1px)';
            e.target.style.boxShadow = '0 4px 8px rgba(197, 48, 48, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.target.style.background = colors.danger;
            e.target.style.transform = 'translateY(0)';
            e.target.style.boxShadow = 'none';
          }}
        >
          Logout
        </button>
      </div>

      {/* Statistics - Separate Boxes */}
      <div style={statsContainerStyle}>
        {/* Total Assigned Box */}
        <div 
          style={statBoxStyle('total')}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 8px 20px rgba(1, 81, 186, 0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(1, 81, 186, 0.08)';
          }}
        >
          <div style={iconContainerStyle(getIconColor('total'))}>
            {getIcon('total')}
          </div>
          <div style={statContentStyle}>
            <div style={statNumberColoredStyle('total')}>
              {totalServices}
            </div>
            <h3 style={statLabelStyle}>Total Assigned</h3>
            <p style={statDescriptionStyle}>
              {getDescription('total', totalServices)}
            </p>
          </div>
        </div>

        {/* Active Box */}
        <div 
          style={statBoxStyle('active')}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 8px 20px rgba(56, 161, 105, 0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(1, 81, 186, 0.08)';
          }}
        >
          <div style={iconContainerStyle(getIconColor('active'))}>
            {getIcon('active')}
          </div>
          <div style={statContentStyle}>
            <div style={statNumberColoredStyle('active')}>
              {activeServices}
            </div>
            <h3 style={statLabelStyle}>Active</h3>
            <p style={statDescriptionStyle}>
              {getDescription('active', activeServices)}
            </p>
          </div>
        </div>

        {/* Pending Box */}
        <div 
          style={statBoxStyle('pending')}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 8px 20px rgba(214, 158, 46, 0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(1, 81, 186, 0.08)';
          }}
        >
          <div style={iconContainerStyle(getIconColor('pending'))}>
            {getIcon('pending')}
          </div>
          <div style={statContentStyle}>
            <div style={statNumberColoredStyle('pending')}>
              {pendingServices}
            </div>
            <h3 style={statLabelStyle}>Pending</h3>
            <p style={statDescriptionStyle}>
              {getDescription('pending', pendingServices)}
            </p>
          </div>
        </div>

        {/* Completed Box */}
        <div 
          style={statBoxStyle('completed')}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 8px 20px rgba(49, 130, 206, 0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(1, 81, 186, 0.08)';
          }}
        >
          <div style={iconContainerStyle(getIconColor('completed'))}>
            {getIcon('completed')}
          </div>
          <div style={statContentStyle}>
            <div style={statNumberColoredStyle('completed')}>
              {completedServices}
            </div>
            <h3 style={statLabelStyle}>Completed</h3>
            <p style={statDescriptionStyle}>
              {getDescription('completed', completedServices)}
            </p>
          </div>
        </div>
      </div>

      <div style={tabContainerStyle}>
        <button
          onClick={() => {
            setActiveTab('services');
            setSelectedService(null);
          }}
          style={activeTab === 'services' ? activeTabStyle : tabStyle}
          onMouseEnter={(e) => {
            if (activeTab !== 'services') {
              e.target.style.background = colors.background;
              e.target.style.borderColor = colors.secondary;
            }
          }}
          onMouseLeave={(e) => {
            if (activeTab !== 'services') {
              e.target.style.background = colors.white;
              e.target.style.borderColor = colors.border;
            }
          }}
        >
          {isMobile ? '📋 Services' : '📋 My Assigned Services'} ({activeServices + pendingServices})
        </button>
        <button
          onClick={() => {
            setActiveTab('completed');
            setSelectedService(null);
          }}
          style={activeTab === 'completed' ? activeTabStyle : tabStyle}
          onMouseEnter={(e) => {
            if (activeTab !== 'completed') {
              e.target.style.background = colors.background;
              e.target.style.borderColor = colors.secondary;
            }
          }}
          onMouseLeave={(e) => {
            if (activeTab !== 'completed') {
              e.target.style.background = colors.white;
              e.target.style.borderColor = colors.border;
            }
          }}
        >
          {isMobile ? '✅ Completed' : '✅ Completed Services'} ({completedServices})
        </button>
      </div>

      {renderContent()}
    </div>
  );
};

export default WorkerDashboard;