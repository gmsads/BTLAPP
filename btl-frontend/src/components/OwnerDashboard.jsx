import React, { useState, useEffect } from 'react';
import axios from '../utils/api';
import AddService from './AddService';
import { generatePDF, generatePPT } from '../utils/documentGenerator';
import ImageUpload from './ImageUpload';
import BusinessServicesAudit from './BusinessServicesAudit';

const OwnerDashboard = ({ user, onLogout }) => {
  const getInitialStateFromUrl = () => {
    const path = window.location.pathname;
    if (path.includes('/owner/business-audit/')) {
      const parts = path.split('/');
      const biz = decodeURIComponent(parts[parts.length - 1]);
      return { tab: 'all-services', viewingBiz: biz };
    }
    
    let tab = 'dashboard';
    if (path.includes('/owner/users')) tab = 'users';
    else if (path.includes('/owner/all-services')) tab = 'all-services';
    else if (path.includes('/owner/active-services')) tab = 'active-services';
    else if (path.includes('/owner/add-service')) tab = 'add-service';
    
    return { tab, viewingBiz: null };
  };

  const initialState = getInitialStateFromUrl();
  const [activeTab, setActiveTab] = useState(initialState.tab);
  const [users, setUsers] = useState([]);
  const [allServices, setAllServices] = useState([]);
  const [activeServices, setActiveServices] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [availableWorkers, setAvailableWorkers] = useState([]);
  const [assigningService, setAssigningService] = useState(null);
  
  // States for image viewing
  const [selectedServiceImages, setSelectedServiceImages] = useState(null);
  const [showImageModal, setShowImageModal] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [uploadModalService, setUploadModalService] = useState(null);
  const [viewingBusinessServices, setViewingBusinessServices] = useState(initialState.viewingBiz);

  const navigateToTab = (tabId) => {
    setActiveTab(tabId);
    setViewingBusinessServices(null);
    window.history.pushState(null, '', `/owner/${tabId}`);
  };

  const navigateToBusinessAudit = (businessName) => {
    setViewingBusinessServices(businessName);
    window.history.pushState(null, '', `/owner/business-audit/${encodeURIComponent(businessName)}`);
  };

  const handleBackToDashboard = () => {
    setViewingBusinessServices(null);
    window.history.pushState(null, '', `/owner/${activeTab}`);
  };

  const getModalService = () => {
    if (!uploadModalService) return null;
    const searchList = activeTab === 'active-services' ? activeServices : allServices;
    
    // Find parent service
    const parent = searchList.find(s => s._id === uploadModalService._originalId || s._id === uploadModalService._id);
    if (!parent) return uploadModalService; // Fallback to state
    
    // If it's multi-service, find the specific item
    if (uploadModalService.isMultiService && parent.services && Array.isArray(parent.services)) {
      const idx = uploadModalService.serviceIndex;
      const serviceItem = parent.services[idx];
      if (serviceItem) {
        // Calculate itemImages for this service item
        const itemImages = [
          ...((serviceItem.images || []).filter(Boolean)),
          ...((parent.images || []).filter(img =>
            (img.itemId && serviceItem._id && img.itemId.toString() === serviceItem._id.toString()) ||
            (img.serviceIndex !== undefined && img.serviceIndex !== null && Number(img.serviceIndex) === idx)
          ))
        ].filter((img, i, arr) => arr.findIndex(t => (t.public_id && t.public_id === img.public_id) || (t.url && t.url === img.url) || ((t._id || t.id) && (img._id || img.id) && (t._id || t.id).toString() === (img._id || img.id).toString())) === i);

        return {
          ...parent,
          _originalId: parent._id,
          _id: serviceItem._id || `${parent._id}-${idx}`,
          _rowId: `${parent._id}-${serviceItem._id || idx}`,
          serviceType: serviceItem.serviceType,
          customServiceType: serviceItem.customServiceType,
          quantity: serviceItem.quantity,
          location: serviceItem.location || parent.primaryLocation || parent.location,
          notes: serviceItem.notes || '',
          itemStatus: serviceItem.status || 'pending',
          assignedTo: serviceItem.assignedTo || (parent.assignedTo && !parent.services.some(s => s.assignedTo) ? parent.assignedTo : null),
          images: itemImages,
          isMultiService: true,
          serviceIndex: idx,
          totalServices: parent.services.length,
          serviceName: `${parent.businessName} - ${serviceItem.serviceType === 'other' ? serviceItem.customServiceType : serviceItem.serviceType}`
        };
      }
    } else {
      // Single service
      return {
        ...parent,
        _originalId: parent._id,
        _id: parent._id,
        _rowId: parent._id,
        isMultiService: false,
        serviceIndex: 0,
        totalServices: 1,
        quantity: parent.quantity || 0,
        location: parent.location || parent.primaryLocation,
        serviceName: `${parent.businessName} - ${parent.serviceType === 'other' ? parent.customServiceType : parent.serviceType}`,
        itemStatus: parent.status || 'pending'
      };
    }
    return uploadModalService;
  };

  // Same Green/Brown color palette
  // Blue/Yellow color palette as requested
  const colors = {
    primary: '#0151ba', // Blue
    primaryLight: '#2a75e6',
    primaryDark: '#013a85',
    secondary: '#f2c43b', // Yellow
    secondaryLight: '#f5d166',
    secondaryDark: '#c79e22',
    background: '#f8f9fa',
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
    const path = window.location.pathname;
    if (path === '/' || path === '/owner' || path === '/owner/') {
      window.history.replaceState(null, '', '/owner/dashboard');
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const state = getInitialStateFromUrl();
      setActiveTab(state.tab);
      setViewingBusinessServices(state.viewingBiz);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      setSidebarOpen(!mobile);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (activeTab === 'users') {
      fetchUsers();
    } else if (activeTab === 'all-services') {
      fetchAllServices();
      fetchAvailableWorkers();
    } else if (activeTab === 'active-services') {
      fetchActiveServices();
      fetchAvailableWorkers();
    } else if (activeTab === 'dashboard') {
      fetchStats();
      fetchActiveServices();
    }
  }, [activeTab]);

  // NEW: Function to get location display for individual image
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

  // Function to handle viewing images for a service
  const handleViewImages = (service) => {
    setSelectedServiceImages(service);
    setCurrentImageIndex(0);
    setShowImageModal(true);
  };

  // Navigate to next image
  const nextImage = () => {
    if (selectedServiceImages && selectedServiceImages.images) {
      setCurrentImageIndex((prevIndex) => 
        prevIndex === selectedServiceImages.images.length - 1 ? 0 : prevIndex + 1
      );
    }
  };

  // Navigate to previous image
  const prevImage = () => {
    if (selectedServiceImages && selectedServiceImages.images) {
      setCurrentImageIndex((prevIndex) => 
        prevIndex === 0 ? selectedServiceImages.images.length - 1 : prevIndex - 1
      );
    }
  };

  // Close image modal
  const closeImageModal = () => {
    setShowImageModal(false);
    setSelectedServiceImages(null);
    setCurrentImageIndex(0);
  };

  // Keyboard navigation for image modal
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

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/owner/users');
      if (response.data.success) {
        setUsers(response.data.users);
      }
    } catch (error) {
      setMessage('Error fetching users: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const fetchAllServices = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/owner/services');
      if (response.data.success) {
        const normalized = response.data.services.map(s => ({
          ...s,
          deliveryDate: s.deliveryDate || s.endDate
        }));
        setAllServices(normalized);
      }
    } catch (error) {
      setMessage('Error fetching services: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const fetchActiveServices = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/owner/services?status=active');
      if (response.data.success) {
        const normalized = response.data.services.map(s => ({
          ...s,
          deliveryDate: s.deliveryDate || s.endDate
        }));
        setActiveServices(normalized);
      }
    } catch (error) {
      setMessage('Error fetching active services: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/owner/stats');
      if (response.data.success) {
        setStats(response.data.stats);
      }
    } catch (error) {
      setMessage('Error fetching stats: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableWorkers = async () => {
    try {
      const response = await axios.get('/owner/available-workers'); 
      if (response.data.success) {
        setAvailableWorkers(response.data.workers);
      }
    } catch (error) {
      setMessage('Error fetching workers: ' + (error.response?.data?.message || error.message));
    }
  };

  const deleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user?')) {
      return;
    }

    try {
      const response = await axios.delete(`/owner/users/${userId}`);
      if (response.data.success) {
        setMessage('User deleted successfully');
        fetchUsers();
      }
    } catch (error) {
      setMessage('Error deleting user: ' + (error.response?.data?.message || error.message));
    }
  };

  const deleteService = async (serviceId) => {
    if (!window.confirm('Are you sure you want to delete this service?')) {
      return;
    }

    try {
      const response = await axios.delete(`/owner/services/${serviceId}`);
      if (response.data.success) {
        setMessage('Service deleted successfully');
        if (activeTab === 'all-services') {
          fetchAllServices();
        } else if (activeTab === 'active-services') {
          fetchActiveServices();
        }
      }
    } catch (error) {
      setMessage('Error deleting service: ' + (error.response?.data?.message || error.message));
    }
  };

  const deleteServiceItem = async (serviceId, itemId, serviceItemName) => {
    if (!window.confirm(`Are you sure you want to delete this service item: "${serviceItemName}"?\n\nThis will only delete this specific service item from the order.`)) {
      return;
    }

    try {
      const response = await axios.delete(`/owner/services/${serviceId}/items/${itemId}`);
      if (response.data.success) {
        setMessage('Service item deleted successfully!');
        if (activeTab === 'all-services') {
          fetchAllServices();
        } else if (activeTab === 'active-services') {
          fetchActiveServices();
        }
      }
    } catch (error) {
      setMessage('Error deleting service item: ' + (error.response?.data?.message || error.message));
    }
  };

  const assignService = async (serviceId, workerId, options = {}) => {
    try {
      const response = await axios.patch(`/owner/services/${serviceId}/assign`, {
        assignedTo: workerId,
        assignAll: options.assignAll,
        serviceIndex: options.serviceIndex
      });
      if (response.data.success) {
        setMessage('Service assigned successfully!');
        setAssigningService(null);
        if (activeTab === 'all-services') {
          fetchAllServices();
        } else if (activeTab === 'active-services') {
          fetchActiveServices();
        }
      }
    } catch (error) {
      setMessage('Error assigning service: ' + (error.response?.data?.message || error.message));
    }
  };

  const unassignService = async (serviceId, options = {}) => {
    try {
      const response = await axios.patch(`/owner/services/${serviceId}/assign`, {
        assignedTo: null,
        assignAll: options.assignAll !== undefined ? options.assignAll : true,
        serviceIndex: options.serviceIndex
      });
      if (response.data.success) {
        setMessage('Service unassigned successfully!');
        if (activeTab === 'all-services') {
          fetchAllServices();
        } else if (activeTab === 'active-services') {
          fetchActiveServices();
        }
      }
    } catch (error) {
      setMessage('Error unassigning service: ' + (error.response?.data?.message || error.message));
    }
  };

// Calculate duration - FIXED
const calculateDuration = (startDate, deliveryDate) => {
  if (!startDate || !deliveryDate) return 'N/A';
  
  const start = new Date(startDate);
  const delivery = new Date(deliveryDate);
  
  start.setHours(0, 0, 0, 0);
  delivery.setHours(0, 0, 0, 0);
  
  const diffTime = delivery - start;
  const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  // If same day, return 1 day
  if (days === 0) return '1 day';
  
  return `${days} day${days !== 1 ? 's' : ''}`;
};

 // Calculate total campaign days - FIXED
const getCampaignTotalDays = (startDate, endDate) => {
  if (!startDate || !endDate) return 0;
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  
  const diffTime = end - start;
  const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  // If same date, return 1
  if (days === 0) return 1;
  
  return days;
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

  const renderServiceProgressText = (service) => {
    const hasCampaign = service.startDate && (service.endDate || service.deliveryDate);
    if (hasCampaign) {
      const totalDays = getCampaignTotalDays(service.startDate, service.endDate || service.deliveryDate);
      const completedDays = getCompletedDays(service);
      return `Day ${completedDays}/${totalDays}`;
    }
    return `${service.images?.length || 0}/${service.quantity || 0}`;
  };

  const AssignmentModal = ({ service, workers, onAssign, onClose }) => {
    const [selectedWorker, setSelectedWorker] = useState('');
    const [assignMode, setAssignMode] = useState(service.isMultiService ? 'single' : 'all');

    const modalStyle = {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      background: colors.white,
      padding: isMobile ? '20px' : '24px',
      borderRadius: '12px',
      boxShadow: '0 20px 40px rgba(1, 81, 186, 0.2)',
      zIndex: 1000,
      width: isMobile ? '90vw' : '450px',
      maxWidth: '95vw',
      border: `2px solid ${colors.secondary}`
    };

    const overlayStyle = {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(1, 81, 186, 0.6)',
      zIndex: 999
    };

    const handleAssign = () => {
      if (selectedWorker) {
        onAssign(service._originalId || service._id, selectedWorker, {
          assignAll: assignMode === 'all',
          serviceIndex: service.serviceIndex
        });
      }
    };

    return (
      <>
        <div style={overlayStyle} onClick={onClose} />
        <div style={modalStyle}>
          <h3 style={{ 
            margin: '0 0 16px 0', 
            color: colors.primary,
            fontSize: isMobile ? '16px' : '18px',
            fontWeight: '600'
          }}>
            Assign Service
          </h3>
          <p style={{ 
            margin: '0 0 20px 0', 
            color: colors.textLight,
            fontSize: isMobile ? '13px' : '14px'
          }}>
            Assign <strong style={{color: colors.primary}}>{service.businessName}</strong> to a worker:
          </p>
          
          <select
            value={selectedWorker}
            onChange={(e) => setSelectedWorker(e.target.value)}
            style={{
              width: '100%',
              padding: isMobile ? '10px' : '12px',
              border: `2px solid ${colors.secondary}`,
              borderRadius: '8px',
              marginBottom: '20px',
              fontSize: isMobile ? '13px' : '14px',
              background: colors.background,
              color: colors.text
            }}
          >
            <option value="">Select a worker</option>
            {workers.map(worker => (
              <option key={worker._id} value={worker._id}>
                {worker.username} ({worker.email}) {worker.contactNumber ? `📞 ${worker.contactNumber}` : ''}
              </option>
            ))}
          </select>

          {service.isMultiService && service.serviceIndex !== undefined && (
            <div style={{
              marginBottom: '20px',
              padding: '14px',
              background: '#f8fafc',
              borderRadius: '8px',
              border: `1px solid ${colors.border}`
            }}>
              <div style={{ fontWeight: '600', color: colors.primary, marginBottom: '10px', fontSize: '13px' }}>
                Multiple Service Requirement Options:
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'pointer', fontSize: '13px' }}>
                <input
                  type="radio"
                  name="assignMode"
                  value="single"
                  checked={assignMode === 'single'}
                  onChange={() => setAssignMode('single')}
                />
                <span>Assign separate worker single service item (<strong>{service.serviceType || service.serviceName}</strong>)</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                <input
                  type="radio"
                  name="assignMode"
                  value="all"
                  checked={assignMode === 'all'}
                  onChange={() => setAssignMode('all')}
                />
                <span>Assign to single user ALL services ({service.totalServices || 'All items'} for this business)</span>
              </label>
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button
              onClick={onClose}
              style={{
                padding: isMobile ? '8px 16px' : '10px 20px',
                background: colors.textLight,
                color: colors.white,
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: isMobile ? '13px' : '14px',
                fontWeight: '500'
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleAssign}
              disabled={!selectedWorker}
              style={{
                padding: isMobile ? '8px 16px' : '10px 20px',
                background: selectedWorker ? colors.secondary : colors.textLight,
                color: selectedWorker ? colors.primary : colors.white,
                border: 'none',
                borderRadius: '8px',
                cursor: selectedWorker ? 'pointer' : 'not-allowed',
                fontSize: isMobile ? '13px' : '14px',
                fontWeight: '600'
              }}
            >
              Assign Service
            </button>
          </div>
        </div>
      </>
    );
  };

  // UPDATED: Image Modal Component with Location and 100% Mobile Responsive
  const ImageModal = () => {
    if (!selectedServiceImages || !selectedServiceImages.images) return null;

    const modalImages = selectedServiceImages.images;
    const service = selectedServiceImages;

    const getGroupedModalImages = () => {
      const hasCampaign = selectedServiceImages?.startDate && (selectedServiceImages?.endDate || selectedServiceImages?.deliveryDate);
      if (!hasCampaign) {
        return { isCampaign: false, images: selectedServiceImages.images };
      }
      
      const startDate = selectedServiceImages.startDate;
      const endDate = selectedServiceImages.endDate || selectedServiceImages.deliveryDate;
      const totalDays = getCampaignTotalDays(startDate, endDate);
      
      const groups = {};
      for (let d = 1; d <= totalDays; d++) {
        groups[d] = [];
      }
      const overflowImages = [];
      
      selectedServiceImages.images.forEach(img => {
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

    const handleDeleteImage = async () => {
      const activeImage = modalImages[currentImageIndex];
      if (!activeImage) return;

      const imageId = activeImage._id || activeImage.id;
      if (!imageId || !service._id) return;

      if (!window.confirm(`Are you sure you want to delete this image?`)) return;

      try {
        let deleteUrl = `/services/${service._originalId || service._id}/images/${imageId}`;
        if (activeImage.public_id) {
          deleteUrl += `?public_id=${encodeURIComponent(activeImage.public_id)}`;
        }

        const response = await axios.delete(deleteUrl);
        if (response.data.success) {
          alert('Image deleted successfully!');
          const updated = modalImages.filter(img => (img._id || img.id) !== imageId);
          setSelectedServiceImages(prev => ({
            ...prev,
            images: updated
          }));
          if (currentImageIndex >= updated.length) {
            setCurrentImageIndex(Math.max(0, updated.length - 1));
          }
          if (updated.length === 0) {
            closeImageModal();
          }
          if (activeTab === 'all-services') fetchAllServices();
          else if (activeTab === 'active-services') fetchActiveServices();
        } else {
          alert(`Failed to delete: ${response.data.message}`);
        }
      } catch (err) {
        console.error('Delete image error:', err);
        alert(`Error deleting image: ${err.message}`);
      }
    };

    const handleDeleteSingleImage = async (imgToDelete) => {
      if (!imgToDelete) return;

      const imageId = imgToDelete._id || imgToDelete.id;
      if (!imageId || !service._id) return;

      if (!window.confirm(`Are you sure you want to delete this specific image?`)) return;

      try {
        let deleteUrl = `/services/${service._originalId || service._id}/images/${imageId}`;
        if (imgToDelete.public_id) {
          deleteUrl += `?public_id=${encodeURIComponent(imgToDelete.public_id)}`;
        }

        const response = await axios.delete(deleteUrl);
        if (response.data.success) {
          alert('Image deleted successfully!');
          const updated = modalImages.filter(img => (img._id || img.id) !== imageId);
          setSelectedServiceImages(prev => ({
            ...prev,
            images: updated
          }));
          
          const indexInFlat = modalImages.findIndex(img => (img._id || img.id) === imageId);
          if (currentImageIndex === indexInFlat) {
            setCurrentImageIndex(Math.max(0, updated.length - 1));
          } else if (currentImageIndex > indexInFlat) {
            setCurrentImageIndex(prev => Math.max(0, prev - 1));
          }

          if (updated.length === 0) {
            closeImageModal();
          }
          if (activeTab === 'all-services') fetchAllServices();
          else if (activeTab === 'active-services') fetchActiveServices();
        } else {
          alert(`Failed to delete: ${response.data.message}`);
        }
      } catch (err) {
        console.error('Delete image error:', err);
        alert(`Error deleting image: ${err.message}`);
      }
    };

    const overlayStyle = {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(1, 81, 186, 0.85)',
      zIndex: 1000,
      backdropFilter: 'blur(3px)'
    };

    const modalStyle = {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      background: colors.white,
      padding: isMobile ? '16px' : '24px',
      borderRadius: '12px',
      boxShadow: '0 25px 50px rgba(1, 81, 186, 0.3)',
      zIndex: 1001,
      width: isMobile ? '95vw' : '600px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      overflow: 'auto',
      border: `3px solid ${colors.secondary}`
    };

    const imageContainerStyle = {
      width: '100%',
      height: isMobile ? '200px' : '300px',
      background: colors.background,
      borderRadius: '8px',
      overflow: 'hidden',
      marginBottom: '16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: `2px solid ${colors.border}`
    };

    const imageStyle = {
      maxWidth: '100%',
      maxHeight: '100%',
      objectFit: 'contain'
    };

    const thumbnailContainerStyle = {
      display: 'flex',
      gap: '8px',
      overflowX: 'auto',
      padding: '10px 0',
      WebkitOverflowScrolling: 'touch'
    };

    const thumbnailStyle = (index) => ({
      width: '60px',
      height: '60px',
      borderRadius: '6px',
      overflow: 'hidden',
      cursor: 'pointer',
      border: `2px solid ${index === currentImageIndex ? colors.secondary : colors.border}`,
      opacity: index === currentImageIndex ? 1 : 0.6,
      transition: 'all 0.2s ease',
      flexShrink: 0
    });

    const handleImageError = (e) => {
      e.target.onerror = null;
      e.target.src = 'https://via.placeholder.com/400x300?text=Image+Not+Available';
    };

    const handleThumbnailError = (e) => {
      e.target.onerror = null;
      e.target.src = 'https://via.placeholder.com/60x60?text=Image';
    };

    return (
      <>
        <div style={overlayStyle} onClick={closeImageModal} />
        <div style={modalStyle}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px'
          }}>
            <h3 style={{
              margin: 0,
              color: colors.primary,
              fontSize: isMobile ? '16px' : '18px',
              fontWeight: '600'
            }}>
              Service Images: {service.businessName}
            </h3>
            <button
              type="button"
              onClick={closeImageModal}
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: 'none',
                color: colors.danger,
                fontSize: '24px',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '50%',
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                fontWeight: 'bold'
              }}
              onMouseEnter={(e) => {
                e.target.style.background = colors.danger;
                e.target.style.color = colors.white;
              }}
              onMouseLeave={(e) => {
                e.target.style.background = 'rgba(239, 68, 68, 0.1)';
                e.target.style.color = colors.danger;
              }}
            >
              ×
            </button>
          </div>

          <div style={imageContainerStyle}>
            <img
              src={modalImages[currentImageIndex]?.url}
              alt={modalImages[currentImageIndex]?.caption || `Service image ${currentImageIndex + 1}`}
              style={imageStyle}
              onError={handleImageError}
            />
          </div>

          {(() => {
            const grouped = getGroupedModalImages();
            if (!grouped.isCampaign) {
              return modalImages.length > 1 && (
                <div style={thumbnailContainerStyle}>
                  {modalImages.map((img, index) => (
                    <div
                      key={img._id || index}
                      style={{
                        ...thumbnailStyle(index),
                        position: 'relative'
                      }}
                      onClick={() => setCurrentImageIndex(index)}
                    >
                      <img
                        src={img.url}
                        alt={`Thumbnail ${index + 1}`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={handleThumbnailError}
                      />
                      <button
                        type="button"
                        title="Delete Image"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSingleImage(img);
                        }}
                        style={{
                          position: 'absolute',
                          top: '2px',
                          right: '2px',
                          background: 'rgba(220, 53, 69, 0.95)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '50%',
                          width: '18px',
                          height: '18px',
                          fontSize: '11px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          lineHeight: 1,
                          zIndex: 10
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              );
            }
            
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px', maxHeight: '250px', overflowY: 'auto', paddingRight: '4px', width: '100%' }}>
                {Object.keys(grouped.groups).map((day) => {
                  const dayImages = grouped.groups[day];
                  return (
                    <div key={day} style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: colors.primary, marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                        <span>📅 Day {day}</span>
                        <span style={{ fontSize: '11px', color: colors.textLight }}>({dayImages.length} image{dayImages.length !== 1 ? 's' : ''})</span>
                      </div>
                      {dayImages.length > 0 ? (
                        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '6px' }}>
                          {dayImages.map((img) => {
                            const indexInFlat = modalImages.findIndex(mImg => (mImg._id || mImg.id) === (img._id || img.id));
                            return (
                              <div
                                key={img._id}
                                style={{
                                  ...thumbnailStyle(indexInFlat),
                                  position: 'relative'
                                }}
                                onClick={() => setCurrentImageIndex(indexInFlat)}
                              >
                                <img
                                  src={img.url}
                                  alt="Thumbnail"
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  onError={handleThumbnailError}
                                />
                                <button
                                  type="button"
                                  title="Delete Image"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteSingleImage(img);
                                  }}
                                  style={{
                                    position: 'absolute',
                                    top: '2px',
                                    right: '2px',
                                    background: 'rgba(220, 53, 69, 0.95)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: '18px',
                                    height: '18px',
                                    fontSize: '11px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    lineHeight: 1,
                                    zIndex: 10
                                  }}
                                >
                                  ×
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ fontSize: '12px', color: colors.textLight, fontStyle: 'italic' }}>
                          No images for Day {day}
                        </div>
                      )}
                    </div>
                  );
                })}
                
                {grouped.overflowImages && grouped.overflowImages.length > 0 && (
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: colors.danger, marginBottom: '8px' }}>
                      ⚠️ Other Campaign Images ({grouped.overflowImages.length})
                    </div>
                    <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '6px' }}>
                      {grouped.overflowImages.map((img) => {
                        const indexInFlat = modalImages.findIndex(mImg => (mImg._id || mImg.id) === (img._id || img.id));
                        return (
                          <div
                            key={img._id}
                            style={{
                              ...thumbnailStyle(indexInFlat),
                              position: 'relative'
                            }}
                            onClick={() => setCurrentImageIndex(indexInFlat)}
                          >
                            <img
                              src={img.url}
                              alt="Thumbnail"
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              onError={handleThumbnailError}
                            />
                            <button
                              type="button"
                              title="Delete Image"
                              onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteSingleImage(img);
                              }}
                              style={{
                                position: 'absolute',
                                top: '2px',
                                right: '2px',
                                background: 'rgba(220, 53, 69, 0.95)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '50%',
                                width: '18px',
                                height: '18px',
                                fontSize: '11px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                lineHeight: 1,
                                zIndex: 10
                              }}
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          <div style={{
            marginTop: '20px',
            paddingTop: '16px',
            borderTop: `1px solid ${colors.border}`,
            textAlign: 'center'
          }}>
            <span style={{ color: colors.textLight, fontSize: isMobile ? '12px' : '14px' }}>
              Image {currentImageIndex + 1} of {modalImages.length}
            </span>
            {modalImages[currentImageIndex]?.caption && (
              <div style={{
                marginTop: '8px',
                color: colors.primary,
                fontWeight: '600',
                fontSize: isMobile ? '12px' : '14px'
              }}>
                {modalImages[currentImageIndex].caption}
              </div>
            )}
            {modalImages[currentImageIndex]?.locationAddress && (
              <div style={{
                marginTop: '4px',
                color: colors.textLight,
                fontSize: isMobile ? '11px' : '12px'
              }}>
                📍 {modalImages[currentImageIndex].locationAddress}
              </div>
            )}
            <div style={{ marginTop: '12px', display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={closeImageModal}
                style={{
                  background: colors.textLight,
                  color: colors.white,
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '20px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = '#718096';
                  e.target.style.transform = 'scale(1.05)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = colors.textLight;
                  e.target.style.transform = 'scale(1)';
                }}
              >
                ❌ Close Window
              </button>

              <button
                type="button"
                onClick={handleDeleteImage}
                style={{
                  background: 'rgba(220, 53, 69, 0.9)',
                  color: 'white',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '20px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = '#bd2130';
                  e.target.style.transform = 'scale(1.05)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'rgba(220, 53, 69, 0.9)';
                  e.target.style.transform = 'scale(1)';
                }}
              >
                🗑️ Delete Image
              </button>
            </div>
          </div>
        </div>
      </>
    );
  };

  const containerStyle = {
    minHeight: '100vh',
    background: `linear-gradient(135deg, ${colors.background} 0%, ${colors.white} 100%)`,
    fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif",
    display: 'flex',
    fontSize: isMobile ? '13px' : '14px'
  };

  const sidebarStyle = {
    width: isMobile ? (sidebarOpen ? '260px' : '0') : '260px',
    background: `linear-gradient(180deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`,
    transition: 'all 0.3s ease',
    overflowY: 'auto',
    position: isMobile ? 'fixed' : 'sticky',
    top: 0,
    height: '100vh',
    zIndex: 1000,
    flexShrink: 0,
    boxShadow: '4px 0 20px rgba(1, 81, 186, 0.15)'
  };

  const mainContentStyle = {
    flex: 1,
    minWidth: 0,
    overflowX: 'auto',
    padding: isMobile ? '16px' : '24px',
    marginLeft: isMobile ? '0' : '0',
    transition: 'all 0.3s ease',
    background: 'transparent',
    width: isMobile ? '100%' : 'auto'
  };

  const headerStyle = {
    background: `linear-gradient(135deg, ${colors.white} 0%, ${colors.background} 100%)`,
    padding: isMobile ? '16px' : '24px',
    borderRadius: '12px',
    boxShadow: '0 4px 12px rgba(1, 81, 186, 0.1)',
    marginBottom: isMobile ? '16px' : '20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: isMobile ? '12px' : '0',
    border: `2px solid ${colors.secondary}`
  };

  const contentStyle = {
    background: colors.white,
    padding: isMobile ? '16px' : '24px',
    borderRadius: '12px',
    boxShadow: '0 4px 12px rgba(1, 81, 186, 0.1)',
    minHeight: '400px',
    border: `1px solid ${colors.border}`,
    overflow: 'hidden'
  };

  const cardStyle = {
    background: colors.white,
    padding: isMobile ? '14px' : '20px',
    borderRadius: '10px',
    boxShadow: '0 2px 8px rgba(1, 81, 186, 0.08)',
    marginBottom: isMobile ? '12px' : '18px',
    border: `1px solid ${colors.border}`
  };

  const statCardStyle = {
    ...cardStyle,
    textAlign: 'center',
    background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%)`,
    color: colors.white,
    border: 'none',
    boxShadow: '0 4px 15px rgba(1, 81, 186, 0.2)'
  };

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: isMobile ? '12px' : '20px',
    marginBottom: isMobile ? '16px' : '24px'
  };

  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    marginTop: '16px',
    fontSize: isMobile ? '12px' : '14px',
    borderRadius: '8px',
    overflow: 'hidden',
    boxShadow: '0 2px 8px rgba(1, 81, 186, 0.1)'
  };

  const thStyle = {
    background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryLight} 100%)`,
    color: colors.white,
    padding: isMobile ? '12px 6px' : '16px 12px',
    textAlign: 'left',
    border: `1px solid ${colors.primaryLight}`,
    fontSize: isMobile ? '11px' : '14px',
    fontWeight: '600'
  };

  const tdStyle = {
    padding: isMobile ? '10px 6px' : '14px 12px',
    border: `1px solid ${colors.border}`,
    textAlign: 'left',
    fontSize: isMobile ? '11px' : '14px',
    background: colors.white,
    verticalAlign: 'top'
  };

  const buttonStyle = (color = colors.secondary, size = 'medium') => ({
    padding: size === 'small' ? (isMobile ? '6px 10px' : '8px 12px') : 
             size === 'large' ? (isMobile ? '10px 16px' : '14px 24px') : 
             (isMobile ? '8px 12px' : '12px 20px'),
    background: color,
    color: color === colors.secondary ? colors.primary : colors.white,
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: size === 'small' ? (isMobile ? '11px' : '12px') : 
             size === 'large' ? (isMobile ? '13px' : '15px') : 
             (isMobile ? '12px' : '14px'),
    fontWeight: '600',
    transition: 'all 0.2s ease',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    textDecoration: 'none',
    whiteSpace: 'nowrap'
  });

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return colors.success;
      case 'pending': return colors.warning;
      case 'completed': return colors.info;
      default: return colors.textLight;
    }
  };

  const getRoleColor = (role) => {
    return role === 'admin' ? colors.primary : colors.secondary;
  };

  const renderDashboard = () => (
    <div>
      <h3 style={{ 
        color: colors.primary, 
        marginBottom: isMobile ? '16px' : '24px', 
        fontSize: isMobile ? '16px' : '22px', 
        fontWeight: '700'
      }}>
        📊 Dashboard Overview
      </h3>
      
      {stats && (
        <>
          <div style={gridStyle}>
            <div style={statCardStyle}>
              <div style={{ fontSize: isMobile ? '18px' : '24px', marginBottom: '6px' }}>👥</div>
              <h4 style={{ margin: '0 0 6px 0', fontSize: isMobile ? '11px' : '13px', opacity: 0.9, fontWeight: '600' }}>TOTAL USERS</h4>
              <div style={{ fontSize: isMobile ? '20px' : '28px', fontWeight: 'bold' }}>{stats.totalUsers}</div>
            </div>
            <div style={statCardStyle}>
              <div style={{ fontSize: isMobile ? '18px' : '24px', marginBottom: '6px' }}>👷</div>
              <h4 style={{ margin: '0 0 6px 0', fontSize: isMobile ? '11px' : '13px', opacity: 0.9, fontWeight: '600' }}>WORKERS</h4>
              <div style={{ fontSize: isMobile ? '20px' : '28px', fontWeight: 'bold' }}>{stats.totalWorkers}</div>
            </div>
            <div style={statCardStyle}>
              <div style={{ fontSize: isMobile ? '18px' : '24px', marginBottom: '6px' }}>🏢</div>
              <h4 style={{ margin: '0 0 6px 0', fontSize: isMobile ? '11px' : '13px', opacity: 0.9, fontWeight: '600' }}>CLIENTS</h4>
              <div style={{ fontSize: isMobile ? '20px' : '28px', fontWeight: 'bold' }}>{stats.totalClients}</div>
            </div>
            <div style={statCardStyle}>
              <div style={{ fontSize: isMobile ? '18px' : '24px', marginBottom: '6px' }}>📋</div>
              <h4 style={{ margin: '0 0 6px 0', fontSize: isMobile ? '11px' : '13px', opacity: 0.9, fontWeight: '600' }}>SERVICES</h4>
              <div style={{ fontSize: isMobile ? '20px' : '28px', fontWeight: 'bold' }}>{stats.totalServices}</div>
            </div>
          </div>

          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', 
            gap: isMobile ? '16px' : '24px', 
            marginBottom: isMobile ? '20px' : '28px' 
          }}>
            <div style={cardStyle}>
              <h4 style={{ 
                color: colors.primary, 
                marginBottom: isMobile ? '14px' : '18px', 
                fontSize: isMobile ? '14px' : '16px', 
                fontWeight: '600'
              }}>
                📈 Services by Status
              </h4>
              {stats.servicesByStatus && stats.servicesByStatus.map((item, index) => (
                <div key={index} style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  marginBottom: '8px',
                  padding: isMobile ? '10px' : '12px',
                  background: colors.background,
                  borderRadius: '6px',
                  border: `1px solid ${colors.border}`
                }}>
                  <span style={{ 
                    padding: isMobile ? '4px 8px' : '6px 12px', 
                    borderRadius: '20px', 
                    fontSize: isMobile ? '10px' : '12px',
                    background: getStatusColor(item._id),
                    color: colors.white,
                    fontWeight: '600'
                  }}>
                    {item._id.toUpperCase()}
                  </span>
                  <span style={{ 
                    fontWeight: 'bold', 
                    fontSize: isMobile ? '13px' : '15px',
                    color: colors.primary
                  }}>{item.count}</span>
                </div>
              ))}
            </div>

            <div style={cardStyle}>
              <h4 style={{ 
                color: colors.primary, 
                marginBottom: isMobile ? '14px' : '18px', 
                fontSize: isMobile ? '14px' : '16px', 
                fontWeight: '600'
              }}>
                👥 Services by Assignment
              </h4>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: '8px',
                padding: isMobile ? '10px' : '12px',
                background: colors.background,
                borderRadius: '6px',
                border: `1px solid ${colors.border}`
              }}>
                <span style={{ 
                  padding: isMobile ? '4px 8px' : '6px 12px', 
                  borderRadius: '20px', 
                    fontSize: isMobile ? '10px' : '12px',
                  background: colors.success,
                  color: colors.white,
                  fontWeight: '600'
                }}>
                  ASSIGNED
                </span>
                <span style={{ 
                  fontWeight: 'bold', 
                  fontSize: isMobile ? '13px' : '15px',
                  color: colors.primary
                }}>{stats.assignedServices || 0}</span>
              </div>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: '8px',
                padding: isMobile ? '10px' : '12px',
                background: colors.background,
                borderRadius: '6px',
                border: `1px solid ${colors.border}`
              }}>
                <span style={{ 
                  padding: isMobile ? '4px 8px' : '6px 12px', 
                  borderRadius: '20px', 
                  fontSize: isMobile ? '10px' : '12px',
                  background: colors.warning,
                  color: colors.white,
                  fontWeight: '600'
                }}>
                  UNASSIGNED
                </span>
                <span style={{ 
                  fontWeight: 'bold', 
                  fontSize: isMobile ? '13px' : '15px',
                  color: colors.primary
                }}>{stats.unassignedServices || 0}</span>
              </div>
            </div>
          </div>
        </>
      )}

      <div style={cardStyle}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: isMobile ? '16px' : '20px',
          flexWrap: 'wrap',
          gap: isMobile ? '8px' : '12px'
        }}>
          <h4 style={{ 
            color: colors.primary, 
            margin: 0, 
            fontSize: isMobile ? '14px' : '16px', 
            fontWeight: '600'
          }}>
            🟢 Active Services
          </h4>
          <button 
            onClick={() => navigateToTab('active-services')}
            style={buttonStyle(colors.secondary, 'small')}
          >
            View All
          </button>
        </div>
        
        {activeServices.slice(0, isMobile ? 2 : 3).map((service) => (
          <div key={service._id} style={{
            ...cardStyle,
            borderLeft: `4px solid ${colors.success}`,
            background: '#f0fff4',
            marginBottom: isMobile ? '12px' : '16px',
            padding: isMobile ? '12px' : '18px'
          }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'flex-start', 
              marginBottom: isMobile ? '8px' : '12px', 
              flexWrap: 'wrap',
              gap: isMobile ? '6px' : '8px'
            }}>
              <div style={{ flex: 1, minWidth: isMobile ? '100%' : 'auto', marginBottom: isMobile ? '6px' : '0' }}>
                <h5 style={{ 
                  margin: '0 0 4px 0', 
                  color: colors.primary, 
                  fontSize: isMobile ? '13px' : '15px', 
                  fontWeight: '600' 
                }}>
                  {service.businessName}
                </h5>
                <p style={{ 
                  margin: '0 0 4px 0', 
                  color: colors.textLight, 
                  fontSize: isMobile ? '12px' : '14px',
                  fontWeight: '500'
                }}>
                  {service.serviceType === 'other' ? service.customServiceType : service.serviceType}
                </p>
                <p style={{ 
                  margin: 0, 
                  color: colors.textLight, 
                  fontSize: isMobile ? '11px' : '13px' 
                }}>
                  {service.createdBy.username}
                  {service.assignedTo && (
                    <span style={{ marginLeft: '6px', color: colors.success, fontWeight: '600' }}>
                      → {service.assignedTo.username}
                    </span>
                  )}
                </p>
              </div>
              <span style={{
                padding: isMobile ? '4px 8px' : '6px 12px',
                borderRadius: '20px',
                fontSize: isMobile ? '10px' : '12px',
                background: colors.success,
                color: colors.white,
                fontWeight: '600',
                whiteSpace: 'nowrap'
              }}>
                ACTIVE
              </span>
            </div>
            <p style={{ 
              margin: '6px 0 0 0', 
              color: colors.textLight, 
              fontSize: isMobile ? '12px' : '14px', 
              lineHeight: '1.4' 
            }}>
              {service.description.length > (isMobile ? 50 : 80) 
                ? service.description.substring(0, isMobile ? 50 : 80) + '...'
                : service.description
              }
            </p>
          </div>
        ))}
        
        {activeServices.length === 0 && (
          <div style={{ 
            textAlign: 'center', 
            padding: isMobile ? '20px' : '24px', 
            color: colors.textLight,
            background: colors.background,
            borderRadius: '6px',
            border: `1px solid ${colors.border}`,
            fontSize: isMobile ? '13px' : '14px'
          }}>
            No active services found
          </div>
        )}
      </div>
    </div>
  );

  const renderUsers = () => (
    <div>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: isMobile ? '16px' : '24px', 
        flexWrap: 'wrap', 
        gap: isMobile ? '8px' : '12px' 
      }}>
        <h3 style={{ 
          color: colors.primary, 
          margin: 0, 
          fontSize: isMobile ? '16px' : '22px', 
          fontWeight: '700'
        }}>
          👥 User Management
        </h3>
        <AddUserForm onUserAdded={fetchUsers} isMobile={isMobile} colors={colors} buttonStyle={buttonStyle} />
      </div>

      {loading ? (
        <div style={{ 
          textAlign: 'center', 
          padding: isMobile ? '30px' : '40px', 
          color: colors.textLight,
          fontSize: isMobile ? '13px' : '15px'
        }}>
          Loading users...
        </div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: '8px', WebkitOverflowScrolling: 'touch' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>User</th>
                {!isMobile && <th style={thStyle}>Email</th>}
                <th style={thStyle}>Role</th>
                {!isMobile && <th style={thStyle}>Contact</th>}
                {!isMobile && <th style={thStyle}>Business</th>}
                {!isMobile && <th style={thStyle}>Created</th>}
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((userItem) => (
                <tr key={userItem._id}>
                  <td style={tdStyle}>
                    <div>
                      <div style={{ fontWeight: '600', color: colors.primary, fontSize: isMobile ? '12px' : '14px' }}>{userItem.username}</div>
                      {isMobile && <div style={{ fontSize: '11px', color: colors.textLight }}>{userItem.email}</div>}
                      {isMobile && userItem.contactNumber && (
                        <div style={{ fontSize: '11px', color: colors.textLight }}>📞 {userItem.contactNumber}</div>
                      )}
                    </div>
                  </td>
                  {!isMobile && <td style={tdStyle}>{userItem.email}</td>}
                  <td style={tdStyle}>
                    <span style={{
                      padding: isMobile ? '4px 8px' : '6px 12px',
                      borderRadius: '20px',
                      fontSize: isMobile ? '10px' : '12px',
                      background: getRoleColor(userItem.role),
                      color: colors.white,
                      fontWeight: '600'
                    }}>
                      {userItem.role.toUpperCase()}
                    </span>
                  </td>
                  {!isMobile && (
                    <td style={tdStyle}>
                      {userItem.contactNumber ? (
                        <span style={{ color: colors.primary, fontWeight: '600' }}>
                          📞 {userItem.contactNumber}
                        </span>
                      ) : '-'}
                    </td>
                  )}
                  {!isMobile && <td style={tdStyle}>{userItem.businessName || '-'}</td>}
                  {!isMobile && <td style={tdStyle}>{new Date(userItem.createdAt).toLocaleDateString()}</td>}
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <EditUserForm user={userItem} onUserUpdated={fetchUsers} isMobile={isMobile} colors={colors} buttonStyle={buttonStyle} />
                      <button
                        onClick={() => deleteUser(userItem._id)}
                        style={buttonStyle(colors.danger, 'small')}
                        disabled={userItem._id === user._id}
                      >
                        🗑️ {isMobile ? '' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

 const renderAllServices = () => {
  const expandedServices = [];

  allServices.forEach(service => {
    if (service.services && Array.isArray(service.services) && service.services.length > 0) {
      service.services.forEach((serviceItem, index) => {
        const itemImages = [
          ...((serviceItem.images || []).filter(Boolean)),
          ...((service.images || []).filter(img =>
            (img.itemId && serviceItem._id && img.itemId.toString() === serviceItem._id.toString()) ||
            (img.serviceIndex !== undefined && img.serviceIndex !== null && Number(img.serviceIndex) === index)
          ))
        ].filter((img, i, arr) => arr.findIndex(t => (t.public_id && t.public_id === img.public_id) || (t.url && t.url === img.url) || ((t._id || t.id) && (img._id || img.id) && (t._id || t.id).toString() === (img._id || img.id).toString())) === i);

        expandedServices.push({
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
          images: itemImages,
          isMultiService: true,
          serviceIndex: index,
          totalServices: service.services.length,
          serviceName: `${service.businessName} - ${serviceItem.serviceType === 'other' ? serviceItem.customServiceType : serviceItem.serviceType}`
        });
      });
    } else {
      expandedServices.push({
        ...service,
        _originalId: service._id,
        _id: service._id,
        _rowId: service._id,
        isMultiService: false,
        serviceIndex: 0,
        totalServices: 1,
        quantity: service.quantity || 0,
        location: service.location || service.primaryLocation,
        serviceName: `${service.businessName} - ${service.serviceType === 'other' ? service.customServiceType : service.serviceType}`,
        status: service.status || 'pending'
      });
    }
  });

  return (
    <div>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: isMobile ? '16px' : '24px', 
        flexWrap: 'wrap', 
        gap: isMobile ? '8px' : '12px' 
      }}>
        <div>
          <h3 style={{ 
            color: colors.primary, 
            margin: 0, 
            fontSize: isMobile ? '16px' : '22px', 
            fontWeight: '700'
          }}>
            📋 All Services
            <span style={{
              marginLeft: '8px',
              padding: '4px 10px',
              background: colors.secondary,
              color: colors.primary,
              borderRadius: '20px',
              fontSize: isMobile ? '12px' : '14px',
              fontWeight: '600'
            }}>
              {expandedServices.length} items
            </span>
          </h3>
        </div>
        <button
          onClick={fetchAllServices}
          style={buttonStyle(colors.secondary, 'small')}
        >
          🔄 {isMobile ? 'Refresh' : 'Refresh'}
        </button>
      </div>

      {loading ? (
        <div style={{ 
          textAlign: 'center', 
          padding: isMobile ? '30px' : '40px', 
          color: colors.textLight,
          fontSize: isMobile ? '13px' : '15px'
        }}>
          Loading services...
        </div>
      ) : isMobile ? (
        <div>
          {expandedServices.length > 0 ? (
            expandedServices.map((service) => (
              <div key={service._rowId} style={{
                ...cardStyle,
                borderLeft: `4px solid ${service.isMultiService ? colors.info : colors.primary}`,
                padding: 0,
                overflow: 'hidden'
              }}>
                {service.isMultiService && (
                  <div style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    background: colors.info,
                    color: colors.white,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontWeight: '600'
                  }}>
                    Item {service.serviceIndex + 1}
                  </div>
                )}

                <div style={{
                  padding: '12px',
                  background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryLight} 100%)`,
                  color: colors.white,
                  borderBottom: `2px solid ${colors.secondary}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start'
                }}>
                  <div style={{ flex: 1, marginRight: service.isMultiService ? '50px' : '0' }}>
                    <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: '700' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        {service.businessName}
                        <button
                          type="button"
                          onClick={() => navigateToBusinessAudit(service.businessName)}
                          title="Audit Services"
                          style={{
                            background: 'rgba(255, 255, 255, 0.2)',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '2px 6px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            color: '#fff'
                          }}
                        >
                          📁
                        </button>
                      </span>
                    </h4>
                    <div style={{ fontSize: '11px', opacity: 0.9 }}>
                      {service.serviceType === 'other' ? service.customServiceType : service.serviceType}
                    </div>
                  </div>
                  <span style={{
                    padding: '4px 8px',
                    borderRadius: '12px',
                    fontSize: '10px',
                    background: getStatusColor(service.status),
                    color: colors.white,
                    fontWeight: '600'
                  }}>
                    {service.status.toUpperCase()}
                  </span>
                </div>

                <div style={{ padding: '12px' }}>
                  {/* QUANTITY */}
                  <div style={{ textAlign: 'center', marginBottom: '12px' }}>
                    <div style={{ fontSize: '10px', color: colors.textLight, marginBottom: '2px' }}>QUANTITY</div>
                    <div style={{
                      padding: '6px 14px',
                      background: colors.secondary,
                      color: colors.primary,
                      borderRadius: '12px',
                      fontSize: '14px',
                      fontWeight: '700',
                      display: 'inline-block'
                    }}>
                      {service.quantity || '0'} units
                    </div>
                  </div>

                  {/* LOCATION DISPLAY - NEW */}
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '10px', color: colors.textLight, marginBottom: '2px' }}>📍 SERVICE LOCATION</div>
                    <div style={{
                      padding: '8px',
                      background: '#e6f7ff',
                      borderRadius: '6px',
                      border: `1px solid ${colors.info}`,
                      fontSize: '11px',
                      fontWeight: '600',
                      color: colors.primary,
                      wordBreak: 'break-all'
                    }}>
                      {service.location?.address || 'No location specified'}
                    </div>
                  </div>

                  {/* DATES */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '8px',
                    marginBottom: '12px',
                    padding: '8px',
                    background: colors.background,
                    borderRadius: '6px'
                  }}>
                    <div>
                      <div style={{ fontSize: '10px', color: colors.textLight }}>START DATE</div>
                      <div style={{ fontSize: '11px', fontWeight: '600', color: colors.primary }}>
                        {service.startDate ? new Date(service.startDate).toLocaleDateString() : 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10px', color: colors.textLight }}>DELIVERY DATE</div>
                      <div style={{ fontSize: '11px', fontWeight: '600', color: colors.primary }}>
                        {service.deliveryDate ? new Date(service.deliveryDate).toLocaleDateString() : 'N/A'}
                      </div>
                    </div>
                  </div>

                  {/* ASSIGNED TO */}
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '10px', color: colors.textLight, marginBottom: '2px' }}>ASSIGNED TO</div>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: colors.primary }}>
                      {service.assignedTo ? (
                        <div>
                          <div>{service.assignedTo.username}</div>
                          <button
                            onClick={() => unassignService(service._originalId || service._id, {
                              assignAll: !service.isMultiService,
                              serviceIndex: service.serviceIndex
                            })}
                            style={{
                              ...buttonStyle(colors.warning, 'small'),
                              marginTop: '4px',
                              padding: '4px 8px',
                              fontSize: '10px'
                            }}
                          >
                            Unassign
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAssigningService(service)}
                          style={buttonStyle(colors.success, 'small')}
                        >
                          Assign Worker
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ACTIONS */}
                  <div style={{
                    display: 'flex',
                    gap: '6px',
                    paddingTop: '12px',
                    borderTop: `1px solid ${colors.border}`,
                    flexWrap: 'wrap'
                  }}>
                    <button
                      onClick={() => handleViewImages(service)}
                      style={buttonStyle(colors.primary, 'small')}
                    >
                      🖼️ {renderServiceProgressText(service)}
                    </button>
                    <button
                      onClick={() => setUploadModalService(service)}
                      style={buttonStyle(colors.info, 'small')}
                    >
                      📷 Upload
                    </button>
                    <button
                      onClick={() => generatePPT(service)}
                      style={buttonStyle(colors.secondary, 'small')}
                    >
                      📊 PPT
                    </button>
                    <button
                      onClick={() => generatePDF(service)}
                      style={buttonStyle(colors.success, 'small')}
                    >
                      📄 PDF
                    </button>
                    <button
                      onClick={() => {
                        if (service.isMultiService && service._originalId !== service._id) {
                          deleteServiceItem(service._originalId, service._id, service.serviceName);
                        } else {
                          deleteService(service._originalId || service._id);
                        }
                      }}
                      style={buttonStyle(colors.danger, 'small')}
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div style={{ textAlign: 'center', padding: '30px', color: colors.textLight }}>
              No services found
            </div>
          )}
        </div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: '8px', WebkitOverflowScrolling: 'touch' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Business</th>
                <th style={thStyle}>Service Type</th>
                <th style={thStyle}>Qty</th>
                <th style={thStyle}>Location</th>
                <th style={thStyle}>Duration</th>
                <th style={thStyle}>Start Date</th>
                <th style={thStyle}>Delivery Date</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Assigned To</th>
                <th style={thStyle}>Images</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {expandedServices.map((service) => (
                <tr key={service._rowId}>
                  <td style={{...tdStyle, fontWeight: '600', color: colors.primary, fontSize: isMobile ? '12px' : '14px'}}>
                    <div>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        {service.businessName}
                        <button
                          type="button"
                          onClick={() => navigateToBusinessAudit(service.businessName)}
                          title="Audit Services"
                          style={{
                            background: 'rgba(1, 81, 186, 0.1)',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '2px 6px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            color: colors.primary,
                            transition: 'all 0.2s ease'
                          }}
                          onMouseEnter={(e) => e.target.style.background = 'rgba(1, 81, 186, 0.2)'}
                          onMouseLeave={(e) => e.target.style.background = 'rgba(1, 81, 186, 0.1)'}
                        >
                          📁
                        </button>
                      </span>
                      {service.isMultiService && (
                        <span style={{
                          marginLeft: '6px',
                          background: colors.info,
                          color: '#fff',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '10px'
                        }}>
                          Item {service.serviceIndex + 1} of {service.totalServices}
                        </span>
                      )}
                    </div>
                  </td>
                  
                  <td style={tdStyle}>
                    {service.serviceType === 'other' ? service.customServiceType : service.serviceType}
                  </td>
                  
                  <td style={{...tdStyle, textAlign: 'center', fontWeight: '600'}}>
                    <span style={{
                      padding: isMobile ? '3px 6px' : '6px 12px',
                      background: colors.secondary,
                      color: colors.primary,
                      borderRadius: '20px',
                      fontSize: isMobile ? '10px' : '12px',
                      fontWeight: '600'
                    }}>
                      {service.quantity || '0'}
                    </span>
                  </td>

                  {/* LOCATION COLUMN - NEW */}
                  <td style={tdStyle}>
                    <div style={{
                      padding: '4px 8px',
                      background: '#e6f7ff',
                      borderRadius: '4px',
                      border: `1px solid ${colors.info}`,
                      fontSize: '12px',
                      maxWidth: '200px',
                      wordWrap: 'break-word'
                    }}>
                      <span style={{ fontWeight: '600', color: colors.primary }}>
                        {service.location?.address || 'No location'}
                      </span>
                    </div>
                  </td>
                  
                  <td style={{...tdStyle, textAlign: 'center'}}>
                    {calculateDuration(service.startDate, service.deliveryDate)}
                  </td>
                  
                  <td style={tdStyle}>
                    {service.startDate ? new Date(service.startDate).toLocaleDateString() : 'N/A'}
                  </td>
                  
                  <td style={tdStyle}>
                    {service.deliveryDate ? new Date(service.deliveryDate).toLocaleDateString() : 'N/A'}
                  </td>
                  
                  <td style={tdStyle}>
                    <span style={{
                      padding: isMobile ? '3px 6px' : '6px 12px',
                      borderRadius: '20px',
                      fontSize: isMobile ? '10px' : '12px',
                      background: getStatusColor(service.status),
                      color: colors.white,
                      fontWeight: '600'
                    }}>
                      {isMobile ? service.status.charAt(0).toUpperCase() : service.status.toUpperCase()}
                    </span>
                  </td>
                  
                  <td style={tdStyle}>
                    {service.assignedTo ? (
                      <div>
                        <div style={{ fontWeight: '600', color: colors.primary, fontSize: isMobile ? '11px' : '14px' }}>
                          {isMobile ? service.assignedTo.username.split(' ')[0] : service.assignedTo.username}
                        </div>
                        {!isMobile && (
                          <div style={{ fontSize: '12px', color: colors.textLight }}>
                            {service.assignedTo.email}
                            {service.assignedTo.contactNumber && (
                              <div>📞 {service.assignedTo.contactNumber}</div>
                            )}
                          </div>
                        )}
                        <button
                          onClick={() => unassignService(service._originalId || service._id, {
                            assignAll: !service.isMultiService,
                            serviceIndex: service.serviceIndex
                          })}
                          style={{
                            ...buttonStyle(colors.warning, 'small'),
                            marginTop: '4px',
                            padding: isMobile ? '4px 6px' : '6px 10px',
                            fontSize: isMobile ? '10px' : '11px'
                          }}
                        >
                          {isMobile ? 'Unassign' : 'Unassign'}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAssigningService(service)}
                        style={buttonStyle(colors.success, 'small')}
                      >
                        {isMobile ? 'Assign' : 'Assign Worker'}
                      </button>
                    )}
                  </td>
                  
                  <td style={tdStyle}>
                    {service.images && service.images.length > 0 ? (
                      <button
                        onClick={() => handleViewImages(service)}
                        style={{
                          padding: '6px 12px',
                          background: colors.primary,
                          color: colors.white,
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: '600',
                          border: 'none',
                          cursor: 'pointer',
                          width: '100%'
                        }}
                      >
                        📷 {renderServiceProgressText(service)}
                      </button>
                    ) : (
                      <span style={{
                        padding: '6px 12px',
                        background: colors.border,
                        color: colors.textLight,
                        borderRadius: '20px',
                        fontSize: '12px',
                        fontWeight: '600',
                        display: 'inline-block',
                        width: '100%',
                        textAlign: 'center'
                      }}>
                        {renderServiceProgressText(service)}
                      </span>
                    )}
                  </td>
                  
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <button
                        onClick={() => setUploadModalService(service)}
                        style={buttonStyle(colors.info, 'small')}
                        title="Upload Image"
                      >
                        📷 Upload
                      </button>
                      <button
                        onClick={() => generatePPT(service)}
                        style={buttonStyle(colors.secondary, 'small')}
                        title="Download PPT"
                      >
                        📊 PPT
                      </button>
                      <button
                        onClick={() => generatePDF(service)}
                        style={buttonStyle(colors.primary, 'small')}
                        title="Download PDF"
                      >
                        📄 PDF
                      </button>
                      <button
                        onClick={() => {
                          if (service.isMultiService && service._originalId !== service._id) {
                            deleteServiceItem(service._originalId, service._id, service.serviceName);
                          } else {
                            deleteService(service._originalId || service._id);
                          }
                        }}
                        style={buttonStyle(colors.danger, 'small')}
                      >
                        🗑️ {isMobile ? '' : (service.isMultiService ? 'Del Item' : 'Delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
 const renderActiveServices = () => {
  const expandedServices = [];

  activeServices.forEach(service => {
    if (service.services && Array.isArray(service.services) && service.services.length > 0) {
      service.services.forEach((serviceItem, index) => {
        const itemImages = [
          ...((serviceItem.images || []).filter(Boolean)),
          ...((service.images || []).filter(img =>
            (img.itemId && serviceItem._id && img.itemId.toString() === serviceItem._id.toString()) ||
            (img.serviceIndex !== undefined && img.serviceIndex !== null && Number(img.serviceIndex) === index)
          ))
        ].filter((img, i, arr) => arr.findIndex(t => (t.public_id && t.public_id === img.public_id) || (t.url && t.url === img.url) || ((t._id || t.id) && (img._id || img.id) && (t._id || t.id).toString() === (img._id || img.id).toString())) === i);

        expandedServices.push({
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
          images: itemImages,
          isMultiService: true,
          serviceIndex: index,
          totalServices: service.services.length,
          serviceName: `${service.businessName} - ${serviceItem.serviceType === 'other' ? serviceItem.customServiceType : serviceItem.serviceType}`
        });
      });
    } else {
      expandedServices.push({
        ...service,
        _originalId: service._id,
        _id: service._id,
        _rowId: service._id,
        isMultiService: false,
        serviceIndex: 0,
        totalServices: 1,
        quantity: service.quantity || 0,
        location: service.location || service.primaryLocation,
        serviceName: `${service.businessName} - ${service.serviceType === 'other' ? service.customServiceType : service.serviceType}`,
        status: service.status || 'pending'
      });
    }
  });

  return (
    <div>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: isMobile ? '16px' : '24px', 
        flexWrap: 'wrap', 
        gap: isMobile ? '8px' : '12px' 
      }}>
        <h3 style={{ 
          color: colors.primary, 
          margin: 0, 
          fontSize: isMobile ? '16px' : '22px', 
          fontWeight: '700'
        }}>
          🟢 Active Services
        </h3>
        <div style={{ display: 'flex', gap: isMobile ? '8px' : '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{
            padding: isMobile ? '6px 12px' : '8px 16px',
            background: colors.success,
            color: colors.white,
            borderRadius: '20px',
            fontSize: isMobile ? '12px' : '14px',
            fontWeight: '600'
          }}>
            {expandedServices.length} Active Items
          </span>
          <button
            onClick={fetchActiveServices}
            style={buttonStyle(colors.secondary, 'small')}
          >
            🔄 {isMobile ? 'Refresh' : 'Refresh'}
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ 
          textAlign: 'center', 
          padding: isMobile ? '30px' : '40px', 
          color: colors.textLight,
          fontSize: isMobile ? '13px' : '15px'
        }}>
          Loading active services...
        </div>
      ) : expandedServices.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          padding: isMobile ? '30px' : '40px', 
          color: colors.textLight,
          background: colors.background,
          borderRadius: '8px',
          border: `1px solid ${colors.border}`,
          fontSize: isMobile ? '13px' : '14px'
        }}>
          No active services found
        </div>
      ) : (
        <div>
          {expandedServices.map((service) => (
            <div key={service._rowId} style={{
              ...cardStyle,
              borderLeft: `4px solid ${colors.success}`,
              background: '#f0fff4'
            }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'flex-start', 
                marginBottom: isMobile ? '12px' : '16px', 
                flexWrap: 'wrap', 
                gap: isMobile ? '8px' : '12px' 
              }}>
                <div style={{ flex: 1 }}>
                  <h4 style={{ 
                    margin: '0 0 6px 0', 
                    color: colors.primary, 
                    fontSize: isMobile ? '14px' : '18px', 
                    fontWeight: '700' 
                  }}>
                    {service.businessName}
                    {service.isMultiService && (
                      <span style={{
                        marginLeft: '8px',
                        padding: '2px 8px',
                        background: colors.info,
                        color: '#fff',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '600'
                      }}>
                        Item {service.serviceIndex + 1} of {service.totalServices}
                      </span>
                    )}
                  </h4>
                  <p style={{ 
                    margin: '0 0 6px 0', 
                    color: colors.textLight, 
                    fontSize: isMobile ? '12px' : '15px',
                    fontWeight: '600'
                  }}>
                    <strong>Service:</strong> {service.serviceType === 'other' ? service.customServiceType : service.serviceType}
                  </p>
                  
                  {/* LOCATION DISPLAY - NEW */}
                  <p style={{ 
                    margin: '0 0 6px 0', 
                    color: colors.primary, 
                    fontSize: isMobile ? '11px' : '14px',
                    fontWeight: '600',
                    background: '#e6f7ff',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    display: 'inline-block',
                    border: `1px solid ${colors.info}`
                  }}>
                    📍 {service.location?.address || 'No location specified'}
                  </p>
                  
                  <p style={{ 
                    margin: '4px 0 0 0', 
                    color: colors.textLight, 
                    fontSize: isMobile ? '11px' : '14px' 
                  }}>
                    <strong>Created by:</strong> {service.createdBy.username} {!isMobile && `(${service.createdBy.email})`}
                    {!isMobile && service.createdBy.contactNumber && ` 📞 ${service.createdBy.contactNumber}`}
                  </p>
                  {service.assignedTo && (
                    <p style={{ 
                      margin: '4px 0 0 0', 
                      color: colors.success, 
                      fontSize: isMobile ? '11px' : '14px',
                      fontWeight: '600'
                    }}>
                      <strong>Assigned to:</strong> {service.assignedTo.username} {!isMobile && `(${service.assignedTo.email})`}
                      {!isMobile && service.assignedTo.contactNumber && ` 📞 ${service.assignedTo.contactNumber}`}
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
                  <span style={{
                    padding: isMobile ? '4px 8px' : '6px 12px',
                    borderRadius: '20px',
                    fontSize: isMobile ? '11px' : '12px',
                    background: colors.success,
                    color: colors.white,
                    fontWeight: '600'
                  }}>
                    ACTIVE
                  </span>
                  <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
                    <button
                      onClick={() => setUploadModalService(service)}
                      style={buttonStyle(colors.info, 'small')}
                    >
                      📷 Upload
                    </button>
                    <button
                      onClick={() => generatePPT(service)}
                      style={buttonStyle(colors.secondary, 'small')}
                    >
                      📊 PPT
                    </button>
                    <button
                      onClick={() => generatePDF(service)}
                      style={buttonStyle(colors.primary, 'small')}
                    >
                      📄 PDF
                    </button>
                  </div>
                </div>
              </div>
              
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: isMobile ? '8px' : '12px',
                marginBottom: isMobile ? '12px' : '16px',
                padding: isMobile ? '12px' : '16px',
                background: colors.background,
                borderRadius: '6px',
                border: `1px solid ${colors.border}`
              }}>
                <div>
                  <strong style={{ color: colors.primary, fontSize: isMobile ? '12px' : '13px' }}>Quantity:</strong>
                  <div style={{ color: colors.text, fontWeight: '600', fontSize: isMobile ? '13px' : '14px' }}>{service.quantity || '0'}</div>
                </div>
                <div>
                  <strong style={{ color: colors.primary, fontSize: isMobile ? '12px' : '13px' }}>Duration:</strong>
                  <div style={{ color: colors.text, fontWeight: '600', fontSize: isMobile ? '13px' : '14px' }}>{calculateDuration(service.startDate, service.deliveryDate)}</div>
                </div>
                <div>
                  <strong style={{ color: colors.primary, fontSize: isMobile ? '12px' : '13px' }}>Start Date:</strong>
                  <div style={{ color: colors.text, fontWeight: '600', fontSize: isMobile ? '13px' : '14px' }}>{service.startDate ? new Date(service.startDate).toLocaleDateString() : 'N/A'}</div>
                </div>
                <div>
                  <strong style={{ color: colors.primary, fontSize: isMobile ? '12px' : '13px' }}>Delivery Date:</strong>
                  <div style={{ color: colors.text, fontWeight: '600', fontSize: isMobile ? '13px' : '14px' }}>{service.deliveryDate ? new Date(service.deliveryDate).toLocaleDateString() : 'N/A'}</div>
                </div>
              </div>
              
              <p style={{ 
                margin: '0 0 12px 0', 
                color: colors.textLight, 
                fontSize: isMobile ? '12px' : '14px', 
                lineHeight: '1.5' 
              }}>
                {service.description}
              </p>
              
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '6px',
                padding: isMobile ? '10px' : '12px',
                background: colors.background,
                borderRadius: '6px',
                fontSize: isMobile ? '11px' : '13px',
                border: `1px solid ${colors.border}`
              }}>
                <div style={{ fontWeight: '600', color: colors.primary, fontSize: isMobile ? '11px' : '13px' }}>
                  <strong>Location:</strong> {service.location?.address || 'Auto location'}
                </div>
                <div style={{ fontWeight: '600', color: colors.primary, fontSize: isMobile ? '11px' : '13px' }}>
                  <strong>Created:</strong> {new Date(service.createdAt).toLocaleDateString()}
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {service.assignedTo && (
                    <button
                      onClick={() => unassignService(service._originalId || service._id, {
                        assignAll: !service.isMultiService,
                        serviceIndex: service.serviceIndex
                      })}
                      style={{
                        ...buttonStyle(colors.warning, 'small'),
                        padding: isMobile ? '4px 6px' : '6px 10px',
                        fontSize: isMobile ? '10px' : '11px'
                      }}
                    >
                      {isMobile ? 'Unassign' : 'Unassign'}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (service.isMultiService && service._originalId !== service._id) {
                        deleteServiceItem(service._originalId, service._id, service.serviceName);
                      } else {
                        deleteService(service._originalId || service._id);
                      }
                    }}
                    style={buttonStyle(colors.danger, 'small')}
                  >
                    🗑️ {isMobile ? '' : (service.isMultiService ? 'Del Item' : 'Delete')}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

  const renderAddService = () => (
    <div>
      <h3 style={{ 
        color: colors.primary, 
        marginBottom: isMobile ? '16px' : '24px', 
        fontSize: isMobile ? '16px' : '22px', 
        fontWeight: '700'
      }}>
        ➕ Add New Service
      </h3>
      <AddService 
        userRole={user?.role || 'owner'} 
        currentUser={user}
        onSuccess={() => {
          navigateToTab('all-services');
          setMessage('Service created successfully!');
        }} 
      />
    </div>
  );

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'users', label: 'Users', icon: '👥' },
    { id: 'all-services', label: 'All Services', icon: '📋' },
    { id: 'active-services', label: 'Active Services', icon: '🟢' },
    { id: 'add-service', label: 'Add Service', icon: '➕' }
  ];

  return (
    <div style={containerStyle}>
      <div style={sidebarStyle}>
        {sidebarOpen && (
          <div style={{ padding: isMobile ? '20px 16px' : '24px 20px', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ 
              paddingBottom: isMobile ? '16px' : '24px', 
              borderBottom: `1px solid ${colors.secondary}`,
              marginBottom: isMobile ? '16px' : '24px'
            }}>
              <h2 style={{ 
                margin: '0 0 6px 0', 
                color: colors.white, 
                fontSize: isMobile ? '16px' : '20px',
                fontWeight: '700'
              }}>
                Dashboard
              </h2>
              <p style={{ 
                margin: 0, 
                color: colors.secondaryLight, 
                fontSize: isMobile ? '12px' : '14px'
              }}>
                {user.username}
              </p>
            </div>

            <nav style={{ flex: 1 }}>
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    navigateToTab(item.id);
                    if (isMobile) setSidebarOpen(false);
                  }}
                  style={{
                    width: '100%',
                    padding: isMobile ? '10px 12px' : '14px 20px',
                    marginBottom: '6px',
                    background: activeTab === item.id ? colors.secondary : 'transparent',
                    color: activeTab === item.id ? colors.primary : colors.white,
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: isMobile ? '13px' : '15px',
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    gap: isMobile ? '8px' : '12px',
                    transition: 'all 0.2s ease',
                    fontWeight: activeTab === item.id ? '700' : '500'
                  }}
                >
                  <span style={{ fontSize: isMobile ? '14px' : '16px' }}>{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </nav>

          </div>
        )}
      </div>

      <div style={mainContentStyle}>
        {isMobile && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            padding: '12px 0',
            flexWrap: 'wrap',
            gap: '8px'
          }}>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              style={buttonStyle(colors.primary, 'small')}
            >
              ☰ Menu
            </button>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px',
              flexWrap: 'wrap' 
            }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: colors.primary }}>{user.username}</div>
                <div style={{ fontSize: '11px', color: colors.textLight }}>Dashboard</div>
              </div>
              <button
                onClick={onLogout}
                style={buttonStyle(colors.danger, 'small')}
              >
                🚪 Logout
              </button>
            </div>
          </div>
        )}

        {!isMobile && (
          <div style={headerStyle}>
            <div>
              <h1 style={{ 
                color: colors.primary, 
                margin: '0 0 6px 0', 
                fontSize: '24px',
                fontWeight: '700'
              }}>
                Dashboard
              </h1>
              <p style={{ color: colors.textLight, margin: 0, fontSize: '14px' }}>
                Welcome back, {user.username}
              </p>
            </div>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '16px',
              flexWrap: 'wrap' 
            }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '15px', fontWeight: '700', color: colors.primary }}>{user.username}</div>
                <div style={{ fontSize: '13px', color: colors.textLight }}>Dashboard</div>
              </div>
              <button
                onClick={onLogout}
                style={buttonStyle(colors.danger)}
              >
                🚪 Logout
              </button>
            </div>
          </div>
        )}

        {message && (
          <div style={{
            padding: isMobile ? '10px 12px' : '12px 16px',
            borderRadius: '6px',
            marginBottom: isMobile ? '16px' : '20px',
            background: message.includes('success') ? '#d1fae5' : '#fee2e2',
            color: message.includes('success') ? '#065f46' : '#991b1b',
            border: `2px solid ${message.includes('success') ? '#a7f3d0' : '#fecaca'}`,
            fontSize: isMobile ? '12px' : '14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontWeight: '600'
          }}>
            <span>{message}</span>
            <button 
              onClick={() => setMessage('')}
              style={{
                background: 'none',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                fontSize: isMobile ? '16px' : '18px',
                padding: '0',
                width: isMobile ? '20px' : '24px',
                height: isMobile ? '20px' : '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              ×
            </button>
          </div>
        )}

        <div style={contentStyle}>
          {viewingBusinessServices ? (
            <BusinessServicesAudit
              businessName={viewingBusinessServices}
              services={allServices.filter(s => s.businessName === viewingBusinessServices)}
              colors={colors}
              isMobile={isMobile}
              onBack={handleBackToDashboard}
            />
          ) : (
            <>
              {activeTab === 'dashboard' && renderDashboard()}
              {activeTab === 'users' && renderUsers()}
              {activeTab === 'all-services' && renderAllServices()}
              {activeTab === 'active-services' && renderActiveServices()}
              {activeTab === 'add-service' && renderAddService()}
            </>
          )}
        </div>
      </div>

      {/* Image Modal */}
      {showImageModal && <ImageModal />}

      {/* Upload Image Modal right beside actions */}
      {uploadModalService && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(1, 81, 186, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div style={{
            background: colors.white,
            borderRadius: '12px',
            padding: '24px',
            width: '100%',
            maxWidth: '500px',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ color: colors.primary, margin: 0 }}>📷 Upload Service Image</h3>
              <button 
                onClick={() => setUploadModalService(null)}
                style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: colors.text }}
              >×</button>
            </div>
            <ImageUpload 
              service={getModalService()}
              serviceId={uploadModalService._originalId || uploadModalService._id}
              userRole={user?.role || 'owner'}
              currentUser={user}
              onImagesAdded={() => {
                if (activeTab === 'all-services') fetchAllServices();
                else if (activeTab === 'active-services') fetchActiveServices();
              }}
              onImageUploaded={() => {
                setUploadModalService(null);
                if (activeTab === 'all-services') fetchAllServices();
                else if (activeTab === 'active-services') fetchActiveServices();
                setMessage('Image uploaded successfully!');
              }}
            />
          </div>
        </div>
      )}

      {assigningService && (
        <AssignmentModal
          service={assigningService}
          workers={availableWorkers}
          onAssign={assignService}
          onClose={() => setAssigningService(null)}
        />
      )}

      {isMobile && sidebarOpen && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(1, 81, 186, 0.6)',
            zIndex: 999
          }}
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
};

// Add User Form Component - UPDATED WITH CONTACT NUMBER
const AddUserForm = ({ onUserAdded, isMobile, colors, buttonStyle }) => {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    contactNumber: '', // Added contact number field
    role: 'user', // Default to worker
    businessName: ''
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const response = await axios.post('/owner/users', formData);
      if (response.data.success) {
        setMessage('User created successfully!');
        setFormData({ 
          username: '', 
          email: '', 
          password: '', 
          contactNumber: '', // Reset contact number
          role: 'user', 
          businessName: ''
        });
        setShowForm(false);
        onUserAdded();
      }
    } catch (error) {
      setMessage('Error creating user: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const formStyle = {
    background: colors.white,
    padding: isMobile ? '16px' : '24px',
    borderRadius: '10px',
    marginBottom: '12px',
    border: `2px solid ${colors.secondary}`,
    width: isMobile ? '100%' : '400px',
    boxShadow: '0 8px 25px rgba(1, 81, 186, 0.15)'
  };

  const inputStyle = {
    width: '100%',
    padding: isMobile ? '10px' : '14px',
    margin: '6px 0',
    border: `2px solid ${colors.border}`,
    borderRadius: '6px',
    fontSize: isMobile ? '13px' : '15px',
    boxSizing: 'border-box',
    background: colors.background
  };

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        style={buttonStyle(colors.secondary, 'small')}
      >
        👤 Add User
      </button>
    );
  }

  return (
    <div style={formStyle}>
      <h4 style={{ 
        margin: '0 0 12px 0', 
        color: colors.primary, 
        fontSize: isMobile ? '14px' : '18px', 
        fontWeight: '700'
      }}>
        Add New User
      </h4>
      {message && (
        <div style={{
          padding: '10px',
          borderRadius: '6px',
          marginBottom: '12px',
          background: message.includes('success') ? '#d1fae5' : '#fee2e2',
          color: message.includes('success') ? '#065f46' : '#991b1b',
          fontSize: isMobile ? '12px' : '14px',
          fontWeight: '600'
        }}>
          {message}
        </div>
      )}
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          name="username"
          placeholder="Username"
          value={formData.username}
          onChange={handleChange}
          required
          style={inputStyle}
        />
        <input
          type="email"
          name="email"
          placeholder="Email (Optional)"
          value={formData.email}
          onChange={handleChange}
          style={inputStyle}
        />
        <input
          type="password"
          name="password"
          placeholder="Password"
          value={formData.password}
          onChange={handleChange}
          required
          style={inputStyle}
        />
        <input
          type="tel"
          name="contactNumber"
          placeholder="Contact Number (e.g., +1234567890)"
          value={formData.contactNumber}
          onChange={handleChange}
          style={inputStyle}
        />
        <select
          name="role"
          value={formData.role}
          onChange={handleChange}
          style={inputStyle}
        >
          <option value="user">Worker</option>
          <option value="client">Client</option>
        </select>
        
        {formData.role === 'client' && (
          <input
            type="text"
            name="businessName"
            placeholder="Business Name"
            value={formData.businessName}
            onChange={handleChange}
            required
            style={inputStyle}
          />
        )}
        
        <div style={{ display: 'flex', gap: isMobile ? '8px' : '12px', marginTop: '12px', flexWrap: 'wrap' }}>
          <button
            type="submit"
            disabled={loading}
            style={{
              ...buttonStyle(loading ? colors.textLight : colors.secondary, 'small'),
              flex: 1,
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? 'Creating...' : 'Create User'}
          </button>
          <button
            type="button"
            onClick={() => setShowForm(false)}
            style={{
              ...buttonStyle(colors.textLight, 'small'),
              flex: 1
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

// Edit User Form Component - UPDATED WITH CONTACT NUMBER
const EditUserForm = ({ user, onUserUpdated, isMobile, colors, buttonStyle }) => {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    username: user.username,
    email: user.email,
    contactNumber: user.contactNumber || '', // Added contact number field
    role: user.role,
    businessName: user.businessName || ''
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const response = await axios.put(`/owner/users/${user._id}`, formData);
      if (response.data.success) {
        setMessage('User updated successfully!');
        setShowForm(false);
        onUserUpdated();
      }
    } catch (error) {
      setMessage('Error updating user: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const formStyle = {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    background: colors.white,
    padding: isMobile ? '20px' : '28px',
    borderRadius: '10px',
    boxShadow: '0 20px 40px rgba(1, 81, 186, 0.25)',
    zIndex: 1000,
    width: isMobile ? '90%' : '420px',
    maxWidth: '95vw',
    border: `2px solid ${colors.secondary}`
  };

  const overlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(1, 81, 186, 0.6)',
    zIndex: 999
  };

  const inputStyle = {
    width: '100%',
    padding: isMobile ? '10px' : '14px',
    margin: '6px 0',
    border: `2px solid ${colors.border}`,
    borderRadius: '6px',
    fontSize: isMobile ? '13px' : '15px',
    boxSizing: 'border-box',
    background: colors.background
  };

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        style={buttonStyle(colors.info, 'small')}
      >
        ✏️ {isMobile ? 'Edit' : 'Edit'}
      </button>
    );
  }

  return (
    <>
      <div style={overlayStyle} onClick={() => setShowForm(false)} />
      <div style={formStyle}>
        <h4 style={{ 
          margin: '0 0 16px 0', 
          color: colors.primary, 
          textAlign: 'center', 
          fontWeight: '700',
          fontSize: isMobile ? '14px' : '18px'
        }}>
          Edit User
        </h4>
        {message && (
          <div style={{
            padding: '10px',
            borderRadius: '6px',
            marginBottom: '12px',
            background: message.includes('success') ? '#d1fae5' : '#fee2e2',
            color: message.includes('success') ? '#065f46' : '#991b1b',
            fontSize: isMobile ? '12px' : '14px',
            fontWeight: '600'
          }}>
            {message}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            name="username"
            placeholder="Username"
            value={formData.username}
            onChange={handleChange}
            required
            style={inputStyle}
          />
          <input
            type="email"
            name="email"
            placeholder="Email (Optional)"
            value={formData.email}
            onChange={handleChange}
            style={inputStyle}
          />
          <input
            type="tel"
            name="contactNumber"
            placeholder="Contact Number (e.g., +1234567890)"
            value={formData.contactNumber}
            onChange={handleChange}
            style={inputStyle}
          />
          <select
            name="role"
            value={formData.role}
            onChange={handleChange}
            style={inputStyle}
          >
            <option value="user">Worker</option>
            <option value="client">Client</option>
          </select>
          {formData.role === 'client' && (
            <input
              type="text"
              name="businessName"
              placeholder="Business Name"
              value={formData.businessName}
              onChange={handleChange}
              style={inputStyle}
            />
          )}
          <div style={{ display: 'flex', gap: isMobile ? '8px' : '12px', marginTop: '16px' }}>
            <button
              type="submit"
              disabled={loading}
              style={{
                ...buttonStyle(loading ? colors.textLight : colors.info, 'small'),
                flex: 1,
                opacity: loading ? 0.7 : 1
              }}
            >
              {loading ? 'Updating...' : 'Update User'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              style={{
                ...buttonStyle(colors.textLight, 'small'),
                flex: 1
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </>
  );
};

export default OwnerDashboard;