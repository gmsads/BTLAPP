import React, { useState, useEffect } from 'react';
import axios from '../utils/api'; 
import Select from 'react-select';

const AddService = ({ onSuccess, userRole, currentUser }) => {
  const [formData, setFormData] = useState({
    businessName: '',
    ownerName: '',
    description: '',
    contactNumber: '',
    startDate: '',
    endDate: ''
  });
  
  // Services array with location for each service
  const [services, setServices] = useState([
    { 
      serviceType: 'pole-boards', 
      quantity: 1, 
      customServiceType: '',
      location: { address: '' } // Location for this specific service
    }
  ]);
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [serviceTypes, setServiceTypes] = useState([]);
  const [businessOptions, setBusinessOptions] = useState([]);
  const [selectedBusiness, setSelectedBusiness] = useState(null);
  const [isLoadingBusinesses, setIsLoadingBusinesses] = useState(false);

  // Fetch service types and business users on component mount
  useEffect(() => {
    fetchServiceTypes();
    fetchBusinessUsers();
    
    // Set today's date as default start date (optional - can remove this if you want)
    const today = new Date().toISOString().split('T')[0];
    setFormData(prev => ({
      ...prev,
      startDate: today
    }));
  }, []);

  const fetchServiceTypes = () => {
    const types = [
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
    setServiceTypes(types);
  };

  const fetchBusinessUsers = async () => {
    try {
      setIsLoadingBusinesses(true);
      const isOwner = userRole === 'owner' || currentUser?.role === 'owner';
      let response;
      try {
        const endpoint = isOwner ? '/owner/business-users' : '/auth/business-users';
        response = await axios.get(endpoint);
      } catch (err) {
        if (err.response?.status === 404 && isOwner) {
          response = await axios.get('/auth/business-users');
        } else {
          throw err;
        }
      }
      
      if (response.data.success) {
        const users = response.data.users;
        
        const options = users.map(user => ({
          value: user._id,
          label: user.businessName,
          userData: {
            id: user._id,
            businessName: user.businessName,
            ownerName: user.username || user.ownerName || '',
            contactNumber: user.contactNumber || '',
            email: user.email || ''
          }
        }));
        
        options.sort((a, b) => a.label.localeCompare(b.label));
        setBusinessOptions(options);
      } else {
        setMessage('Failed to load business list');
      }
    } catch (error) {
      console.error('Error fetching business users:', error);
      setMessage('Error loading business list: ' + error.message);
    } finally {
      setIsLoadingBusinesses(false);
    }
  };

  // Handle window resize for mobile detection
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Check if any service type requires end date
  const requiresEndDate = () => {
    const typesRequiringEndDate = ['mobile-vans', 'look-walkers', 'try-cycle', 'auto-booming', 'auto-stickers', 'auto-tops', 'rounds', 'digital-wall-poster', 'other'];
    return services.some(service => typesRequiringEndDate.includes(service.serviceType));
  };

 // Calculate total days - CORRECTED
const calculateDays = () => {
  if (!formData.startDate || !formData.endDate) return 0;
  
  const start = new Date(formData.startDate);
  const end = new Date(formData.endDate);
  
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  
  const diffTime = end - start;
  // This gives the correct number of days (July 15 to Aug 14 = 30 days)
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  // If same date, return 1
  if (diffDays === 0) return 1;
  
  return diffDays;
};

  // Handle business selection from dropdown
  const handleBusinessSelect = (selectedOption) => {
    setSelectedBusiness(selectedOption);
    
    if (selectedOption) {
      const { userData } = selectedOption;
      setFormData(prev => ({
        ...prev,
        businessName: userData.businessName,
        ownerName: userData.ownerName || userData.businessName,
        contactNumber: userData.contactNumber || ''
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        businessName: '',
        ownerName: '',
        contactNumber: ''
      }));
    }
  };

  // Handle manual input for business name
  const handleBusinessNameChange = (e) => {
    const value = e.target.value;
    setFormData(prev => ({
      ...prev,
      businessName: value
    }));
    
    if (selectedBusiness && value !== selectedBusiness.label) {
      setSelectedBusiness(null);
    }
  };

  // Handle form field changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Handle service changes
  const handleServiceChange = (index, field, value) => {
    const updatedServices = [...services];
    updatedServices[index] = {
      ...updatedServices[index],
      [field]: value
    };
    setServices(updatedServices);
  };

  // Handle service location change
  const handleServiceLocationChange = (index, value) => {
    const updatedServices = [...services];
    updatedServices[index] = {
      ...updatedServices[index],
      location: { address: value }
    };
    setServices(updatedServices);
  };

  // Add new service row with location
  const addService = () => {
    setServices([...services, { 
      serviceType: 'pole-boards', 
      quantity: 1, 
      customServiceType: '',
      location: { address: '' }
    }]);
  };

  // Remove service row
  const removeService = (index) => {
    if (services.length > 1) {
      const updatedServices = services.filter((_, i) => i !== index);
      setServices(updatedServices);
    }
  };

  // Calculate total quantity
  const calculateTotalQuantity = () => {
    return services.reduce((total, service) => total + (parseInt(service.quantity) || 0), 0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    // Validate required fields
    if (!formData.businessName.trim()) {
      setMessage('Business name is required');
      setLoading(false);
      return;
    }

    if (!formData.ownerName.trim()) {
      setMessage('Owner name is required');
      setLoading(false);
      return;
    }

    if (!formData.contactNumber.trim()) {
      setMessage('Contact number is required');
      setLoading(false);
      return;
    }

    // Validate services with locations
    const validServices = services.filter(service => 
      service.serviceType && service.quantity > 0 && service.location && service.location.address.trim()
    );
    
    if (validServices.length === 0) {
      setMessage('At least one service type with quantity and location is required');
      setLoading(false);
      return;
    }

    // Validate dates
    if (!formData.startDate) {
      setMessage('Start date is required');
      setLoading(false);
      return;
    }

    if (requiresEndDate() && !formData.endDate) {
      setMessage('End date is required for selected service types');
      setLoading(false);
      return;
    }

    // Check if end date is after start date
    if (formData.endDate && formData.startDate) {
      const startDate = new Date(formData.startDate);
      const endDate = new Date(formData.endDate);
      
      if (endDate <= startDate) {
        setMessage('End date must be after start date');
        setLoading(false);
        return;
      }
    }

    try {
      // Prepare data for backend with location per service
      const submitData = {
        businessName: formData.businessName,
        ownerName: formData.ownerName,
        description: formData.description,
        contactNumber: formData.contactNumber,
        services: validServices.map(service => ({
          serviceType: service.serviceType,
          quantity: parseInt(service.quantity),
          customServiceType: service.serviceType === 'other' ? service.customServiceType : undefined,
          location: {
            type: 'manual',
            address: service.location.address.trim()
          }
        })),
        totalQuantity: calculateTotalQuantity(),
        startDate: formData.startDate,
        endDate: formData.endDate
      };

      // Add selected business user ID if available
      if (selectedBusiness && selectedBusiness.value) {
        submitData.clientId = selectedBusiness.value;
      }

      console.log('Submitting service data with locations:', JSON.stringify(submitData, null, 2));

      const response = await axios.post('/services', submitData);
      
      if (response.data.success) {
        setMessage('Service added successfully!');
        // Reset form
        setFormData({
          businessName: '',
          ownerName: '',
          description: '',
          contactNumber: '',
          startDate: new Date().toISOString().split('T')[0],
          endDate: ''
        });
        setServices([{ 
          serviceType: 'pole-boards', 
          quantity: 1, 
          customServiceType: '',
          location: { address: '' }
        }]);
        setSelectedBusiness(null);
        
        setTimeout(() => {
          onSuccess();
        }, 1500);
      }
    } catch (error) {
      console.error('Error adding service:', error);
      
      if (error.response?.data?.message) {
        setMessage(`Error: ${error.response.data.message}`);
      } else if (error.message) {
        setMessage('Error adding service: ' + error.message);
      } else {
        setMessage('Error adding service. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Format service type for display
  const formatServiceType = (type) => {
    return type
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Blue/Yellow theme colors
  const colors = {
    primary: '#0151ba', // Blue
    white: '#ffffff', // White
    secondary: '#f2c43b', // Yellow
    background: '#f8fafd'
  };

  // Styles
  const containerStyle = {
    background: 'white',
    padding: isMobile ? '16px' : '30px',
    borderRadius: '12px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    width: '100%',
    maxWidth: '800px',
    margin: '0 auto',
    boxSizing: 'border-box'
  };

  const inputStyle = {
    width: '100%',
    padding: isMobile ? '12px 10px' : '10px 12px',
    margin: '4px 0',
    border: '2px solid #e1e5e9',
    borderRadius: '6px',
    fontSize: isMobile ? '14px' : '15px',
    outline: 'none',
    transition: 'border-color 0.3s',
    boxSizing: 'border-box',
    minHeight: '40px'
  };

  const serviceRowStyle = {
    display: 'grid',
    gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr auto',
    gap: '10px',
    alignItems: 'start',
    marginBottom: '10px',
    padding: '15px',
    background: '#f8fafd',
    borderRadius: '6px',
    border: '1px solid #e9ecef'
  };

  const serviceSectionStyle = {
    gridColumn: isMobile ? 'span 1' : 'span 2',
    display: 'grid',
    gridTemplateColumns: isMobile ? '1fr 1fr' : '2fr 1fr',
    gap: '10px',
    marginBottom: '10px'
  };

  const locationSectionStyle = {
    gridColumn: isMobile ? 'span 1' : 'span 1',
    background: '#f8fafd',
    padding: '10px',
    borderRadius: '6px',
    border: '1px solid #0151ba'
  };

  const buttonStyle = {
    width: '100%',
    padding: isMobile ? '14px' : '12px',
    background: '#0151ba',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: isMobile ? '16px' : '16px',
    cursor: 'pointer',
    marginTop: '15px',
    transition: 'opacity 0.3s',
    fontWeight: '600',
    minHeight: '44px'
  };

  const sectionStyle = {
    marginBottom: isMobile ? '20px' : '25px',
    paddingBottom: isMobile ? '16px' : '20px',
    borderBottom: '1px solid #e1e5e9'
  };

  const sectionTitleStyle = {
    color: '#333',
    marginBottom: isMobile ? '12px' : '15px',
    fontSize: isMobile ? '16px' : '18px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  };

  const labelStyle = {
    fontWeight: '600',
    marginBottom: isMobile ? '4px' : '5px',
    display: 'block',
    fontSize: isMobile ? '14px' : '15px',
    color: '#333'
  };

  const messageStyle = {
    padding: isMobile ? '12px' : '12px',
    borderRadius: '8px',
    marginBottom: isMobile ? '16px' : '20px',
    background: message.includes('success') ? '#d4edda' : '#f8d7da',
    color: message.includes('success') ? '#155724' : '#721c24',
    border: `1px solid ${message.includes('success') ? '#c3e6cb' : '#f5c6cb'}`,
    fontSize: isMobile ? '14px' : '15px',
    fontWeight: '500'
  };

  const addButtonStyle = {
    background: '#0151ba',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    padding: '8px 15px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    marginTop: '10px'
  };

  const removeButtonStyle = {
    background: '#f44336',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    padding: '8px 12px',
    cursor: 'pointer',
    fontSize: '14px',
    minWidth: '40px',
    height: '40px'
  };

  const totalQuantityStyle = {
    padding: '8px 12px',
    background: '#f8fafd',
    borderRadius: '6px',
    border: '1px solid #0151ba',
    fontSize: '14px',
    fontWeight: '600',
    color: '#0151ba',
    marginTop: '10px',
    textAlign: 'center'
  };

  const locationTitleStyle = {
    fontSize: isMobile ? '12px' : '13px',
    fontWeight: '600',
    color: '#0151ba',
    marginBottom: '5px',
    display: 'flex',
    alignItems: 'center',
    gap: '5px'
  };

  return (
    <div style={containerStyle}>
      <h2 style={{ 
        color: '#0151ba', 
        marginBottom: isMobile ? '20px' : '25px', 
        textAlign: 'center',
        fontSize: isMobile ? '20px' : '24px',
        fontWeight: '700'
      }}>
        Add New Service
      </h2>

      {message && (
        <div style={messageStyle}>
          {message}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Business Information Section */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>
            <span>🏢</span>
            Business Information
          </div>
          
          <div>
            <label style={labelStyle}>
              Business Name *
            </label>
            
            {/* Business Name Dropdown */}
            <div style={{ marginBottom: '10px' }}>
              <Select
                value={selectedBusiness}
                onChange={handleBusinessSelect}
                options={businessOptions}
                isLoading={isLoadingBusinesses}
                placeholder="Search or select a business..."
                isClearable
                styles={{
                  control: (base) => ({
                    ...base,
                    minHeight: '40px',
                    border: '2px solid #e1e5e9',
                    borderRadius: '6px',
                    boxShadow: 'none',
                    '&:hover': { borderColor: '#667eea' }
                  })
                }}
                noOptionsMessage={() => "No businesses found"}
                loadingMessage={() => "Loading businesses..."}
              />
              
              <div style={{ 
                textAlign: 'center', 
                margin: '10px 0', 
                color: '#666',
                fontSize: '14px'
              }}>
                OR
              </div>
            </div>
            
            {/* Manual Business Name Input */}
            <div>
              <label style={{...labelStyle, fontSize: '13px'}}>
                Or enter business name manually:
              </label>
              <input
                type="text"
                name="businessName"
                value={formData.businessName}
                onChange={handleBusinessNameChange}
                style={inputStyle}
                placeholder="Enter business name"
              />
            </div>
          </div>
          
          <div>
            <label style={labelStyle}>
              Owner Name *
            </label>
            <input
              type="text"
              name="ownerName"
              value={formData.ownerName}
              onChange={handleChange}
              required
              style={inputStyle}
              placeholder="Enter owner/Client name"
            />
          </div>

          <div>
            <label style={labelStyle}>
              Contact Number *
            </label>
            <input
              type="tel"
              name="contactNumber"
              value={formData.contactNumber}
              onChange={handleChange}
              required
              style={inputStyle}
              placeholder="Enter contact number"
              inputMode="tel"
            />
          </div>
        </div>

        {/* Services Section - Multiple Services with Locations */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>
            <span>📋</span>
            Services with Locations
            <span style={{ 
              fontSize: '12px', 
              color: '#666', 
              marginLeft: '10px',
              fontWeight: 'normal'
            }}>
              (Each service needs its own location)
            </span>
          </div>

          <div style={{ marginBottom: '15px' }}>
            {services.map((service, index) => (
              <div key={index} style={serviceRowStyle}>
                {/* Service Type and Quantity Section */}
                <div style={serviceSectionStyle}>
                  <div>
                    <div style={labelStyle}>
                      Service Type {index + 1}
                    </div>
                    <select
                      value={service.serviceType}
                      onChange={(e) => handleServiceChange(index, 'serviceType', e.target.value)}
                      style={{ ...inputStyle, margin: 0 }}
                    >
                      {serviceTypes.map(type => (
                        <option key={type} value={type}>
                          {formatServiceType(type)}
                        </option>
                      ))}
                    </select>
                    
                    {service.serviceType === 'other' && (
                      <input
                        type="text"
                        value={service.customServiceType}
                        onChange={(e) => handleServiceChange(index, 'customServiceType', e.target.value)}
                        style={{ ...inputStyle, marginTop: '5px' }}
                        placeholder="Specify service type"
                        required
                      />
                    )}
                  </div>
                  
                  <div>
                    <label style={labelStyle}>
                      Quantity
                    </label>
                    <input
                      type="number"
                      value={service.quantity}
                      onChange={(e) => handleServiceChange(index, 'quantity', e.target.value)}
                      min="1"
                      style={{ ...inputStyle, margin: 0 }}
                      placeholder="Qty"
                      inputMode="numeric"
                      required
                    />
                  </div>
                </div>

                {/* Location Section for this Service */}
                <div style={locationSectionStyle}>
                  <div style={locationTitleStyle}>
                    <span>📍</span>
                    Location for this Service
                  </div>
                  <input
                    type="text"
                    value={service.location?.address || ''}
                    onChange={(e) => handleServiceLocationChange(index, e.target.value)}
                    style={{ ...inputStyle, margin: 0 }}
                    placeholder={`Enter location for ${service.serviceType === 'other' ? service.customServiceType || 'this service' : formatServiceType(service.serviceType)}`}
                    required
                  />
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                    This location is specific to this service type
                  </div>
                </div>

                {/* Remove Button */}
                <div style={{ alignSelf: 'center' }}>
                  {services.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeService(index)}
                      style={removeButtonStyle}
                      title="Remove service"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
            
            <button
              type="button"
              onClick={addService}
              style={addButtonStyle}
            >
              <span>+</span> Add Another Service with Location
            </button>
            
            <div style={totalQuantityStyle}>
              📊 Total Quantity: {calculateTotalQuantity()} units
            </div>
          </div>

          <div>
            <label style={labelStyle}>
              Description 
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={isMobile ? "3" : "4"}
              style={{
                ...inputStyle,
                resize: 'vertical',
                minHeight: '100px',
                fontFamily: 'inherit'
              }}
              placeholder="Describe the service requirements..."
            />
          </div>
        </div>

        {/* Schedule Section */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>
            <span>📅</span>
            Schedule
          </div>

          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', 
            gap: '15px' 
          }}>
            <div>
              <label style={labelStyle}>
                Start Date *
              </label>
              <input
                type="date"
                name="startDate"
                value={formData.startDate}
                onChange={handleChange}
                required
                style={inputStyle}
                // Removed min attribute to allow any date
              />
            </div>

            {requiresEndDate() && (
              <div>
                <label style={labelStyle}>
                  End Date *
                </label>
                <input
                  type="date"
                  name="endDate"
                  value={formData.endDate}
                  onChange={handleChange}
                  required
                  style={inputStyle}
                  // Removed min attribute to allow any date
                />
              </div>
            )}
          </div>

          {requiresEndDate() && formData.startDate && formData.endDate && (
            <div style={{
              marginTop: '10px',
              padding: '8px 12px',
              background: '#f0f8ff',
              borderRadius: '6px',
              border: '1px solid #d1ecf1',
              fontSize: '14px',
              color: '#0c5460',
              textAlign: 'center'
            }}>
              📅 Service Duration: {calculateDays()} days
              <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                {formData.startDate === new Date().toISOString().split('T')[0] 
                  ? 'Starting from today'
                  : `Starting from ${new Date(formData.startDate).toLocaleDateString()}`
                }
              </div>
            </div>
          )}
        </div>

        <button 
          type="submit" 
          disabled={loading || isLoadingBusinesses}
          style={{
            ...buttonStyle,
            opacity: (loading || isLoadingBusinesses) ? 0.7 : 1
          }}
        >
          {loading ? 'Adding Service...' : '➕ Add Service'}
        </button>
      </form>
    </div>
  );
};

export default AddService;