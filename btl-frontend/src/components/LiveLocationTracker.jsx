import React, { useEffect, useState, useRef, useCallback } from 'react';
import axios from '../utils/api';
import { FaMapMarkerAlt, FaSyncAlt, FaCheckCircle, FaExclamationTriangle } from 'react-icons/fa';

const TRACKING_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const STORAGE_KEY_LAST_PING = 'btl_last_location_ping';
const STORAGE_KEY_PERMISSION = 'btl_location_permission_granted';

const LiveLocationTracker = ({ user }) => {
  const [trackingStatus, setTrackingStatus] = useState('initializing'); // initializing, active, requesting, denied, error
  const [lastLocation, setLastLocation] = useState(null);
  const [lastPingTime, setLastPingTime] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const intervalRef = useRef(null);
  const isSyncingRef = useRef(false);

  // Send coordinates to backend
  const sendLocationUpdate = useCallback(async (position, source = 'auto_30min') => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    setIsSyncing(true);

    try {
      const { latitude, longitude, accuracy } = position.coords;

      const response = await axios.post('/locations/track', {
        lat: latitude,
        lng: longitude,
        accuracy: accuracy || null,
        source
      });

      if (response.data.success) {
        const now = Date.now();
        localStorage.setItem(STORAGE_KEY_LAST_PING, now.toString());
        localStorage.setItem(STORAGE_KEY_PERMISSION, 'true');
        setLastPingTime(new Date(now));
        setLastLocation({
          name: response.data.data.locationName,
          coordinates: response.data.data.coordinates
        });
        setTrackingStatus('active');
        setErrorMessage('');
      }
    } catch (err) {
      console.error('Failed to sync location:', err);
      // Keep tracking active if we already had permission
      if (trackingStatus !== 'active') {
        setErrorMessage('Failed to sync location with server');
      }
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [trackingStatus]);

  // Capture current position from browser
  const captureAndSync = useCallback((source = 'auto_30min') => {
    if (!navigator.geolocation) {
      setTrackingStatus('unsupported');
      setErrorMessage('Geolocation is not supported by your browser');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        sendLocationUpdate(position, source);
      },
      (error) => {
        console.warn('Geolocation capture error:', error.message);
        if (error.code === error.PERMISSION_DENIED) {
          setTrackingStatus('denied');
          setErrorMessage('Location permission denied. Please allow location access in your browser settings.');
        } else {
          setErrorMessage(`Location error: ${error.message}`);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 60000
      }
    );
  }, [sendLocationUpdate]);

  // Trigger permission request and start tracking
  const requestPermissionAndStart = useCallback(() => {
    setTrackingStatus('requesting');
    setErrorMessage('');

    if (!navigator.geolocation) {
      setTrackingStatus('unsupported');
      setErrorMessage('Geolocation is not supported by your browser');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        // Permission granted!
        localStorage.setItem(STORAGE_KEY_PERMISSION, 'true');
        sendLocationUpdate(position, 'app_start');
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setTrackingStatus('denied');
          setErrorMessage('Location permission is required for live tracking.');
        } else {
          setTrackingStatus('error');
          setErrorMessage(error.message);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 20000
      }
    );
  }, [sendLocationUpdate]);

  // Main tracking setup
  useEffect(() => {
    // 1. Check existing permission status
    const checkPermissionAndInit = async () => {
      const previouslyGranted = localStorage.getItem(STORAGE_KEY_PERMISSION) === 'true';

      if (navigator.permissions && navigator.permissions.query) {
        try {
          const status = await navigator.permissions.query({ name: 'geolocation' });
          if (status.state === 'granted') {
            captureAndSync('app_start');
          } else if (status.state === 'prompt') {
            if (previouslyGranted) {
              requestPermissionAndStart();
            } else {
              setTrackingStatus('requesting');
            }
          } else if (status.state === 'denied') {
            setTrackingStatus('denied');
          }

          status.onchange = () => {
            if (status.state === 'granted') {
              captureAndSync('app_start');
            } else if (status.state === 'denied') {
              setTrackingStatus('denied');
            }
          };
        } catch {
          // Fallback if query throws
          if (previouslyGranted) {
            captureAndSync('app_start');
          } else {
            setTrackingStatus('requesting');
          }
        }
      } else {
        // Browser doesn't support permissions.query
        if (previouslyGranted) {
          captureAndSync('app_start');
        } else {
          setTrackingStatus('requesting');
        }
      }
    };

    checkPermissionAndInit();

    // 2. Set up 30-minute interval timer
    intervalRef.current = setInterval(() => {
      captureAndSync('auto_30min');
    }, TRACKING_INTERVAL_MS);

    // 3. Page visibility change handler (catches up if tab was backgrounded or phone was locked)
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible' || !document.hidden) {
        const lastPing = parseInt(localStorage.getItem(STORAGE_KEY_LAST_PING) || '0', 10);
        const elapsed = Date.now() - lastPing;
        if (elapsed >= TRACKING_INTERVAL_MS) {
          captureAndSync('auto_30min');
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);
    window.addEventListener('online', handleVisibilityOrFocus);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      window.removeEventListener('online', handleVisibilityOrFocus);
    };
  }, [captureAndSync, requestPermissionAndStart]);

  // Formatting helper for time
  const formatTime = (date) => {
    if (!date) return '';
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Render tracking pill/banner
  return (
    <div style={{
      margin: '0 0 16px 0',
      padding: '12px 16px',
      borderRadius: '10px',
      background: trackingStatus === 'active' 
        ? 'linear-gradient(135deg, #e6f7ff 0%, #f0fdf4 100%)' 
        : trackingStatus === 'denied'
        ? '#fff1f0'
        : '#fffbe6',
      border: `1px solid ${
        trackingStatus === 'active' ? '#86efac' : trackingStatus === 'denied' ? '#fca5a5' : '#fde047'
      }`,
      boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      fontSize: '13px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            display: 'inline-block',
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            backgroundColor: trackingStatus === 'active' ? '#22c55e' : trackingStatus === 'denied' ? '#ef4444' : '#eab308',
            boxShadow: trackingStatus === 'active' ? '0 0 6px #22c55e' : 'none'
          }} />
          <strong style={{ color: '#1e293b' }}>
            {trackingStatus === 'active' && 'Live Location Tracing Active'}
            {trackingStatus === 'requesting' && 'Live Location Permission Required'}
            {trackingStatus === 'denied' && 'Location Permission Denied'}
            {trackingStatus === 'initializing' && 'Checking Location Services...'}
            {trackingStatus === 'unsupported' && 'Geolocation Not Supported'}
          </strong>
          <span style={{ fontSize: '11px', color: '#64748b', background: '#ffffff', padding: '2px 8px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            Updates Every 30 Min
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {trackingStatus === 'requesting' && (
            <button
              onClick={requestPermissionAndStart}
              type="button"
              style={{
                backgroundColor: '#0151ba',
                color: '#ffffff',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <FaMapMarkerAlt /> Enable Location Tracking
            </button>
          )}

          {trackingStatus === 'active' && (
            <button
              onClick={() => captureAndSync('manual_ping')}
              disabled={isSyncing}
              type="button"
              style={{
                backgroundColor: '#ffffff',
                color: '#0151ba',
                border: '1px solid #cbd5e1',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: '600',
                cursor: isSyncing ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
              title="Sync current location now"
            >
              <FaSyncAlt className={isSyncing ? 'fa-spin' : ''} /> {isSyncing ? 'Syncing...' : 'Sync Now'}
            </button>
          )}
        </div>
      </div>

      {trackingStatus === 'active' && lastLocation && (
        <div style={{ fontSize: '12px', color: '#334155', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
          <FaMapMarkerAlt style={{ color: '#0151ba', marginTop: '3px', flexShrink: 0 }} />
          <div>
            <span style={{ fontWeight: '600' }}>Current Location:</span> {lastLocation.name}
            {lastPingTime && (
              <span style={{ marginLeft: '8px', color: '#64748b', fontSize: '11px' }}>
                (Last updated: {formatTime(lastPingTime)})
              </span>
            )}
          </div>
        </div>
      )}

      {errorMessage && (
        <div style={{ fontSize: '12px', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <FaExclamationTriangle />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
};

export default LiveLocationTracker;
