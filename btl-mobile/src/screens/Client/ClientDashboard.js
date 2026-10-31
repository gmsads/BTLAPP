// src/screens/Client/ClientDashboard.js
import React, { useState, useEffect, useContext, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Image,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthContext } from '../../context/AuthContext';
import API from '../../utils/api';
import { COLORS, SHADOWS } from '../../utils/theme';

export default function ClientDashboard() {
  const { user, logout } = useContext(AuthContext);

  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Image Viewer Modal matching ClientDashboard.jsx
  const [imageModal, setImageModal] = useState({
    visible: false,
    images: [],
    currentIndex: 0,
    serviceInfo: null,
  });

  // Work Updates Modal matching ClientDashboard.jsx
  const [updatesModal, setUpdatesModal] = useState({
    visible: false,
    service: null,
  });

  const fetchClientServices = useCallback(async () => {
    try {
      const response = await API.get('/services/my-services');
      const list = response.data?.services || response.data || [];
      const normalized = (Array.isArray(list) ? list : []).map((s) => ({
        ...s,
        deliveryDate: s.deliveryDate || s.endDate,
      }));
      setServices(normalized);
    } catch (error) {
      console.warn('Error fetching client services:', error.message);
      setServices([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchClientServices();
  }, [fetchClientServices]);

  // Expand multi-service documents into individual sub-service cards just like ClientDashboard.jsx
  const getExpandedServices = (rawServices) => {
    const expanded = [];
    rawServices.forEach((service) => {
      if (service.services && service.services.length > 0) {
        service.services.forEach((sub, idx) => {
          const parentMatched = (service.images || []).filter(
            (img) =>
              (img.itemId && sub._id && img.itemId.toString() === sub._id.toString()) ||
              (img.serviceIndex !== undefined &&
                img.serviceIndex !== null &&
                Number(img.serviceIndex) === idx)
          );
          const enrichedSub = (sub.images || [])
            .filter(Boolean)
            .map((sImg) => {
              const match = (service.images || []).find(
                (p) =>
                  (p.public_id && sImg.public_id && p.public_id === sImg.public_id) ||
                  (p.url && sImg.url && p.url === sImg.url)
              );
              return match ? { ...sImg, ...match } : sImg;
            });
          const itemImages = [...parentMatched, ...enrichedSub].filter(
            (img, i, arr) =>
              arr.findIndex(
                (t) =>
                  (t.public_id && t.public_id === img.public_id) ||
                  (t.url && t.url === img.url) ||
                  ((t._id || t.id) &&
                    (img._id || img.id) &&
                    (t._id || t.id).toString() === (img._id || img.id).toString())
              ) === i
          );

          expanded.push({
            ...service,
            _id: `${service._id}_${idx}`,
            originalServiceId: service._id,
            serviceIndex: idx,
            serviceType:
              sub.serviceType === 'other' && sub.customServiceType
                ? sub.customServiceType
                : sub.serviceTypeName || sub.serviceType,
            serviceTypeCode: sub.serviceType,
            quantity: sub.quantity,
            numberOfDays: sub.numberOfDays || service.numberOfDays || 1,
            serviceLocation: sub.location || sub.serviceLocation || service.primaryLocation || service.location,
            itemStatus: sub.status || service.status,
            assignedTo: sub.assignedTo || service.assignedTo,
            images: itemImages,
            dailyStats: service.meterReadings || sub.dailyStats || [],
            isMultiService: true,
            totalItems: service.services.length,
            itemNumber: idx + 1,
          });
        });
      } else {
        expanded.push({
          ...service,
          originalServiceId: service._id,
          serviceIndex: null,
          serviceTypeCode: service.serviceType,
          itemStatus: service.status,
          serviceLocation: service.location || service.primaryLocation,
          images: service.images || [],
          dailyStats: service.meterReadings || service.dailyStats || [],
          isMultiService: false,
          totalItems: 1,
          itemNumber: 1,
        });
      }
    });
    return expanded;
  };

  const expandedServices = getExpandedServices(services);

  const openGoogleMaps = (loc, fallbackAddress = '') => {
    const lat = loc?.latitude || loc?.lat || loc?.coordinates?.lat;
    const lng = loc?.longitude || loc?.lng || loc?.coordinates?.lng;
    const addr =
      loc?.locationAddress ||
      loc?.simpleAddress ||
      loc?.address ||
      loc?.locationName ||
      fallbackAddress;
    if (lat && lng) {
      Linking.openURL(`https://www.google.com/maps?q=${lat},${lng}`);
    } else if (addr) {
      const q = encodeURIComponent(addr);
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header matching ClientDashboard.jsx */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>🏢 Client Dashboard</Text>
          <Text style={styles.headerSub}>
            Welcome, <Text style={{ fontWeight: '800' }}>{user?.username}</Text>
            {user?.businessName ? (
              <Text style={{ color: COLORS.secondary }}> • {user.businessName}</Text>
            ) : null}
          </Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Text style={styles.logoutBtnText}>🚪 Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Navigation Bar matching ClientDashboard.jsx */}
      <View style={styles.navBar}>
        <View style={styles.navTabActive}>
          <Text style={styles.navTabActiveText}>📋 My Services</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchClientServices();
            }}
          />
        }
      >
        <View style={styles.mainPanel}>
          <View style={styles.panelHeaderRow}>
            <Text style={styles.panelHeading}>
              My Business Services ({expandedServices.length})
            </Text>
            {!!user?.businessName && (
              <View style={styles.bizBadge}>
                <Text style={styles.bizBadgeText}>🏢 {user.businessName}</Text>
              </View>
            )}
          </View>

          {loading ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 30 }} />
          ) : expandedServices.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={{ fontSize: 42, marginBottom: 8 }}>📭</Text>
              <Text style={styles.emptyTitle}>No services found for your business</Text>
              <Text style={styles.emptySub}>
                Services created for "{user?.businessName}" will appear here
              </Text>
            </View>
          ) : (
            expandedServices.map((srv) => {
              const imgCount = srv.images?.length || 0;
              const pct = srv.quantity
                ? Math.min(100, Math.round((imgCount / srv.quantity) * 100))
                : 0;
              const totalDist = (srv.dailyStats || []).reduce(
                (acc, curr) => acc + (curr.totalDistance || 0),
                0
              );
              const showOdometer =
                srv.serviceTypeCode === 'mobile-vans' ||
                (srv.serviceType || '').toLowerCase().includes('mobile van') ||
                (srv.dailyStats && srv.dailyStats.length > 0);

              return (
                <View
                  key={srv._id}
                  style={[
                    styles.serviceCard,
                    srv.isMultiService && {
                      borderLeftWidth: 4,
                      borderLeftColor: COLORS.primary,
                    },
                  ]}
                >
                  {srv.isMultiService && (
                    <View style={styles.multiBadge}>
                      <Text style={styles.multiBadgeText}>
                        Item {srv.itemNumber} of {srv.totalItems}
                      </Text>
                    </View>
                  )}

                  {/* Service Header */}
                  <View style={styles.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.serviceTitle}>{srv.serviceType}</Text>
                      <Text style={styles.serviceBiz}>🏢 {srv.businessName}</Text>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor:
                            srv.itemStatus === 'active'
                              ? '#16a34a'
                              : srv.itemStatus === 'completed'
                              ? '#0151ba'
                              : '#d97706',
                        },
                      ]}
                    >
                      <Text style={styles.statusBadgeText}>
                        {srv.itemStatus === 'pending' && '⏳ Pending'}
                        {srv.itemStatus === 'active' && '🟢 Active'}
                        {srv.itemStatus === 'completed' && '✅ Completed'}
                      </Text>
                    </View>
                  </View>

                  {/* Work Progress Bar matching ClientDashboard.jsx */}
                  <View style={styles.progressBox}>
                    <View style={styles.progressTopRow}>
                      <Text style={styles.progressTitle}>Work Progress</Text>
                      <Text
                        style={[
                          styles.progressPct,
                          { color: pct >= 100 ? '#16a34a' : COLORS.primary },
                        ]}
                      >
                        {pct}% Complete
                      </Text>
                    </View>
                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: `${pct}%`,
                            backgroundColor: pct >= 100 ? '#16a34a' : COLORS.primary,
                          },
                        ]}
                      />
                    </View>
                    <View style={styles.progressBottomRow}>
                      <Text style={styles.progressSub}>Uploaded: {imgCount} photos</Text>
                      <Text style={styles.progressSub}>Required: {srv.quantity} items</Text>
                    </View>
                  </View>

                  {/* Odometer Distance Progress (for Mobile Vans) matching ClientDashboard.jsx */}
                  {showOdometer && (
                    <View style={styles.odometerBox}>
                      <View style={styles.progressTopRow}>
                        <Text style={styles.odometerTitle}>🚗 Total Distance Covered</Text>
                        <Text style={styles.odometerVal}>
                          {totalDist.toFixed(1)} km
                          {srv.quantity > 0 ? ` / ${srv.quantity} km` : ''}
                        </Text>
                      </View>
                      {srv.quantity > 0 && (
                        <View style={styles.odometerTrack}>
                          <View
                            style={[
                              styles.odometerFill,
                              {
                                width: `${Math.min(
                                  100,
                                  Math.round((totalDist / srv.quantity) * 100)
                                )}%`,
                              },
                            ]}
                          />
                        </View>
                      )}
                    </View>
                  )}

                  {/* Action Buttons: View Images & Work Updates */}
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={[
                        styles.viewImagesBtn,
                        imgCount === 0 && { backgroundColor: '#94a3b8' },
                      ]}
                      disabled={imgCount === 0}
                      onPress={() =>
                        setImageModal({
                          visible: true,
                          images: srv.images || [],
                          currentIndex: 0,
                          serviceInfo: {
                            serviceType: srv.serviceType,
                            businessName: srv.businessName,
                            location: srv.serviceLocation?.address,
                            status: srv.itemStatus,
                            assignedTo: srv.assignedTo?.username,
                            quantity: srv.quantity,
                            uploadedCount: imgCount,
                          },
                        })
                      }
                    >
                      <Text style={styles.actionBtnText}>📷 View Images ({imgCount})</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.workUpdatesBtn}
                      onPress={() => setUpdatesModal({ visible: true, service: srv })}
                    >
                      <Text style={styles.actionBtnText}>📋 Work Updates</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Info Details matching ClientDashboard.jsx */}
                  <View style={styles.infoGrid}>
                    <View style={styles.infoCell}>
                      <Text style={styles.infoLabel}>QUANTITY</Text>
                      <Text style={styles.infoVal}>📦 {srv.quantity}</Text>
                    </View>
                    <View style={[styles.infoCell, { backgroundColor: '#e0f2fe' }]}>
                      <Text style={[styles.infoLabel, { color: '#0369a1' }]}>📅 DURATION</Text>
                      <Text style={[styles.infoVal, { color: '#0284c7' }]}>
                        {srv.numberOfDays || 1} {srv.numberOfDays === 1 ? 'day' : 'days'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.infoFullBox}>
                    <Text style={styles.infoLabel}>📍 LOCATION FOR THIS SERVICE</Text>
                    <Text style={styles.infoVal}>
                      {srv.serviceLocation?.address || 'Location not specified'}
                    </Text>
                  </View>

                  <View style={styles.infoGrid}>
                    <View style={styles.infoCell}>
                      <Text style={styles.infoLabel}>START DATE</Text>
                      <Text style={styles.infoVal}>
                        {srv.startDate ? new Date(srv.startDate).toLocaleDateString() : 'N/A'}
                      </Text>
                    </View>
                    <View style={styles.infoCell}>
                      <Text style={styles.infoLabel}>DELIVERY DATE</Text>
                      <Text style={styles.infoVal}>
                        {srv.endDate ? new Date(srv.endDate).toLocaleDateString() : 'N/A'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.workTypeBox}>
                    <Text style={[styles.infoLabel, { color: '#92400e' }]}>🛠️ WORK TYPE</Text>
                    <Text style={[styles.infoVal, { color: '#b45309' }]}>{srv.serviceType}</Text>
                  </View>

                  <Text style={styles.createdFooter}>
                    Created: {srv.createdAt ? new Date(srv.createdAt).toLocaleDateString() : 'N/A'}
                  </Text>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* IMAGE VIEWER MODAL WITH CLICKABLE LOCATION BUBBLES matching ClientDashboard.jsx */}
      <Modal visible={imageModal.visible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>
                  📷 {imageModal.serviceInfo?.serviceType} Images
                </Text>
                <Text style={styles.modalSub}>
                  {imageModal.currentIndex + 1} of {imageModal.images.length} photos
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setImageModal({ ...imageModal, visible: false })}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {imageModal.images.length > 0 && (() => {
              const cur = imageModal.images[imageModal.currentIndex];
              const url = typeof cur === 'string' ? cur : cur?.url;
              const loc = typeof cur === 'object' ? cur?.location : null;
              const lat =
                typeof cur === 'object'
                  ? cur?.latitude || loc?.lat || loc?.coordinates?.lat
                  : null;
              const lng =
                typeof cur === 'object'
                  ? cur?.longitude || loc?.lng || loc?.coordinates?.lng
                  : null;
              const fallbackAddr = imageModal.serviceInfo?.location || 'Location Recorded';
              const displayLoc =
                (typeof cur === 'object' &&
                  (cur?.locationAddress ||
                    cur?.simpleAddress ||
                    loc?.address ||
                    loc?.locationName)) ||
                fallbackAddr;

              return (
                <ScrollView>
                  <View style={{ position: 'relative' }}>
                    <Image
                      source={{ uri: url }}
                      style={styles.fullImage}
                      resizeMode="contain"
                    />
                    {!!displayLoc && (
                      <View
                        style={{
                          position: 'absolute',
                          bottom: 0,
                          left: 0,
                          right: 0,
                          backgroundColor: 'rgba(0,0,0,0.72)',
                          borderLeftWidth: 3,
                          borderLeftColor: '#f2c43b',
                          paddingHorizontal: 8,
                          paddingVertical: 5,
                        }}
                      >
                        <Text
                          style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}
                          numberOfLines={2}
                        >
                          📍 {displayLoc}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Prev / Next Navigation */}
                  <View style={styles.slideNavRow}>
                    <TouchableOpacity
                      style={[
                        styles.slideNavBtn,
                        imageModal.currentIndex === 0 && { opacity: 0.4 },
                      ]}
                      disabled={imageModal.currentIndex === 0}
                      onPress={() =>
                        setImageModal({
                          ...imageModal,
                          currentIndex: imageModal.currentIndex - 1,
                        })
                      }
                    >
                      <Text style={styles.slideNavBtnText}>◀ Prev</Text>
                    </TouchableOpacity>

                    <Text style={{ fontWeight: '700', color: COLORS.text }}>
                      {imageModal.currentIndex + 1} / {imageModal.images.length}
                    </Text>

                    <TouchableOpacity
                      style={[
                        styles.slideNavBtn,
                        imageModal.currentIndex === imageModal.images.length - 1 && {
                          opacity: 0.4,
                        },
                      ]}
                      disabled={imageModal.currentIndex === imageModal.images.length - 1}
                      onPress={() =>
                        setImageModal({
                          ...imageModal,
                          currentIndex: imageModal.currentIndex + 1,
                        })
                      }
                    >
                      <Text style={styles.slideNavBtnText}>Next ▶</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Clickable Location Bubble below every image matching ClientDashboard.jsx */}
                  <TouchableOpacity
                    style={styles.locationBubble}
                    onPress={() =>
                      openGoogleMaps(typeof cur === 'object' ? { ...loc, ...cur } : loc, displayLoc)
                    }
                  >
                    <View style={styles.locationPinCircle}>
                      <Text style={{ fontSize: 16 }}>📍</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.locationBubbleLabel}>
                        WORK PHOTO LOCATION (TAP FOR GOOGLE MAPS)
                      </Text>
                      <Text style={styles.locationBubbleAddress}>{displayLoc}</Text>
                      {!!(lat && lng) && (
                        <Text style={styles.locationCoords}>
                          GPS: {Number(lat).toFixed(5)}, {Number(lng).toFixed(5)}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                </ScrollView>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* WORK UPDATES & PROGRESS MODAL matching ClientDashboard.jsx */}
      <Modal visible={updatesModal.visible} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxHeight: '92%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>📋 Work Updates & Progress</Text>
                <Text style={styles.modalSub}>
                  {updatesModal.service?.serviceType} • {updatesModal.service?.businessName}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setUpdatesModal({ visible: false, service: null })}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {updatesModal.service && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* 4 Summary Boxes */}
                <View style={styles.updatesSummaryGrid}>
                  <View style={styles.updateStatCell}>
                    <Text style={styles.infoLabel}>STATUS</Text>
                    <Text style={styles.updateStatVal}>
                      {(updatesModal.service.itemStatus || 'pending').toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.updateStatCell}>
                    <Text style={styles.infoLabel}>QUANTITY</Text>
                    <Text style={styles.updateStatVal}>
                      📦 {updatesModal.service.quantity}
                    </Text>
                  </View>
                  <View style={styles.updateStatCell}>
                    <Text style={styles.infoLabel}>WORKER</Text>
                    <Text style={styles.updateStatVal}>
                      👤 {updatesModal.service.assignedTo?.username || 'Pending'}
                    </Text>
                  </View>
                  <View style={styles.updateStatCell}>
                    <Text style={styles.infoLabel}>PHOTOS</Text>
                    <Text style={styles.updateStatVal}>
                      📷 {updatesModal.service.images?.length || 0}
                    </Text>
                  </View>
                </View>

                {/* Daily Meter Distance Log Table matching ClientDashboard.jsx */}
                {updatesModal.service.dailyStats &&
                  updatesModal.service.dailyStats.length > 0 && (
                    <View style={styles.meterLogSection}>
                      <Text style={styles.sectionSubTitle}>🚗 Daily Meter Distance Log</Text>
                      {updatesModal.service.dailyStats.map((stat, idx) => (
                        <View key={idx} style={styles.meterLogRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.meterDayTitle}>
                              Day {stat.dayNumber} (
                              {stat.date ? new Date(stat.date).toLocaleDateString() : 'N/A'})
                            </Text>
                            <Text style={styles.meterReadingsText}>
                              Start: {stat.startReading ?? '-'} km • End:{' '}
                              {stat.endReading ?? '-'} km
                            </Text>
                          </View>
                          <View style={styles.meterDistPill}>
                            <Text style={styles.meterDistPillText}>
                              {stat.totalDistance > 0
                                ? `${stat.totalDistance.toFixed(1)} km`
                                : 'In Progress'}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}

                {/* Work Photos & Updates Grid */}
                <Text style={styles.sectionSubTitle}>
                  📷 Work Photos & Updates ({updatesModal.service.images?.length || 0})
                </Text>
                {(updatesModal.service.images || []).length === 0 ? (
                  <Text style={styles.emptySub}>
                    No work photos uploaded yet. Photos will appear here once work starts.
                  </Text>
                ) : (
                  (updatesModal.service.images || []).map((img, i) => {
                    const url = typeof img === 'string' ? img : img.url;
                    const loc = typeof img === 'object' ? img.location : null;
                    const addr =
                      (typeof img === 'object' &&
                        (img.locationAddress ||
                          img.simpleAddress ||
                          loc?.address ||
                          loc?.locationName)) ||
                      updatesModal.service.serviceLocation?.address ||
                      'Location Recorded';
                    return (
                      <View key={i} style={styles.updatePhotoCard}>
                        <View style={{ position: 'relative' }}>
                          <Image
                            source={{ uri: url }}
                            style={styles.updatePhotoImg}
                            resizeMode="cover"
                          />
                          {!!addr && (
                            <View
                              style={{
                                position: 'absolute',
                                bottom: 0,
                                left: 0,
                                right: 0,
                                backgroundColor: 'rgba(0,0,0,0.72)',
                                borderLeftWidth: 3,
                                borderLeftColor: '#f2c43b',
                                paddingHorizontal: 8,
                                paddingVertical: 4,
                              }}
                            >
                              <Text
                                style={{ color: '#fff', fontSize: 10, fontWeight: '600' }}
                                numberOfLines={2}
                              >
                                📍 {addr}
                              </Text>
                            </View>
                          )}
                        </View>
                        <TouchableOpacity
                          style={styles.updatePhotoLocRow}
                          onPress={() =>
                            openGoogleMaps(typeof img === 'object' ? { ...loc, ...img } : loc, addr)
                          }
                        >
                          <Text style={{ fontSize: 13 }}>📍</Text>
                          <Text style={styles.updatePhotoLocText} numberOfLines={2}>
                            {addr}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })
                )}
              </ScrollView>
            )}
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
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitle: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: '800',
  },
  headerSub: {
    color: '#e2e8f0',
    fontSize: 12,
    marginTop: 2,
  },
  logoutBtn: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  logoutBtnText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 12,
  },
  navBar: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    flexDirection: 'row',
  },
  navTabActive: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  navTabActiveText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 13,
  },
  scrollContent: {
    padding: 14,
    paddingBottom: 32,
  },
  mainPanel: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 14,
    ...SHADOWS.card,
  },
  panelHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  panelHeading: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1e293b',
  },
  bizBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  bizBadgeText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '700',
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#475569',
  },
  emptySub: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 4,
  },
  serviceCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  multiBadge: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 8,
  },
  multiBadgeText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: '700',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  serviceTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1e293b',
  },
  serviceBiz: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
  },
  statusBadgeText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: '700',
  },
  progressBox: {
    backgroundColor: COLORS.white,
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  progressTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  progressPct: {
    fontSize: 12,
    fontWeight: '800',
  },
  progressTrack: {
    height: 8,
    backgroundColor: '#e2e8f0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressSub: {
    fontSize: 11,
    color: '#64748b',
  },
  odometerBox: {
    backgroundColor: '#f0fdf4',
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  odometerTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#166534',
  },
  odometerVal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#15803d',
  },
  odometerTrack: {
    height: 8,
    backgroundColor: '#dcfce7',
    borderRadius: 4,
    overflow: 'hidden',
  },
  odometerFill: {
    height: '100%',
    backgroundColor: '#16a34a',
    borderRadius: 4,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  viewImagesBtn: {
    flex: 1,
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  workUpdatesBtn: {
    flex: 1,
    backgroundColor: '#16a34a',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionBtnText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '700',
  },
  infoGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  infoCell: {
    flex: 1,
    backgroundColor: COLORS.white,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  infoFullBox: {
    backgroundColor: COLORS.white,
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  infoLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
  },
  infoVal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 2,
  },
  workTypeBox: {
    backgroundColor: '#fef3c7',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fde68a',
    marginBottom: 8,
  },
  createdFooter: {
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'right',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.primary,
  },
  modalSub: {
    fontSize: 12,
    color: '#64748b',
  },
  closeBtnText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#64748b',
  },
  fullImage: {
    width: '100%',
    height: 260,
    backgroundColor: '#0f172a',
    borderRadius: 10,
  },
  slideNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 10,
  },
  slideNavBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  slideNavBtnText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 12,
  },
  locationBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#93c5fd',
    gap: 10,
  },
  locationPinCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationBubbleLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.primary,
  },
  locationBubbleAddress: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e3a8a',
    marginTop: 2,
  },
  locationCoords: {
    fontSize: 11,
    color: '#3b82f6',
    marginTop: 2,
  },
  updatesSummaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  updateStatCell: {
    width: '48%',
    backgroundColor: '#f8fafc',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  updateStatVal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1e293b',
    marginTop: 2,
  },
  meterLogSection: {
    marginBottom: 14,
  },
  sectionSubTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.primary,
    marginBottom: 8,
  },
  meterLogRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    padding: 10,
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  meterDayTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#166534',
  },
  meterReadingsText: {
    fontSize: 11,
    color: '#15803d',
    marginTop: 2,
  },
  meterDistPill: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  meterDistPillText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: '700',
  },
  updatePhotoCard: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 12,
  },
  updatePhotoImg: {
    width: '100%',
    height: 190,
    backgroundColor: '#f1f5f9',
  },
  updatePhotoLocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 10,
    backgroundColor: '#eff6ff',
  },
  updatePhotoLocText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#1e40af',
  },
});
