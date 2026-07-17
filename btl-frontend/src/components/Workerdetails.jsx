import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from '../utils/api';
import { FaEdit, FaTrash, FaEye, FaTimes, FaPhone, FaIdCard, FaEnvelope, FaMapMarkerAlt, FaCar, FaUserTie, FaCheckCircle } from 'react-icons/fa';

// Memoized form component to prevent re-renders
const WorkerForm = React.memo(({ 
  formData, 
  errors, 
  formLoading, 
  editingWorker, 
  isMobile, 
  colors, 
  serviceTypes,
  onInputChange,
  onSubmit,
  onCancel 
}) => {
  const formRef = useRef(null);

  const handleFormSubmit = (e) => {
    e.preventDefault();
    onSubmit(e);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && e.target.type !== 'textarea') {
      e.preventDefault();
    }
  };

  return (
    <div ref={formRef} style={{
      background: colors?.white || '#ffffff',
      padding: isMobile ? '16px' : '24px',
      borderRadius: '10px',
      marginBottom: '20px',
      border: `2px solid ${colors?.secondary || '#f2c43b'}`,
      boxShadow: '0 4px 12px rgba(1, 81, 186, 0.1)'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
        paddingBottom: '15px',
        borderBottom: `1px solid ${colors.border}`
      }}>
        <h3 style={{ color: colors.primary, margin: 0, fontSize: isMobile ? '14px' : '18px', fontWeight: '600' }}>
          {editingWorker ? 'Edit Worker' : 'Add New Worker'}
        </h3>
        <button 
          onClick={onCancel} 
          style={{ 
            background: 'none', 
            border: 'none', 
            fontSize: '18px', 
            color: colors.textLight, 
            cursor: 'pointer',
            padding: '5px'
          }}
          disabled={formLoading}
          type="button"
        >
          <FaTimes />
        </button>
      </div>

      <form onSubmit={handleFormSubmit} onKeyDown={handleKeyDown}>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '8px', color: colors.text, fontSize: isMobile ? '12px' : '14px', fontWeight: '500' }}>
            Worker Name *
          </label>
          <input
            type="text"
            name="workerName"
            value={formData.workerName}
            onChange={onInputChange}
            style={{
              width: '100%',
              padding: isMobile ? '10px' : '12px',
              border: `1px solid ${errors.workerName ? colors.danger : colors.border}`,
              borderRadius: '6px',
              fontSize: isMobile ? '13px' : '14px',
              background: colors.background,
              color: colors.text
            }}
            placeholder="Enter worker name"
            disabled={formLoading}
          />
          {errors.workerName && <span style={{ color: colors.danger, fontSize: '12px', display: 'block', marginTop: '5px' }}>{errors.workerName}</span>}
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '8px', color: colors.text, fontSize: isMobile ? '12px' : '14px', fontWeight: '500' }}>
            Contact Number *
          </label>
          <input
            type="tel"
            name="contactNumber"
            value={formData.contactNumber}
            onChange={onInputChange}
            style={{
              width: '100%',
              padding: isMobile ? '10px' : '12px',
              border: `1px solid ${errors.contactNumber ? colors.danger : colors.border}`,
              borderRadius: '6px',
              fontSize: isMobile ? '13px' : '14px',
              background: colors.background,
              color: colors.text
            }}
            placeholder="Enter contact number"
            disabled={formLoading}
          />
          {errors.contactNumber && <span style={{ color: colors.danger, fontSize: '12px', display: 'block', marginTop: '5px' }}>{errors.contactNumber}</span>}
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '8px', color: colors.text, fontSize: isMobile ? '12px' : '14px', fontWeight: '500' }}>
            Aadhar Number *
          </label>
          <input
            type="text"
            name="aadharNumber"
            value={formData.aadharNumber}
            onChange={onInputChange}
            style={{
              width: '100%',
              padding: isMobile ? '10px' : '12px',
              border: `1px solid ${errors.aadharNumber ? colors.danger : colors.border}`,
              borderRadius: '6px',
              fontSize: isMobile ? '13px' : '14px',
              background: colors.background,
              color: colors.text
            }}
            placeholder="Enter Aadhar number"
            disabled={formLoading}
          />
          {errors.aadharNumber && <span style={{ color: colors.danger, fontSize: '12px', display: 'block', marginTop: '5px' }}>{errors.aadharNumber}</span>}
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '8px', color: colors.text, fontSize: isMobile ? '12px' : '14px', fontWeight: '500' }}>
            Email (Optional)
          </label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={onInputChange}
            style={{
              width: '100%',
              padding: isMobile ? '10px' : '12px',
              border: `1px solid ${errors.email ? colors.danger : colors.border}`,
              borderRadius: '6px',
              fontSize: isMobile ? '13px' : '14px',
              background: colors.background,
              color: colors.text
            }}
            placeholder="Enter email address"
            disabled={formLoading}
          />
          {errors.email && <span style={{ color: colors.danger, fontSize: '12px', display: 'block', marginTop: '5px' }}>{errors.email}</span>}
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '8px', color: colors.text, fontSize: isMobile ? '12px' : '14px', fontWeight: '500' }}>
            Address *
          </label>
          <textarea
            name="address"
            value={formData.address}
            onChange={onInputChange}
            style={{
              width: '100%',
              padding: isMobile ? '10px' : '12px',
              border: `1px solid ${errors.address ? colors.danger : colors.border}`,
              borderRadius: '6px',
              fontSize: isMobile ? '13px' : '14px',
              background: colors.background,
              color: colors.text,
              height: '80px',
              resize: 'vertical'
            }}
            placeholder="Enter full address"
            disabled={formLoading}
          />
          {errors.address && <span style={{ color: colors.danger, fontSize: '12px', display: 'block', marginTop: '5px' }}>{errors.address}</span>}
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '8px', color: colors.text, fontSize: isMobile ? '12px' : '14px', fontWeight: '500' }}>
            Service Type *
          </label>
          <select
            name="serviceType"
            value={formData.serviceType}
            onChange={onInputChange}
            style={{
              width: '100%',
              padding: isMobile ? '10px' : '12px',
              border: `1px solid ${errors.serviceType ? colors.danger : colors.border}`,
              borderRadius: '6px',
              fontSize: isMobile ? '13px' : '14px',
              background: colors.background,
              color: colors.text
            }}
            disabled={formLoading}
          >
            <option value="">Select Service Type</option>
            {serviceTypes.map(type => (
              <option key={type} value={type}>
                {type.replace(/-/g, ' ').toUpperCase()}
              </option>
            ))}
          </select>
          {errors.serviceType && <span style={{ color: colors.danger, fontSize: '12px', display: 'block', marginTop: '5px' }}>{errors.serviceType}</span>}
        </div>

        {formData.serviceType === 'mobile-vans' && (
          <div style={{ background: colors.background, padding: '15px', borderRadius: '6px', marginBottom: '15px' }}>
            <h4 style={{ color: colors.primary, marginBottom: '15px', fontSize: isMobile ? '13px' : '15px' }}>Vehicle Details (Required for Mobile Vans)</h4>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '8px', color: colors.text, fontSize: isMobile ? '12px' : '14px', fontWeight: '500' }}>
                Vehicle Number *
              </label>
              <input
                type="text"
                name="vehicleDetails.vehicleNumber"
                value={formData.vehicleDetails.vehicleNumber}
                onChange={onInputChange}
                style={{
                  width: '100%',
                  padding: isMobile ? '10px' : '12px',
                  border: `1px solid ${errors.vehicleNumber ? colors.danger : colors.border}`,
                  borderRadius: '6px',
                  fontSize: isMobile ? '13px' : '14px',
                  background: colors.white,
                  color: colors.text
                }}
                placeholder="Enter vehicle number"
                disabled={formLoading}
              />
              {errors.vehicleNumber && <span style={{ color: colors.danger, fontSize: '12px', display: 'block', marginTop: '5px' }}>{errors.vehicleNumber}</span>}
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '8px', color: colors.text, fontSize: isMobile ? '12px' : '14px', fontWeight: '500' }}>
                Supplier Name *
              </label>
              <input
                type="text"
                name="vehicleDetails.supplierName"
                value={formData.vehicleDetails.supplierName}
                onChange={onInputChange}
                style={{
                  width: '100%',
                  padding: isMobile ? '10px' : '12px',
                  border: `1px solid ${errors.supplierName ? colors.danger : colors.border}`,
                  borderRadius: '6px',
                  fontSize: isMobile ? '13px' : '14px',
                  background: colors.white,
                  color: colors.text
                }}
                placeholder="Enter supplier name"
                disabled={formLoading}
              />
              {errors.supplierName && <span style={{ color: colors.danger, fontSize: '12px', display: 'block', marginTop: '5px' }}>{errors.supplierName}</span>}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          <button 
            type="submit" 
            style={{
              padding: isMobile ? '8px 12px' : '10px 20px',
              background: colors.secondary,
              color: colors.primary,
              border: 'none',
              borderRadius: '6px',
              fontSize: isMobile ? '12px' : '14px',
              fontWeight: '600',
              cursor: 'pointer',
              flex: 1,
              opacity: formLoading ? 0.7 : 1
            }}
            disabled={formLoading}
          >
            {formLoading ? 'Processing...' : editingWorker ? 'Update Worker' : 'Add Worker'}
          </button>
          <button 
            type="button" 
            onClick={onCancel}
            style={{
              padding: isMobile ? '8px 12px' : '10px 20px',
              background: colors.textLight,
              color: colors.white,
              border: 'none',
              borderRadius: '6px',
              fontSize: isMobile ? '12px' : '14px',
              fontWeight: '600',
              cursor: 'pointer',
              flex: 1,
              opacity: formLoading ? 0.7 : 1
            }}
            disabled={formLoading}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
});

// Default Blue/Yellow/White color palette if colors prop not supplied
const defaultColors = {
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

// Main component
const Workerdetails = ({ colors = defaultColors, isMobile }) => {
  const [workers, setWorkers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingWorker, setEditingWorker] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState(null);
  const [formData, setFormData] = useState({
    workerName: '',
    contactNumber: '',
    aadharNumber: '',
    email: '',
    address: '',
    serviceType: '',
    vehicleDetails: {
      vehicleNumber: '',
      supplierName: ''
    }
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const formRef = useRef(null);

  // Service types
  const serviceTypes = [
    'mobile-vans',
    'look-walkers', 
    'try-cycle',
    'auto-booming',
    'auto-stickers',
    'auto-tops',
    'rounds',
    'digital-wall-poster',
    'pole-boards',
    'no-parking-boards',
    'other'
  ];

  useEffect(() => {
    fetchWorkers();
  }, []);

  // Scroll to form when it's opened
  useEffect(() => {
    if (showForm && formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [showForm]);

  const fetchWorkers = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/workers');
      setWorkers(response.data);
    } catch (error) {
      console.error('Error fetching workers:', error);
      alert('Failed to fetch workers. Please check your API endpoint.');
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.workerName.trim()) newErrors.workerName = 'Worker name is required';
    if (!formData.contactNumber.trim()) newErrors.contactNumber = 'Contact number is required';
    if (!formData.aadharNumber.trim()) newErrors.aadharNumber = 'Aadhar number is required';
    if (!formData.address.trim()) newErrors.address = 'Address is required';
    if (!formData.serviceType) newErrors.serviceType = 'Service type is required';
    
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }
    
    if (formData.serviceType === 'mobile-vans') {
      if (!formData.vehicleDetails.vehicleNumber.trim()) {
        newErrors.vehicleNumber = 'Vehicle number is required for mobile vans';
      }
      if (!formData.vehicleDetails.supplierName.trim()) {
        newErrors.supplierName = 'Supplier name is required for mobile vans';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Use useCallback for input change handler
  const handleInputChange = useCallback((e) => {
    const { name, value } = e.target;
    
    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setFormData(prev => ({
        ...prev,
        [parent]: {
          ...prev[parent],
          [child]: value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }

    // Clear error for this field
    const errorKey = name.includes('.') ? name.split('.')[1] : name;
    if (errors[errorKey]) {
      setErrors(prev => ({ ...prev, [errorKey]: '' }));
    }
  }, [errors]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setFormLoading(true);
    try {
      const payload = {
        ...formData,
        contactNumber: formData.contactNumber.replace(/\D/g, ''),
        aadharNumber: formData.aadharNumber.replace(/\s/g, '')
      };

      if (editingWorker) {
        await axios.put(`/workers/${editingWorker._id}`, payload);
        setEditingWorker(null);
        alert('Worker updated successfully!');
      } else {
        await axios.post('/workers', payload);
        alert('Worker added successfully!');
      }
      
      resetForm();
      fetchWorkers();
      setShowForm(false);
    } catch (error) {
      console.error('Error saving worker:', error);
      const errorMessage = error.response?.data?.message || 'Failed to save worker. Please try again.';
      alert(errorMessage);
    } finally {
      setFormLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      workerName: '',
      contactNumber: '',
      aadharNumber: '',
      email: '',
      address: '',
      serviceType: '',
      vehicleDetails: {
        vehicleNumber: '',
        supplierName: ''
      }
    });
    setErrors({});
  };

  const handleEdit = (worker) => {
    setFormData({
      workerName: worker.workerName || '',
      contactNumber: worker.contactNumber || '',
      aadharNumber: worker.aadharNumber || '',
      email: worker.email || '',
      address: worker.address || '',
      serviceType: worker.serviceType || '',
      vehicleDetails: worker.vehicleDetails || {
        vehicleNumber: '',
        supplierName: ''
      }
    });
    setEditingWorker(worker);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this worker?')) {
      setLoading(true);
      try {
        await axios.delete(`/workers/${id}`);
        alert('Worker deleted successfully!');
        fetchWorkers();
      } catch (error) {
        console.error('Error deleting worker:', error);
        alert('Failed to delete worker. Please try again.');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleViewDetails = (worker) => {
    setModalData(worker);
    setShowModal(true);
  };

  const handleCancel = useCallback(() => {
    resetForm();
    setEditingWorker(null);
    setShowForm(false);
  }, []);

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const getServiceTypeLabel = (type) => {
    return type.replace(/-/g, ' ').toUpperCase();
  };

  // Worker Table Component
  const WorkerTable = () => (
    <div style={{ overflowX: 'auto' }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        marginTop: '16px',
        fontSize: isMobile ? '12px' : '14px',
        borderRadius: '8px',
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(1, 81, 186, 0.1)'
      }}>
        <thead>
          <tr>
            <th style={{
              background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryLight} 100%)`,
              color: colors.white,
              padding: isMobile ? '12px 6px' : '16px 12px',
              textAlign: 'left',
              border: `1px solid ${colors.primaryLight}`,
              fontSize: isMobile ? '11px' : '14px',
              fontWeight: '600'
            }}>S.I</th>
            <th style={{
              background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryLight} 100%)`,
              color: colors.white,
              padding: isMobile ? '12px 6px' : '16px 12px',
              textAlign: 'left',
              border: `1px solid ${colors.primaryLight}`,
              fontSize: isMobile ? '11px' : '14px',
              fontWeight: '600'
            }}>Worker Name</th>
            <th style={{
              background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryLight} 100%)`,
              color: colors.white,
              padding: isMobile ? '12px 6px' : '16px 12px',
              textAlign: 'left',
              border: `1px solid ${colors.primaryLight}`,
              fontSize: isMobile ? '11px' : '14px',
              fontWeight: '600'
            }}>Contact</th>
            <th style={{
              background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryLight} 100%)`,
              color: colors.white,
              padding: isMobile ? '12px 6px' : '16px 12px',
              textAlign: 'left',
              border: `1px solid ${colors.primaryLight}`,
              fontSize: isMobile ? '11px' : '14px',
              fontWeight: '600'
            }}>Aadhar</th>
            <th style={{
              background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryLight} 100%)`,
              color: colors.white,
              padding: isMobile ? '12px 6px' : '16px 12px',
              textAlign: 'left',
              border: `1px solid ${colors.primaryLight}`,
              fontSize: isMobile ? '11px' : '14px',
              fontWeight: '600'
            }}>Service Type</th>
            <th style={{
              background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryLight} 100%)`,
              color: colors.white,
              padding: isMobile ? '12px 6px' : '16px 12px',
              textAlign: 'left',
              border: `1px solid ${colors.primaryLight}`,
              fontSize: isMobile ? '11px' : '14px',
              fontWeight: '600'
            }}>Added On</th>
            <th style={{
              background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryLight} 100%)`,
              color: colors.white,
              padding: isMobile ? '12px 6px' : '16px 12px',
              textAlign: 'left',
              border: `1px solid ${colors.primaryLight}`,
              fontSize: isMobile ? '11px' : '14px',
              fontWeight: '600'
            }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {workers.map((worker, index) => (
            <tr key={worker._id}>
              <td style={{
                padding: isMobile ? '10px 6px' : '14px 12px',
                border: `1px solid ${colors.border}`,
                textAlign: 'left',
                fontSize: isMobile ? '11px' : '14px',
                background: colors.white,
                verticalAlign: 'top'
              }}>{index + 1}</td>
              <td style={{
                padding: isMobile ? '10px 6px' : '14px 12px',
                border: `1px solid ${colors.border}`,
                textAlign: 'left',
                fontSize: isMobile ? '11px' : '14px',
                background: colors.white,
                verticalAlign: 'top'
              }}>
                <div>
                  <div style={{ fontWeight: '600', color: colors.primary }}>{worker.workerName}</div>
                  {worker.email && (
                    <div style={{ fontSize: '12px', color: colors.textLight }}>{worker.email}</div>
                  )}
                </div>
              </td>
              <td style={{
                padding: isMobile ? '10px 6px' : '14px 12px',
                border: `1px solid ${colors.border}`,
                textAlign: 'left',
                fontSize: isMobile ? '11px' : '14px',
                background: colors.white,
                verticalAlign: 'top'
              }}>{worker.contactNumber}</td>
              <td style={{
                padding: isMobile ? '10px 6px' : '14px 12px',
                border: `1px solid ${colors.border}`,
                textAlign: 'left',
                fontSize: isMobile ? '11px' : '14px',
                background: colors.white,
                verticalAlign: 'top'
              }}>{worker.aadharNumber}</td>
              <td style={{
                padding: isMobile ? '10px 6px' : '14px 12px',
                border: `1px solid ${colors.border}`,
                textAlign: 'left',
                fontSize: isMobile ? '11px' : '14px',
                background: colors.white,
                verticalAlign: 'top'
              }}>
                <span style={{
                  padding: '4px 8px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  background: colors.secondary,
                  color: colors.primary,
                  fontWeight: '600'
                }}>
                  {getServiceTypeLabel(worker.serviceType)}
                </span>
              </td>
              <td style={{
                padding: isMobile ? '10px 6px' : '14px 12px',
                border: `1px solid ${colors.border}`,
                textAlign: 'left',
                fontSize: isMobile ? '11px' : '14px',
                background: colors.white,
                verticalAlign: 'top'
              }}>{formatDate(worker.createdAt)}</td>
              <td style={{
                padding: isMobile ? '10px 6px' : '14px 12px',
                border: `1px solid ${colors.border}`,
                textAlign: 'left',
                fontSize: isMobile ? '11px' : '14px',
                background: colors.white,
                verticalAlign: 'top'
              }}>
                <div style={{ display: 'flex', gap: '5px' }}>
                  <button
                    onClick={() => handleViewDetails(worker)}
                    style={{
                      width: '32px',
                      height: '32px',
                      padding: '6px',
                      background: colors.info,
                      color: colors.white,
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title="View Details"
                    type="button"
                  >
                    <FaEye />
                  </button>
                  <button
                    onClick={() => handleEdit(worker)}
                    style={{
                      width: '32px',
                      height: '32px',
                      padding: '6px',
                      background: colors.success,
                      color: colors.white,
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title="Edit"
                    type="button"
                  >
                    <FaEdit />
                  </button>
                  <button
                    onClick={() => handleDelete(worker._id)}
                    style={{
                      width: '32px',
                      height: '32px',
                      padding: '6px',
                      background: colors.danger,
                      color: colors.white,
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title="Delete"
                    type="button"
                  >
                    <FaTrash />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

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
       
        <button
          onClick={() => {
            if (!showForm) {
              resetForm();
              setEditingWorker(null);
            }
            setShowForm(!showForm);
          }}
          style={{
            padding: isMobile ? '8px 12px' : '10px 20px',
            background: colors.secondary,
            color: colors.primary,
            border: 'none',
            borderRadius: '6px',
            fontSize: isMobile ? '12px' : '14px',
            fontWeight: '600',
            cursor: 'pointer'
          }}
          type="button"
        >
          {showForm ? 'Hide Form' : 'Add New Worker'}
        </button>
      </div>

      {showForm && (
        <WorkerForm
          formData={formData}
          errors={errors}
          formLoading={formLoading}
          editingWorker={editingWorker}
          isMobile={isMobile}
          colors={colors}
          serviceTypes={serviceTypes}
          onInputChange={handleInputChange}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: colors.textLight }}>
          Loading workers...
        </div>
      ) : workers.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '40px', 
          color: colors.textLight,
          background: colors.background,
          borderRadius: '8px',
          border: `1px solid ${colors.border}`
        }}>
          No workers found. Add your first worker.
        </div>
      ) : (
        <WorkerTable />
      )}

      {showModal && modalData && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(1, 81, 186, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(5px)'
        }} onClick={() => setShowModal(false)}>
          <div style={{
            background: colors.white,
            borderRadius: '15px',
            width: isMobile ? '90%' : '600px',
            maxHeight: '90vh',
            overflowY: 'auto',
            animation: 'modalSlideIn 0.3s ease'
          }} onClick={e => e.stopPropagation()}>
            <style>
              {`
                @keyframes modalSlideIn {
                  from {
                    opacity: 0;
                    transform: translateY(-20px);
                  }
                  to {
                    opacity: 1;
                    transform: translateY(0);
                  }
                }
              `}
            </style>
            
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '25px 30px',
              borderBottom: `1px solid ${colors.border}`
            }}>
              <h2 style={{ color: colors.primary, fontSize: '20px', fontWeight: '600', margin: 0 }}>
                Worker Details
              </h2>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '20px',
                  color: colors.textLight,
                  cursor: 'pointer',
                  transition: 'color 0.2s ease'
                }}
                type="button"
              >
                <FaTimes />
              </button>
            </div>

            <div style={{ padding: '30px' }}>
              <div style={{ marginBottom: '30px' }}>
                <div style={{ marginBottom: '20px', paddingBottom: '10px', borderBottom: `1px solid ${colors.border}` }}>
                  <h3 style={{ color: colors.primary, fontSize: '18px', fontWeight: '600', margin: 0 }}>
                    Personal Information
                  </h3>
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(250px, 1fr))',
                  gap: '20px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '15px' }}>
                    <FaUserTie style={{ color: colors.primary, fontSize: '20px', marginTop: '5px', flexShrink: 0 }} />
                    <div>
                      <label style={{ display: 'block', color: colors.textLight, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px' }}>
                        Worker Name
                      </label>
                      <p style={{ color: colors.text, fontSize: '16px', fontWeight: '500', margin: 0 }}>
                        {modalData.workerName}
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '15px' }}>
                    <FaPhone style={{ color: colors.primary, fontSize: '20px', marginTop: '5px', flexShrink: 0 }} />
                    <div>
                      <label style={{ display: 'block', color: colors.textLight, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px' }}>
                        Contact Number
                      </label>
                      <p style={{ color: colors.text, fontSize: '16px', fontWeight: '500', margin: 0 }}>
                        {modalData.contactNumber}
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '15px' }}>
                    <FaIdCard style={{ color: colors.primary, fontSize: '20px', marginTop: '5px', flexShrink: 0 }} />
                    <div>
                      <label style={{ display: 'block', color: colors.textLight, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px' }}>
                        Aadhar Number
                      </label>
                      <p style={{ color: colors.text, fontSize: '16px', fontWeight: '500', margin: 0 }}>
                        {modalData.aadharNumber}
                      </p>
                    </div>
                  </div>

                  {modalData.email && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '15px' }}>
                      <FaEnvelope style={{ color: colors.primary, fontSize: '20px', marginTop: '5px', flexShrink: 0 }} />
                      <div>
                        <label style={{ display: 'block', color: colors.textLight, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px' }}>
                          Email
                        </label>
                        <p style={{ color: colors.text, fontSize: '16px', fontWeight: '500', margin: 0 }}>
                          {modalData.email}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ marginBottom: '30px' }}>
                <div style={{ marginBottom: '20px', paddingBottom: '10px', borderBottom: `1px solid ${colors.border}` }}>
                  <h3 style={{ color: colors.primary, fontSize: '18px', fontWeight: '600', margin: 0 }}>
                    Service Information
                  </h3>
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(250px, 1fr))',
                  gap: '20px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '15px' }}>
                    <div style={{ color: colors.primary, fontSize: '20px', marginTop: '5px', flexShrink: 0 }}>
                      <FaCheckCircle />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: colors.textLight, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px' }}>
                        Service Type
                      </label>
                      <p style={{ 
                        color: colors.text, 
                        fontSize: '16px', 
                        fontWeight: '500', 
                        margin: 0,
                        padding: '4px 8px',
                        borderRadius: '20px',
                        background: colors.secondary,
                        display: 'inline-block'
                      }}>
                        {getServiceTypeLabel(modalData.serviceType)}
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '15px' }}>
                    <FaMapMarkerAlt style={{ color: colors.primary, fontSize: '20px', marginTop: '5px', flexShrink: 0 }} />
                    <div>
                      <label style={{ display: 'block', color: colors.textLight, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px' }}>
                        Address
                      </label>
                      <p style={{ color: colors.text, fontSize: '14px', lineHeight: '1.5', margin: 0 }}>
                        {modalData.address}
                      </p>
                    </div>
                  </div>

                  {modalData.serviceType === 'mobile-vans' && modalData.vehicleDetails && (
                    <>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '15px' }}>
                        <FaCar style={{ color: colors.primary, fontSize: '20px', marginTop: '5px', flexShrink: 0 }} />
                        <div>
                          <label style={{ display: 'block', color: colors.textLight, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px' }}>
                            Vehicle Number
                          </label>
                          <p style={{ color: colors.text, fontSize: '16px', fontWeight: '500', margin: 0 }}>
                            {modalData.vehicleDetails.vehicleNumber}
                          </p>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '15px' }}>
                        <FaUserTie style={{ color: colors.primary, fontSize: '20px', marginTop: '5px', flexShrink: 0 }} />
                        <div>
                          <label style={{ display: 'block', color: colors.textLight, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px' }}>
                            Supplier Name
                          </label>
                          <p style={{ color: colors.text, fontSize: '16px', fontWeight: '500', margin: 0 }}>
                            {modalData.vehicleDetails.supplierName}
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div>
                <div style={{ marginBottom: '20px', paddingBottom: '10px', borderBottom: `1px solid ${colors.border}` }}>
                  <h3 style={{ color: colors.primary, fontSize: '18px', fontWeight: '600', margin: 0 }}>
                    Timestamps
                  </h3>
                </div>
                <div style={{ background: colors.background, padding: '20px', borderRadius: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <label style={{ color: colors.textLight, fontSize: '14px' }}>Created On:</label>
                    <span style={{ color: colors.text, fontSize: '14px', fontWeight: '500' }}>
                      {modalData.createdAt ? new Date(modalData.createdAt).toLocaleDateString('en-IN', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      }) : 'N/A'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <label style={{ color: colors.textLight, fontSize: '14px' }}>Last Updated:</label>
                    <span style={{ color: colors.text, fontSize: '14px', fontWeight: '500' }}>
                      {modalData.updatedAt ? new Date(modalData.updatedAt).toLocaleDateString('en-IN', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      }) : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ padding: '20px 30px', borderTop: `1px solid ${colors.border}`, textAlign: 'right' }}>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  padding: '10px 20px',
                  background: colors.primary,
                  color: colors.white,
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
                type="button"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Workerdetails;