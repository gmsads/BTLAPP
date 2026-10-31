// src/components/LiveTrackingMap.js
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Linking,
  Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import API from '../utils/api';
import { COLORS } from '../utils/theme';

export default function LiveTrackingMap({ initialWorker }) {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedWorkerId, setSelectedWorkerId] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [routeLogs, setRouteLogs] = useState([]);
  const [routeLoading, setRouteLoading] = useState(false);
  const [viewMode, setViewMode] = useState('trace'); // 'trace' or 'all'
  const [searchTerm, setSearchTerm] = useState(initialWorker || '');

  useEffect(() => {
    if (initialWorker) {
      setSearchTerm(initialWorker);
      if (workers.length > 0) {
        const match = workers.find(
          (w) => (w.username || '').toLowerCase() === initialWorker.toLowerCase()
        );
        if (match) {
          setSelectedWorkerId(match._id);
          setViewMode('trace');
        }
      }
    }
  }, [initialWorker, workers]);

  useEffect(() => {
    fetchLiveLocations();
  }, []);

  const fetchLiveLocations = async () => {
    try {
      setLoading(true);
      const res = await API.get('/locations/live');
      if (res.data?.success) {
        const list = res.data.workers || [];
        setWorkers(list);
        if (initialWorker) {
          const match = list.find(
            (w) => (w.username || '').toLowerCase() === initialWorker.toLowerCase()
          );
          if (match) {
            setSelectedWorkerId(match._id);
            return;
          }
        }
        if (!selectedWorkerId && list.length > 0) {
          const withLoc = list.find((w) => w.hasLocation && w.coordinates);
          setSelectedWorkerId(withLoc ? withLoc._id : list[0]._id);
        }
      }
    } catch (err) {
      console.warn('Live locations error:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedWorkerId && viewMode === 'trace') {
      fetchRouteHistory(selectedWorkerId, selectedDate);
    }
  }, [selectedWorkerId, selectedDate, viewMode]);

  const fetchRouteHistory = async (workerId, dateStr) => {
    try {
      setRouteLoading(true);
      const res = await API.get(`/locations/history/${workerId}?date=${dateStr}`);
      if (res.data?.success) {
        setRouteLogs(res.data.logs || []);
      } else {
        setRouteLogs([]);
      }
    } catch (err) {
      setRouteLogs([]);
    } finally {
      setRouteLoading(false);
    }
  };

  const selectedWorker = workers.find((w) => w._id === selectedWorkerId) || null;
  const filteredWorkers = workers.filter((w) =>
    !searchTerm.trim()
      ? true
      : (w.username || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (w.contactNumber || '').includes(searchTerm)
  );

  // Build interactive Leaflet HTML for WebView
  const getMapHtml = () => {
    const markers = [];
    const polylineCoords = [];

    if (viewMode === 'all') {
      workers.forEach((w) => {
        if (w.coordinates?.lat && w.coordinates?.lng) {
          markers.push({
            lat: w.coordinates.lat,
            lng: w.coordinates.lng,
            title: w.username || 'Worker',
            sub: w.locationName || '',
            color: w.isLive ? '#10b981' : '#0151ba',
          });
        }
      });
    } else if (routeLogs.length > 0) {
      routeLogs.forEach((log, idx) => {
        if (log.coordinates?.lat && log.coordinates?.lng) {
          polylineCoords.push([log.coordinates.lat, log.coordinates.lng]);
          markers.push({
            lat: log.coordinates.lat,
            lng: log.coordinates.lng,
            title:
              idx === 0
                ? 'Start Point'
                : idx === routeLogs.length - 1
                ? 'Latest Position'
                : `Stop #${idx + 1}`,
            sub: `${new Date(log.recordedAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })} - ${log.locationName || ''}`,
            color: idx === routeLogs.length - 1 ? '#10b981' : '#0151ba',
          });
        }
      });
    } else if (selectedWorker?.coordinates?.lat && selectedWorker?.coordinates?.lng) {
      markers.push({
        lat: selectedWorker.coordinates.lat,
        lng: selectedWorker.coordinates.lng,
        title: selectedWorker.username || 'Worker',
        sub: selectedWorker.locationName || 'Last Known Position',
        color: '#0151ba',
      });
    }

    const centerLat = markers[markers.length - 1]?.lat || 17.412153;
    const centerLng = markers[markers.length - 1]?.lng || 78.267959;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          body, html, #map { margin: 0; padding: 0; width: 100%; height: 100%; }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          const map = L.map('map').setView([${centerLat}, ${centerLng}], 13);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap'
          }).addTo(map);

          const markersData = ${JSON.stringify(markers)};
          const polyData = ${JSON.stringify(polylineCoords)};

          if (polyData.length > 1) {
            const poly = L.polyline(polyData, { color: '#0151ba', weight: 4 }).addTo(map);
            map.fitBounds(poly.getBounds(), { padding: [30, 30] });
          }

          markersData.forEach((m, i) => {
            const icon = L.divIcon({
              html: '<div style="background:' + m.color + ';color:#fff;border:2px solid #fff;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:11px;box-shadow:0 2px 6px rgba(0,0,0,0.3);">' + (i + 1) + '</div>',
              className: '',
              iconSize: [26, 26],
              iconAnchor: [13, 13]
            });
            L.marker([m.lat, m.lng], { icon })
              .addTo(map)
              .bindPopup('<b>' + m.title + '</b><br/>' + m.sub);
          });
        </script>
      </body>
      </html>
    `;
  };

  return (
    <View style={styles.container}>
      {/* Top Controls */}
      <View style={styles.topBar}>
        <View style={styles.modeSwitch}>
          <TouchableOpacity
            style={[styles.modeBtn, viewMode === 'trace' && styles.modeBtnActive]}
            onPress={() => setViewMode('trace')}
          >
            <Text style={[styles.modeBtnText, viewMode === 'trace' && styles.modeBtnTextActive]}>
              🛣️ Worker Route
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, viewMode === 'all' && styles.modeBtnActive]}
            onPress={() => setViewMode('all')}
          >
            <Text style={[styles.modeBtnText, viewMode === 'all' && styles.modeBtnTextActive]}>
              🗺️ All Fleet ({workers.length})
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.refreshBtn} onPress={fetchLiveLocations}>
          <Text style={styles.refreshBtnText}>🔄 Refresh</Text>
        </TouchableOpacity>
      </View>

      {/* Search & Date Input */}
      <View style={styles.filterRow}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={searchTerm}
          onChangeText={setSearchTerm}
          placeholder="🔍 Search worker..."
        />
        <TextInput
          style={[styles.input, { width: 125 }]}
          value={selectedDate}
          onChangeText={setSelectedDate}
          placeholder="YYYY-MM-DD"
        />
      </View>

      {/* Horizontal Worker Selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.workerStrip}
      >
        {filteredWorkers.map((w) => {
          const isSelected = w._id === selectedWorkerId;
          return (
            <TouchableOpacity
              key={w._id}
              style={[styles.workerChip, isSelected && styles.workerChipSelected]}
              onPress={() => {
                setSelectedWorkerId(w._id);
                setViewMode('trace');
              }}
            >
              <Text style={[styles.workerChipName, isSelected && { color: COLORS.white }]}>
                {w.isLive ? '🟢 ' : '⚪ '}
                {w.username}
              </Text>
              <Text
                style={[styles.workerChipSub, isSelected && { color: COLORS.secondaryLight }]}
                numberOfLines={1}
              >
                {w.locationName ? w.locationName.split(',')[0] : 'No GPS yet'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Interactive Map */}
      <View style={styles.mapBox}>
        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={{ marginTop: 8, color: COLORS.textLight }}>Loading live map...</Text>
          </View>
        ) : Platform.OS === 'web' ? (
          <View style={styles.centerBox}>
            <Text style={{ fontWeight: '700', color: COLORS.primary }}>
              Interactive Map View (Open on Android/iOS or tap Google Maps below)
            </Text>
          </View>
        ) : (
          <WebView
            originWhitelist={['*']}
            source={{ html: getMapHtml() }}
            style={{ flex: 1 }}
          />
        )}
      </View>

      {/* Route Timeline Logs */}
      <Text style={styles.timelineTitle}>
        📍 Route Timeline ({routeLogs.length} stops on {selectedDate})
      </Text>

      {routeLoading ? (
        <ActivityIndicator size="small" color={COLORS.primary} />
      ) : routeLogs.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>
            No route logs recorded for {selectedWorker?.username || 'this worker'} on {selectedDate}.
          </Text>
          {selectedWorker?.coordinates && (
            <TouchableOpacity
              style={styles.gmapsBtn}
              onPress={() =>
                Linking.openURL(
                  `https://www.google.com/maps?q=${selectedWorker.coordinates.lat},${selectedWorker.coordinates.lng}`
                )
              }
            >
              <Text style={styles.gmapsBtnText}>
                🗺️ Open Last Known Position in Google Maps
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        routeLogs.map((log, index) => (
          <View key={log._id || index} style={styles.stopCard}>
            <View style={styles.stopBadge}>
              <Text style={styles.stopBadgeText}>{index + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.stopTime}>
                {new Date(log.recordedAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                • {index === 0 ? 'Start' : index === routeLogs.length - 1 ? 'Latest' : 'Checkpoint'}
              </Text>
              <Text style={styles.stopAddress}>{log.locationName}</Text>
            </View>
            {log.coordinates?.lat && (
              <TouchableOpacity
                style={styles.pinBtn}
                onPress={() =>
                  Linking.openURL(
                    `https://www.google.com/maps?q=${log.coordinates.lat},${log.coordinates.lng}`
                  )
                }
              >
                <Text style={styles.pinBtnText}>🗺️ Map</Text>
              </TouchableOpacity>
            )}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 20,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  modeSwitch: {
    flexDirection: 'row',
    backgroundColor: COLORS.lightGrey,
    borderRadius: 10,
    padding: 3,
  },
  modeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  modeBtnActive: {
    backgroundColor: COLORS.primary,
  },
  modeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
  },
  modeBtnTextActive: {
    color: COLORS.white,
  },
  refreshBtn: {
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  refreshBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primaryDark,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  input: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    color: COLORS.text,
  },
  workerStrip: {
    marginBottom: 12,
  },
  workerChip: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    minWidth: 130,
    maxWidth: 170,
  },
  workerChipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  workerChipName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  workerChipSub: {
    fontSize: 10,
    color: COLORS.textLight,
    marginTop: 2,
  },
  mapBox: {
    height: 250,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#e2e8f0',
    marginBottom: 14,
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  timelineTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.primary,
    marginBottom: 10,
  },
  emptyBox: {
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 12,
    color: COLORS.textLight,
    textAlign: 'center',
  },
  gmapsBtn: {
    marginTop: 10,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  gmapsBtnText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '700',
  },
  stopCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    padding: 10,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  stopBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopBadgeText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 12,
  },
  stopTime: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
  },
  stopAddress: {
    fontSize: 12,
    color: COLORS.text,
    marginTop: 2,
  },
  pinBtn: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  pinBtnText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '700',
  },
});
