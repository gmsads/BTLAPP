import React, { useState, useEffect, useRef } from 'react';
import axios from '../utils/api';
import L from 'leaflet';
import { 
  FaMapMarkerAlt, 
  FaSyncAlt, 
  FaUser, 
  FaPhone, 
  FaExternalLinkAlt, 
  FaHistory, 
  FaCheckCircle, 
  FaTimes, 
  FaSearch, 
  FaClock, 
  FaSignal, 
  FaRoute, 
  FaCalendarAlt, 
  FaCar, 
  FaChevronRight, 
  FaCompass 
} from 'react-icons/fa';

// Helper: Haversine distance in meters
const calculateDistanceMeters = (lat1, lon1, lat2, lon2) => {
  if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) return 0;
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Helper: Check if vehicle is moving (Live) or stationary / not moved in > 1 hr (Last Location)
const checkVehicleMovementStatus = (worker, logs, dateStr) => {
  const isToday = dateStr === new Date().toISOString().split('T')[0];
  if (!isToday) {
    return {
      isLive: false,
      isMoving: false,
      statusLabel: 'Last Location',
      subText: `Route on ${dateStr}`,
      minutesAgo: null,
      badgeColor: '#475569',
      badgeBg: '#f1f5f9'
    };
  }

  const now = Date.now();
  const lastTime = logs && logs.length > 0
    ? new Date(logs[logs.length - 1].recordedAt).getTime()
    : (worker?.lastUpdated ? new Date(worker.lastUpdated).getTime() : null);

  if (!lastTime) {
    return {
      isLive: false,
      isMoving: false,
      statusLabel: 'No Location',
      subText: 'No coordinates logged',
      minutesAgo: null,
      badgeColor: '#64748b',
      badgeBg: '#f1f5f9'
    };
  }

  const diffMs = now - lastTime;
  const minutesAgo = Math.max(0, Math.round(diffMs / (60 * 1000)));

  // If vehicle has not moved or reported in more than 1 hour (60 minutes)
  if (minutesAgo > 60) {
    const hoursAgo = (minutesAgo / 60).toFixed(1);
    return {
      isLive: false,
      isMoving: false,
      statusLabel: 'Last Location',
      subText: `Not moved in ${hoursAgo} hrs (${minutesAgo}m ago)`,
      minutesAgo,
      badgeColor: '#475569',
      badgeBg: '#f1f5f9'
    };
  }

  // If logs exist for today, check if vehicle has remained stationary (< 50m) for over 60 minutes
  if (logs && logs.length >= 2) {
    const latest = logs[logs.length - 1];
    // Find logs from earlier within the past 90 minutes
    const logsInPastHour = logs.filter(l => (now - new Date(l.recordedAt).getTime()) <= 90 * 60 * 1000);
    if (logsInPastHour.length >= 2) {
      const firstInWindow = logsInPastHour[0];
      const dist = calculateDistanceMeters(
        latest.coordinates.lat, latest.coordinates.lng,
        firstInWindow.coordinates.lat, firstInWindow.coordinates.lng
      );
      const timeSpanMin = Math.round((new Date(latest.recordedAt).getTime() - new Date(firstInWindow.recordedAt).getTime()) / (60 * 1000));
      // If at same spot (< 50 meters) for 60+ minutes, not moved > 1 hr
      if (timeSpanMin >= 60 && dist < 50) {
        return {
          isLive: false,
          isMoving: false,
          statusLabel: 'Last Location',
          subText: 'Stationary at spot for > 1 hr',
          minutesAgo,
          badgeColor: '#b45309',
          badgeBg: '#fef3c7'
        };
      }
    }
  }

  // If backend marked it as not moving or not live
  if (worker && worker.isLive === false) {
    return {
      isLive: false,
      isMoving: false,
      statusLabel: 'Last Location',
      subText: minutesAgo > 60 ? `Not moved in ${(minutesAgo / 60).toFixed(1)} hrs` : 'Stationary',
      minutesAgo,
      badgeColor: '#475569',
      badgeBg: '#f1f5f9'
    };
  }

  // Actively moving within the last 1 hour
  return {
    isLive: true,
    isMoving: true,
    statusLabel: 'Live (Moving)',
    subText: minutesAgo === 0 ? 'Moving now' : `Moving (${minutesAgo}m ago)`,
    minutesAgo,
    badgeColor: '#166534',
    badgeBg: '#dcfce7'
  };
};

const LiveTrackingView = ({ colors, isMobile, initialWorker, onClearWorkerFilter }) => {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedWorkerId, setSelectedWorkerId] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [routeLogs, setRouteLogs] = useState([]);
  const [routeLoading, setRouteLoading] = useState(false);
  const [activePointIndex, setActivePointIndex] = useState(null);
  const [viewMode, setViewMode] = useState('trace'); // 'trace' (single vehicle route) or 'all' (fleet map)
  const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'live', 'last_location'
  const [searchTerm, setSearchTerm] = useState(initialWorker || '');
  const [lastRefreshed, setLastRefreshed] = useState(null);

  // Map Refs
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const polylineRef = useRef(null);
  const glowPolylineRef = useRef(null);

  const primaryColor = colors?.primary || '#0151ba';
  const secondaryColor = colors?.secondary || '#f2c43b';

  // 1. Fetch all workers and their current live locations
  const fetchLiveLocations = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/locations/live');
      if (res.data.success) {
        const fetched = res.data.workers || [];
        setWorkers(fetched);
        setLastRefreshed(new Date());

        // Default to initialWorker or first worker with location or first worker
        setSelectedWorkerId(prevId => {
          if (prevId && fetched.some(w => w._id === prevId)) return prevId;
          if (initialWorker) {
            const matched = fetched.find(w => w.username?.toLowerCase() === initialWorker.toLowerCase());
            if (matched) return matched._id;
          }
          const withLoc = fetched.find(w => w.hasLocation && w.coordinates);
          return withLoc ? withLoc._id : (fetched[0]?._id || null);
        });
      }
    } catch (err) {
      console.error('Failed to fetch live locations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveLocations();
    // Auto-refresh every 2 minutes
    const refreshInterval = setInterval(fetchLiveLocations, 2 * 60 * 1000);
    return () => clearInterval(refreshInterval);
  }, []);

  // Sync initialWorker prop if changed from parent
  useEffect(() => {
    if (initialWorker && workers.length > 0) {
      const match = workers.find(w => w.username?.toLowerCase() === initialWorker.toLowerCase());
      if (match) {
        setSelectedWorkerId(match._id);
        setViewMode('trace');
      }
    }
  }, [initialWorker, workers]);

  // Selected worker object
  const selectedWorker = workers.find(w => w._id === selectedWorkerId) || null;

  // 2. Fetch route history for the selected worker on selectedDate
  const fetchRouteHistory = async (workerId, dateStr) => {
    if (!workerId) return;
    try {
      setRouteLoading(true);
      const res = await axios.get(`/locations/history/${workerId}?date=${dateStr}`);
      if (res.data.success) {
        const rawLogs = res.data.logs || [];
        const THIRTY_MINUTES_MS = 30 * 60 * 1000;
        const filteredLogs = [];

        if (rawLogs.length > 0) {
          // 1. Always include the first stop (Start Point)
          filteredLogs.push(rawLogs[0]);
          let lastTime = new Date(rawLogs[0].recordedAt).getTime();

          // 2. Include intermediate points spaced by at least 30 minutes
          for (let i = 1; i < rawLogs.length; i++) {
            const itemTime = new Date(rawLogs[i].recordedAt).getTime();
            if (itemTime - lastTime >= THIRTY_MINUTES_MS) {
              filteredLogs.push(rawLogs[i]);
              lastTime = itemTime;
            }
          }

          // 3. If latest log is at least 15 minutes after last included point, include it as latest/live
          const latestLog = rawLogs[rawLogs.length - 1];
          const latestTime = new Date(latestLog.recordedAt).getTime();
          const lastInFiltered = filteredLogs[filteredLogs.length - 1];
          const lastInFilteredTime = new Date(lastInFiltered.recordedAt).getTime();

          if (latestLog._id?.toString() !== lastInFiltered._id?.toString() && (latestTime - lastInFilteredTime) >= 15 * 60 * 1000) {
            filteredLogs.push(latestLog);
          }
        }

        setRouteLogs(filteredLogs);
        setActivePointIndex(null);
      }
    } catch (err) {
      console.error('Failed to fetch worker route history:', err);
      setRouteLogs([]);
    } finally {
      setRouteLoading(false);
    }
  };

  useEffect(() => {
    if (selectedWorkerId && viewMode === 'trace') {
      fetchRouteHistory(selectedWorkerId, selectedDate);
    }
  }, [selectedWorkerId, selectedDate, viewMode]);

  // Clean up Leaflet on unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (e) {
          console.warn('Map cleanup error:', e);
        }
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Compute status for selected worker
  const currentWorkerStatus = selectedWorker
    ? checkVehicleMovementStatus(selectedWorker, routeLogs, selectedDate)
    : { isLive: false, isMoving: false, statusLabel: 'Last Location', subText: '' };

  // 3. Render Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Initialize Map instance if not created
    if (!mapInstanceRef.current) {
      if (mapContainerRef.current._leaflet_id) {
        mapContainerRef.current._leaflet_id = null;
      }
      try {
        const map = L.map(mapContainerRef.current).setView([20.5937, 78.9629], 5);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 19
        }).addTo(map);

        mapInstanceRef.current = map;
      } catch (err) {
        console.error('Leaflet init error:', err);
        return;
      }
    }

    const map = mapInstanceRef.current;

    // Clear existing markers & polylines
    markersRef.current.forEach(m => {
      try { m.remove(); } catch (e) {}
    });
    markersRef.current = [];

    if (polylineRef.current) {
      try { polylineRef.current.remove(); } catch (e) {}
      polylineRef.current = null;
    }
    if (glowPolylineRef.current) {
      try { glowPolylineRef.current.remove(); } catch (e) {}
      glowPolylineRef.current = null;
    }

    // MODE 1: TRACE INDIVIDUAL VEHICLE WITH CONNECTING DOTS
    if (viewMode === 'trace' && selectedWorker) {
      const validLogs = routeLogs.filter(
        l => l.coordinates && !isNaN(l.coordinates.lat) && !isNaN(l.coordinates.lng)
      );

      const latlngs = validLogs.map(l => [l.coordinates.lat, l.coordinates.lng]);

      const vehicleIcon = selectedWorker.vehicleType === 'mobile-vans' ? '🚐' :
                          selectedWorker.vehicleType?.startsWith('auto') ? '🛺' :
                          selectedWorker.vehicleType === 'try-cycle' ? '🚲' : '🚗';

      // Movement status check: is vehicle moving or has it not moved > 1 hr?
      const movementStatus = checkVehicleMovementStatus(selectedWorker, validLogs, selectedDate);
      const isLiveMoving = movementStatus.isLive;

      // If we have history logs for this date
      if (latlngs.length > 0) {
        // Draw Connecting Lines if 2 or more points
        if (latlngs.length >= 2) {
          // Glow background line
          glowPolylineRef.current = L.polyline(latlngs, {
            color: '#60a5fa',
            weight: 7,
            opacity: 0.35,
            lineCap: 'round',
            lineJoin: 'round'
          }).addTo(map);

          // Connecting route line with dashed dots effect
          polylineRef.current = L.polyline(latlngs, {
            color: '#0151ba',
            weight: 3.5,
            opacity: 0.9,
            dashArray: '8, 8', // connecting dots effect
            lineCap: 'round',
            lineJoin: 'round'
          }).addTo(map);
        }

        // Add Connecting Dots (Waypoints)
        validLogs.forEach((log, idx) => {
          const isStart = idx === 0;
          const isLatest = idx === validLogs.length - 1;
          const pointNum = idx + 1;
          const timeStr = new Date(log.recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

          let dotHtml = '';
          let iconSize = [24, 24];
          let iconAnchor = [12, 12];

          if (isStart) {
            // Start Point Dot (Green #1)
            iconSize = [28, 28];
            iconAnchor = [14, 14];
            dotHtml = `
              <div style="position:relative; width:28px; height:28px;">
                <div style="
                  background: #16a34a; 
                  color: #ffffff; 
                  width: 28px; 
                  height: 28px; 
                  border-radius: 50%; 
                  border: 2.5px solid #ffffff; 
                  box-shadow: 0 3px 8px rgba(0,0,0,0.35); 
                  display: flex; 
                  align-items: center; 
                  justify-content: center; 
                  font-weight: 800; 
                  font-size: 12px;
                ">
                  1
                </div>
                <div style="
                  position: absolute; 
                  top: -18px; 
                  left: 50%; 
                  transform: translateX(-50%); 
                  background: #166534; 
                  color: #ffffff; 
                  font-size: 9px; 
                  font-weight: 700; 
                  padding: 1px 5px; 
                  border-radius: 4px; 
                  white-space: nowrap;
                  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
                ">
                  START
                </div>
              </div>
            `;
          } else if (isLatest) {
            // LATEST POINT: Only show "Live" with pulse IF vehicle is actively moving.
            // If vehicle not moved more than 1 hr, show "Last Location" with NO live pulse!
            if (isLiveMoving) {
              iconSize = [34, 34];
              iconAnchor = [17, 17];
              dotHtml = `
                <div style="position:relative; width:34px; height:34px;">
                  <div style="
                    position: absolute; 
                    width: 44px; 
                    height: 44px; 
                    top: -5px; 
                    left: -5px; 
                    border-radius: 50%; 
                    background: rgba(34, 197, 94, 0.4); 
                    animation: pulse 2s infinite;
                  "></div>
                  <div style="
                    background: #16a34a; 
                    color: #ffffff; 
                    width: 34px; 
                    height: 34px; 
                    border-radius: 50%; 
                    border: 3px solid #ffffff; 
                    box-shadow: 0 4px 12px rgba(22, 163, 74, 0.45); 
                    display: flex; 
                    align-items: center; 
                    justify-content: center; 
                    font-size: 15px;
                  ">
                    ${vehicleIcon}
                  </div>
                  <div style="
                    position: absolute; 
                    bottom: -18px; 
                    left: 50%; 
                    transform: translateX(-50%); 
                    background: #166534; 
                    color: #ffffff; 
                    font-size: 9px; 
                    font-weight: 800; 
                    padding: 1px 6px; 
                    border-radius: 4px; 
                    white-space: nowrap;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.25);
                  ">
                    LIVE #${pointNum}
                  </div>
                </div>
              `;
            } else {
              // Not moved > 1 hr: Show steady "LAST LOCATION" marker, NOT live!
              iconSize = [32, 32];
              iconAnchor = [16, 16];
              dotHtml = `
                <div style="position:relative; width:32px; height:32px;">
                  <div style="
                    background: #475569; 
                    color: #ffffff; 
                    width: 32px; 
                    height: 32px; 
                    border-radius: 50%; 
                    border: 2.5px solid #ffffff; 
                    box-shadow: 0 3px 8px rgba(0,0,0,0.3); 
                    display: flex; 
                    align-items: center; 
                    justify-content: center; 
                    font-size: 14px;
                  ">
                    ${vehicleIcon}
                  </div>
                  <div style="
                    position: absolute; 
                    bottom: -18px; 
                    left: 50%; 
                    transform: translateX(-50%); 
                    background: #334155; 
                    color: #ffffff; 
                    font-size: 9px; 
                    font-weight: 800; 
                    padding: 1px 6px; 
                    border-radius: 4px; 
                    white-space: nowrap;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.25);
                  ">
                    LAST LOCATION #${pointNum}
                  </div>
                </div>
              `;
            }
          } else {
            // Intermediate Waypoint Dot
            iconSize = [22, 22];
            iconAnchor = [11, 11];
            dotHtml = `
              <div style="
                background: #0284c7; 
                color: #ffffff; 
                width: 22px; 
                height: 22px; 
                border-radius: 50%; 
                border: 2px solid #ffffff; 
                box-shadow: 0 2px 6px rgba(0,0,0,0.25); 
                display: flex; 
                align-items: center; 
                justify-content: center; 
                font-weight: 700; 
                font-size: 11px;
              ">
                ${pointNum}
              </div>
            `;
          }

          const dotIcon = L.divIcon({
            className: 'custom-route-dot',
            html: dotHtml,
            iconSize,
            iconAnchor,
            popupAnchor: [0, -12]
          });

          const popupContent = `
            <div style="font-family: inherit; font-size: 12px; min-width: 220px; padding: 4px;">
              <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 4px;">
                <span style="
                  background: ${isStart ? '#dcfce7' : isLatest ? (isLiveMoving ? '#dcfce7' : '#f1f5f9') : '#f1f5f9'};
                  color: ${isStart ? '#166534' : isLatest ? (isLiveMoving ? '#166534' : '#475569') : '#475569'};
                  font-weight: 700;
                  padding: 2px 8px;
                  border-radius: 10px;
                  font-size: 11px;
                ">
                  ${isStart ? '🟢 Point #1 (Start)' : isLatest ? (isLiveMoving ? `🟢 Point #${pointNum} (Live - Moving)` : `⚪ Point #${pointNum} (Last Location)`) : `📍 Point #${pointNum}`}
                </span>
                <span style="color:#64748b; font-size:11px; font-weight:600;">
                  ${timeStr}
                </span>
              </div>
              <div style="color: #0f172a; font-weight: 600; margin: 6px 0 4px 0; font-size: 13px;">
                ${selectedWorker.username} ${selectedWorker.vehicleDetails?.vehicleNumber ? `(${selectedWorker.vehicleDetails.vehicleNumber})` : ''}
              </div>
              ${isLatest && !isLiveMoving ? `
                <div style="color: #b45309; font-size: 11px; font-weight: 600; margin-bottom: 4px;">
                  ⚠️ ${movementStatus.subText}
                </div>
              ` : ''}
              <div style="color: #334155; line-height: 1.35; margin-bottom: 6px;">
                📍 ${log.locationName}
              </div>
              <div style="color: #64748b; font-size: 11px; margin-bottom: 6px;">
                Coords: ${log.coordinates.lat?.toFixed(5)}, ${log.coordinates.lng?.toFixed(5)}
              </div>
              <a 
                href="https://www.google.com/maps?q=${log.coordinates.lat},${log.coordinates.lng}" 
                target="_blank" 
                rel="noopener noreferrer" 
                style="color: #0151ba; text-decoration: none; font-weight: 700; font-size: 11px; display: inline-flex; align-items: center; gap: 4px;"
              >
                Open Google Maps ↗
              </a>
            </div>
          `;

          const marker = L.marker([log.coordinates.lat, log.coordinates.lng], { icon: dotIcon })
            .addTo(map)
            .bindPopup(popupContent);

          marker.on('click', () => {
            setActivePointIndex(idx);
          });

          markersRef.current.push(marker);
        });

        // Fit map bounds to show complete journey path
        map.fitBounds(latlngs, { padding: [50, 50], maxZoom: 16 });

      } else if (selectedWorker.hasLocation && selectedWorker.coordinates) {
        // Fallback: If no history logs yet for this date, show current/last known position
        const { lat, lng } = selectedWorker.coordinates;
        const fallbackIcon = L.divIcon({
          className: 'custom-single-marker',
          html: `
            <div style="position:relative; width:30px; height:30px;">
              ${isLiveMoving ? '<div style="position:absolute; width:38px; height:38px; top:-4px; left:-4px; border-radius:50%; background:rgba(34,197,94,0.35); animation:pulse 2s infinite;"></div>' : ''}
              <div style="
                background: ${isLiveMoving ? '#16a34a' : '#475569'}; 
                color: #ffffff; 
                width: 30px; 
                height: 30px; 
                border-radius: 50%; 
                border: 2.5px solid #ffffff; 
                box-shadow: 0 3px 10px rgba(0,0,0,0.3); 
                display: flex; 
                align-items: center; 
                justify-content: center; 
                font-size: 14px;
              ">
                ${vehicleIcon}
              </div>
              <div style="
                position: absolute; 
                bottom: -18px; 
                left: 50%; 
                transform: translateX(-50%); 
                background: ${isLiveMoving ? '#166534' : '#334155'}; 
                color: #ffffff; 
                font-size: 9px; 
                font-weight: 800; 
                padding: 1px 6px; 
                border-radius: 4px; 
                white-space: nowrap;
              ">
                ${isLiveMoving ? 'LIVE' : 'LAST LOCATION'}
              </div>
            </div>
          `,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
          popupAnchor: [0, -10]
        });

        const singlePopup = `
          <div style="font-family: inherit; font-size: 12px; min-width: 200px; padding: 4px;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 4px;">
              <strong style="color:#0f172a; font-size:13px;">${selectedWorker.username}</strong>
              <span style="
                background: ${isLiveMoving ? '#dcfce7' : '#f1f5f9'};
                color: ${isLiveMoving ? '#166534' : '#475569'};
                font-weight: 700;
                padding: 1px 6px;
                border-radius: 8px;
                font-size: 10px;
              ">
                ${isLiveMoving ? '🟢 Live Moving' : '⚪ Last Location'}
              </span>
            </div>
            ${!isLiveMoving ? `
              <div style="color: #b45309; font-size: 11px; font-weight: 600; margin-bottom: 4px;">
                ⚠️ ${movementStatus.subText}
              </div>
            ` : ''}
            <div style="color:#334155; margin: 4px 0;">📍 ${selectedWorker.locationName}</div>
            <div style="color:#64748b; font-size:11px;">
              Updated: ${selectedWorker.lastUpdated ? new Date(selectedWorker.lastUpdated).toLocaleTimeString() : 'N/A'}
            </div>
          </div>
        `;

        const marker = L.marker([lat, lng], { icon: fallbackIcon })
          .addTo(map)
          .bindPopup(singlePopup);

        markersRef.current.push(marker);
        map.setView([lat, lng], 15);
      }

    } else {
      // MODE 2: FLEET OVERVIEW (ALL WORKERS' CURRENT POSITIONS)
      const bounds = [];
      const workersWithCoords = workers.filter(
        w => w.hasLocation && w.coordinates && !isNaN(w.coordinates.lat) && !isNaN(w.coordinates.lng)
      );

      workersWithCoords.forEach((worker) => {
        const { lat, lng } = worker.coordinates;
        bounds.push([lat, lng]);

        const wStatus = checkVehicleMovementStatus(worker, null, selectedDate);
        const isLive = wStatus.isLive;
        const markerColor = isLive ? '#16a34a' : '#64748b';
        const vIcon = worker.vehicleType === 'mobile-vans' ? '🚐' :
                      worker.vehicleType?.startsWith('auto') ? '🛺' : '🚗';

        const customIcon = L.divIcon({
          className: 'custom-fleet-marker',
          html: `
            <div style="position:relative; width:26px; height:26px;">
              ${isLive ? '<div style="position:absolute; width:34px; height:34px; top:-4px; left:-4px; border-radius:50%; background:rgba(34,197,94,0.35); animation:pulse 2s infinite;"></div>' : ''}
              <div style="
                width: 26px; 
                height: 26px; 
                border-radius: 50%; 
                background: ${markerColor}; 
                border: 2px solid #ffffff; 
                box-shadow: 0 2px 8px rgba(0,0,0,0.3); 
                display: flex; 
                align-items: center; 
                justify-content: center; 
                color: #ffffff; 
                font-size: 12px;
              ">
                ${vIcon}
              </div>
            </div>
          `,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
          popupAnchor: [0, -10]
        });

        const popup = `
          <div style="font-family: inherit; font-size: 13px; min-width: 210px; padding: 4px;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 4px;">
              <strong style="color: #0f172a; font-size: 14px;">${worker.username}</strong>
              <span style="
                padding: 2px 6px; 
                border-radius: 10px; 
                font-size: 10px; 
                font-weight: 700; 
                background: ${isLive ? '#dcfce7' : '#f1f5f9'}; 
                color: ${isLive ? '#166534' : '#475569'};
              ">
                ${isLive ? '🟢 Live Moving' : '⚪ Last Location'}
              </span>
            </div>
            <div style="color: #64748b; font-size: 12px; margin-bottom: 4px;">
              📞 ${worker.contactNumber || 'N/A'}
            </div>
            ${!isLive ? `
              <div style="color: #b45309; font-size: 11px; font-weight: 600; margin-bottom: 4px;">
                ⚠️ ${wStatus.subText}
              </div>
            ` : ''}
            ${worker.vehicleDetails?.vehicleNumber ? `
              <div style="font-size: 11px; color: #1d4ed8; font-weight: 600; margin-bottom: 4px;">
                🚗 ${worker.vehicleDetails.vehicleNumber}
              </div>
            ` : ''}
            <div style="color: #334155; margin-bottom: 6px; line-height: 1.3;">
              📍 <strong>Location:</strong> ${worker.locationName}
            </div>
            <button 
              id="btn-trace-${worker._id}" 
              style="
                background: #0151ba; 
                color: #ffffff; 
                border: none; 
                padding: 5px 10px; 
                border-radius: 6px; 
                font-size: 11px; 
                font-weight: 700; 
                cursor: pointer;
                width: 100%;
                margin-top: 4px;
              "
            >
              Trace Vehicle Route ↗
            </button>
          </div>
        `;

        const marker = L.marker([lat, lng], { icon: customIcon })
          .addTo(map)
          .bindPopup(popup);

        marker.on('popupopen', () => {
          const btn = document.getElementById(`btn-trace-${worker._id}`);
          if (btn) {
            btn.onclick = () => {
              setSelectedWorkerId(worker._id);
              setViewMode('trace');
            };
          }
        });

        markersRef.current.push(marker);
      });

      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      }
    }

  }, [viewMode, selectedWorker, routeLogs, workers, selectedDate]);

  // Center on point from right-hand timeline click
  const handlePointClick = (idx, log) => {
    setActivePointIndex(idx);
    if (!mapInstanceRef.current || !log.coordinates) return;
    const { lat, lng } = log.coordinates;
    mapInstanceRef.current.setView([lat, lng], 16, { animate: true });
    if (markersRef.current[idx]) {
      markersRef.current[idx].openPopup();
    }
  };

  // Filter workers list for selector
  const filteredWorkers = workers.filter(worker => {
    const matchesSearch = 
      worker.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      worker.contactNumber?.includes(searchTerm) ||
      worker.vehicleDetails?.vehicleNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      worker.locationName?.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;
    const wStatus = checkVehicleMovementStatus(worker, null, selectedDate);
    if (filterStatus === 'live') return wStatus.isLive;
    if (filterStatus === 'last_location') return !wStatus.isLive;
    return true;
  });

  const liveCount = workers.filter(w => checkVehicleMovementStatus(w, null, selectedDate).isLive).length;
  const lastLocationCount = workers.length - liveCount;

  return (
    <div style={{ padding: isMobile ? '12px' : '20px', background: '#f8fafd' }}>
      <style>{`
        @keyframes pulse {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); opacity: 1; }
          70% { transform: scale(1.35); box-shadow: 0 0 0 10px rgba(34, 197, 94, 0); opacity: 0; }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); opacity: 0; }
        }
      `}</style>

      {/* Top Header Bar */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        marginBottom: '16px'
      }}>
        <div>
          <h2 style={{ color: primaryColor, margin: '0 0 4px 0', fontSize: isMobile ? '20px' : '23px', fontWeight: '800' }}>
            Live Vehicle & Location Tracing
          </h2>
          <p style={{ color: '#64748b', margin: 0, fontSize: '13px' }}>
            Active vehicles moving within 1 hr show live; vehicles stopped or not moved in &gt; 1 hr show last location.
          </p>
        </div>

        {/* View Mode Switcher and Refresh */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{
            display: 'flex',
            background: '#e2e8f0',
            borderRadius: '8px',
            padding: '3px'
          }}>
            <button
              onClick={() => setViewMode('trace')}
              style={{
                border: 'none',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: viewMode === 'trace' ? primaryColor : 'transparent',
                color: viewMode === 'trace' ? '#ffffff' : '#475569',
                transition: 'all 0.2s'
              }}
            >
              <FaRoute /> Vehicle Route Tracing
            </button>
            <button
              onClick={() => setViewMode('all')}
              style={{
                border: 'none',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: viewMode === 'all' ? primaryColor : 'transparent',
                color: viewMode === 'all' ? '#ffffff' : '#475569',
                transition: 'all 0.2s'
              }}
            >
              <FaCompass /> All Vehicles Map ({liveCount} Live Moving)
            </button>
          </div>

          <button
            onClick={() => {
              fetchLiveLocations();
              if (selectedWorkerId) fetchRouteHistory(selectedWorkerId, selectedDate);
            }}
            disabled={loading || routeLoading}
            style={{
              backgroundColor: '#ffffff',
              color: primaryColor,
              border: `1.5px solid ${secondaryColor}`,
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: '700',
              cursor: (loading || routeLoading) ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.04)'
            }}
          >
            <FaSyncAlt className={(loading || routeLoading) ? 'fa-spin' : ''} />
            {(loading || routeLoading) ? 'Syncing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Main Container: Left Side Map & Right Side Details */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1.35fr 1fr',
        gap: '16px',
        alignItems: 'start'
      }}>
        {/* ================= LEFT SIDE: LIVE MAP WITH CONNECTING DOTS ================= */}
        <div style={{
          background: '#ffffff',
          borderRadius: '12px',
          border: '1.5px solid #e2e8f0',
          overflow: 'hidden',
          boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* Map Header */}
          <div style={{
            padding: '12px 16px',
            background: '#ffffff',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                background: currentWorkerStatus.isLive ? '#dcfce7' : '#f1f5f9',
                color: currentWorkerStatus.isLive ? '#16a34a' : '#64748b',
                padding: '6px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <FaMapMarkerAlt />
              </span>
              <div>
                <strong style={{ color: '#0f172a', fontSize: '14px', display: 'block' }}>
                  {viewMode === 'trace' 
                    ? (currentWorkerStatus.isLive
                        ? `🟢 Live Trail: ${selectedWorker?.username || 'Select Vehicle'} (Moving)`
                        : `📍 ${selectedWorker?.username || 'Select Vehicle'} (Last Location)`)
                    : 'Fleet Vehicles Map'}
                </strong>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  {viewMode === 'trace'
                    ? `${routeLogs.length} Waypoints on ${selectedDate} • ${currentWorkerStatus.subText}`
                    : `${liveCount} Live Moving • ${lastLocationCount} Last Location`}
                </span>
              </div>
            </div>

            {viewMode === 'trace' && routeLogs.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px', fontWeight: '600' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#166534' }}>
                  <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#16a34a' }}></span>
                  Start (Dot #1)
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#0369a1' }}>
                  <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#0284c7' }}></span>
                  Trail
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: currentWorkerStatus.isLive ? '#166534' : '#475569' }}>
                  <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: currentWorkerStatus.isLive ? '#22c55e' : '#64748b' }}></span>
                  {currentWorkerStatus.isLive ? 'Live (Moving)' : 'Last Location'}
                </span>
              </div>
            )}
          </div>

          {/* Leaflet Map Div */}
          <div 
            ref={mapContainerRef} 
            style={{ 
              height: isMobile ? '380px' : '620px', 
              width: '100%', 
              zIndex: 1 
            }} 
          />
        </div>

        {/* ================= RIGHT SIDE: JOURNEY DETAILS & WHERE IT WENT ================= */}
        <div style={{
          background: '#ffffff',
          borderRadius: '12px',
          border: '1.5px solid #e2e8f0',
          boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: isMobile ? 'none' : '680px',
          overflow: 'hidden'
        }}>
          {/* Right Header: Vehicle Selector & Date */}
          <div style={{
            padding: '16px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <h3 style={{ margin: 0, color: primaryColor, fontSize: '15px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FaCar /> Vehicle Journey Details
              </h3>
              {lastRefreshed && (
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  Sync: {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>

            {/* Select Vehicle Dropdown */}
            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>
                SELECT USER / VEHICLE TO TRACE:
              </label>
              <select
                value={selectedWorkerId || ''}
                onChange={(e) => {
                  setSelectedWorkerId(e.target.value);
                  setViewMode('trace');
                }}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: '#0f172a',
                  background: '#ffffff',
                  outline: 'none'
                }}
              >
                {workers.map(w => {
                  const wStatus = checkVehicleMovementStatus(w, null, selectedDate);
                  return (
                    <option key={w._id} value={w._id}>
                      {w.username} {w.vehicleType ? `(${w.vehicleType}${w.vehicleDetails?.vehicleNumber ? ' - ' + w.vehicleDetails.vehicleNumber : ''})` : ''} - {wStatus.isLive ? '🟢 Live Moving' : '⚪ Last Location'}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Date Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '6px 10px' }}>
                <FaCalendarAlt style={{ color: '#64748b', fontSize: '12px' }} />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  style={{
                    border: 'none',
                    outline: 'none',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#1e293b',
                    width: '100%'
                  }}
                />
              </div>
              <button
                onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
                style={{
                  background: selectedDate === new Date().toISOString().split('T')[0] ? primaryColor : '#ffffff',
                  color: selectedDate === new Date().toISOString().split('T')[0] ? '#ffffff' : '#334155',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
              >
                Today
              </button>
            </div>
          </div>

          {/* Selected Worker & Vehicle Summary Card */}
          {selectedWorker && (
            <div style={{
              padding: '12px 16px',
              borderBottom: '1px solid #e2e8f0',
              background: '#ffffff'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h4 style={{ margin: '0 0 2px 0', color: '#0f172a', fontSize: '15px', fontWeight: '800' }}>
                    {selectedWorker.username}
                  </h4>
                  <span style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <FaPhone style={{ fontSize: '10px' }} /> {selectedWorker.contactNumber || 'No Phone'}
                  </span>
                </div>

                {/* Status Badge: Live Moving vs Last Location */}
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '3px 10px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: '700',
                  background: currentWorkerStatus.isLive ? '#dcfce7' : '#f1f5f9',
                  color: currentWorkerStatus.isLive ? '#166534' : '#475569',
                  border: `1px solid ${currentWorkerStatus.isLive ? '#bbf7d0' : '#e2e8f0'}`
                }}>
                  <span style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    background: currentWorkerStatus.isLive ? '#22c55e' : '#94a3b8',
                    animation: currentWorkerStatus.isLive ? 'pulse 1.5s infinite' : 'none'
                  }} />
                  {currentWorkerStatus.isLive ? 'Live (Moving)' : 'Last Location'}
                </span>
              </div>

              {/* Movement Subtext */}
              {!currentWorkerStatus.isLive && (
                <div style={{ fontSize: '11px', color: '#b45309', fontWeight: '600', marginTop: '4px' }}>
                  ⚠️ {currentWorkerStatus.subText}
                </div>
              )}

              {/* Vehicle Type & Number Plate */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                {selectedWorker.vehicleType && (
                  <span style={{
                    background: '#eff6ff',
                    color: '#1d4ed8',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: '700',
                    border: '1px solid #bfdbfe'
                  }}>
                    {selectedWorker.vehicleType === 'mobile-vans' ? '🚐 Mobile Van' :
                     selectedWorker.vehicleType.startsWith('auto') ? '🛺 ' + selectedWorker.vehicleType :
                     selectedWorker.vehicleType === 'try-cycle' ? '🚲 Try-cycle' :
                     '🚗 ' + selectedWorker.vehicleType}
                  </span>
                )}
                {selectedWorker.vehicleDetails?.vehicleNumber && (
                  <span style={{
                    background: '#fef3c7',
                    color: '#92400e',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: '700',
                    border: '1px solid #fde68a'
                  }}>
                    Reg: {selectedWorker.vehicleDetails.vehicleNumber}
                  </span>
                )}
                {selectedWorker.runningServices && selectedWorker.runningServices.length > 0 && (
                  <span style={{ fontSize: '11px', color: '#0369a1', fontWeight: '600' }}>
                    Campaign: <strong>{selectedWorker.runningServices[0].businessName}</strong>
                  </span>
                )}
              </div>

              {/* Journey Metrics Strip */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px',
                marginTop: '10px',
                padding: '8px',
                background: '#f8fafc',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                textAlign: 'center'
              }}>
                <div>
                  <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '700' }}>STOPS RECORDED</div>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: primaryColor }}>{routeLogs.length}</div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '700' }}>START TIME</div>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#0f172a', marginTop: '2px' }}>
                    {routeLogs[0] ? new Date(routeLogs[0].recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '700' }}>LATEST UPDATE</div>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: currentWorkerStatus.isLive ? '#16a34a' : '#475569', marginTop: '2px' }}>
                    {routeLogs[routeLogs.length - 1] 
                      ? new Date(routeLogs[routeLogs.length - 1].recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                      : (selectedWorker.lastUpdated ? new Date(selectedWorker.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A')}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Chronological Stop-by-Stop Route List ("Where Where It Went") */}
          <div style={{
            padding: '16px',
            overflowY: 'auto',
            flex: 1
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '12px', fontWeight: '800', color: '#334155', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                📍 Route Stops & Locations Visited
              </span>
              <span style={{ fontSize: '11px', color: '#64748b' }}>
                (Click any stop to center on map)
              </span>
            </div>

            {routeLoading ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                <FaSyncAlt className="fa-spin" style={{ marginRight: '8px', color: primaryColor }} />
                Loading vehicle movement trail...
              </div>
            ) : routeLogs.length === 0 ? (
              <div style={{
                background: '#f8fafc',
                border: '1.5px dashed #cbd5e1',
                borderRadius: '10px',
                padding: '24px 16px',
                textAlign: 'center',
                color: '#64748b'
              }}>
                <FaRoute style={{ fontSize: '28px', color: '#94a3b8', marginBottom: '8px' }} />
                <div style={{ fontWeight: '700', color: '#1e293b', marginBottom: '4px' }}>
                  No movement trail recorded on this date
                </div>
                <div style={{ fontSize: '12px', maxWidth: '300px', margin: '0 auto' }}>
                  When the vehicle moves and sends 30-minute interval pings, each point will appear here in chronological order and connect on the map.
                </div>
                {selectedWorker?.hasLocation && (
                  <div style={{ marginTop: '12px' }}>
                    <button
                      onClick={() => {
                        if (mapInstanceRef.current && selectedWorker.coordinates) {
                          mapInstanceRef.current.setView([selectedWorker.coordinates.lat, selectedWorker.coordinates.lng], 16, { animate: true });
                        }
                      }}
                      style={{
                        background: '#ffffff',
                        border: `1.5px solid ${primaryColor}`,
                        color: primaryColor,
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                    >
                      Focus on Current Known Location
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {routeLogs.map((log, idx) => {
                  const isStart = idx === 0;
                  const isLatest = idx === routeLogs.length - 1;
                  const isSelected = activePointIndex === idx;
                  const timeFormatted = new Date(log.recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                  return (
                    <div
                      key={log._id || idx}
                      onClick={() => handlePointClick(idx, log)}
                      style={{
                        background: isSelected ? '#eff6ff' : '#ffffff',
                        border: `1.5px solid ${isSelected ? primaryColor : isStart ? '#bbf7d0' : isLatest ? (currentWorkerStatus.isLive ? '#bbf7d0' : '#e2e8f0') : '#e2e8f0'}`,
                        borderRadius: '10px',
                        padding: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        boxShadow: isSelected ? '0 4px 12px rgba(1, 81, 186, 0.15)' : '0 1px 3px rgba(0,0,0,0.02)'
                      }}
                    >
                      {/* Stop Header */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            background: isStart ? '#16a34a' : isLatest ? (currentWorkerStatus.isLive ? '#16a34a' : '#475569') : '#0284c7',
                            color: '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '11px',
                            fontWeight: '800'
                          }}>
                            {idx + 1}
                          </span>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: '800',
                            padding: '2px 8px',
                            borderRadius: '10px',
                            background: isStart ? '#dcfce7' : isLatest ? (currentWorkerStatus.isLive ? '#dcfce7' : '#f1f5f9') : '#f1f5f9',
                            color: isStart ? '#166534' : isLatest ? (currentWorkerStatus.isLive ? '#166534' : '#475569') : '#475569'
                          }}>
                            {isStart ? 'START POINT' : isLatest ? (currentWorkerStatus.isLive ? 'LIVE POSITION (MOVING)' : 'LAST LOCATION') : `WAYPOINT #${idx + 1}`}
                          </span>
                        </div>

                        <span style={{
                          fontSize: '12px',
                          color: '#0f172a',
                          fontWeight: '700',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          <FaClock style={{ fontSize: '11px', color: '#64748b' }} />
                          {timeFormatted}
                        </span>
                      </div>

                      {/* Location Name */}
                      <div style={{
                        fontSize: '13px',
                        fontWeight: '600',
                        color: '#1e293b',
                        marginBottom: '6px',
                        lineHeight: '1.4',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '6px'
                      }}>
                        <FaMapMarkerAlt style={{ color: isStart ? '#16a34a' : isLatest ? (currentWorkerStatus.isLive ? '#16a34a' : '#475569') : primaryColor, marginTop: '3px', flexShrink: 0 }} />
                        <span>{log.locationName}</span>
                      </div>

                      {/* Coordinates & Google Maps Link */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '11px',
                        color: '#64748b',
                        marginTop: '6px',
                        paddingTop: '6px',
                        borderTop: '1px solid #f1f5f9'
                      }}>
                        <span>
                          Coords: {log.coordinates?.lat?.toFixed(5)}, {log.coordinates?.lng?.toFixed(5)}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ color: primaryColor, fontWeight: '700', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            Focus Map <FaChevronRight style={{ fontSize: '9px' }} />
                          </span>
                          <a
                            href={`https://www.google.com/maps?q=${log.coordinates?.lat},${log.coordinates?.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            style={{ color: '#475569', textDecoration: 'none', fontWeight: '600' }}
                          >
                            Google Maps ↗
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveTrackingView;
