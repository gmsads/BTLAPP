// src/screens/Shared/ServiceDetailsScreen.js
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import API from '../../utils/api';
import NativeImageUpload from '../../components/NativeImageUpload';
import {
  COLORS,
  formatServiceType,
  getServiceProgress,
  getServiceStatus,
} from '../../utils/theme';

export default function ServiceDetailsScreen({ route, navigation }) {
  const { service: initialService, userRole = 'worker' } = route.params || {};
  const [currentService, setCurrentService] = useState(initialService);
  const [activeTab, setActiveTab] = useState('images'); // 'images' | 'readings'
  const [meterReadings, setMeterReadings] = useState(initialService?.meterReadings || []);
  const [showAddReading, setShowAddReading] = useState(false);
  const [newReading, setNewReading] = useState({ startReading: '', endReading: '' });
  const [startReadingAsset, setStartReadingAsset] = useState(null);
  const [endReadingAsset, setEndReadingAsset] = useState(null);
  const [loading, setLoading] = useState(false);

  const rawServiceId =
    currentService?.originalServiceId ||
    currentService?._originalId ||
    currentService?._id;
  const serviceId = rawServiceId
    ? String(rawServiceId).replace(/[_-]\d+$/, '')
    : null;
  const progress = getServiceProgress(currentService);
  const status = getServiceStatus(currentService);

  const refreshServiceFromBackend = async () => {
    if (!serviceId) return;
    try {
      const res = await API.get(`/services/${serviceId}`);
      if (res.data?.success && res.data?.service) {
        const fetched = res.data.service;
        setCurrentService((prev) => {
          const idx = prev?.serviceIndex;
          const isMulti = prev?.isMultiService && idx !== undefined && idx !== null && Array.isArray(fetched.services) && fetched.services[idx];
          let mergedImages = fetched.images || prev?.images || [];
          if (isMulti) {
            const sub = fetched.services[idx];
            const parentMatched = (fetched.images || []).filter(
              (img) =>
                (img.itemId && sub._id && String(img.itemId) === String(sub._id)) ||
                (img.serviceIndex !== undefined &&
                  img.serviceIndex !== null &&
                  Number(img.serviceIndex) === Number(idx))
            );
            const enrichedSub = (sub.images || [])
              .filter(Boolean)
              .map((sImg) => {
                const match = (fetched.images || []).find(
                  (p) =>
                    (p.public_id && sImg.public_id && p.public_id === sImg.public_id) ||
                    (p.url && sImg.url && p.url === sImg.url)
                );
                return match ? { ...sImg, ...match } : sImg;
              });
            const combined = [...parentMatched, ...enrichedSub].filter(
              (img, i, arr) =>
                arr.findIndex(
                  (t) =>
                    (t.public_id && t.public_id === img.public_id) ||
                    (t.url && t.url === img.url)
                ) === i
            );
            if (combined.length > 0) mergedImages = combined;
          }
          return {
            ...prev,
            ...fetched,
            _id: prev?._id,
            _originalId: fetched._id,
            serviceIndex: prev?.serviceIndex,
            isMultiService: prev?.isMultiService,
            serviceType: prev?.serviceType || fetched.serviceType,
            location: prev?.location || fetched.location || fetched.primaryLocation,
            images: mergedImages,
            meterReadings: fetched.meterReadings || [],
          };
        });
        setMeterReadings(res.data.service.meterReadings || []);
      }
    } catch (e) {
      // ignore
    }
  };

  const pickReadingImage = async (which) => {
    const { status: camStatus } = await ImagePicker.requestCameraPermissionsAsync();
    if (camStatus !== 'granted') {
      Alert.alert('Permission', 'Camera permission is needed for odometer photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });

    if (!result.canceled && result.assets?.length > 0) {
      if (which === 'start') setStartReadingAsset(result.assets[0]);
      else setEndReadingAsset(result.assets[0]);
    }
  };

  const handleAddReading = async () => {
    if (!newReading.startReading || !newReading.endReading) {
      Alert.alert('Validation', 'Please enter both start and end odometer readings.');
      return;
    }
    if (parseFloat(newReading.endReading) <= parseFloat(newReading.startReading)) {
      Alert.alert('Validation', 'End reading must be greater than start reading.');
      return;
    }

    try {
      setLoading(true);
      const formData = new FormData();
      formData.append('startReading', newReading.startReading);
      formData.append('endReading', newReading.endReading);

      if (startReadingAsset) {
        formData.append('startImage', {
          uri: startReadingAsset.uri,
          name: startReadingAsset.fileName || `start_${Date.now()}.jpg`,
          type: 'image/jpeg',
        });
      }
      if (endReadingAsset) {
        formData.append('endImage', {
          uri: endReadingAsset.uri,
          name: endReadingAsset.fileName || `end_${Date.now()}.jpg`,
          type: 'image/jpeg',
        });
      }

      const res = await API.post(`/services/${serviceId}/meter-readings`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data?.success) {
        const updatedReadings = res.data.service?.meterReadings || [];
        setMeterReadings(updatedReadings);
        setCurrentService((prev) => ({ ...prev, meterReadings: updatedReadings }));
        setNewReading({ startReading: '', endReading: '' });
        setStartReadingAsset(null);
        setEndReadingAsset(null);
        setShowAddReading(false);
        Alert.alert('Success', 'Meter reading recorded!');
      } else {
        Alert.alert('Error', res.data?.message || 'Failed to add reading');
      }
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteReading = (readingId) => {
    if (!readingId) return;
    Alert.alert('Delete Reading', 'Delete this odometer reading?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await API.delete(`/services/${serviceId}/meter-readings/${readingId}`);
            if (res.data?.success) {
              setMeterReadings(res.data.service?.meterReadings || []);
            }
          } catch (err) {
            Alert.alert('Error', err.response?.data?.message || err.message);
          }
        },
      },
    ]);
  };

  const totalDistance = meterReadings.reduce(
    (sum, r) => sum + Math.max(0, (Number(r.endReading) || 0) - (Number(r.startReading) || 0)),
    0
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Bar */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {currentService?.businessName || 'Service Details'}
        </Text>
        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText}>{status.toUpperCase()}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Service Summary Card */}
        <View style={styles.infoCard}>
          <Text style={styles.serviceTypeTitle}>
            {formatServiceType(currentService?.serviceType, currentService?.customServiceType)}
          </Text>
          <Text style={styles.infoLine}>
            🏢 Client: <Text style={styles.bold}>{currentService?.businessName}</Text> (
            {currentService?.ownerName})
          </Text>
          <Text style={styles.infoLine}>📞 Contact: {currentService?.contactNumber}</Text>
          <Text style={styles.infoLine}>
            📍 Location:{' '}
            {typeof currentService?.location === 'string'
              ? currentService.location
              : currentService?.location?.address ||
                currentService?.primaryLocation?.address ||
                'Not specified'}
          </Text>
          <Text style={styles.infoLine}>
            📦 Quantity: {currentService?.quantity || 1} • Progress: {progress.text}
          </Text>
          {currentService?.startDate && (
            <Text style={styles.infoLine}>
              📅 {new Date(currentService.startDate).toLocaleDateString()} →{' '}
              {currentService.endDate || currentService.deliveryDate
                ? new Date(
                    currentService.endDate || currentService.deliveryDate
                  ).toLocaleDateString()
                : 'Ongoing'}
            </Text>
          )}

          {/* Progress Bar */}
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.min(100, Math.round(progress.progress))}%` },
              ]}
            />
          </View>
        </View>

        {/* Sub-Tabs: Proof Photos vs Odometer Readings */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'images' && styles.tabBtnActive]}
            onPress={() => setActiveTab('images')}
          >
            <Text style={[styles.tabBtnText, activeTab === 'images' && styles.tabBtnTextActive]}>
              📸 Proof Photos ({currentService?.images?.length || 0})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'readings' && styles.tabBtnActive]}
            onPress={() => setActiveTab('readings')}
          >
            <Text style={[styles.tabBtnText, activeTab === 'readings' && styles.tabBtnTextActive]}>
              🚐 Meter Readings ({meterReadings.length})
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'images' ? (
          <NativeImageUpload
            service={currentService}
            serviceId={serviceId}
            userRole={userRole}
            onImagesAdded={() => refreshServiceFromBackend()}
          />
        ) : (
          <View style={styles.readingsSection}>
            <View style={styles.readingsHeader}>
              <View>
                <Text style={styles.readingsTitle}>Odometer Log</Text>
                <Text style={styles.readingsSub}>
                  Total Distance: {totalDistance.toFixed(1)} km
                </Text>
              </View>
              <TouchableOpacity
                style={styles.addReadingBtn}
                onPress={() => setShowAddReading(!showAddReading)}
              >
                <Text style={styles.addReadingBtnText}>
                  {showAddReading ? '✕ Cancel' : '+ Add Reading'}
                </Text>
              </TouchableOpacity>
            </View>

            {showAddReading && (
              <View style={styles.formCard}>
                <Text style={styles.label}>Start Reading (km) *</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  placeholder="e.g. 12450"
                  value={newReading.startReading}
                  onChangeText={(v) => setNewReading({ ...newReading, startReading: v })}
                />

                <Text style={styles.label}>End Reading (km) *</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  placeholder="e.g. 12520"
                  value={newReading.endReading}
                  onChangeText={(v) => setNewReading({ ...newReading, endReading: v })}
                />

                <View style={styles.photoPickerRow}>
                  <TouchableOpacity
                    style={styles.photoPickBtn}
                    onPress={() => pickReadingImage('start')}
                  >
                    <Text style={styles.photoPickText}>
                      {startReadingAsset ? '✅ Start Photo Ready' : '📷 Capture Start Meter'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.photoPickBtn}
                    onPress={() => pickReadingImage('end')}
                  >
                    <Text style={styles.photoPickText}>
                      {endReadingAsset ? '✅ End Photo Ready' : '📷 Capture End Meter'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.saveReadingBtn}
                  onPress={handleAddReading}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color={COLORS.white} />
                  ) : (
                    <Text style={styles.saveReadingText}>Save Meter Reading</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {meterReadings.length === 0 ? (
              <Text style={styles.emptyText}>No meter readings recorded yet.</Text>
            ) : (
              meterReadings.map((r, idx) => {
                const dist = Math.max(
                  0,
                  (Number(r.endReading) || 0) - (Number(r.startReading) || 0)
                );
                return (
                  <View key={r._id || idx} style={styles.readingCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.readingDay}>
                        Day {r.dayNumber || idx + 1} •{' '}
                        {r.date ? new Date(r.date).toLocaleDateString() : ''}
                      </Text>
                      <Text style={styles.readingNumbers}>
                        Start: {r.startReading} km → End: {r.endReading} km ({dist.toFixed(1)} km)
                      </Text>
                      <View style={styles.readingThumbs}>
                        {r.startImage?.url && (
                          <Image source={{ uri: r.startImage.url }} style={styles.readingThumb} />
                        )}
                        {r.endImage?.url && (
                          <Image source={{ uri: r.endImage.url }} style={styles.readingThumb} />
                        )}
                      </View>
                    </View>
                    {r._id && (
                      <TouchableOpacity
                        style={styles.delBtn}
                        onPress={() => handleDeleteReading(r._id)}
                      >
                        <Text style={styles.delBtnText}>🗑️</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  backBtn: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  backBtnText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 13,
  },
  headerTitle: {
    flex: 1,
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '800',
  },
  statusBadge: {
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    color: COLORS.primaryDark,
    fontSize: 10,
    fontWeight: '800',
  },
  scrollContent: {
    padding: 14,
    paddingBottom: 36,
  },
  infoCard: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 14,
  },
  serviceTypeTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.primary,
    marginBottom: 6,
  },
  infoLine: {
    fontSize: 13,
    color: COLORS.text,
    marginBottom: 4,
  },
  bold: {
    fontWeight: '700',
  },
  progressTrack: {
    height: 8,
    backgroundColor: COLORS.lightGrey,
    borderRadius: 4,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.success,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  tabBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },
  tabBtnTextActive: {
    color: COLORS.white,
  },
  readingsSection: {
    marginTop: 4,
  },
  readingsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  readingsTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.primary,
  },
  readingsSub: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  addReadingBtn: {
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
  },
  addReadingBtnText: {
    color: COLORS.primaryDark,
    fontWeight: '700',
    fontSize: 12,
  },
  formCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  input: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    marginBottom: 10,
  },
  photoPickerRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  photoPickBtn: {
    flex: 1,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  photoPickText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  saveReadingBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveReadingText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 14,
  },
  emptyText: {
    textAlign: 'center',
    color: COLORS.textLight,
    marginTop: 20,
  },
  readingCard: {
    backgroundColor: COLORS.white,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  readingDay: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },
  readingNumbers: {
    fontSize: 12,
    color: COLORS.text,
    marginTop: 2,
  },
  readingThumbs: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  readingThumb: {
    width: 60,
    height: 60,
    borderRadius: 6,
    backgroundColor: '#e2e8f0',
  },
  delBtn: {
    padding: 8,
  },
  delBtnText: {
    fontSize: 16,
  },
});
