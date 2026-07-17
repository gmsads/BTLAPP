import React, { useState, useEffect } from 'react';
import axios from '../utils/api';
import AddService from './AddService';
import WorkerDetails from './Workerdetails';
import { generatePDF, generatePPT } from '../utils/documentGenerator';
import ImageUpload from './ImageUpload';
import BusinessServicesAudit from './BusinessServicesAudit';

const AdminDashboard = ({ user, onLogout }) => {
  const getInitialStateFromUrl = () => {
    const path = window.location.pathname;
    if (path.includes('/admin/business-audit/')) {
      const parts = path.split('/');
      const biz = decodeURIComponent(parts[parts.length - 1]);
      return { tab: 'all-services', viewingBiz: biz };
    }
    
    let tab = 'dashboard';
    if (path.includes('/admin/users')) tab = 'users';
    else if (path.includes('/admin/all-services')) tab = 'all-services';
    else if (path.includes('/admin/active-services')) tab = 'active-services';
    else if (path.includes('/admin/add-service')) tab = 'add-service';
    else if (path.includes('/admin/worker-details')) tab = 'worker-details';
    
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
  const [uploadModalService, setUploadModalService] = useState(null);
  const [viewingBusinessServices, setViewingBusinessServices] = useState(initialState.viewingBiz);

  const navigateToTab = (tabId) => {
    setActiveTab(tabId);
    setViewingBusinessServices(null);
    window.history.pushState(null, '', `/admin/${tabId}`);
  };

  const navigateToBusinessAudit = (businessName) => {
    setViewingBusinessServices(businessName);
    window.history.pushState(null, '', `/admin/business-audit/${encodeURIComponent(businessName)}`);
  };

  const handleBackToDashboard = () => {
    setViewingBusinessServices(null);
    window.history.pushState(null, '', `/admin/${activeTab}`);
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

  // NEW STATE FOR SELECTED DATA
  const [selectedData, setSelectedData] = useState({
    type: null, // 'users', 'admins', 'workers', 'clients', 'owners', 'services', 'active-services', etc.
    filter: null, // Specific filter value
    title: null, // Display title
    count: null // Count to show in title
  });

  // NEW STATE FOR IMAGE MODAL
  const [imageModal, setImageModal] = useState({
    open: false,
    service: null,
    images: []
  });

  // NEW STATE FOR LOADING IMAGES
  const [, setLoadingImages] = useState(false);

  // Blue/Yellow color palette
  const colors = {
    primary: '#0151ba', // Blue
    primaryLight: '#2670e8', // Medium Blue
    primaryDark: '#003a8c', // Darker Blue
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
    const path = window.location.pathname;
    if (path === '/' || path === '/admin' || path === '/admin/') {
      window.history.replaceState(null, '', '/admin/dashboard');
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
      // Clear selected data when returning to dashboard
      setSelectedData({
        type: null,
        filter: null,
        title: null,
        count: null
      });
    }
  }, [activeTab]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/admin/users');
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
      const response = await axios.get('/admin/services');
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
      const response = await axios.get('/admin/services?status=active');
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
      const response = await axios.get('/admin/stats');
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
      const response = await axios.get('/admin/available-workers');
      if (response.data.success) {
        setAvailableWorkers(response.data.workers);
      }
    } catch (error) {
      setMessage('Error fetching workers: ' + (error.response?.data?.message || error.message));
    }
  };

  // NEW: Function to fetch images for a specific service
  const fetchServiceImages = async (serviceId) => {
    try {
      setLoadingImages(true);
      console.log('Fetching images for service:', serviceId);
      const response = await axios.get(`/services/${serviceId}/images`);
      if (response.data.success) {
        return response.data.images || [];
      }
      return [];
    } catch (error) {
      console.error('Error fetching images:', error.response?.data?.message || error.message);
      return [];
    } finally {
      setLoadingImages(false);
    }
  };

  const deleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user and all their services?')) {
      return;
    }

    try {
      const response = await axios.delete(`/admin/users/${userId}`);
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
      const response = await axios.delete(`/admin/services/${serviceId}`);
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

  const assignService = async (serviceId, workerId, options = {}) => {
    try {
      const response = await axios.patch(`/services/${serviceId}/assign`, {
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
      const errorMsg = error.response?.data?.message || error.message;
      setMessage(`Error assigning service: ${errorMsg}`);

      if (errorMsg.includes('deliveryDate') || errorMsg.includes('serviceType')) {
        if (window.confirm('Service has invalid data. Do you want to edit this service?')) {
          console.log('Service needs editing:', serviceId);
        }
      }
    }
  };

  const unassignService = async (serviceId, options = {}) => {
    try {
      const response = await axios.patch(`/services/${serviceId}/assign`, {
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

  // Function to handle stat box clicks - SHOW ONLY THAT DATA
  const handleStatClick = (type, value = null, count = null) => {
    let tab = '';
    let filter = null;
    let title = '';

    switch (type) {
      case 'users':
        tab = 'users';
        filter = null;
        title = 'All Users';
        break;
      case 'admins':
        tab = 'users';
        filter = 'admin';
        title = 'Admins';
        break;
      case 'workers':
        tab = 'users';
        filter = 'user';
        title = 'Workers';
        break;
      case 'clients':
        tab = 'users';
        filter = 'client';
        title = 'Clients';
        break;
      case 'owners':
        tab = 'users';
        filter = 'owner';
        title = 'Owners';
        break;
      case 'services':
        tab = 'all-services';
        filter = null;
        title = 'All Services';
        break;
      case 'service-status':
        tab = 'all-services';
        filter = { type: 'status', value: value };
        title = `${value.charAt(0).toUpperCase() + value.slice(1)} Services`;
        break;
      case 'assigned-services':
        tab = 'all-services';
        filter = { type: 'assigned', value: true };
        title = 'Assigned Services';
        break;
      case 'unassigned-services':
        tab = 'all-services';
        filter = { type: 'assigned', value: false };
        title = 'Unassigned Services';
        break;
      case 'active-services':
        tab = 'active-services';
        filter = null;
        title = 'Active Services';
        break;
      default:
        break;
    }

    setSelectedData({
      type: type,
      filter: filter,
      title: title,
      count: count
    });

    navigateToTab(tab);
  };

  // Get filtered users based on selectedData
  const getFilteredUsers = () => {
    if (!selectedData.filter) return users;

    return users.filter(user => user.role === selectedData.filter);
  };

  // Get filtered services based on selectedData
  const getFilteredServices = () => {
    if (!selectedData.filter) return allServices;

    if (selectedData.filter.type === 'status') {
      return allServices.filter(service => service.status === selectedData.filter.value);
    } else if (selectedData.filter.type === 'assigned') {
      if (selectedData.filter.value === true) {
        return allServices.filter(service => service.assignedTo);
      } else {
        return allServices.filter(service => !service.assignedTo);
      }
    }

    return allServices;
  };

  // Get filtered active services
  const getFilteredActiveServices = () => {
    if (!selectedData.filter) return activeServices;

    if (selectedData.filter.type === 'assigned') {
      if (selectedData.filter.value === true) {
        return activeServices.filter(service => service.assignedTo);
      } else {
        return activeServices.filter(service => !service.assignedTo);
      }
    }

    return activeServices;
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

  // IMAGE MODAL COMPONENT - UPDATED WITH IMAGE LOADING
  const ImageModal = ({ service, images, onClose }) => {
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [modalImages, setModalImages] = useState(images || []);
    const [modalLoading, setModalLoading] = useState(!images || images.length === 0);
    const [error, setError] = useState('');

    const getGroupedModalImages = () => {
      const hasCampaign = service?.startDate && (service?.endDate || service?.deliveryDate);
      if (!hasCampaign) {
        return { isCampaign: false, images: modalImages };
      }
      
      const startDate = service.startDate;
      const endDate = service.endDate || service.deliveryDate;
      const totalDays = getCampaignTotalDays(startDate, endDate);
      
      const groups = {};
      for (let d = 1; d <= totalDays; d++) {
        groups[d] = [];
      }
      const overflowImages = [];
      
      modalImages.forEach(img => {
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
        setModalLoading(true);
        let deleteUrl = `/services/${service._originalId || service._id}/images/${imageId}`;
        if (activeImage.public_id) {
          deleteUrl += `?public_id=${encodeURIComponent(activeImage.public_id)}`;
        }

        const response = await axios.delete(deleteUrl);
        if (response.data.success) {
          alert('Image deleted successfully!');
          const updated = modalImages.filter(img => (img._id || img.id) !== imageId);
          setModalImages(updated);
          if (currentImageIndex >= updated.length) {
            setCurrentImageIndex(Math.max(0, updated.length - 1));
          }
          if (updated.length === 0) {
            setError('No images available for this service.');
          }
          if (activeTab === 'all-services') fetchAllServices();
          if (activeTab === 'active-services') fetchActiveServices();
        } else {
          alert(`Failed to delete: ${response.data.message}`);
        }
      } catch (err) {
        console.error('Delete image error:', err);
        alert(`Error deleting image: ${err.message}`);
      } finally {
        setModalLoading(false);
      }
    };

    const handleDeleteSingleImage = async (imgToDelete) => {
      if (!imgToDelete) return;

      const imageId = imgToDelete._id || imgToDelete.id;
      if (!imageId || !service._id) return;

      if (!window.confirm(`Are you sure you want to delete this specific image?`)) return;

      try {
        setModalLoading(true);
        let deleteUrl = `/services/${service._originalId || service._id}/images/${imageId}`;
        if (imgToDelete.public_id) {
          deleteUrl += `?public_id=${encodeURIComponent(imgToDelete.public_id)}`;
        }

        const response = await axios.delete(deleteUrl);
        if (response.data.success) {
          alert('Image deleted successfully!');
          const updated = modalImages.filter(img => (img._id || img.id) !== imageId);
          setModalImages(updated);
          
          const indexInFlat = modalImages.findIndex(img => (img._id || img.id) === imageId);
          if (currentImageIndex === indexInFlat) {
            setCurrentImageIndex(Math.max(0, updated.length - 1));
          } else if (currentImageIndex > indexInFlat) {
            setCurrentImageIndex(prev => Math.max(0, prev - 1));
          }

          if (updated.length === 0) {
            setError('No images available for this service.');
          }
          if (activeTab === 'all-services') fetchAllServices();
          if (activeTab === 'active-services') fetchActiveServices();
        } else {
          alert(`Failed to delete: ${response.data.message}`);
        }
      } catch (err) {
        console.error('Delete image error:', err);
        alert(`Error deleting image: ${err.message}`);
      } finally {
        setModalLoading(false);
      }
    };

    useEffect(() => {
      const loadImages = async () => {
        if (service && (!modalImages || modalImages.length === 0)) {
          setModalLoading(true);
          setError('');
          try {
            const fetchedImages = await fetchServiceImages(service._id);
            setModalImages(fetchedImages);
            if (fetchedImages.length === 0) {
              setError('No images available for this service.');
            }
          } catch (error) {
            console.error('Failed to load images:', error);
            setError('Failed to load images. Please try again.');
            setModalImages([]);
          } finally {
            setModalLoading(false);
          }
        }
      };

      loadImages();
    }, [service]);

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
        <div style={overlayStyle} onClick={onClose} />
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
              {modalLoading && (
                <span style={{
                  fontSize: '12px',
                  color: colors.textLight,
                  marginLeft: '8px',
                  fontWeight: 'normal'
                }}>
                  (Loading...)
                </span>
              )}
            </h3>
            <button
              type="button"
              onClick={onClose}
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

          {modalLoading ? (
            <div style={imageContainerStyle}>
              <div style={{
                textAlign: 'center',
                color: colors.textLight,
                padding: '20px'
              }}>
                <div style={{
                  fontSize: '40px',
                  marginBottom: '10px',
                  animation: 'spin 1s linear infinite'
                }}>
                  ⏳
                </div>
                Loading images...
              </div>
            </div>
          ) : error ? (
            <div style={imageContainerStyle}>
              <div style={{
                textAlign: 'center',
                color: colors.danger,
                padding: '20px'
              }}>
                <div style={{ fontSize: '40px', marginBottom: '10px' }}>❌</div>
                {error}
              </div>
            </div>
          ) : modalImages.length > 0 ? (
            <>
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
                    onClick={onClose}
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
            </>
          ) : (
            <>
              <div style={imageContainerStyle}>
                <div style={{
                  textAlign: 'center',
                  color: colors.textLight,
                  padding: '20px'
                }}>
                  <div style={{ fontSize: '40px', marginBottom: '10px' }}>🖼️</div>
                  No Images Available
                  <div style={{
                    fontSize: '12px',
                    marginTop: '8px',
                    color: colors.textLight
                  }}>
                    No images have been uploaded for this service yet.
                  </div>
                </div>
              </div>
              <div style={{ marginTop: '12px', textAlign: 'center' }}>
                <button
                  type="button"
                  onClick={onClose}
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
              </div>
            </>
          )}
        </div>
      </>
    );
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
            Assign <strong style={{ color: colors.primary }}>{service.businessName}</strong> to a worker:
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
                {worker.username} ({worker.email})
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
    boxShadow: '0 4px 15px rgba(1, 81, 186, 0.2)',
    transition: 'all 0.3s ease',
    cursor: 'pointer'
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

  const formatRoleName = (role) => {
    switch (role) {
      case 'user': return 'WORKER';
      case 'admin': return 'ADMIN';
      case 'owner': return 'OWNER';
      case 'client': return 'CLIENT';
      default: return role.toUpperCase();
    }
  };

  const getRoleColor = (role) => {
    switch (role) {
      case 'admin': return colors.primary;
      case 'owner': return colors.info;
      case 'client': return colors.success;
      case 'user': return colors.secondary;
      default: return colors.textLight;
    }
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
            {/* TOTAL USERS - Click shows ALL users */}
            <div
              style={{
                ...statCardStyle,
                transform: 'scale(1)',
                ':hover': { transform: 'scale(1.02)' }
              }}
              onClick={() => handleStatClick('users', null, stats.totalUsers)}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.02)';
                e.currentTarget.style.boxShadow = '0 8px 25px rgba(1, 81, 186, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 4px 15px rgba(1, 81, 186, 0.2)';
              }}
            >
              <div style={{ fontSize: isMobile ? '18px' : '24px', marginBottom: '6px' }}>👥</div>
              <h4 style={{ margin: '0 0 6px 0', fontSize: isMobile ? '11px' : '13px', opacity: 0.9, fontWeight: '600' }}>TOTAL USERS</h4>
              <div style={{ fontSize: isMobile ? '20px' : '28px', fontWeight: 'bold' }}>{stats.totalUsers}</div>
            </div>

            {/* ADMINS - Click shows ONLY admins */}
            <div
              style={{
                ...statCardStyle,
                transform: 'scale(1)',
                ':hover': { transform: 'scale(1.02)' }
              }}
              onClick={() => handleStatClick('admins', 'admin', stats.totalAdmins)}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.02)';
                e.currentTarget.style.boxShadow = '0 8px 25px rgba(1, 81, 186, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 4px 15px rgba(1, 81, 186, 0.2)';
              }}
            >
              <div style={{ fontSize: isMobile ? '18px' : '24px', marginBottom: '6px' }}>🛡️</div>
              <h4 style={{ margin: '0 0 6px 0', fontSize: isMobile ? '11px' : '13px', opacity: 0.9, fontWeight: '600' }}>ADMINS</h4>
              <div style={{ fontSize: isMobile ? '20px' : '28px', fontWeight: 'bold' }}>{stats.totalAdmins}</div>
            </div>

            {/* WORKERS - Click shows ONLY workers */}
            <div
              style={{
                ...statCardStyle,
                transform: 'scale(1)',
                ':hover': { transform: 'scale(1.02)' }
              }}
              onClick={() => handleStatClick('workers', 'user', stats.totalWorkers)}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.02)';
                e.currentTarget.style.boxShadow = '0 8px 25px rgba(1, 81, 186, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 4px 15px rgba(1, 81, 186, 0.2)';
              }}
            >
              <div style={{ fontSize: isMobile ? '18px' : '24px', marginBottom: '6px' }}>👷</div>
              <h4 style={{ margin: '0 0 6px 0', fontSize: isMobile ? '11px' : '13px', opacity: 0.9, fontWeight: '600' }}>WORKERS</h4>
              <div style={{ fontSize: isMobile ? '20px' : '28px', fontWeight: 'bold' }}>{stats.totalWorkers}</div>
            </div>

            {/* SERVICES - Click shows ALL services */}
            <div
              style={{
                ...statCardStyle,
                transform: 'scale(1)',
                ':hover': { transform: 'scale(1.02)' }
              }}
              onClick={() => handleStatClick('services', null, stats.totalServices)}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.02)';
                e.currentTarget.style.boxShadow = '0 8px 25px rgba(1, 81, 186, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 4px 15px rgba(1, 81, 186, 0.2)';
              }}
            >
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
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px',
                    padding: isMobile ? '10px' : '12px',
                    background: colors.background,
                    borderRadius: '6px',
                    border: `1px solid ${colors.border}`,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onClick={() => handleStatClick('service-status', item._id, item.count)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = colors.lightGrey;
                    e.currentTarget.style.transform = 'translateX(4px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = colors.background;
                    e.currentTarget.style.transform = 'translateX(0)';
                  }}
                >
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
              {/* ASSIGNED - Click shows ONLY assigned services */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px',
                  padding: isMobile ? '10px' : '12px',
                  background: colors.background,
                  borderRadius: '6px',
                  border: `1px solid ${colors.border}`,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onClick={() => handleStatClick('assigned-services', true, stats.assignedServices || 0)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = colors.lightGrey;
                  e.currentTarget.style.transform = 'translateX(4px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = colors.background;
                  e.currentTarget.style.transform = 'translateX(0)';
                }}
              >
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

              {/* UNASSIGNED - Click shows ONLY unassigned services */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px',
                  padding: isMobile ? '10px' : '12px',
                  background: colors.background,
                  borderRadius: '6px',
                  border: `1px solid ${colors.border}`,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onClick={() => handleStatClick('unassigned-services', false, stats.unassignedServices || 0)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = colors.lightGrey;
                  e.currentTarget.style.transform = 'translateX(4px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = colors.background;
                  e.currentTarget.style.transform = 'translateX(0)';
                }}
              >
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

              {/* ACTIVE SERVICES - Click shows ONLY active services */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: isMobile ? '10px' : '12px',
                  background: colors.background,
                  borderRadius: '6px',
                  border: `1px solid ${colors.border}`,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onClick={() => handleStatClick('active-services', null, activeServices.length)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = colors.lightGrey;
                  e.currentTarget.style.transform = 'translateX(4px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = colors.background;
                  e.currentTarget.style.transform = 'translateX(0)';
                }}
              >
                <span style={{
                  padding: isMobile ? '4px 8px' : '6px 12px',
                  borderRadius: '20px',
                  fontSize: isMobile ? '10px' : '12px',
                  background: getStatusColor('active'),
                  color: colors.white,
                  fontWeight: '600'
                }}>
                  ACTIVE SERVICES
                </span>
                <span style={{
                  fontWeight: 'bold',
                  fontSize: isMobile ? '13px' : '15px',
                  color: colors.primary
                }}>{activeServices.length}</span>
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
            🟢 Active Services Preview
          </h4>
          <button
            onClick={() => handleStatClick('active-services', null, activeServices.length)}
            style={buttonStyle(colors.secondary, 'small')}
          >
            View All Active
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

  const renderUsers = () => {
    const filteredUsers = getFilteredUsers();
    const showAllUsers = !selectedData.filter;

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
              {selectedData.title || 'User Management'}
              {selectedData.count !== null && (
                <span style={{
                  marginLeft: '8px',
                  padding: '4px 10px',
                  background: colors.secondary,
                  color: colors.primary,
                  borderRadius: '20px',
                  fontSize: isMobile ? '12px' : '14px',
                  fontWeight: '600'
                }}>
                  {selectedData.count}
                </span>
              )}
            </h3>

            {!showAllUsers && (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                marginTop: '4px',
                padding: '4px 8px',
                background: colors.background,
                borderRadius: '4px',
                fontSize: isMobile ? '11px' : '12px',
                color: colors.textLight,
                border: `1px solid ${getRoleColor(selectedData.filter)}`
              }}>
                <span style={{ color: getRoleColor(selectedData.filter), fontWeight: '600' }}>
                  Showing only: {formatRoleName(selectedData.filter)}
                </span>
                <button
                  onClick={() => {
                    setSelectedData({
                      type: null,
                      filter: null,
                      title: null,
                      count: null
                    });
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: colors.danger,
                    cursor: 'pointer',
                    fontSize: '14px',
                    padding: '0 4px',
                    fontWeight: 'bold'
                  }}
                >
                  ×
                </button>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {!showAllUsers && (
              <button
                onClick={() => {
                  setSelectedData({
                    type: null,
                    filter: null,
                    title: null,
                    count: null
                  });
                }}
                style={buttonStyle(colors.warning, 'small')}
              >
                Show All Users
              </button>
            )}
            <AddUserForm onUserAdded={fetchUsers} isMobile={isMobile} colors={colors} buttonStyle={buttonStyle} />
          </div>
        </div>

        {loading ? (
          <div style={{
            textAlign: 'center',
            padding: isMobile ? '30px' : '40px',
            color: colors.textLight,
            fontSize: isMobile ? '13px' : '15px'
          }}>
            Loading {selectedData.title?.toLowerCase() || 'users'}...
          </div>
        ) : (
          <div style={{ overflowX: 'auto', borderRadius: '8px', WebkitOverflowScrolling: 'touch' }}>
            {filteredUsers.length > 0 ? (
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
                  {filteredUsers.map((userItem) => (
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
                          {formatRoleName(userItem.role)}
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
            ) : (
              <div style={{
                textAlign: 'center',
                padding: isMobile ? '40px' : '60px',
                color: colors.textLight,
                background: colors.background,
                borderRadius: '8px',
                border: `1px solid ${colors.border}`,
                fontSize: isMobile ? '14px' : '16px'
              }}>
                <div style={{ fontSize: isMobile ? '40px' : '60px', marginBottom: '16px', opacity: 0.5 }}>
                  {selectedData.filter === 'admin' ? '🛡️' :
                    selectedData.filter === 'user' ? '👷' :
                      selectedData.filter === 'client' ? '👔' :
                        selectedData.filter === 'owner' ? '👑' : '👤'}
                </div>
                <div style={{ fontWeight: '600', color: colors.primary, marginBottom: '8px' }}>
                  No {selectedData.title?.toLowerCase() || 'users'} found
                </div>
                <p style={{ margin: 0, fontSize: isMobile ? '12px' : '14px' }}>
                  {selectedData.filter ?
                    `There are currently no ${formatRoleName(selectedData.filter).toLowerCase()} in the system.` :
                    'No users found in the system.'
                  }
                </p>
                <button
                  onClick={() => {
                    setSelectedData({
                      type: null,
                      filter: null,
                      title: null,
                      count: null
                    });
                  }}
                  style={{
                    ...buttonStyle(colors.secondary, 'small'),
                    marginTop: '20px'
                  }}
                >
                  {selectedData.filter ? 'Show All Users' : 'Refresh'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

const renderAllServices = () => {
  const filteredServices = getFilteredServices();
  const showAllServices = !selectedData.filter;

  // Mobile card style definition
  const mobileCardStyle = {
    ...cardStyle,
    marginBottom: '16px',
    border: `1px solid ${colors.border}`,
    background: '#fff',
    borderRadius: '10px',
    overflow: 'hidden',
    boxShadow: '0 2px 8px rgba(1, 81, 186, 0.1)'
  };

  // Calculate duration for a service
  const calculateDuration = (startDate, deliveryDate) => {
    if (!startDate || !deliveryDate) return 'N/A';
    const start = new Date(startDate);
    const delivery = new Date(deliveryDate);
    start.setHours(0, 0, 0, 0);
    delivery.setHours(0, 0, 0, 0);
    const diffTime = delivery - start;
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (days === 0) return '1 day';
    return `${days} day${days !== 1 ? 's' : ''}`;
  };

  // Function to delete individual service item
  const deleteServiceItem = async (serviceId, itemId, serviceItemName) => {
    if (!window.confirm(`Are you sure you want to delete this service item: "${serviceItemName}"?\n\nThis will only delete this specific service item from the order.`)) {
      return;
    }

    try {
      console.log('Deleting service item:', { serviceId, itemId, serviceItemName });

      const response = await axios.delete(`/admin/services/${serviceId}/items/${itemId}`);

      if (response.data.success) {
        setMessage('Service item deleted successfully!');

        if (activeTab === 'all-services') {
          fetchAllServices();
        } else if (activeTab === 'active-services') {
          fetchActiveServices();
        }
      }
    } catch (error) {
      console.error('Error deleting service item:', error);
      setMessage('Error deleting service item: ' + (error.response?.data?.message || error.message));
    }
  };

  // Function to delete entire service
  const deleteService = async (serviceId, serviceName) => {
    if (!window.confirm(`Are you sure you want to delete the entire service: "${serviceName}"?\n\nThis will delete ALL service items and associated data.`)) {
      return;
    }

    try {
      const response = await axios.delete(`/admin/services/${serviceId}`);
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

  // Create expanded rows for services with multiple service types
  const expandedServices = [];

  filteredServices.forEach(service => {
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
          itemStatus: serviceItem.status || 'pending',
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
        itemStatus: service.status || 'pending'
      });
    }
  });

  return (
    <div>
      {/* Header section */}
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
            {selectedData.title || 'All Services'}
            <span style={{
              marginLeft: '8px',
              padding: '4px 10px',
              background: colors.secondary,
              color: colors.primary,
              borderRadius: '20px',
              fontSize: isMobile ? '12px' : '14px',
              fontWeight: '600'
            }}>
              {expandedServices.length} service items
            </span>
          </h3>

          {!showAllServices && (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              marginTop: '4px',
              padding: '4px 8px',
              background: colors.background,
              borderRadius: '4px',
              fontSize: isMobile ? '11px' : '12px',
              color: colors.textLight,
              border: `1px solid ${selectedData.filter.type === 'status' ? getStatusColor(selectedData.filter.value) : selectedData.filter.value ? colors.success : colors.warning}`
            }}>
              <span style={{
                color: selectedData.filter.type === 'status' ? getStatusColor(selectedData.filter.value) : selectedData.filter.value ? colors.success : colors.warning,
                fontWeight: '600'
              }}>
                Showing only: {selectedData.filter.type === 'status' ? selectedData.filter.value.toUpperCase() : selectedData.filter.value ? 'ASSIGNED' : 'UNASSIGNED'}
              </span>
              <button
                onClick={() => {
                  setSelectedData({
                    type: null,
                    filter: null,
                    title: null,
                    count: null
                  });
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: colors.danger,
                  cursor: 'pointer',
                  fontSize: '14px',
                  padding: '0 4px',
                  fontWeight: 'bold'
                }}
              >
                ×
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {!showAllServices && (
            <button
              onClick={() => {
                setSelectedData({
                  type: null,
                  filter: null,
                  title: null,
                  count: null
                });
              }}
              style={buttonStyle(colors.warning, 'small')}
            >
              Show All Services
            </button>
          )}
          <button
            onClick={fetchAllServices}
            style={buttonStyle(colors.secondary, 'small')}
          >
            🔄 Refresh
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
          Loading services...
        </div>
      ) : (
        <div>
          {isMobile ? (
            // MOBILE VIEW - CARDS
            <div>
              {expandedServices.length > 0 ? (
                expandedServices.map((service) => (
                  <div key={service._rowId} style={{
                    ...mobileCardStyle,
                    borderLeft: `4px solid ${service.isMultiService ? colors.info : colors.primary}`
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

                    {/* HEADER SECTION */}
                    <div style={{
                      padding: '12px',
                      background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryLight} 100%)`,
                      color: colors.white,
                      borderBottom: `2px solid ${colors.secondary}`
                    }}>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start'
                      }}>
                        <div style={{ flex: 1, marginRight: service.isMultiService ? '50px' : '0' }}>
                          <h4 style={{
                            margin: '0 0 4px 0',
                            fontSize: '14px',
                            fontWeight: '700'
                          }}>
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
                    </div>

                    {/* DETAILS SECTION */}
                    <div style={{ padding: '12px' }}>
                      {/* QUANTITY */}
                      <div style={{
                        textAlign: 'center',
                        marginBottom: '12px'
                      }}>
                        <div style={{ fontSize: '10px', color: colors.textLight, marginBottom: '2px' }}>QUANTITY</div>
                        <div style={{
                          padding: '8px 16px',
                          background: colors.secondary,
                          color: colors.primary,
                          borderRadius: '12px',
                          fontSize: '16px',
                          fontWeight: '700',
                          display: 'inline-block'
                        }}>
                          {service.quantity || '0'} units
                        </div>
                      </div>

                      {/* DURATION - NEW */}
                      <div style={{
                        textAlign: 'center',
                        marginBottom: '12px',
                        padding: '6px',
                        background: '#e6f7ff',
                        borderRadius: '6px',
                        border: `1px solid ${colors.info}`
                      }}>
                        <div style={{ fontSize: '10px', color: colors.textLight, marginBottom: '2px' }}>📅 DURATION</div>
                        <div style={{
                          fontSize: '14px',
                          fontWeight: '700',
                          color: colors.primary
                        }}>
                          {calculateDuration(service.startDate, service.deliveryDate)}
                        </div>
                      </div>

                      {/* LOCATION FOR THIS SPECIFIC SERVICE */}
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '10px', color: colors.textLight, marginBottom: '2px' }}>📍 LOCATION FOR THIS SERVICE</div>
                        <div style={{
                          padding: '8px',
                          background: '#e6f7ff',
                          borderRadius: '6px',
                          border: `1px solid ${colors.info}`,
                          fontSize: '11px',
                          fontWeight: '600',
                          color: colors.primary
                        }}>
                          {service.location?.address || 'No location specified'}
                        </div>
                      </div>

                      {/* Service Item Status */}
                      {service.isMultiService && (
                        <div style={{ marginBottom: '10px' }}>
                          <div style={{ fontSize: '10px', color: colors.textLight, marginBottom: '2px' }}>ITEM STATUS</div>
                          <span style={{
                            padding: '4px 8px',
                            borderRadius: '12px',
                            fontSize: '10px',
                            background: service.itemStatus === 'completed' ? colors.success :
                              service.itemStatus === 'in-progress' ? colors.warning : colors.info,
                            color: colors.white,
                            fontWeight: '600'
                          }}>
                            {service.itemStatus.toUpperCase()}
                          </span>
                        </div>
                      )}

                      {/* Service Type Info */}
                      {service.isMultiService && (
                        <div style={{
                          padding: '8px',
                          background: '#f0f9ff',
                          borderRadius: '6px',
                          marginBottom: '10px',
                          border: `1px solid ${colors.info}`
                        }}>
                          <div style={{
                            fontSize: '10px',
                            color: colors.textLight,
                            marginBottom: '2px'
                          }}>
                            This is {service.serviceIndex + 1} of {service.totalServices} services in this order
                          </div>
                          {service.notes && (
                            <div style={{
                              fontSize: '10px',
                              color: colors.primary,
                              marginTop: '4px',
                              fontStyle: 'italic'
                            }}>
                              📝 {service.notes}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Dates */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '8px',
                        marginBottom: '12px'
                      }}>
                        <div>
                          <div style={{ fontSize: '10px', color: colors.textLight, marginBottom: '2px' }}>START DATE</div>
                          <div style={{ fontSize: '11px', fontWeight: '600', color: colors.primary }}>
                            {service.startDate ? new Date(service.startDate).toLocaleDateString() : 'N/A'}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', color: colors.textLight, marginBottom: '2px' }}>DELIVERY DATE</div>
                          <div style={{ fontSize: '11px', fontWeight: '600', color: colors.primary }}>
                            {service.deliveryDate ? new Date(service.deliveryDate).toLocaleDateString() : 'N/A'}
                          </div>
                        </div>
                      </div>

                      {/* Assigned To */}
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '10px', color: colors.textLight, marginBottom: '2px' }}>ASSIGNED TO</div>
                        <div style={{ fontSize: '11px', fontWeight: '600', color: colors.primary }}>
                          {service.assignedTo ? (
                            <div>
                              <div>{service.assignedTo.username}</div>
                              <div style={{ fontSize: '10px', color: colors.textLight }}>
                                {service.assignedTo.email}
                              </div>
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

                      {/* Actions */}
                      <div style={{
                        display: 'flex',
                        gap: '8px',
                        paddingTop: '12px',
                        borderTop: `1px solid ${colors.border}`,
                        flexWrap: 'wrap'
                      }}>
                        <button
                          onClick={() => setImageModal({
                            open: true,
                            service: service,
                            images: service.images || []
                          })}
                          style={buttonStyle(colors.primary, 'small')}
                        >
                          🖼️ View Images
                        </button>
                        <button
                          onClick={() => setUploadModalService(service)}
                          style={buttonStyle(colors.info, 'small')}
                        >
                          📷 Upload
                        </button>
                        <button
                          onClick={() => generatePPT(service.images || [], service.businessName || 'Service')}
                          style={buttonStyle(colors.secondary, 'small')}
                          disabled={!service.images || service.images.length === 0}
                        >
                          📊 PPT
                        </button>
                        <button
                          onClick={() => generatePDF(service.images || [], service.businessName || 'Service')}
                          style={buttonStyle(colors.success, 'small')}
                          disabled={!service.images || service.images.length === 0}
                        >
                          📄 PDF
                        </button>
                        <button
                          onClick={() => {
                            if (service.isMultiService) {
                              const serviceItemName = service.serviceType === 'other' ? service.customServiceType : service.serviceType;
                              deleteServiceItem(service._originalId, service._id, serviceItemName);
                            } else {
                              deleteService(service._originalId, service.serviceName);
                            }
                          }}
                          style={buttonStyle(colors.danger, 'small')}
                          title={service.isMultiService ? 'Delete this service item only' : 'Delete entire service'}
                        >
                          🗑️ {service.isMultiService ? 'Delete Item' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{
                  textAlign: 'center',
                  padding: '40px',
                  color: colors.textLight,
                  background: colors.background,
                  borderRadius: '8px',
                  border: `1px solid ${colors.border}`,
                  fontSize: '14px'
                }}>
                  No services found
                </div>
              )}
            </div>
          ) : (
            // DESKTOP VIEW - TABLE
            <div style={{ overflowX: 'auto', borderRadius: '8px', WebkitOverflowScrolling: 'touch' }}>
              {expandedServices.length > 0 ? (
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Business</th>
                      <th style={thStyle}>Service Type</th>
                      <th style={thStyle}>Quantity</th>
                      <th style={thStyle}>Duration</th>
                      <th style={thStyle}>Location</th>
                      <th style={thStyle}>Item Status</th>
                      <th style={thStyle}>Start Date</th>
                      <th style={thStyle}>Delivery Date</th>
                      <th style={thStyle}>Assigned To</th>
                      <th style={thStyle}>Images</th>
                      <th style={thStyle}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expandedServices.map((service) => (
                      <tr key={service._rowId} style={{
                        background: service.isMultiService ? '#f0f9ff' : colors.white
                      }}>
                        <td style={{ ...tdStyle, fontWeight: '600', color: colors.primary, fontSize: '14px' }}>
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
                              <div style={{
                                fontSize: '11px',
                                color: colors.info,
                                fontWeight: '600',
                                marginTop: '2px',
                                background: '#e6f7ff',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                display: 'inline-block'
                              }}>
                                Item {service.serviceIndex + 1} of {service.totalServices}
                              </div>
                            )}
                          </div>
                        </td>

                        <td style={tdStyle}>
                          <div style={{ fontWeight: '600', color: colors.primary }}>
                            {service.serviceType === 'other' ? service.customServiceType : service.serviceType}
                          </div>
                          {service.notes && (
                            <div style={{ fontSize: '11px', color: colors.textLight, marginTop: '4px', fontStyle: 'italic' }}>
                              📝 {service.notes}
                            </div>
                          )}
                        </td>

                        {/* QUANTITY */}
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <div style={{
                            padding: '8px 16px',
                            background: colors.secondary,
                            color: colors.primary,
                            borderRadius: '20px',
                            fontSize: '14px',
                            fontWeight: '700',
                            display: 'inline-block'
                          }}>
                            {service.quantity || '0'}
                          </div>
                        </td>

                        {/* DURATION COLUMN - NEW */}
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <div style={{
                            padding: '4px 12px',
                            background: '#e6f7ff',
                            borderRadius: '12px',
                            border: `1px solid ${colors.info}`,
                            fontSize: '13px',
                            fontWeight: '600',
                            color: colors.primary,
                            display: 'inline-block',
                            whiteSpace: 'nowrap'
                          }}>
                            📅 {calculateDuration(service.startDate, service.deliveryDate)}
                          </div>
                        </td>

                        {/* LOCATION FOR THIS SPECIFIC SERVICE */}
                        <td style={tdStyle}>
                          <div style={{
                            padding: '8px 10px',
                            background: '#e6f7ff',
                            borderRadius: '6px',
                            border: `1px solid ${colors.info}`,
                            fontSize: '12px',
                            maxWidth: '200px',
                            wordWrap: 'break-word'
                          }}>
                            <div style={{ fontWeight: '600', color: colors.primary, marginBottom: '4px', fontSize: '13px' }}>
                              {service.location?.address || 'No location specified'}
                            </div>
                          </div>
                        </td>

                        {/* ITEM STATUS */}
                        <td style={tdStyle}>
                          <span style={{
                            padding: '6px 12px',
                            borderRadius: '20px',
                            fontSize: '12px',
                            background: service.itemStatus === 'completed' ? colors.success :
                              service.itemStatus === 'in-progress' ? colors.warning : colors.info,
                            color: colors.white,
                            fontWeight: '600'
                          }}>
                            {service.itemStatus.toUpperCase()}
                          </span>
                        </td>

                        <td style={tdStyle}>
                          {service.startDate ? new Date(service.startDate).toLocaleDateString() : 'N/A'}
                        </td>

                        <td style={tdStyle}>
                          {service.deliveryDate ? new Date(service.deliveryDate).toLocaleDateString() : 'N/A'}
                        </td>

                        <td style={tdStyle}>
                          {service.assignedTo ? (
                            <div>
                              <div style={{ fontWeight: '600', color: colors.primary, fontSize: '14px' }}>
                                {service.assignedTo.username}
                              </div>
                              <div style={{ fontSize: '12px', color: colors.textLight }}>
                                {service.assignedTo.email}
                              </div>
                              <button
                                onClick={() => unassignService(service._originalId || service._id, {
                                  assignAll: !service.isMultiService,
                                  serviceIndex: service.serviceIndex
                                })}
                                style={{
                                  ...buttonStyle(colors.warning, 'small'),
                                  marginTop: '4px',
                                  padding: '6px 10px',
                                  fontSize: '11px'
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
                        </td>

                        <td style={tdStyle}>
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            <button
                              onClick={() => setImageModal({
                                open: true,
                                service: service,
                                images: service.images || []
                              })}
                              style={buttonStyle(colors.primary, 'small')}
                              title="View Images"
                            >
                              🖼️ {renderServiceProgressText(service)}
                            </button>
                            <button
                              onClick={() => setUploadModalService(service)}
                              style={buttonStyle(colors.info, 'small')}
                              title="Upload Images"
                            >
                              📷 Upload
                            </button>
                            <button
                              onClick={() => generatePPT(service.images || [], service.businessName || 'Service')}
                              style={buttonStyle(colors.secondary, 'small')}
                              disabled={!service.images || service.images.length === 0}
                              title="Download PPT"
                            >
                              📊 PPT
                            </button>
                            <button
                              onClick={() => generatePDF(service.images || [], service.businessName || 'Service')}
                              style={buttonStyle(colors.success, 'small')}
                              disabled={!service.images || service.images.length === 0}
                              title="Download PDF"
                            >
                              📄 PDF
                            </button>
                          </div>
                        </td>

                        <td style={tdStyle}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <button
                              onClick={() => {
                                if (service.isMultiService) {
                                  const serviceItemName = service.serviceType === 'other' ? service.customServiceType : service.serviceType;
                                  deleteServiceItem(service._originalId, service._id, serviceItemName);
                                } else {
                                  deleteService(service._originalId, service.serviceName);
                                }
                              }}
                              style={buttonStyle(colors.danger, 'small')}
                              title={service.isMultiService ? 'Delete this service item only' : 'Delete entire service'}
                            >
                              🗑️ {service.isMultiService ? 'Delete' : 'Delete'}
                            </button>
                            {service.isMultiService && (
                              <button
                                onClick={() => deleteService(service._originalId, service.serviceName)}
                                style={{
                                  ...buttonStyle(colors.warning, 'small'),
                                  padding: '4px 8px',
                                  fontSize: '10px'
                                }}
                                title="Delete entire service order (all items)"
                              >
                                Delete All
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{
                  textAlign: 'center',
                  padding: '60px',
                  color: colors.textLight,
                  background: colors.background,
                  borderRadius: '8px',
                  border: `1px solid ${colors.border}`,
                  fontSize: '16px'
                }}>
                  No services found
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
  const renderActiveServices = () => {
    const filteredActiveServices = getFilteredActiveServices();
    const showAllActiveServices = !selectedData.filter;

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
              {selectedData.title || 'Active Services'}
              <span style={{
                marginLeft: '8px',
                padding: '4px 10px',
                background: colors.success,
                color: colors.white,
                borderRadius: '20px',
                fontSize: isMobile ? '12px' : '14px',
                fontWeight: '600'
              }}>
                {filteredActiveServices.length} Active
              </span>
            </h3>

            {!showAllActiveServices && (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                marginTop: '4px',
                padding: '4px 8px',
                background: colors.background,
                borderRadius: '4px',
                fontSize: isMobile ? '11px' : '12px',
                color: colors.textLight,
                border: `1px solid ${selectedData.filter.value ? colors.success : colors.warning}`
              }}>
                <span style={{
                  color: selectedData.filter.value ? colors.success : colors.warning,
                  fontWeight: '600'
                }}>
                  Showing only: {selectedData.filter.value ? 'ASSIGNED' : 'UNASSIGNED'}
                </span>
                <button
                  onClick={() => {
                    setSelectedData({
                      type: null,
                      filter: null,
                      title: null,
                      count: null
                    });
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: colors.danger,
                    cursor: 'pointer',
                    fontSize: '14px',
                    padding: '0 4px',
                    fontWeight: 'bold'
                  }}
                >
                  ×
                </button>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: isMobile ? '8px' : '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            {!showAllActiveServices && (
              <button
                onClick={() => {
                  setSelectedData({
                    type: null,
                    filter: null,
                    title: null,
                    count: null
                  });
                }}
                style={buttonStyle(colors.warning, 'small')}
              >
                Show All Active
              </button>
            )}
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
            Loading {selectedData.title?.toLowerCase() || 'active services'}...
          </div>
        ) : filteredActiveServices.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: isMobile ? '40px' : '60px',
            color: colors.textLight,
            background: colors.background,
            borderRadius: '8px',
            border: `1px solid ${colors.border}`,
            fontSize: isMobile ? '14px' : '16px'
          }}>
            <div style={{ fontSize: isMobile ? '40px' : '60px', marginBottom: '16px', opacity: 0.5 }}>
              {selectedData.filter?.value === true ? '✅' : '📋'}
            </div>
            <div style={{ fontWeight: '600', color: colors.primary, marginBottom: '8px' }}>
              No {selectedData.title?.toLowerCase() || 'active services'} found
            </div>
            <p style={{ margin: 0, fontSize: isMobile ? '12px' : '14px' }}>
              {selectedData.filter ?
                `There are currently no ${selectedData.title?.toLowerCase() || 'active services'} in the system.` :
                'No active services found in the system.'
              }
            </p>
            <button
              onClick={() => {
                setSelectedData({
                  type: null,
                  filter: null,
                  title: null,
                  count: null
                });
              }}
              style={{
                ...buttonStyle(colors.secondary, 'small'),
                marginTop: '20px'
              }}
            >
              {selectedData.filter ? 'Show All Active Services' : 'Refresh'}
            </button>
          </div>
        ) : (
          <div>
            {filteredActiveServices.map((service) => (
              <div key={service._id} style={{
                ...cardStyle,
                borderLeft: `4px solid ${colors.success}`,
                background: '#f0fff4',
                marginBottom: isMobile ? '16px' : '20px'
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
                    </h4>
                    <p style={{
                      margin: '0 0 6px 0',
                      color: colors.textLight,
                      fontSize: isMobile ? '12px' : '15px',
                      fontWeight: '600'
                    }}>
                      <strong>Service:</strong> {service.serviceType === 'other' ? service.customServiceType : service.serviceType}
                    </p>
                    <p style={{
                      margin: 0,
                      color: colors.textLight,
                      fontSize: isMobile ? '11px' : '14px'
                    }}>
                      <strong>Created by:</strong> {service.createdBy.username} {!isMobile && `(${service.createdBy.email})`}
                    </p>
                    {service.assignedTo && (
                      <p style={{
                        margin: '4px 0 0 0',
                        color: colors.success,
                        fontSize: isMobile ? '11px' : '14px',
                        fontWeight: '600'
                      }}>
                        <strong>Assigned to:</strong> {service.assignedTo.username} {!isMobile && `(${service.assignedTo.email})`}
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
                    <span style={{
                      padding: isMobile ? '4px 8px' : '6px 12px',
                      borderRadius: '20px',
                      fontSize: isMobile ? '11px' : '13px',
                      background: colors.success,
                      color: colors.white,
                      fontWeight: '600'
                    }}>
                      ACTIVE
                    </span>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <button
                        onClick={() => setImageModal({
                          open: true,
                          service: service,
                          images: service.images || []
                        })}
                        style={{
                          padding: isMobile ? '4px 8px' : '6px 12px',
                          background: colors.primary,
                          color: colors.white,
                          border: 'none',
                          borderRadius: '12px',
                          fontSize: isMobile ? '10px' : '12px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <span>🖼️</span>
                        {renderServiceProgressText(service)}
                      </button>
                      <button
                        onClick={() => setUploadModalService(service)}
                        style={buttonStyle(colors.info, 'small')}
                      >
                        📷 Upload
                      </button>
                      <button
                        onClick={() => generatePPT(service.images || [], service.businessName || 'Service')}
                        style={buttonStyle(colors.secondary, 'small')}
                        disabled={!service.images || service.images.length === 0}
                      >
                        📊 PPT
                      </button>
                      <button
                        onClick={() => generatePDF(service.images || [], service.businessName || 'Service')}
                        style={buttonStyle(colors.success, 'small')}
                        disabled={!service.images || service.images.length === 0}
                      >
                        📄 PDF
                      </button>
                    </div>
                    {!service.assignedTo && (
                      <button
                        onClick={() => setAssigningService(service)}
                        style={buttonStyle(colors.success, 'small')}
                      >
                        {isMobile ? 'Assign' : 'Assign Worker'}
                      </button>
                    )}
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
                      onClick={() => deleteService(service._id)}
                      style={buttonStyle(colors.danger, 'small')}
                    >
                      🗑️ {isMobile ? '' : 'Delete'}
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
      <AddService onSuccess={() => {
        navigateToTab('all-services');
        setMessage('Service created successfully!');
      }} userRole={user?.role || 'admin'} currentUser={user} />
    </div>
  );

  const renderWorkerDetails = () => (
    <div>
      <h3 style={{
        color: colors.primary,
        marginBottom: isMobile ? '16px' : '24px',
        fontSize: isMobile ? '16px' : '22px',
        fontWeight: '700'
      }}>
        👷 Worker Details
      </h3>
      <WorkerDetails
        colors={colors}
        isMobile={isMobile}
        buttonStyle={buttonStyle}
        setMessage={setMessage}
        cardStyle={cardStyle}
        tableStyle={tableStyle}
        thStyle={thStyle}
        tdStyle={tdStyle}
      />
    </div>
  );

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'users', label: 'Users', icon: '👥' },
    { id: 'all-services', label: 'All Services', icon: '📋' },
    { id: 'active-services', label: 'Active Services', icon: '🟢' },
    { id: 'add-service', label: 'Add Service', icon: '➕' },
    { id: 'worker-details', label: 'Worker Details', icon: '👷' }
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
                Admin Panel
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
                    // Clear selected data when navigating via sidebar
                    setSelectedData({
                      type: null,
                      filter: null,
                      title: null,
                      count: null
                    });
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

            <div style={{
              marginTop: 'auto',
              paddingTop: isMobile ? '16px' : '20px',
              borderTop: `1px solid ${colors.secondary}`,
              color: colors.secondaryLight,
              fontSize: isMobile ? '11px' : '12px',
              textAlign: 'center'
            }}>
              <p style={{ margin: 0, opacity: 0.8 }}>
                © {new Date().getFullYear()} Admin Panel
              </p>
            </div>
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
              gap: isMobile ? '8px' : '12px',
              flexWrap: 'wrap'
            }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: isMobile ? '13px' : '14px', fontWeight: '700', color: colors.primary }}>{user.username}</div>
                <div style={{ fontSize: isMobile ? '11px' : '12px', color: colors.textLight }}>Admin</div>
              </div>
              <button
                onClick={onLogout}
                style={buttonStyle(colors.danger, 'small')}
              >
                🚪 {isMobile ? 'Logout' : 'Logout'}
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
                Admin Dashboard
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
                <div style={{ fontSize: '13px', color: colors.textLight }}>Administrator</div>
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
              {activeTab === 'worker-details' && renderWorkerDetails()}
            </>
          )}
        </div>
      </div>

      {assigningService && (
        <AssignmentModal
          service={assigningService}
          workers={availableWorkers}
          onAssign={assignService}
          onClose={() => setAssigningService(null)}
        />
      )}

      {imageModal.open && (
        <ImageModal
          service={imageModal.service}
          images={imageModal.images}
          onClose={() => setImageModal({ open: false, service: null, images: [] })}
        />
      )}

      {uploadModalService && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(1, 81, 186, 0.6)',
          zIndex: 1001,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }} onClick={() => setUploadModalService(null)}>
          <div style={{
            background: colors.white,
            padding: isMobile ? '16px' : '24px',
            borderRadius: '12px',
            width: isMobile ? '100%' : '650px',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, color: colors.primary }}>📷 Manage & Upload Images ({uploadModalService.businessName})</h3>
              <button onClick={() => setUploadModalService(null)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: colors.danger, fontWeight: 'bold' }}>×</button>
            </div>
            <ImageUpload
              service={getModalService()}
              serviceId={uploadModalService._originalId || uploadModalService._id}
              onImagesAdded={() => {
                if (activeTab === 'all-services') fetchAllServices();
                if (activeTab === 'active-services') fetchActiveServices();
              }}
              onImageUploaded={() => {
                if (activeTab === 'all-services') fetchAllServices();
                if (activeTab === 'active-services') fetchActiveServices();
              }}
              userRole={user?.role || 'admin'}
              currentUser={user}
            />
          </div>
        </div>
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

// Add User Form Component - UPDATED WITH CONTACT NUMBER FIELD
const AddUserForm = ({ onUserAdded, isMobile, colors, buttonStyle }) => {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    contactNumber: '', // Added contact number field
    role: 'user', // Default to worker
    businessName: '',
    ownerLevel: 'standard'
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const response = await axios.post('/admin/users', formData);
      if (response.data.success) {
        setMessage('User created successfully!');
        setFormData({
          username: '',
          email: '',
          password: '',
          contactNumber: '', // Reset contact number
          role: 'user',
          businessName: '',
          ownerLevel: 'standard'
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
          type="tel"
          name="contactNumber"
          placeholder="Contact Number (e.g., +1234567890)"
          value={formData.contactNumber}
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
        <select
          name="role"
          value={formData.role}
          onChange={handleChange}
          style={inputStyle}
        >
          <option value="user">Worker</option>
          <option value="admin">Admin</option>
          <option value="client">Client</option>
          <option value="owner">Owner</option>
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

        {formData.role === 'owner' && (
          <select
            name="ownerLevel"
            value={formData.ownerLevel}
            onChange={handleChange}
            style={inputStyle}
          >
            <option value="standard">Standard Owner</option>
            <option value="premium">Premium Owner</option>
            <option value="enterprise">Enterprise Owner</option>
          </select>
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

// Edit User Form Component - UPDATED WITH CONTACT NUMBER AND OWNER LEVEL
const EditUserForm = ({ user, onUserUpdated, isMobile, colors, buttonStyle }) => {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    username: user.username,
    email: user.email,
    contactNumber: user.contactNumber || '', // Added contact number field
    role: user.role,
    businessName: user.businessName || '',
    ownerLevel: user.ownerLevel || 'standard' // initialize ownerLevel
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const response = await axios.put(`/admin/users/${user._id}`, formData);
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
            <option value="admin">Admin</option>
            <option value="client">Client</option>
            <option value="owner">Owner</option>
          </select>

          {/* Business Name field for clients */}
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

          {/* Owner Level field for owners */}
          {formData.role === 'owner' && (
            <select
              name="ownerLevel"
              value={formData.ownerLevel}
              onChange={handleChange}
              style={inputStyle}
            >
              <option value="standard">Standard Owner</option>
              <option value="premium">Premium Owner</option>
              <option value="enterprise">Enterprise Owner</option>
            </select>
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

export default AdminDashboard;