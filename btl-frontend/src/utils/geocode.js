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

// Get full address for watermarking
export const getExactAddressFromCoordinates = async (lat, lng) => {
  try {
    if (!lat || !lng) return 'Coordinates unavailable';
    
    const response = await axios.get('/geocode/reverse', {
      params: { lat, lng }
    });
    
    if (response.data.success && response.data.data) {
      return response.data.data.display_name || `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`;
    }
    return `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`;
  } catch (error) {
    console.error('Error getting exact address:', error);
    return `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`;
  }
};