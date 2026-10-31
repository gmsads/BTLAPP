// src/utils/api.js
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export const STORAGE_KEY_API_URL = 'btl_custom_api_url';

// Default API URLs:
// - Web: http://localhost:5002/api (if local) or https://btlmanager.in/api
// - Mobile: defaults to https://btlmanager.in/api (and can be switched to any local LAN IP:5002/api from the login screen)
export const DEFAULT_PROD_API_URL = 'https://btlmanager.in/api';
export const DEFAULT_LOCAL_ANDROID_EMULATOR_URL = 'http://10.0.2.2:5002/api';
export const DEFAULT_LOCAL_WEB_URL = 'http://localhost:5002/api';

const getInitialBaseUrl = () => {
  if (Platform.OS === 'web') {
    if (
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ) {
      return DEFAULT_LOCAL_WEB_URL;
    }
  }
  return DEFAULT_PROD_API_URL;
};

let currentBaseUrl = getInitialBaseUrl();

const API = axios.create({
  baseURL: currentBaseUrl,
  timeout: 60000,
});

// Load any user-configured backend URL on startup
export const initApiBaseUrl = async () => {
  try {
    const savedUrl = await AsyncStorage.getItem(STORAGE_KEY_API_URL);
    if (savedUrl && savedUrl.trim()) {
      currentBaseUrl = savedUrl.trim();
      API.defaults.baseURL = currentBaseUrl;
    }
  } catch (e) {
    console.warn('Could not read custom API URL:', e.message);
  }
  return currentBaseUrl;
};

export const setApiBaseUrl = async (newUrl) => {
  const clean = newUrl.trim().replace(/\/+$/, '');
  currentBaseUrl = clean;
  API.defaults.baseURL = clean;
  await AsyncStorage.setItem(STORAGE_KEY_API_URL, clean);
  return clean;
};

export const getApiBaseUrl = () => currentBaseUrl;
export const getBaseUrl = getApiBaseUrl;
export const setCustomBaseUrl = setApiBaseUrl;

// Automatically attach JWT Bearer token from AsyncStorage
API.interceptors.request.use(
  async (config) => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (e) {
      console.warn('Token read error:', e.message);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export default API;
