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
  FaSignal
} from 'react-icons/fa';

const LiveTrackingView = ({ colors, isMobile, initialWorker, onClearWorkerFilter }) => {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState(initialWorker || '');
  const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'online', 'offline'
  const [lastRefreshed, setLastRefreshed] = useState(null);

  // Sync search filter when initialWorker changes
  useEffect(() => {
    if (initialWorker) {
      setSearchTerm(initialWorker);
    }
  }, [initialWorker]);
  
  // History Modal State
  const [selectedWorkerHistory, setSelectedWorkerHistory] = useState(null);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyDate, setHistoryDate] = useState(new Date().toISOString().split('T')[0]);

  // Leaflet Map Refs
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef({});

  const primaryColor = colors?.primary || '#0151ba';
  const secondaryColor = colors?.secondary || '#f2c43b';

  // Fetch live locations from backend
  const fetchLiveLocations = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/locations/live');
      if (res.data.success) {
        setWorkers(res.data.workers || []);
        setLastRefreshed(new Date());
      }
    } catch (err) {
      console.error('Failed to fetch live locations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveLocations();
    // Auto-refresh every 2 minutes on the dashboard
    const refreshInterval = setInterval(fetchLiveLocations, 2 * 60 * 1000);
    return () => clearInterval(refreshInterval);
  }, []);

  // Clean up Leaflet instance on unmount
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

  // Initialize and update Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      if (mapContainerRef.current._leaflet_id) {
        mapContainerRef.current._leaflet_id = null;
      }
      try {
        const map = L.map(mapContainerRef.current).setView([20.5937, 78.9629], 5); // India center default
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 19
        }).addTo(map);

        mapInstanceRef.current = map;
      } catch (err) {
        console.error('Leaflet init error:', err);
      }
    }

    const map = mapInstanceRef.current;

    // Clear existing markers
    Object.values(markersRef.current).forEach(marker => marker.remove());
    markersRef.current = {};

    const bounds = [];

    // Filtered workers with valid coordinates
    const workersWithCoords = workers.filter(
      w => w.hasLocation && w.coordinates && !isNaN(w.coordinates.lat) && !isNaN(w.coordinates.lng)
    );

    workersWithCoords.forEach(worker => {
      const { lat, lng } = worker.coordinates;
      bounds.push([lat, lng]);

      const isOnline = worker.isOnline;
      const markerColor = isOnline ? '#16a34a' : '#64748b';
      const pulseHtml = isOnline 
        ? `<div style="position:absolute; width:28px; height:28px; top:-4px; left:-4px; border-radius:50%; background:rgba(34,197,94,0.4); animation: pulse 2s infinite;"></div>` 
        : '';

      const customIcon = L.divIcon({
        className: 'custom-live-marker',
        html: `
          <div style="position:relative; width:20px; height:20px;">
            ${pulseHtml}
            <div style="
              width:20px; 
              height:20px; 
              border-radius:50%; 
              background-color:${markerColor}; 
              border:2.5px solid #ffffff; 
              box-shadow:0 2px 6px rgba(0,0,0,0.3);
            "></div>
          </div>
        `,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        popupAnchor: [0, -10]
      });

      const popupContent = `
        <div style="font-family: inherit; font-size: 13px; min-width: 200px; padding: 4px;">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 6px;">
            <strong style="color: #0f172a; font-size: 14px;">${worker.username}</strong>
            <span style="
              padding: 2px 6px; 
              border-radius: 10px; 
              font-size: 10px; 
              font-weight: 600; 
              background: ${isOnline ? '#dcfce7' : '#f1f5f9'}; 
              color: ${isOnline ? '#166534' : '#475569'};
            ">
              ${isOnline ? 'Active Now' : 'Offline'}
            </span>
          </div>
          <div style="color: #64748b; font-size: 12px; margin-bottom: 4px;">
            📞 ${worker.contactNumber || 'N/A'}
          </div>
          ${worker.vehicleType ? `
            <div style="margin-bottom: 6px;">
              <span style="background: #eff6ff; color: #1d4ed8; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600; border: 1px solid #bfdbfe;">
                ${worker.vehicleType === 'mobile-vans' ? '🚐 Mobile Van' : worker.vehicleType.startsWith('auto') ? '🛺 ' + worker.vehicleType : '🚗 ' + worker.vehicleType}
                ${worker.vehicleDetails?.vehicleNumber ? ' - ' + worker.vehicleDetails.vehicleNumber : ''}
              </span>
            </div>
          ` : ''}
          ${worker.runningServices && worker.runningServices.length > 0 ? `
            <div style="color: #0369a1; font-size: 11px; margin-bottom: 4px;">
              Campaign: <strong>${worker.runningServices[0].businessName}</strong>
            </div>
          ` : ''}
          <div style="color: #334155; margin-bottom: 6px; line-height: 1.3;">
            📍 <strong>Live Location:</strong> ${worker.locationName}
          </div>
          <div style="color: #64748b; font-size: 11px; margin-bottom: 8px;">
            🕒 <strong>Last Updated:</strong> ${worker.lastUpdated ? new Date(worker.lastUpdated).toLocaleTimeString() : 'N/A'} 
            ${worker.minutesAgo !== null ? `(${worker.minutesAgo} mins ago)` : ''}
          </div>
          <a 
            href="https://www.google.com/maps?q=${lat},${lng}" 
            target="_blank" 
            rel="noopener noreferrer" 
            style="color: #0151ba; text-decoration: none; font-weight: 600; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;"
          >
            Open in Google Maps ↗
          </a>
        </div>
      `;

      const marker = L.marker([lat, lng], { icon: customIcon })
        .addTo(map)
        .bindPopup(popupContent);

      markersRef.current[worker._id] = marker;
    });

    // If filtered to a specific worker, auto-zoom directly onto their vehicle location!
    if (searchTerm) {
      const matched = workers.find(w => 
        w.username?.toLowerCase().includes(searchTerm.toLowerCase()) && 
        w.hasLocation && w.coordinates && !isNaN(w.coordinates.lat) && !isNaN(w.coordinates.lng)
      );
      if (matched) {
        map.setView([matched.coordinates.lat, matched.coordinates.lng], 16, { animate: true });
        setTimeout(() => {
          if (markersRef.current[matched._id]) {
            markersRef.current[matched._id].openPopup();
          }
        }, 300);
        return;
      }
    }

    // Fit bounds if markers exist
    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }

    return () => {
      // cleanup handled above
    };
  }, [workers, searchTerm]);

  // Focus map on selected worker
  const focusOnWorker = (worker) => {
    if (!worker.coordinates || !mapInstanceRef.current) return;
    const { lat, lng } = worker.coordinates;
    mapInstanceRef.current.setView([lat, lng], 16, { animate: true });
    
    if (markersRef.current[worker._id]) {
      markersRef.current[worker._id].openPopup();
    }
  };

  // Fetch History for modal
  const fetchWorkerHistory = async (worker, dateToFetch = historyDate) => {
    try {
      setSelectedWorkerHistory(worker);
      setHistoryLoading(true);
      const res = await axios.get(`/locations/history/${worker._id}?date=${dateToFetch}`);
      if (res.data.success) {
        setHistoryLogs(res.data.logs || []);
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Filter workers based on search and status
  const filteredWorkers = workers.filter(worker => {
    const matchesSearch = 
      worker.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      worker.contactNumber?.includes(searchTerm) ||
      worker.locationName?.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (filterStatus === 'online') return worker.isOnline;
    if (filterStatus === 'offline') return !worker.isOnline;
    return true;
  });

  const activeCount = workers.filter(w => w.isOnline).length;
  const offlineCount = workers.length - activeCount;

  return (
    <div style={{ padding: isMobile ? '12px' : '24px', background: '#f8fafd' }}>
      {/* Top Header & Stats */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        marginBottom: '20px'
      }}>
        <div>
          <h2 style={{ color: primaryColor, margin: '0 0 4px 0', fontSize: isMobile ? '20px' : '24px', fontWeight: '700' }}>
            Live Location Tracing
          </h2>
          <p style={{ color: '#64748b', margin: 0, fontSize: '13px' }}>
            Real-time coordinates and exact physical locations updated every 30 minutes.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={fetchLiveLocations}
            disabled={loading}
            style={{
              backgroundColor: '#ffffff',
              color: primaryColor,
              border: `1.5px solid ${secondaryColor}`,
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 6px rgba(0,0,0,0.05)'
            }}
          >
            <FaSyncAlt className={loading ? 'fa-spin' : ''} />
            {loading ? 'Refreshing...' : 'Refresh Now'}
          </button>
          {lastRefreshed && (
            <span style={{ fontSize: '11px', color: '#64748b' }}>
              Last sync: {lastRefreshed.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
        gap: '12px',
        marginBottom: '20px'
      }}>
        <div style={{
          background: '#ffffff',
          padding: '16px',
          borderRadius: '10px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '500' }}>Total Personnel</div>
          <div style={{ fontSize: '24px', fontWeight: '700', color: primaryColor, marginTop: '4px' }}>
            {workers.length}
          </div>
        </div>

        <div style={{
          background: '#ffffff',
          padding: '16px',
          borderRadius: '10px',
          border: '1px solid #bbf7d0',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}>
          <div style={{ fontSize: '12px', color: '#166534', fontWeight: '500' }}>Active Now (Within 35m)</div>
          <div style={{ fontSize: '24px', fontWeight: '700', color: '#16a34a', marginTop: '4px' }}>
            {activeCount}
          </div>
        </div>

        <div style={{
          background: '#ffffff',
          padding: '16px',
          borderRadius: '10px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
          gridColumn: isMobile ? 'span 2' : 'auto'
        }}>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '500' }}>Offline / Idle</div>
          <div style={{ fontSize: '24px', fontWeight: '700', color: '#64748b', marginTop: '4px' }}>
            {offlineCount}
          </div>
        </div>
      </div>

      {searchTerm && (
        <div style={{
          background: '#eff6ff',
          border: '1.5px solid #93c5fd',
          borderRadius: '10px',
          padding: '10px 16px',
          marginBottom: '14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
          fontSize: '13px',
          color: '#1e40af',
          boxShadow: '0 2px 6px rgba(1, 81, 186, 0.08)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FaMapMarkerAlt style={{ color: '#2563eb' }} />
            <span>
              Filtered for worker: <strong>{searchTerm}</strong> (Showing live van/vehicle tracing)
            </span>
          </div>
          <button
            onClick={() => {
              setSearchTerm('');
              if (onClearWorkerFilter) onClearWorkerFilter();
            }}
            style={{
              background: '#ffffff',
              border: '1px solid #3b82f6',
              color: '#1d4ed8',
              padding: '4px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Show All Workers
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        marginBottom: '16px',
        background: '#ffffff',
        padding: '12px 16px',
        borderRadius: '10px',
        border: '1px solid #e2e8f0'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '220px' }}>
          <FaSearch style={{ color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Search by personnel name, phone, or location..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              if (!e.target.value && onClearWorkerFilter) onClearWorkerFilter();
            }}
            style={{
              width: '100%',
              border: 'none',
              outline: 'none',
              fontSize: '13px',
              color: '#1e293b'
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {['all', 'online', 'offline'].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                background: filterStatus === status ? primaryColor : '#f1f5f9',
                color: filterStatus === status ? '#ffffff' : '#475569'
              }}
            >
              {status === 'all' ? 'All Personnel' : status === 'online' ? `Active (${activeCount})` : `Offline (${offlineCount})`}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid: Map & Worker List */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1.3fr 1fr',
        gap: '20px'
      }}>
        {/* Interactive Leaflet Map */}
        <div style={{
          background: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
          boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{
            padding: '12px 16px',
            background: '#ffffff',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <strong style={{ color: primaryColor, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FaMapMarkerAlt /> Live Field Map
            </strong>
            <span style={{ fontSize: '11px', color: '#64748b' }}>
              Showing {filteredWorkers.filter(w => w.hasLocation).length} mapped personnel
            </span>
          </div>

          <div 
            ref={mapContainerRef} 
            style={{ 
              height: isMobile ? '350px' : '520px', 
              width: '100%', 
              zIndex: 1 
            }} 
          />
        </div>

        {/* Worker Cards List */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          maxHeight: isMobile ? 'auto' : '580px',
          overflowY: 'auto'
        }}>
          {filteredWorkers.length === 0 ? (
            <div style={{
              background: '#ffffff',
              padding: '30px',
              borderRadius: '12px',
              textAlign: 'center',
              color: '#64748b',
              border: '1px solid #e2e8f0'
            }}>
              No personnel found matching your filter criteria.
            </div>
          ) : (
            filteredWorkers.map((worker) => (
              <div
                key={worker._id}
                style={{
                  background: '#ffffff',
                  borderRadius: '12px',
                  border: `1.5px solid ${worker.isOnline ? '#bbf7d0' : '#e2e8f0'}`,
                  padding: '16px',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                  transition: 'all 0.2s ease'
                }}
              >
                {/* Card Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div>
                    <h4 style={{ margin: 0, color: '#0f172a', fontSize: '15px', fontWeight: '700' }}>
                      {worker.username}
                    </h4>
                    <span style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                      <FaPhone style={{ fontSize: '10px' }} /> {worker.contactNumber || 'No phone'}
                    </span>
                    {worker.vehicleType && (
                      <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{
                          background: '#eff6ff',
                          color: '#1d4ed8',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: '600',
                          border: '1px solid #bfdbfe'
                        }}>
                          {worker.vehicleType === 'mobile-vans' ? '🚐 Mobile Van' :
                           worker.vehicleType.startsWith('auto') ? '🛺 ' + worker.vehicleType :
                           worker.vehicleType === 'try-cycle' ? '🚲 Try-cycle' :
                           worker.vehicleType === 'look-walkers' ? '🚶 Look Walker' :
                           '🚗 ' + worker.vehicleType}
                        </span>
                        {worker.vehicleDetails?.vehicleNumber && (
                          <span style={{ fontSize: '11px', color: '#475569', fontWeight: '600' }}>
                            ({worker.vehicleDetails.vehicleNumber})
                          </span>
                        )}
                      </div>
                    )}
                    {worker.runningServices && worker.runningServices.length > 0 && (
                      <div style={{ fontSize: '11px', color: '#0369a1', marginTop: '3px' }}>
                        Campaign: <strong>{worker.runningServices[0].businessName}</strong>
                      </div>
                    )}
                  </div>

                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '3px 8px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: '600',
                    background: worker.isOnline ? '#dcfce7' : '#f1f5f9',
                    color: worker.isOnline ? '#166534' : '#64748b'
                  }}>
                    <span style={{
                      width: '7px',
                      height: '7px',
                      borderRadius: '50%',
                      background: worker.isOnline ? '#22c55e' : '#94a3b8'
                    }} />
                    {worker.isOnline ? 'Active Now' : 'Offline'}
                  </span>
                </div>

                {/* Location Details */}
                <div style={{
                  background: '#f8fafc',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  marginBottom: '10px',
                  border: '1px solid #f1f5f9'
                }}>
                  <div style={{
                    fontSize: '13px',
                    fontWeight: '600',
                    color: '#1e293b',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '6px',
                    lineHeight: '1.4'
                  }}>
                    <FaMapMarkerAlt style={{ color: primaryColor, marginTop: '2px', flexShrink: 0 }} />
                    <span>{worker.locationName}</span>
                  </div>

                  {worker.coordinates && (
                    <div style={{
                      marginTop: '6px',
                      fontSize: '11px',
                      color: '#64748b',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '4px'
                    }}>
                      <span>
                        Coords: {worker.coordinates.lat?.toFixed(5)}, {worker.coordinates.lng?.toFixed(5)}
                        {worker.accuracy && ` (±${Math.round(worker.accuracy)}m)`}
                      </span>
                      <span>
                        <FaClock style={{ marginRight: '3px' }} />
                        {worker.lastUpdated ? new Date(worker.lastUpdated).toLocaleTimeString() : 'N/A'}
                        {worker.minutesAgo !== null ? ` (${worker.minutesAgo}m ago)` : ''}
                      </span>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  {worker.hasLocation && (
                    <>
                      <button
                        onClick={() => focusOnWorker(worker)}
                        style={{
                          background: '#f1f5f9',
                          border: 'none',
                          color: primaryColor,
                          padding: '6px 12px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <FaMapMarkerAlt /> View on Map
                      </button>

                      <a
                        href={`https://www.google.com/maps?q=${worker.coordinates?.lat},${worker.coordinates?.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          background: '#f1f5f9',
                          color: '#334155',
                          textDecoration: 'none',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '600',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <FaExternalLinkAlt style={{ fontSize: '10px' }} /> Google Maps
                      </a>
                    </>
                  )}

                  <button
                    onClick={() => fetchWorkerHistory(worker)}
                    style={{
                      background: 'none',
                      border: `1px solid ${secondaryColor}`,
                      color: '#b45309',
                      padding: '5px 10px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      marginLeft: 'auto'
                    }}
                  >
                    <FaHistory /> 30m Logs
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 30-Minute Interval History Modal */}
      {selectedWorkerHistory && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '650px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div>
                <h3 style={{ margin: 0, color: primaryColor, fontSize: '18px', fontWeight: '700' }}>
                  Location History (30-Min Logs)
                </h3>
                <span style={{ fontSize: '13px', color: '#64748b' }}>
                  Personnel: <strong>{selectedWorkerHistory.username}</strong> ({selectedWorkerHistory.contactNumber})
                </span>
              </div>
              <button
                onClick={() => setSelectedWorkerHistory(null)}
                style={{ background: 'none', border: 'none', fontSize: '18px', color: '#64748b', cursor: 'pointer' }}
              >
                <FaTimes />
              </button>
            </div>

            {/* Date Selector */}
            <div style={{
              padding: '12px 20px',
              background: '#f8fafc',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#334155' }}>Select Date:</span>
              <input
                type="date"
                value={historyDate}
                onChange={(e) => {
                  setHistoryDate(e.target.value);
                  fetchWorkerHistory(selectedWorkerHistory, e.target.value);
                }}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px'
                }}
              />
            </div>

            {/* Logs List */}
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
              {historyLoading ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                  <FaSyncAlt className="fa-spin" style={{ marginRight: '8px' }} /> Loading 30-minute interval logs...
                </div>
              ) : historyLogs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                  No location updates recorded for this personnel on this date.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {historyLogs.map((log, idx) => (
                    <div
                      key={log._id || idx}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '8px',
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{
                          fontWeight: '700',
                          fontSize: '13px',
                          color: primaryColor,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}>
                          <FaClock style={{ fontSize: '11px' }} />
                          {new Date(log.recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                        <span style={{
                          fontSize: '11px',
                          color: '#64748b',
                          background: '#f1f5f9',
                          padding: '2px 8px',
                          borderRadius: '10px'
                        }}>
                          Interval #{idx + 1}
                        </span>
                      </div>

                      <div style={{ fontSize: '13px', color: '#1e293b', marginBottom: '4px', lineHeight: '1.4' }}>
                        📍 <strong>{log.locationName}</strong>
                      </div>

                      <div style={{
                        fontSize: '11px',
                        color: '#64748b',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: '6px'
                      }}>
                        <span>
                          Coords: {log.coordinates?.lat?.toFixed(5)}, {log.coordinates?.lng?.toFixed(5)}
                        </span>
                        <a
                          href={`https://www.google.com/maps?q=${log.coordinates?.lat},${log.coordinates?.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: primaryColor, textDecoration: 'none', fontWeight: '600' }}
                        >
                          View Pin ↗
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', textAlign: 'right' }}>
              <button
                onClick={() => setSelectedWorkerHistory(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  background: '#f1f5f9',
                  border: 'none',
                  color: '#334155',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveTrackingView;
