// src/components/NativeLocationTracker.js
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  Platform,
} from 'react-native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import API from '../utils/api';
import { COLORS } from '../utils/theme';

const TRACKING_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const STORAGE_KEY_LAST_PING = 'btl_last_location_ping';

export default function NativeLocationTracker() {
  const [trackingStatus, setTrackingStatus] = useState('initializing'); // initializing, active, denied, off, error
  const [lastLocation, setLastLocation] = useState(null);
  const [lastPingTime, setLastPingTime] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const intervalRef = useRef(null);
  const gpsCheckRef = useRef(null);
  const watcherRef = useRef(null);
  const isSyncingRef = useRef(false);
  const hasShownOffAlertRef = useRef(false);
  const trackingStatusRef = useRef('initializing');

  const updateStatus = useCallback((newStatus) => {
    trackingStatusRef.current = newStatus;
    setTrackingStatus((prev) => (prev === newStatus ? prev : newStatus));
  }, []);

  const promptTurnOnLocation = useCallback(async (forcePrompt = false) => {
    if (hasShownOffAlertRef.current && !forcePrompt) return false;
    hasShownOffAlertRef.current = true;

    try {
      if (Platform.OS === 'android' && Location.enableNetworkProviderAsync) {
        await Location.enableNetworkProviderAsync();
        return true;
      }
    } catch (e) {
      // user cancelled or fallback to alert
    }

    Alert.alert(
      '📍 Turn ON Your Location',
      'Your device Location (GPS) is OFF. Please turn ON your location — without location enabled, you cannot upload work photos.',
      [
        { text: 'OK', style: 'cancel' },
        {
          text: 'Open Settings',
          onPress: () => {
            if (Linking.openSettings) Linking.openSettings();
          },
        },
      ]
    );
    return false;
  }, []);

  const sendLocationUpdate = useCallback(async (coords, source = 'auto_30min') => {
    if (isSyncingRef.current) return;

    try {
      const lastPingStr = await AsyncStorage.getItem(STORAGE_KEY_LAST_PING);
      const lastPing = parseInt(lastPingStr || '0', 10);
      const elapsed = Date.now() - lastPing;

      if (
        lastPing > 0 &&
        elapsed < TRACKING_INTERVAL_MS &&
        source !== 'manual_ping' &&
        source !== 'app_start'
      ) {
        updateStatus('active');
        setErrorMessage('');
        return;
      }

      isSyncingRef.current = true;
      if (source === 'manual_ping') {
        setIsSyncing(true);
      }

      let deviceAddress = '';
      try {
        const geoList = await Location.reverseGeocodeAsync({
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
        if (Array.isArray(geoList) && geoList.length > 0) {
          const g = geoList[0];
          const parts = [
            g.name && g.name !== g.street ? g.name : '',
            [g.streetNumber, g.street].filter(Boolean).join(' '),
            g.district || g.subregion || '',
            g.city || '',
            g.region || '',
            g.postalCode || '',
          ].filter(Boolean);
          const uniqueParts = parts.filter((item, idx) => parts.indexOf(item) === idx);
          if (uniqueParts.length > 0) {
            deviceAddress = uniqueParts.join(', ');
          }
        }
      } catch (e) {
        // ignore native geocode failure
      }

      const response = await API.post('/locations/track', {
        lat: coords.latitude,
        lng: coords.longitude,
        accuracy: coords.accuracy || null,
        source,
      });

      if (response.data?.success) {
        const now = Date.now();
        await AsyncStorage.setItem(STORAGE_KEY_LAST_PING, now.toString());
        setLastPingTime(new Date(now));
        const serverLocName = response.data.data?.locationName || '';
        const finalLocName =
          serverLocName && !serverLocName.startsWith('Lat:')
            ? serverLocName
            : deviceAddress || serverLocName || 'Location synced';
        setLastLocation({
          name: finalLocName,
          coordinates: response.data.data?.coordinates || {
            lat: coords.latitude,
            lng: coords.longitude,
          },
        });
        updateStatus('active');
        setErrorMessage('');
        hasShownOffAlertRef.current = false;
      }
    } catch (err) {
      console.warn('Location sync error:', err.message);
      if (trackingStatusRef.current !== 'active') {
        setErrorMessage('Could not sync location with server');
      }
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [updateStatus]);

  const startContinuousWatch = useCallback(async () => {
    try {
      if (watcherRef.current) return; // already watching
      watcherRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 15000,
          distanceInterval: 10,
        },
        (pos) => {
          if (pos?.coords) {
            updateStatus('active');
            setErrorMessage('');
            hasShownOffAlertRef.current = false;
          }
        }
      );
    } catch (e) {
      // ignore watch error
    }
  }, [updateStatus]);

  const captureAndSync = useCallback(
    async (source = 'auto_30min') => {
      const isManual = source === 'manual_ping';
      try {
        // 1. Check / request foreground permission on login
        let perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== 'granted' && (source === 'app_start' || isManual)) {
          perm = await Location.requestForegroundPermissionsAsync();
        }
        if (perm.status !== 'granted') {
          updateStatus('denied');
          setErrorMessage(
            '⚠️ Location permission is required! Without location access, you cannot upload work photos.'
          );
          if (!hasShownOffAlertRef.current || isManual) {
            hasShownOffAlertRef.current = true;
            Alert.alert(
              '📍 Location Permission Required',
              'Please allow Location access. Without location enabled, you cannot upload work photos.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Open Settings',
                  onPress: () => {
                    if (Linking.openSettings) Linking.openSettings();
                  },
                },
              ]
            );
          }
          return;
        }

        // 2. Check if device GPS / Location Services is turned ON
        const servicesEnabled = await Location.hasServicesEnabledAsync();
        if (!servicesEnabled) {
          updateStatus('off');
          setErrorMessage(
            '⚠️ Your device Location (GPS) is OFF! Please turn ON your location — without that you cannot upload images.'
          );
          await promptTurnOnLocation(isManual);
          return;
        }

        // Permission granted & location is ON: clear warning immediately
        hasShownOffAlertRef.current = false;
        updateStatus('active');
        setErrorMessage('');

        startContinuousWatch();

        let position = null;
        try {
          position = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          });
        } catch (highErr) {
          try {
            position = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
          } catch (balErr) {
            position = await Location.getLastKnownPositionAsync();
          }
        }

        if (position?.coords) {
          await sendLocationUpdate(position.coords, source);
        }
      } catch (err) {
        console.warn('GPS capture error:', err.message);
        updateStatus('off');
        setErrorMessage(
          '⚠️ Please turn ON device Location (GPS)! Without location enabled, you cannot upload images.'
        );
        await promptTurnOnLocation(isManual);
      }
    },
    [sendLocationUpdate, promptTurnOnLocation, startContinuousWatch, updateStatus]
  );

  useEffect(() => {
    captureAndSync('app_start');

    // Sync every minute (throttled to 30m for server logs)
    intervalRef.current = setInterval(() => {
      captureAndSync('auto_30min');
    }, 60 * 1000);

    // Quietly check GPS status so when user turns ON location, warning disappears immediately
    gpsCheckRef.current = setInterval(async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        const enabled = await Location.hasServicesEnabledAsync();
        if (perm.status !== 'granted' || !enabled) {
          const nextSt = perm.status !== 'granted' ? 'denied' : 'off';
          if (trackingStatusRef.current !== nextSt) {
            updateStatus(nextSt);
            setErrorMessage(
              '⚠️ Your Location (GPS) is OFF! Turn ON your location — without that you cannot upload images.'
            );
            promptTurnOnLocation(false);
          }
        } else if (trackingStatusRef.current !== 'active') {
          hasShownOffAlertRef.current = false;
          updateStatus('active');
          setErrorMessage('');
          captureAndSync('app_start');
        }
      } catch (e) {
        // ignore
      }
    }, 4000);

    // Re-check when returning from settings without resetting alert flag
    const appStateSub = AppState.addEventListener('change', async (nextAppState) => {
      if (nextAppState === 'active') {
        try {
          const perm = await Location.getForegroundPermissionsAsync();
          const enabled = await Location.hasServicesEnabledAsync();
          if (perm.status === 'granted' && enabled) {
            hasShownOffAlertRef.current = false;
            updateStatus('active');
            setErrorMessage('');
            captureAndSync('app_start');
          }
        } catch (e) {
          // ignore
        }
      }
    });

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (gpsCheckRef.current) clearInterval(gpsCheckRef.current);
      if (watcherRef.current && watcherRef.current.remove) {
        watcherRef.current.remove();
        watcherRef.current = null;
      }
      appStateSub.remove();
    };
  }, []);

  const isLocationOffOrDenied =
    trackingStatus === 'denied' || trackingStatus === 'off' || trackingStatus === 'error';

  return (
    <View
      style={[
        styles.card,
        trackingStatus === 'active'
          ? styles.cardActive
          : isLocationOffOrDenied
          ? styles.cardDenied
          : styles.cardDefault,
      ]}
    >
      <View style={styles.topRow}>
        <View style={styles.titleRow}>
          <Text style={styles.icon}>
            {trackingStatus === 'active' ? '🟢' : isLocationOffOrDenied ? '🔴' : '📍'}
          </Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, isLocationOffOrDenied && { color: '#b91c1c' }]}>
              {trackingStatus === 'active'
                ? 'Live GPS Tracking Active'
                : trackingStatus === 'denied'
                ? 'Location Permission Required'
                : isLocationOffOrDenied
                ? 'Location (GPS) is Turned OFF!'
                : 'Initializing GPS Tracker...'}
            </Text>
            <Text
              style={[styles.subtitle, isLocationOffOrDenied && { color: '#dc2626', fontWeight: '600' }]}
              numberOfLines={3}
            >
              {isLocationOffOrDenied
                ? errorMessage ||
                  '⚠️ Turn ON your location! Without location enabled, you cannot upload work photos.'
                : lastLocation?.name
                ? `📍 ${lastLocation.name}`
                : errorMessage || 'Auto-syncs every 30 mins while working'}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.syncBtn,
            isLocationOffOrDenied && { backgroundColor: '#dc2626', borderColor: '#dc2626' },
          ]}
          onPress={() => captureAndSync('manual_ping')}
          disabled={isSyncing}
        >
          {isSyncing ? (
            <ActivityIndicator
              size="small"
              color={isLocationOffOrDenied ? COLORS.white : COLORS.primary}
            />
          ) : (
            <Text style={[styles.syncBtnText, isLocationOffOrDenied && { color: COLORS.white }]}>
              {isLocationOffOrDenied ? '📍 Turn ON' : '🔄 Sync Now'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {lastPingTime && !isLocationOffOrDenied && (
        <Text style={styles.timeText}>
          Last synced: {lastPingTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
  },
  cardActive: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac',
  },
  cardDenied: {
    backgroundColor: '#fef2f2',
    borderColor: '#fca5a5',
  },
  cardDefault: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  icon: {
    fontSize: 18,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 11,
    color: COLORS.textLight,
    marginTop: 2,
  },
  syncBtn: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.primary,
    minWidth: 85,
    alignItems: 'center',
  },
  syncBtnText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  timeText: {
    fontSize: 10,
    color: COLORS.textLight,
    marginTop: 6,
    textAlign: 'right',
  },
});
