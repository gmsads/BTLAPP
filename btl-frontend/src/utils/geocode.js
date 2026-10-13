// src/utils/geocode.js
import axios from './api';

// Get address from GPS coordinates
export const getAddressFromCoordinates = async (lat, lng) => {
  try {
    if (!lat || !lng) return 'Location Captured';
    
    const response = await axios.get('/geocode/reverse', {
      params: { lat, lng }
    });
    
    if (response.data.success && response.data.data) {
      const data = response.data.data;
      if (data.address) {
        const city = data.address.city || data.address.town || data.address.state || '';
        const area = data.address.suburb || data.address.neighbourhood || '';
        return [area || city, data.address.state].filter(Boolean).join(', ') || 'Location Captured';
      }
    }
    return 'Location Captured';
  } catch (error) {
    console.error('Error getting address:', error);
    return 'Location Captured';
  }
};

// Get full address for watermarking and photo capture
export const getExactAddressFromCoordinates = async (lat, lng) => {
  try {
    if (!lat || !lng) return 'Coordinates unavailable';
    
    const response = await axios.get('/geocode/reverse', {
      params: { lat, lng }
    });
    
    if (response.data.success && response.data.data) {
      const data = response.data.data;
      if (data.display_name) {
        return data.display_name;
      }
      if (data.address) {
        const addr = data.address;
        const street = addr.road || addr.street || addr.pedestrian || '';
        const area = addr.suburb || addr.neighbourhood || addr.city_district || '';
        const city = addr.city || addr.town || addr.village || '';
        const state = addr.state || '';
        const postcode = addr.postcode || '';
        const parts = [street, area, city, state, postcode].filter(Boolean);
        if (parts.length > 0) return parts.join(', ');
      }
    }
    return `Lat: ${Number(lat).toFixed(6)}, Lng: ${Number(lng).toFixed(6)}`;
  } catch (error) {
    console.error('Error getting exact address:', error);
    return `Lat: ${Number(lat).toFixed(6)}, Lng: ${Number(lng).toFixed(6)}`;
  }
};