// src/screens/Auth/HomePageScreen.js
import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  ImageBackground,
  Image,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { AuthContext } from '../../context/AuthContext';
import API, { getBaseUrl, setCustomBaseUrl } from '../../utils/api';
import { COLORS, SHADOWS } from '../../utils/theme';

const CAROUSEL_SLIDES = [
  {
    url: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80',
    title: 'Real-time Monitoring',
    description: 'Track all your services in real-time with live updates and status monitoring',
  },
  {
    url: 'https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80',
    title: 'Advanced Analytics',
    description: 'Comprehensive analytics and insights to optimize your service operations',
  },
  {
    url: 'https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80',
    title: 'Team Collaboration',
    description: 'Seamless communication between workers, supervisors, and management',
  },
];

const FEATURES = [
  {
    title: 'Real-time Monitoring',
    description: 'Track service progress in real-time with instant updates and status notifications',
    image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80',
  },
  {
    title: 'Image Management',
    description: 'Upload and manage work completion images with organized categorization',
    image: 'https://images.unsplash.com/photo-1552664730-d307ca884978?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80',
  },
  {
    title: 'Performance Tracking',
    description: 'Monitor worker performance and service completion metrics efficiently',
    image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80',
  },
];

const getServiceEmoji = (serviceType = '') => {
  const t = serviceType.toLowerCase();
  if (t.includes('bus')) return '🚌';
  if (t.includes('hoarding') || t.includes('pole') || t.includes('board')) return '🪧';
  if (t.includes('auto')) return '🛺';
  if (t.includes('van') || t.includes('announcement') || t.includes('led')) return '🔊';
  if (t.includes('pamphlet') || t.includes('flyer')) return '📄';
  if (t.includes('t-shirt') || t.includes('tshirt')) return '👕';
  return '📍';
};

export default function HomePageScreen() {
  const { login, register } = useContext(AuthContext);

  // Modals matching HomePage.jsx
  const [showLogin, setShowLogin] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [showServerModal, setShowServerModal] = useState(false);

  // Carousel state
  const [currentSlide, setCurrentSlide] = useState(0);

  // Public service locations for map
  const [serviceLocations, setServiceLocations] = useState([]);

  // Login form state
  const [loginData, setLoginData] = useState({ contactNumber: '', password: '' });
  const [loginMessage, setLoginMessage] = useState('');

  // Register form state
  const [registerData, setRegisterData] = useState({
    username: '',
    contactNumber: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'user',
    businessName: '',
    ownerLevel: 'standard',
  });
  const [registerMessage, setRegisterMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // Server URL config
  const [serverUrl, setServerUrl] = useState(getBaseUrl());

  // Carousel auto-slide
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % CAROUSEL_SLIDES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // Fetch public service locations for map
  useEffect(() => {
    const fetchLocations = async () => {
      try {
        const res = await API.get('/services/public-locations');
        if (res.data?.success && Array.isArray(res.data.locations)) {
          setServiceLocations(res.data.locations);
        }
      } catch (err) {
        // Ignore silently if offline
      }
    };
    fetchLocations();
  }, []);

  const handleLoginSubmit = async () => {
    if (!loginData.contactNumber || !loginData.password) {
      setLoginMessage('Please fill in all fields');
      return;
    }
    setLoading(true);
    setLoginMessage('');
    try {
      const result = await login(loginData.contactNumber.trim(), loginData.password);
      if (result.success) {
        setShowLogin(false);
      } else {
        setLoginMessage(result.message || 'Login failed');
      }
    } catch (err) {
      setLoginMessage(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async () => {
    if (
      !registerData.username ||
      !registerData.contactNumber ||
      !registerData.email ||
      !registerData.password
    ) {
      setRegisterMessage('Please fill in all required fields');
      return;
    }
    if (registerData.password !== registerData.confirmPassword) {
      setRegisterMessage('Passwords do not match');
      return;
    }
    if (registerData.password.length < 6) {
      setRegisterMessage('Password must be at least 6 characters');
      return;
    }
    if (registerData.role === 'client' && !registerData.businessName.trim()) {
      setRegisterMessage('Business name is required for Client registration');
      return;
    }

    setLoading(true);
    setRegisterMessage('');
    try {
      const payload = {
        username: registerData.username.trim(),
        contactNumber: registerData.contactNumber.trim(),
        email: registerData.email.trim(),
        password: registerData.password,
        role: registerData.role,
        businessName: registerData.role === 'client' ? registerData.businessName.trim() : '',
        ownerLevel: registerData.role === 'owner' ? registerData.ownerLevel : null,
      };
      const result = await register(payload);
      if (result.success) {
        setRegisterMessage('Registration successful! Please login.');
        setTimeout(() => {
          setShowRegister(false);
          setShowLogin(true);
          setLoginData({ contactNumber: registerData.contactNumber, password: '' });
          setLoginMessage('Registration successful! Please login.');
          setRegisterMessage('');
        }, 1200);
      } else {
        setRegisterMessage(result.message || 'Registration failed');
      }
    } catch (err) {
      setRegisterMessage(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveServerUrl = async () => {
    if (!serverUrl.trim()) return;
    const saved = await setCustomBaseUrl(serverUrl.trim());
    setServerUrl(saved);
    setShowServerModal(false);
    Alert.alert('Backend URL Updated', `Now connected to:\n${saved}`);
  };

  // Group locations by address just like HomePage.jsx
  const groupedLocations = Object.values(
    serviceLocations.reduce((acc, loc) => {
      const key = loc.address
        ? loc.address.trim().toLowerCase()
        : `${loc.lat.toFixed(4)}_${loc.lng.toFixed(4)}`;
      if (!acc[key]) {
        acc[key] = {
          lat: loc.lat,
          lng: loc.lng,
          address: loc.address,
          services: [],
        };
      }
      acc[key].services.push(loc);
      return acc;
    }, {})
  );

  const getCoverageMapHtml = () => {
    const markers = groupedLocations.map((group) => ({
      lat: group.lat,
      lng: group.lng,
      address: group.address || 'Location',
      emoji: getServiceEmoji(group.services[0]?.serviceType || ''),
      count: group.services.length,
      items: group.services.map((s) => ({
        emoji: getServiceEmoji(s.serviceType),
        type: s.serviceType || 'Service',
        business: s.businessName || '',
        status: s.status || 'active',
      })),
    }));

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          body, html, #map { margin: 0; padding: 0; width: 100%; height: 100%; font-family: sans-serif; }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          const map = L.map('map').setView([17.412153, 78.267959], 10);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
          }).addTo(map);

          const hqIcon = L.divIcon({
            html: '<div style="background:#ef4444;color:#fff;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,0.3);font-size:16px;">🏢</div>',
            className: '',
            iconSize: [32, 32],
            iconAnchor: [16, 16]
          });
          L.marker([17.412153, 78.267959], { icon: hqIcon })
            .addTo(map)
            .bindPopup('<b>BTL Manager Headquarters</b><br/>Telangana, India');

          const groups = ${JSON.stringify(markers)};
          groups.forEach((g) => {
            const badge = g.count > 1 ? '<span style="position:absolute;top:-5px;right:-5px;background:#ef4444;color:#fff;border-radius:10px;padding:1px 5px;font-size:10px;font-weight:bold;">' + g.count + '</span>' : '';
            const icon = L.divIcon({
              html: '<div style="position:relative;background:#0151ba;color:#fff;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,0.3);font-size:16px;">' + g.emoji + badge + '</div>',
              className: '',
              iconSize: [34, 34],
              iconAnchor: [17, 17]
            });
            let popupHtml = '<div style="min-width:160px;"><b>📍 ' + g.address + '</b><hr style="border:0;border-top:1px solid #e2e8f0;margin:6px 0;"/>';
            g.items.forEach((it) => {
              popupHtml += '<div style="margin-bottom:4px;font-size:12px;">' + it.emoji + ' <b>' + it.type + '</b> ' + (it.business ? '(' + it.business + ')' : '') + '</div>';
            });
            popupHtml += '</div>';
            L.marker([g.lat, g.lng], { icon }).addTo(map).bindPopup(popupHtml);
          });
        </script>
      </body>
      </html>
    `;
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Fixed Header matching HomePage.jsx */}
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <View style={styles.logoBox}>
            <Text style={styles.logoBoxText}>BTL</Text>
          </View>
          <Text style={styles.brandName}>BTL Manager</Text>
        </View>

        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.registerHeaderBtn}
            onPress={() => {
              setRegisterMessage('');
              setShowRegister(true);
            }}
          >
            <Text style={styles.registerHeaderBtnText}>Register</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.loginHeaderBtn}
            onPress={() => {
              setLoginMessage('');
              setShowLogin(true);
            }}
          >
            <Text style={styles.loginHeaderBtnText}>Login</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.gearBtn}
            onPress={() => setShowServerModal(true)}
          >
            <Text style={{ fontSize: 15 }}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Hero Image Carousel matching HomePage.jsx */}
        <View style={styles.carouselWrapper}>
          <ImageBackground
            source={{ uri: CAROUSEL_SLIDES[currentSlide].url }}
            style={styles.carouselSlide}
            imageStyle={{ borderRadius: 16 }}
          >
            <View style={styles.carouselOverlay}>
              <Text style={styles.slideTitle}>{CAROUSEL_SLIDES[currentSlide].title}</Text>
              <Text style={styles.slideDesc}>{CAROUSEL_SLIDES[currentSlide].description}</Text>

              <View style={styles.dotsRow}>
                {CAROUSEL_SLIDES.map((_, idx) => (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => setCurrentSlide(idx)}
                    style={[
                      styles.dot,
                      currentSlide === idx && styles.dotActive,
                    ]}
                  />
                ))}
              </View>
            </View>
          </ImageBackground>
        </View>

        {/* Powerful Features Section matching HomePage.jsx */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Powerful Features</Text>
          <Text style={styles.sectionSubtitle}>
            Everything you need to manage your services effectively
          </Text>

          {FEATURES.map((feature, index) => (
            <View key={index} style={styles.featureCard}>
              <Image source={{ uri: feature.image }} style={styles.featureImage} />
              <View style={styles.featureContent}>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureDesc}>{feature.description}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Our Service Coverage & Location Map Section matching HomePage.jsx */}
        <View style={styles.mapSection}>
          <Text style={styles.sectionTitle}>Our Service Coverage & Location</Text>
          <Text style={styles.sectionSubtitle}>
            Managing services effectively across regions from our headquarters
          </Text>

          <View style={styles.mapWrapper}>
            {Platform.OS === 'web' ? (
              <View style={styles.webMapFallback}>
                <Text style={styles.webMapTitle}>🏢 BTL Manager Headquarters (Telangana)</Text>
                <Text style={styles.webMapSub}>
                  📍 {serviceLocations.length} Active Service Locations Deployed
                </Text>
              </View>
            ) : (
              <WebView
                originWhitelist={['*']}
                source={{ html: getCoverageMapHtml() }}
                style={{ flex: 1 }}
              />
            )}
          </View>
        </View>

        {/* Footer matching HomePage.jsx */}
        <View style={styles.footer}>
          <View style={styles.footerLogoRow}>
            <View style={styles.footerLogoBox}>
              <Text style={styles.footerLogoText}>BTL</Text>
            </View>
            <Text style={styles.footerBrand}>BTL Manager</Text>
          </View>
          <Text style={styles.footerCopy}>© 2026 BTL Manager All rights reserved.</Text>
        </View>
      </ScrollView>

      {/* LOGIN MODAL matching HomePage.jsx */}
      <Modal visible={showLogin} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Welcome Back</Text>
              <TouchableOpacity
                style={styles.closeModalBtn}
                onPress={() => setShowLogin(false)}
              >
                <Text style={styles.closeModalBtnText}>×</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Mobile Number</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your mobile number"
                placeholderTextColor={COLORS.textLight}
                keyboardType="phone-pad"
                value={loginData.contactNumber}
                onChangeText={(v) => setLoginData({ ...loginData, contactNumber: v })}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your password"
                placeholderTextColor={COLORS.textLight}
                secureTextEntry
                value={loginData.password}
                onChangeText={(v) => setLoginData({ ...loginData, password: v })}
              />
            </View>

            {!!loginMessage && (
              <View
                style={[
                  styles.messageBox,
                  loginMessage.includes('successful') ? styles.msgSuccess : styles.msgError,
                ]}
              >
                <Text
                  style={[
                    styles.messageText,
                    loginMessage.includes('successful')
                      ? { color: '#155724' }
                      : { color: '#721c24' },
                  ]}
                >
                  {loginMessage}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.submitBtn, loading && { opacity: 0.7 }]}
              onPress={handleLoginSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.submitBtnText}>Login to Dashboard</Text>
              )}
            </TouchableOpacity>

            <View style={styles.formFooter}>
              <Text style={styles.formFooterText}>Don't have an account? </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowLogin(false);
                  setShowRegister(true);
                  setLoginMessage('');
                }}
              >
                <Text style={styles.switchLink}>Register here</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* REGISTER MODAL matching HomePage.jsx */}
      <Modal visible={showRegister} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={[styles.modalCard, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Account</Text>
              <TouchableOpacity
                style={styles.closeModalBtn}
                onPress={() => setShowRegister(false)}
              >
                <Text style={styles.closeModalBtnText}>×</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Username *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Choose a username"
                  placeholderTextColor={COLORS.textLight}
                  value={registerData.username}
                  onChangeText={(v) => setRegisterData({ ...registerData, username: v })}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Mobile Number *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your mobile number"
                  placeholderTextColor={COLORS.textLight}
                  keyboardType="phone-pad"
                  value={registerData.contactNumber}
                  onChangeText={(v) => setRegisterData({ ...registerData, contactNumber: v })}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Email *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your email"
                  placeholderTextColor={COLORS.textLight}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={registerData.email}
                  onChangeText={(v) => setRegisterData({ ...registerData, email: v })}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Role *</Text>
                <View style={styles.rolePickerRow}>
                  {[
                    { key: 'user', label: 'Worker' },
                    { key: 'client', label: 'Client' },
                    { key: 'owner', label: 'Owner' },
                  ].map((r) => (
                    <TouchableOpacity
                      key={r.key}
                      style={[
                        styles.roleChip,
                        registerData.role === r.key && styles.roleChipActive,
                      ]}
                      onPress={() =>
                        setRegisterData({
                          ...registerData,
                          role: r.key,
                          businessName: r.key !== 'client' ? '' : registerData.businessName,
                          ownerLevel: r.key === 'owner' ? 'standard' : '',
                        })
                      }
                    >
                      <Text
                        style={[
                          styles.roleChipText,
                          registerData.role === r.key && styles.roleChipTextActive,
                        ]}
                      >
                        {r.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {registerData.role === 'owner' && (
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Owner Level *</Text>
                  <View style={styles.rolePickerRow}>
                    {[
                      { key: 'standard', label: 'Standard' },
                      { key: 'premium', label: 'Premium' },
                      { key: 'enterprise', label: 'Enterprise' },
                    ].map((lvl) => (
                      <TouchableOpacity
                        key={lvl.key}
                        style={[
                          styles.roleChip,
                          registerData.ownerLevel === lvl.key && styles.roleChipActive,
                        ]}
                        onPress={() =>
                          setRegisterData({ ...registerData, ownerLevel: lvl.key })
                        }
                      >
                        <Text
                          style={[
                            styles.roleChipText,
                            registerData.ownerLevel === lvl.key &&
                              styles.roleChipTextActive,
                          ]}
                        >
                          {lvl.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {registerData.role === 'client' && (
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Business Name *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your business name"
                    placeholderTextColor={COLORS.textLight}
                    value={registerData.businessName}
                    onChangeText={(v) => setRegisterData({ ...registerData, businessName: v })}
                  />
                  <Text style={styles.helperText}>
                    This will be used to match your services
                  </Text>
                </View>
              )}

              <View style={styles.formGroup}>
                <Text style={styles.label}>Password *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Create a password (min. 6 characters)"
                  placeholderTextColor={COLORS.textLight}
                  secureTextEntry
                  value={registerData.password}
                  onChangeText={(v) => setRegisterData({ ...registerData, password: v })}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Confirm Password *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Confirm your password"
                  placeholderTextColor={COLORS.textLight}
                  secureTextEntry
                  value={registerData.confirmPassword}
                  onChangeText={(v) => setRegisterData({ ...registerData, confirmPassword: v })}
                />
              </View>

              {!!registerMessage && (
                <View
                  style={[
                    styles.messageBox,
                    registerMessage.includes('successful') ? styles.msgSuccess : styles.msgError,
                  ]}
                >
                  <Text
                    style={[
                      styles.messageText,
                      registerMessage.includes('successful')
                        ? { color: '#155724' }
                        : { color: '#721c24' },
                    ]}
                  >
                    {registerMessage}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.submitBtn, loading && { opacity: 0.7 }]}
                onPress={handleRegisterSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={styles.submitBtnText}>Create Account</Text>
                )}
              </TouchableOpacity>

              <View style={styles.formFooter}>
                <Text style={styles.formFooterText}>Already have an account? </Text>
                <TouchableOpacity
                  onPress={() => {
                    setShowRegister(false);
                    setShowLogin(true);
                    setRegisterMessage('');
                  }}
                >
                  <Text style={styles.switchLink}>Login here</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Server Config Modal */}
      <Modal visible={showServerModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>⚙️ Backend API Server</Text>
              <TouchableOpacity
                style={styles.closeModalBtn}
                onPress={() => setShowServerModal(false)}
              >
                <Text style={styles.closeModalBtnText}>×</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.helperText}>
              Point the mobile app to your Node.js backend IP address (e.g., http://192.168.1.5:5002/api)
            </Text>
            <TextInput
              style={[styles.input, { marginTop: 10, marginBottom: 14 }]}
              value={serverUrl}
              onChangeText={setServerUrl}
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.submitBtn} onPress={handleSaveServerUrl}>
              <Text style={styles.submitBtnText}>Save API URL</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    ...SHADOWS.card,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoBox: {
    width: 38,
    height: 38,
    backgroundColor: COLORS.primary,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBoxText: {
    color: COLORS.white,
    fontWeight: '800',
    fontSize: 15,
  },
  brandName: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.primary,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  registerHeaderBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.primary,
    backgroundColor: 'transparent',
  },
  registerHeaderBtnText: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 13,
  },
  loginHeaderBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
  },
  loginHeaderBtnText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 13,
  },
  gearBtn: {
    padding: 6,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  carouselWrapper: {
    padding: 16,
  },
  carouselSlide: {
    height: 250,
    borderRadius: 16,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  carouselOverlay: {
    backgroundColor: 'rgba(1, 81, 186, 0.72)',
    padding: 20,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  slideTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.white,
    textAlign: 'center',
    marginBottom: 8,
  },
  slideDesc: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.95)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 18,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 8,
    position: 'absolute',
    bottom: 16,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  dotActive: {
    backgroundColor: COLORS.white,
    transform: [{ scale: 1.2 }],
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    backgroundColor: COLORS.white,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.primary,
    textAlign: 'center',
    marginBottom: 6,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 20,
  },
  featureCard: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    ...SHADOWS.card,
  },
  featureImage: {
    width: '100%',
    height: 160,
  },
  featureContent: {
    padding: 16,
  },
  featureTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 6,
  },
  featureDesc: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 19,
  },
  mapSection: {
    paddingHorizontal: 16,
    paddingVertical: 24,
    backgroundColor: '#f8fafc',
  },
  mapWrapper: {
    height: 290,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#e2e8f0',
    ...SHADOWS.card,
  },
  webMapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  webMapTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.primary,
  },
  webMapSub: {
    fontSize: 13,
    color: COLORS.textLight,
    marginTop: 6,
  },
  footer: {
    backgroundColor: '#1e293b',
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  footerLogoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  footerLogoBox: {
    width: 34,
    height: 34,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerLogoText: {
    color: COLORS.white,
    fontWeight: '800',
    fontSize: 13,
  },
  footerBrand: {
    color: COLORS.white,
    fontSize: 17,
    fontWeight: '700',
  },
  footerCopy: {
    color: '#94a3b8',
    fontSize: 12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    padding: 18,
  },
  modalCard: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 22,
    ...SHADOWS.card,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 14,
    marginBottom: 16,
    borderBottomWidth: 2,
    borderBottomColor: '#f1f5f9',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.primary,
  },
  closeModalBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeModalBtnText: {
    fontSize: 22,
    color: '#64748b',
    fontWeight: '700',
    lineHeight: 24,
  },
  formGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: COLORS.text,
  },
  rolePickerRow: {
    flexDirection: 'row',
    gap: 8,
  },
  roleChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  roleChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  roleChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  roleChipTextActive: {
    color: COLORS.white,
  },
  helperText: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 4,
  },
  messageBox: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
  },
  msgSuccess: {
    backgroundColor: '#d4edda',
    borderColor: '#c3e6cb',
  },
  msgError: {
    backgroundColor: '#f8d7da',
    borderColor: '#f5c6cb',
  },
  messageText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  submitBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  submitBtnText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '700',
  },
  formFooter: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  formFooterText: {
    fontSize: 13,
    color: '#6b7280',
  },
  switchLink: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
    textDecorationLine: 'underline',
  },
});
