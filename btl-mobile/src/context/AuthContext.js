// src/context/AuthContext.js
import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import API, { initApiBaseUrl } from '../utils/api';

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    bootstrapAuth();
  }, []);

  const bootstrapAuth = async () => {
    try {
      await initApiBaseUrl();
      const token = await AsyncStorage.getItem('token');
      const savedUser = await AsyncStorage.getItem('user');

      if (token && savedUser) {
        try {
          const response = await API.get('/auth/me');
          if (response.data?.user) {
            setUser(response.data.user);
            await AsyncStorage.setItem('user', JSON.stringify(response.data.user));
          } else {
            setUser(JSON.parse(savedUser));
          }
        } catch (err) {
          console.warn('Auth verification failed:', err.message);
          await AsyncStorage.multiRemove(['token', 'user']);
          setUser(null);
        }
      }
    } catch (error) {
      console.error('Auth bootstrap error:', error);
    } finally {
      setLoading(false);
    }
  };

  const login = async (arg1, arg2) => {
    // Support both login(contactNumber, password) and login(token, userData)
    if (typeof arg2 === 'object' && arg2 !== null) {
      await AsyncStorage.setItem('token', arg1);
      await AsyncStorage.setItem('user', JSON.stringify(arg2));
      setUser(arg2);
      return { success: true, user: arg2 };
    }

    try {
      const response = await API.post('/auth/login', {
        contactNumber: arg1,
        password: arg2,
      });
      if (response.data?.token && response.data?.user) {
        await AsyncStorage.setItem('token', response.data.token);
        await AsyncStorage.setItem('user', JSON.stringify(response.data.user));
        setUser(response.data.user);
        return { success: true, user: response.data.user };
      }
      return {
        success: false,
        message: response.data?.message || 'Invalid credentials',
      };
    } catch (err) {
      return {
        success: false,
        message: err.response?.data?.message || 'Login failed. Check your mobile number & password.',
      };
    }
  };

  const register = async (payload) => {
    try {
      const response = await API.post('/auth/register', payload);
      return {
        success: true,
        data: response.data,
      };
    } catch (err) {
      return {
        success: false,
        message: err.response?.data?.message || 'Registration failed',
      };
    }
  };

  const logout = async () => {
    await AsyncStorage.multiRemove(['token', 'user']);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        refreshAuth: bootstrapAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
