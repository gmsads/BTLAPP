import React, { useState, useEffect, useRef } from 'react';
import axios from '../utils/api';
import L from 'leaflet';

const HomePage = ({ onLogin }) => {
  const [showLogin, setShowLogin] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [loginFormData, setLoginFormData] = useState({
    contactNumber: '',
    password: ''
  });
  const [registerFormData, setRegisterFormData] = useState({
    username: '',
    contactNumber: '',
    password: '',
    confirmPassword: '',
    email: '',
    role: 'user',
    businessName: '',
    ownerLevel: ''
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isVisible, setIsVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const featuresRef = useRef(null);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const [locations, setLocations] = useState([]);
  const [mapLoading, setMapLoading] = useState(true);

  // Fetch active service locations from backend on mount
  useEffect(() => {
    const fetchLocations = async () => {
      try {
        console.log('📡 Fetching public locations...');
        const response = await axios.get('/services/public-locations');
        console.log('📍 Full API Response:', response.data);
        
        if (response.data.success) {
          const locationData = response.data.locations || [];
          console.log(`✅ Found ${locationData.length} locations`);
          
          // Log each location with its details
          locationData.forEach((loc, index) => {
            console.log(`📍 Location ${index + 1}:`, {
              businessName: loc.businessName,
              serviceType: loc.serviceType,
              address: loc.address,
              quantity: loc.quantity,
              status: loc.status,
              hasCoords: !!loc.coordinates
            });
          });
          
          setLocations(locationData);
        } else {
          console.warn('⚠️ No locations found:', response.data.message);
        }
      } catch (err) {
        console.error('❌ Error fetching public locations:', err.message);
        console.error('Full error:', err);
      }
    };
    fetchLocations();
  }, []);

  // Cleanup map instance on unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Initialize map and handle geocoding & markers
  useEffect(() => {
    if (!mapRef.current) {
      console.log('⏳ Map container not ready yet');
      return;
    }

    console.log('🗺️ Initializing map...');
    console.log('📍 Locations to display:', locations.length);
    
    // Initialize map if not already done
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapRef.current, {
        zoomControl: true,
        scrollWheelZoom: true,
        center: [17.412153, 78.267959],
        zoom: 11
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(mapInstanceRef.current);
      
      console.log('✅ Map initialized');
      setMapLoading(false);
    }

    const map = mapInstanceRef.current;
    
    // Clear existing markers
    markersRef.current.forEach(marker => {
      if (marker && map) {
        map.removeLayer(marker);
      }
    });
    markersRef.current = [];

    if (!locations || locations.length === 0) {
      console.log('ℹ️ No locations to display on map');
      const defaultIcon = L.divIcon({
        html: `<div style="background-color: #0151ba; color: white; border: 2px solid #f2c43b; border-radius: 50%; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; font-size: 16px; box-shadow: 0 4px 10px rgba(0,0,0,0.3);">
          📍
        </div>`,
        className: 'custom-leaflet-icon',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });
      
      const marker = L.marker([17.412153, 78.267959], { icon: defaultIcon })
        .addTo(map)
        .bindPopup('<div style="font-family: Inter, sans-serif; padding: 10px;"><b>📍 Hyderabad</b><br/>No service locations available yet.</div>');
      
      markersRef.current.push(marker);
      return;
    }

    console.log(`📍 Adding ${locations.length} locations to map...`);

    const serviceEmojis = {
      'mobile-vans': '🚐',
      'look-walkers': '🚶',
      'try-cycle': '🚲',
      'auto-booming': '🛺',
      'auto-stickers': '🏷️',
      'auto-tops': '🎪',
      'rounds': '🔄',
      'digital-wall-poster': '🖥️',
      'pole-boards': '💈',
      'no-parking-boards': '🚫',
      'other': '📍'
    };

    const serviceDisplayNames = {
      'mobile-vans': '🚐 Mobile Van',
      'look-walkers': '🚶 Look Walker',
      'try-cycle': '🚲 Try-Cycle',
      'auto-booming': '🛺 Auto Booming',
      'auto-stickers': '🏷️ Auto Stickers',
      'auto-tops': '🎪 Auto Tops',
      'rounds': '🔄 Rounds',
      'digital-wall-poster': '🖥️ Digital Wall Poster',
      'pole-boards': '💈 Pole Board',
      'no-parking-boards': '🚫 No Parking Board',
      'other': '📍 Other Service'
    };

    // Group locations by normalized address text
    const groupedLocations = {};
    locations.forEach((loc, idx) => {
      if (!loc.address) {
        console.warn(`⚠️ Location ${idx} has no address:`, loc);
        return;
      }
      const addressKey = loc.address.toLowerCase().trim();
      if (!groupedLocations[addressKey]) {
        groupedLocations[addressKey] = {
          address: loc.address,
          coordinates: loc.coordinates,
          services: []
        };
      }
      groupedLocations[addressKey].services.push(loc);
    });

    const uniqueAddressGroups = Object.values(groupedLocations);
    console.log(`📊 Grouped into ${uniqueAddressGroups.length} unique locations`);

    const addMarkerToMap = (group, lat, lng) => {
      const firstService = group.services[0];
      const emoji = serviceEmojis[firstService?.serviceType] || '📍';

      const customIcon = L.divIcon({
        html: `<div style="background-color: #0151ba; color: white; border: 2px solid #f2c43b; border-radius: 50%; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; font-size: 18px; box-shadow: 0 4px 10px rgba(0,0,0,0.3);">
          ${emoji}
          ${group.services.length > 1 ? `<span style="position: absolute; top: -5px; right: -5px; background: #ef4444; color: white; border-radius: 50%; width: 16px; height: 16px; font-size: 10px; display: flex; align-items: center; justify-content: center; border: 1px solid white; font-weight: bold;">${group.services.length}</span>` : ''}
        </div>`,
        className: 'custom-leaflet-icon',
        iconSize: [34, 34],
        iconAnchor: [17, 17]
      });

      const marker = L.marker([lat, lng], { icon: customIcon }).addTo(map);
      markersRef.current.push(marker);
      
      // Build popup content - SIMPLIFIED VERSION
      let popupHtml = `
        <div style="font-family: Arial, sans-serif; padding: 8px; min-width: 220px; max-width: 320px;">
          <div style="font-size: 14px; font-weight: bold; color: #0151ba; border-bottom: 2px solid #0151ba; padding-bottom: 6px; margin-bottom: 8px;">
            📍 ${group.address}
            <span style="background: #0151ba; color: white; padding: 0 8px; border-radius: 12px; font-size: 10px; margin-left: 6px;">
              ${group.services.length}
            </span>
          </div>
      `;

      group.services.forEach((item) => {
        const serviceType = item.serviceType || 'other';
        const displayName = serviceDisplayNames[serviceType] || serviceType;
        const quantity = item.quantity || 0;
        const businessName = item.businessName || 'Unknown';
        const status = item.status || 'pending';
        const statusColor = status === 'completed' ? '#10b981' : 
                           status === 'active' ? '#f59e0b' : '#6b7280';

        popupHtml += `
          <div style="background: #f3f4f6; border-radius: 6px; padding: 6px 8px; margin-bottom: 4px; border-left: 3px solid #0151ba;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-weight: bold; font-size: 12px; color: #0151ba;">${displayName}</span>
              <span style="background: #e6f7ff; color: #0151ba; padding: 0 8px; border-radius: 10px; font-size: 10px; font-weight: bold;">Qty: ${quantity}</span>
            </div>
            <div style="font-size: 11px; color: #333; margin-top: 2px;">Client: ${businessName}</div>
            <div style="font-size: 10px; color: #666; margin-top: 2px;">
              Status: <span style="background: ${statusColor}; color: white; padding: 0 6px; border-radius: 8px; font-size: 9px; font-weight: bold;">${status.toUpperCase()}</span>
            </div>
          </div>
        `;
      });

      popupHtml += `</div>`;

      // Bind popup with the HTML
      marker.bindPopup(popupHtml, {
        maxWidth: 350,
        minWidth: 240
      });
      
      console.log(`✅ Added marker for: ${group.address} with ${group.services.length} services`);
    };

    const geocodeAndAddMarker = async (group) => {
      try {
        let lat = null;
        let lng = null;

        // First check if any service in the group has saved coordinates
        const coordItem = group.services.find(s => s.coordinates && s.coordinates.lat && s.coordinates.lng);
        if (coordItem && coordItem.coordinates) {
          lat = coordItem.coordinates.lat;
          lng = coordItem.coordinates.lng;
          console.log(`📍 Using saved coordinates for: ${group.address}`);
        } else {
        const tryGeocode = async (addressStr) => {
  if (!addressStr || addressStr.trim().length < 3) return null;
  try {
    const response = await axios.get('/geocode/search', {
      params: { q: addressStr }
    });
    
    if (response.data.success && response.data.data && response.data.data.length > 0) {
      const data = response.data.data[0];
      return { lat: parseFloat(data.lat), lng: parseFloat(data.lon) };
    }
  } catch (e) {
    console.warn(`Failed geocoding: ${addressStr}`, e);
  }
  return null;
};

          let result = await tryGeocode(group.address);
          
          if (!result && group.address && group.address.includes(',')) {
            const segments = group.address.split(',').map(s => s.trim()).filter(Boolean);
            for (const segment of segments) {
              result = await tryGeocode(segment);
              if (result) break;
            }
          }

          if (!result && group.address) {
            const firstWord = group.address.trim().split(/[\s,]+/)[0];
            if (firstWord && firstWord.length > 2) {
              result = await tryGeocode(firstWord);
            }
          }

          if (result) {
            lat = result.lat;
            lng = result.lng;
          }
        }

        if (lat !== null && lng !== null) {
          addMarkerToMap(group, lat, lng);
        } else {
          console.warn(`⚠️ Could not geocode: ${group.address}`);
        }
      } catch (err) {
        console.warn('Geocoding error:', err);
      }
    };

    const addMarkersWithDelay = async () => {
      let markersAdded = 0;
      
      for (let i = 0; i < uniqueAddressGroups.length; i++) {
        const group = uniqueAddressGroups[i];
        await geocodeAndAddMarker(group);
        markersAdded++;
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      console.log(`✅ Added ${markersAdded} markers to map`);
    };

    addMarkersWithDelay();

  }, [locations]);

  // Check mobile screen on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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

  // Real images with mobile-optimized versions
  const slides = [
    {
      image: 'https://images.unsplash.com/photo-1552664730-d307ca884978?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
      mobileImage: 'https://images.unsplash.com/photo-1552664730-d307ca884978?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
      title: 'Real-time Monitoring',
      description: 'Track service progress with live updates and comprehensive dashboards'
    },
    {
      image: 'https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
      mobileImage: 'https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
      title: 'Advanced Analytics',
      description: 'Gain insights with powerful data visualization and reporting tools'
    },
    {
      image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
      mobileImage: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
      title: 'Team Collaboration',
      description: 'Seamlessly coordinate with your team across multiple projects'
    }
  ];

  // Features data
  const features = [
    {
      image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80',
      title: 'Real-time Monitoring',
      description: 'Track service progress with live updates and comprehensive dashboards for better decision making.'
    },
    {
      image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80',
      title: 'Image Management',
      description: 'Upload, organize, and track images with automatic progress calculation and status updates.'
    },
    {
      image: 'https://images.unsplash.com/photo-1552664730-d307ca884978?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80',
      title: 'Performance Tracking',
      description: 'Monitor key metrics and performance indicators with detailed analytics and reports.'
    }
  ];

  // Auto slide every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [slides.length]);

  // Intersection Observer for scroll animations
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.1 }
    );

    if (featuresRef.current) {
      observer.observe(featuresRef.current);
    }

    return () => {
      if (featuresRef.current) {
        observer.unobserve(featuresRef.current);
      }
    };
  }, []);

  const handleLoginChange = (e) => {
    setLoginFormData({
      ...loginFormData,
      [e.target.name]: e.target.value
    });
  };

  const handleRegisterChange = (e) => {
    setRegisterFormData({
      ...registerFormData,
      [e.target.name]: e.target.value
    });
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    const mobileRegex = /^[0-9]{10,15}$/;
    if (!mobileRegex.test(loginFormData.contactNumber)) {
      setMessage('Please enter a valid mobile number (10 digits)');
      setLoading(false);
      return;
    }

    try {
      const response = await axios.post('/auth/login', {
        contactNumber: loginFormData.contactNumber,
        password: loginFormData.password
      });
      
      if (response.data.success) {
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        setMessage('Login successful!');
        setTimeout(() => {
          onLogin(response.data.user);
          setShowLogin(false);
          setLoginFormData({ contactNumber: '', password: '' });
        }, 1000);
      }
    } catch (error) {
      setMessage(
        error.response?.data?.message || 'Error during login'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    if (registerFormData.password !== registerFormData.confirmPassword) {
      setMessage('Passwords do not match');
      setLoading(false);
      return;
    }

    const mobileRegex = /^[0-9]{10,15}$/;
    if (!mobileRegex.test(registerFormData.contactNumber)) {
      setMessage('Please enter a valid mobile number (10 digits)');
      setLoading(false);
      return;
    }

    if (registerFormData.password.length < 6) {
      setMessage('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    if (registerFormData.role === 'client' && !registerFormData.businessName.trim()) {
      setMessage('Business name is required for client registration');
      setLoading(false);
      return;
    }

    if (registerFormData.role === 'owner' && !registerFormData.ownerLevel) {
      setMessage('Owner level is required for owner registration');
      setLoading(false);
      return;
    }

    if (registerFormData.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(registerFormData.email)) {
        setMessage('Please enter a valid email address');
        setLoading(false);
        return;
      }
    }

    try {
      const response = await axios.post('/auth/register', {
        username: registerFormData.username,
        contactNumber: registerFormData.contactNumber,
        password: registerFormData.password,
        email: registerFormData.email || undefined,
        role: registerFormData.role,
        businessName: registerFormData.role === 'client' ? registerFormData.businessName : undefined,
        ownerLevel: registerFormData.role === 'owner' ? registerFormData.ownerLevel : undefined
      });
      
      if (response.data.success) {
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        setMessage('Registration successful! Please login.');
        
        setTimeout(() => {
          setShowRegister(false);
          setShowLogin(true);
          setRegisterFormData({
            username: '',
            contactNumber: '',
            password: '',
            confirmPassword: '',
            email: '',
            role: 'user',
            businessName: '',
            ownerLevel: ''
          });
        }, 2000);
      }
    } catch (error) {
      setMessage(
        error.response?.data?.message || 'Error during registration'
      );
    } finally {
      setLoading(false);
    }
  };

  const switchToLogin = () => {
    setShowRegister(false);
    setShowLogin(true);
    setMessage('');
  };

  const switchToRegister = () => {
    setShowLogin(false);
    setShowRegister(true);
    setMessage('');
  };

  // Responsive Styles
  const containerStyle = {
    minHeight: '100vh',
    background: `linear-gradient(135deg, ${colors.background} 0%, ${colors.white} 100%)`,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    overflowX: 'hidden'
  };

  const headerStyle = {
    background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`,
    padding: isMobile ? '15px 20px' : '20px 40px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    boxShadow: '0 4px 20px rgba(1, 81, 186, 0.3)',
    position: 'fixed',
    width: '100%',
    top: 0,
    zIndex: 1000,
    backdropFilter: 'blur(10px)'
  };

  const logoStyle = {
    color: colors.white,
    fontSize: isMobile ? '20px' : '28px',
    fontWeight: '800',
    display: 'flex',
    alignItems: 'center',
    gap: isMobile ? '8px' : '12px',
    letterSpacing: '-0.5px'
  };

  const authButtonsStyle = {
    display: 'flex',
    gap: isMobile ? '10px' : '20px',
    alignItems: 'center'
  };

  const registerButtonStyle = {
    padding: isMobile ? '8px 15px' : '10px 25px',
    background: 'transparent',
    color: colors.white,
    border: `2px solid ${colors.secondary}`,
    borderRadius: '25px',
    fontSize: isMobile ? '13px' : '15px',
    cursor: 'pointer',
    fontWeight: '600',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    whiteSpace: 'nowrap'
  };

  const loginButtonStyle = {
    padding: isMobile ? '10px 20px' : '12px 32px',
    background: `linear-gradient(135deg, ${colors.secondary} 0%, ${colors.secondaryDark} 100%)`,
    color: colors.primaryDark,
    border: 'none',
    borderRadius: '25px',
    fontSize: isMobile ? '14px' : '16px',
    cursor: 'pointer',
    fontWeight: '700',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    boxShadow: '0 4px 15px rgba(198, 170, 88, 0.3)',
    whiteSpace: 'nowrap'
  };

  // Carousel Styles
  const carouselContainerStyle = {
    position: 'relative',
    height: isMobile ? '400px' : '600px',
    overflow: 'hidden',
    background: colors.primaryDark,
    marginTop: isMobile ? '70px' : '80px'
  };

  const carouselSlideStyle = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    opacity: 0,
    transform: 'scale(1.1)',
    transition: 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundImage: `linear-gradient(rgba(1, 81, 186, 0.3), rgba(1, 81, 186, 0.5))`
  };

  const activeSlideStyle = {
    ...carouselSlideStyle,
    opacity: 1,
    transform: 'scale(1)'
  };

  const slideContentStyle = {
    textAlign: 'center',
    color: colors.white,
    background: 'rgba(1, 81, 186, 0.85)',
    padding: isMobile ? '30px 20px' : '50px',
    borderRadius: isMobile ? '15px' : '20px',
    maxWidth: isMobile ? '90%' : '700px',
    backdropFilter: 'blur(15px)',
    border: `1px solid rgba(198, 170, 88, 0.3)`,
    transform: 'translateY(50px)',
    opacity: 0,
    animation: 'slideUpFadeIn 0.8s ease-out 0.5s forwards'
  };

  const slideTitleStyle = {
    fontSize: isMobile ? '32px' : '52px',
    fontWeight: '800',
    marginBottom: isMobile ? '15px' : '20px',
    color: colors.secondaryLight,
    letterSpacing: '-1px',
    lineHeight: '1.1'
  };

  const slideDescriptionStyle = {
    fontSize: isMobile ? '16px' : '22px',
    marginBottom: '0',
    lineHeight: '1.6',
    fontWeight: '400',
    opacity: 0.9
  };

  const dotsContainerStyle = {
    position: 'absolute',
    bottom: isMobile ? '20px' : '30px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: isMobile ? '8px' : '12px',
    zIndex: 10
  };

  const dotStyle = {
    width: isMobile ? '10px' : '14px',
    height: isMobile ? '10px' : '14px',
    borderRadius: '50%',
    background: 'rgba(255, 255, 255, 0.4)',
    cursor: 'pointer',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    border: `2px solid transparent`
  };

  const activeDotStyle = {
    ...dotStyle,
    background: colors.secondaryLight,
    transform: 'scale(1.3)',
    borderColor: colors.white
  };

  // Features Section
  const featuresSectionStyle = {
    padding: isMobile ? '60px 20px' : '100px 40px',
    background: `linear-gradient(135deg, ${colors.white} 0%, ${colors.background} 100%)`,
    position: 'relative',
    overflow: 'hidden'
  };

  const sectionTitleStyle = {
    textAlign: 'center',
    fontSize: isMobile ? '32px' : '48px',
    fontWeight: '800',
    color: colors.primary,
    marginBottom: isMobile ? '40px' : '80px',
    letterSpacing: '-1px',
    opacity: isVisible ? 1 : 0,
    transform: isVisible ? 'translateY(0)' : 'translateY(30px)',
    transition: 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
    lineHeight: '1.2'
  };

  const featuresGridStyle = {
    display: 'grid',
    gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(350px, 1fr))',
    gap: isMobile ? '30px' : '50px',
    maxWidth: '1200px',
    margin: '0 auto'
  };

  const featureCardStyle = {
    background: colors.white,
    padding: '0',
    borderRadius: '20px',
    textAlign: 'center',
    border: `1px solid ${colors.border}`,
    transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
    overflow: 'hidden',
    boxShadow: '0 8px 30px rgba(1, 81, 186, 0.08)',
    opacity: isVisible ? 1 : 0,
    transform: isVisible ? 'translateY(0)' : 'translateY(50px)'
  };

  const featureImageStyle = {
    width: '100%',
    height: isMobile ? '180px' : '220px',
    objectFit: 'cover',
    transition: 'transform 0.4s ease'
  };

  const featureContentStyle = {
    padding: isMobile ? '25px 20px' : '35px 30px'
  };

  const featureTitleStyle = {
    fontSize: isMobile ? '22px' : '26px',
    fontWeight: '700',
    color: colors.primary,
    marginBottom: isMobile ? '12px' : '18px',
    letterSpacing: '-0.5px'
  };

  const featureDescriptionStyle = {
    fontSize: isMobile ? '14px' : '16px',
    color: colors.text,
    lineHeight: '1.7',
    fontWeight: '400'
  };

  // Modal Styles
  const modalOverlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
    padding: isMobile ? '10px' : '20px',
    backdropFilter: 'blur(8px)'
  };

  const modalContentStyle = {
    background: `linear-gradient(135deg, ${colors.white} 0%, ${colors.background} 100%)`,
    padding: isMobile ? '30px 20px' : '50px 40px',
    borderRadius: '25px',
    boxShadow: '0 25px 50px rgba(0,0,0,0.2)',
    width: '100%',
    maxWidth: isMobile ? '95%' : '450px',
    textAlign: 'center',
    border: `1px solid ${colors.border}`,
    transform: 'scale(0.9)',
    opacity: 0,
    animation: 'modalAppear 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards',
    maxHeight: isMobile ? '90vh' : 'auto',
    overflowY: 'auto'
  };

  const inputStyle = {
    width: '100%',
    padding: isMobile ? '14px 16px' : '16px 20px',
    margin: '8px 0',
    border: `2px solid ${colors.border}`,
    borderRadius: '12px',
    fontSize: isMobile ? '14px' : '16px',
    outline: 'none',
    transition: 'all 0.3s ease',
    boxSizing: 'border-box',
    background: colors.background,
    fontWeight: '500'
  };

  const selectStyle = {
    ...inputStyle,
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23333' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 16px center',
    backgroundSize: '16px',
    paddingRight: '40px'
  };

  const submitButtonStyle = {
    width: '100%',
    padding: isMobile ? '14px' : '16px',
    background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`,
    color: colors.white,
    border: 'none',
    borderRadius: '12px',
    fontSize: isMobile ? '14px' : '16px',
    cursor: 'pointer',
    marginTop: '20px',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    fontWeight: '700',
    letterSpacing: '0.5px',
    boxShadow: '0 8px 25px rgba(1, 81, 186, 0.3)'
  };

  const closeButtonStyle = {
    position: 'absolute',
    top: isMobile ? '15px' : '20px',
    right: isMobile ? '15px' : '20px',
    background: colors.background,
    border: 'none',
    fontSize: isMobile ? '20px' : '24px',
    cursor: 'pointer',
    color: colors.textLight,
    width: isMobile ? '35px' : '40px',
    height: isMobile ? '35px' : '40px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.3s ease'
  };

  const messageStyle = {
    color: message.includes('Error') || message.includes('Invalid') ? colors.danger : colors.success,
    margin: '15px 0',
    fontSize: isMobile ? '13px' : '15px',
    fontWeight: '600',
    padding: '12px',
    borderRadius: '8px',
    background: message.includes('Error') || message.includes('Invalid') ? 'rgba(229, 62, 62, 0.1)' : 'rgba(56, 161, 105, 0.1)'
  };

  const switchLinkStyle = {
    color: colors.primary,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: isMobile ? '14px' : '16px',
    fontWeight: '600',
    marginTop: '20px',
    textDecoration: 'underline',
    transition: 'color 0.3s ease'
  };

  // Inline CSS for animations
  const styleTag = `
    @keyframes slideUpFadeIn {
      from {
        opacity: 0;
        transform: translateY(50px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    @keyframes modalAppear {
      from {
        opacity: 0;
        transform: scale(0.9);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }
    
    * {
      box-sizing: border-box;
    }
    
    body {
      margin: 0;
      padding: 0;
      overflow-x: hidden;
    }
  `;

  return (
    <div style={containerStyle}>
      <style>{styleTag}</style>
      
      <header style={headerStyle}>
        <div style={logoStyle}>
          <div style={{
            width: isMobile ? '32px' : '40px',
            height: isMobile ? '32px' : '40px',
            background: `linear-gradient(135deg, ${colors.secondary} 0%, ${colors.secondaryDark} 100%)`,
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
            color: colors.primaryDark,
            fontSize: isMobile ? '14px' : '18px'
          }}>
            BTL
          </div>
          BTL Manager
        </div>
        
        <div style={authButtonsStyle}>
          <button
            onClick={() => setShowRegister(true)}
            style={registerButtonStyle}
            onMouseEnter={(e) => {
              e.target.style.background = colors.secondary;
              e.target.style.color = colors.primaryDark;
              e.target.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.target.style.background = 'transparent';
              e.target.style.color = colors.white;
              e.target.style.transform = 'translateY(0)';
            }}
          >
            {isMobile ? 'Register' : 'Create Account'}
          </button>
          
          <button
            onClick={() => setShowLogin(true)}
            style={loginButtonStyle}
            onMouseEnter={(e) => {
              e.target.style.transform = 'translateY(-2px)';
              e.target.style.boxShadow = '0 8px 25px rgba(198, 170, 88, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = '0 4px 15px rgba(198, 170, 88, 0.3)';
            }}
          >
            {isMobile ? 'Login' : 'Login'}
          </button>
        </div>
      </header>

      <section style={carouselContainerStyle}>
        {slides.map((slide, index) => (
          <div
            key={index}
            style={{
              ...(index === currentSlide ? activeSlideStyle : carouselSlideStyle),
              backgroundImage: `linear-gradient(rgba(1, 81, 186, 0.3), rgba(1, 81, 186, 0.5)), url(${isMobile ? slide.mobileImage : slide.image})`
            }}
          >
            <div style={slideContentStyle}>
              <h2 style={slideTitleStyle}>{slide.title}</h2>
              <p style={slideDescriptionStyle}>{slide.description}</p>
            </div>
          </div>
        ))}
        
        <div style={dotsContainerStyle}>
          {slides.map((_, index) => (
            <div
              key={index}
              style={index === currentSlide ? activeDotStyle : dotStyle}
              onClick={() => setCurrentSlide(index)}
            />
          ))}
        </div>
      </section>

      <section ref={featuresRef} style={featuresSectionStyle}>
        <h2 style={sectionTitleStyle}>
          {isMobile ? 'Features' : 'Powerful Features'}
        </h2>
        <div style={featuresGridStyle}>
          {features.map((feature, index) => (
            <div 
              key={index}
              style={{
                ...featureCardStyle,
                transitionDelay: isVisible ? `${index * 0.2}s` : '0s'
              }}
            >
              <img 
                src={feature.image} 
                alt={feature.title}
                style={featureImageStyle}
              />
              <div style={featureContentStyle}>
                <h3 style={featureTitleStyle}>{feature.title}</h3>
                <p style={featureDescriptionStyle}>{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{
        padding: isMobile ? '60px 20px' : '90px 40px',
        background: colors.white,
        borderTop: `1px solid ${colors.border}`
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          textAlign: 'center'
        }}>
          <h2 style={{
            fontSize: isMobile ? '28px' : '40px',
            fontWeight: '800',
            color: colors.primary,
            marginBottom: '15px',
            letterSpacing: '-0.5px'
          }}>
            Our Service Coverage & Location
          </h2>
          <p style={{
            fontSize: isMobile ? '15px' : '18px',
            color: colors.textLight,
            maxWidth: '700px',
            margin: '0 auto 40px auto',
            lineHeight: '1.6'
          }}>
            We operate across major advertising and commercial centers, delivering on-ground BTL marketing execution with live verified tracking.
            {locations.length > 0 && (
              <span style={{ display: 'block', marginTop: '10px', color: colors.primary, fontWeight: '600' }}>
                📍 {locations.length} active service locations found
              </span>
            )}
          </p>
          
          <div style={{
            borderRadius: '20px',
            overflow: 'hidden',
            boxShadow: '0 12px 35px rgba(1, 81, 186, 0.15)',
            border: `2px solid ${colors.secondary}`,
            height: isMobile ? '350px' : '480px',
            width: '100%',
            position: 'relative',
            background: colors.background
          }}>
            {mapLoading && (
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 10,
                textAlign: 'center',
                color: colors.textLight
              }}>
                <div style={{ fontSize: '40px', marginBottom: '10px' }}>🗺️</div>
                <div>Loading map...</div>
              </div>
            )}
            <div ref={mapRef} style={{ height: '100%', width: '100%', zIndex: 1 }} />
          </div>
        </div>
      </section>

      <footer style={{
        background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`,
        color: colors.white,
        padding: isMobile ? '30px 20px' : '50px 40px',
        textAlign: 'center'
      }}>
        <p style={{ 
          margin: 0, 
          fontSize: isMobile ? '14px' : '16px',
          opacity: 0.8,
          fontWeight: '500'
        }}>
          © 2026 BTL Manager All rights reserved.
        </p>
      </footer>

      {showLogin && (
        <div style={modalOverlayStyle} onClick={() => { setShowLogin(false); setMessage(''); }}>
          <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
            <button 
              onClick={() => { setShowLogin(false); setMessage(''); }}
              style={closeButtonStyle}
            >
              ✕
            </button>
            
            <h2 style={{ 
              marginBottom: isMobile ? '25px' : '35px', 
              color: colors.primary,
              fontSize: isMobile ? '24px' : '32px',
              fontWeight: '800',
              letterSpacing: '-0.5px'
            }}>
              Welcome Back
            </h2>
            
            {message && <div style={messageStyle}>{message}</div>}

            <form onSubmit={handleLoginSubmit}>
              <input
                type="tel"
                name="contactNumber"
                placeholder="Mobile Number (10 digits)"
                value={loginFormData.contactNumber}
                onChange={handleLoginChange}
                required
                pattern="[0-9]{10,15}"
                style={inputStyle}
              />
              
              <input
                type="password"
                name="password"
                placeholder="Password"
                value={loginFormData.password}
                onChange={handleLoginChange}
                required
                minLength="6"
                style={inputStyle}
              />

              <button 
                type="submit" 
                disabled={loading}
                style={{
                  ...submitButtonStyle,
                  opacity: loading ? 0.8 : 1
                }}
              >
                {loading ? 'Logging in...' : (isMobile ? 'Login' : 'Login to Dashboard')}
              </button>

              <button 
                type="button"
                onClick={switchToRegister}
                style={switchLinkStyle}
              >
                Don't have an account? Register here
              </button>
            </form>
          </div>
        </div>
      )}

      {showRegister && (
        <div style={modalOverlayStyle} onClick={() => { setShowRegister(false); setMessage(''); }}>
          <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
            <button 
              onClick={() => { setShowRegister(false); setMessage(''); }}
              style={closeButtonStyle}
            >
              ✕
            </button>
            
            <h2 style={{ 
              marginBottom: isMobile ? '25px' : '35px', 
              color: colors.primary,
              fontSize: isMobile ? '24px' : '32px',
              fontWeight: '800',
              letterSpacing: '-0.5px'
            }}>
              Create Account
            </h2>
            
            {message && <div style={messageStyle}>{message}</div>}

            <form onSubmit={handleRegisterSubmit}>
              <input
                type="text"
                name="username"
                placeholder="Username"
                value={registerFormData.username}
                onChange={handleRegisterChange}
                required
                minLength="3"
                maxLength="30"
                style={inputStyle}
              />
              
              <input
                type="tel"
                name="contactNumber"
                placeholder="Mobile Number (10-15 digits)"
                value={registerFormData.contactNumber}
                onChange={handleRegisterChange}
                required
                pattern="[0-9]{10,15}"
                style={inputStyle}
              />
              
              <input
                type="email"
                name="email"
                placeholder="Email (Optional)"
                value={registerFormData.email}
                onChange={handleRegisterChange}
                style={inputStyle}
              />
              
              <select
                name="role"
                value={registerFormData.role}
                onChange={handleRegisterChange}
                required
                style={selectStyle}
              >
                <option value="user">Worker</option>
                <option value="client">Client</option>
                <option value="owner">Owner</option>
              </select>

              {registerFormData.role === 'client' && (
                <input
                  type="text"
                  name="businessName"
                  placeholder="Business Name"
                  value={registerFormData.businessName}
                  onChange={handleRegisterChange}
                  required
                  style={inputStyle}
                />
              )}

              {registerFormData.role === 'owner' && (
                <select
                  name="ownerLevel"
                  value={registerFormData.ownerLevel}
                  onChange={handleRegisterChange}
                  required
                  style={selectStyle}
                >
                  <option value="">Select Owner Level</option>
                  <option value="standard">Standard</option>
                  <option value="premium">Premium</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              )}
              
              <input
                type="password"
                name="password"
                placeholder="Password (Min 6 characters)"
                value={registerFormData.password}
                onChange={handleRegisterChange}
                required
                minLength="6"
                style={inputStyle}
              />
              
              <input
                type="password"
                name="confirmPassword"
                placeholder="Confirm Password"
                value={registerFormData.confirmPassword}
                onChange={handleRegisterChange}
                required
                minLength="6"
                style={inputStyle}
              />

              <button 
                type="submit" 
                disabled={loading}
                style={{
                  ...submitButtonStyle,
                  opacity: loading ? 0.8 : 1
                }}
              >
                {loading ? 'Registering...' : 'Create Account'}
              </button>

              <button 
                type="button"
                onClick={switchToLogin}
                style={switchLinkStyle}
              >
                Already have an account? Login here
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomePage;