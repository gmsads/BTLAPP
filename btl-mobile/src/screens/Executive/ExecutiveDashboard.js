// src/screens/Executive/ExecutiveDashboard.js
import React, { useState, useEffect, useContext, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthContext } from '../../context/AuthContext';
import API from '../../utils/api';
import { COLORS, SHADOWS } from '../../utils/theme';
import NativeLocationTracker from '../../components/NativeLocationTracker';

export default function ExecutiveDashboard({ navigation }) {
  const { user, logout } = useContext(AuthContext);

  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('services'); // 'services' or 'completed'

  const fetchServices = useCallback(async () => {
    try {
      const response = await API.get('/services/assigned-to-me');
      const list = response.data?.services || response.data || [];
      const normalized = (Array.isArray(list) ? list : []).map((s) => ({
        ...s,
        deliveryDate: s.deliveryDate || s.endDate,
      }));
      setServices(normalized);
    } catch (error) {
      console.warn('Error fetching worker services:', error.message);
      setServices([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchServices();
    if (navigation?.addListener) {
      const unsubscribe = navigation.addListener('focus', () => {
        fetchServices();
      });
      return unsubscribe;
    }
  }, [fetchServices, navigation]);

  // Expand multi-service documents into sub-services assigned to this worker (exact match to ExecutiveDashboard.jsx)
  const getExpandedServices = (rawServices) => {
    if (!rawServices || !Array.isArray(rawServices)) return [];
    const expanded = [];
    const currentUserId = (user?._id || user?.id)?.toString();

    rawServices.forEach((service) => {
      if (service.services && Array.isArray(service.services) && service.services.length > 0) {
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

          const itemAssignedTo = sub.assignedTo || service.assignedTo || null;
          const assignedIdStr = (itemAssignedTo?._id || itemAssignedTo)?.toString();
          const assignedUsername = (itemAssignedTo?.username || '').trim().toLowerCase();
          const currentUsername = (user?.username || '').trim().toLowerCase();
          const isAssignedToMe =
            !currentUserId ||
            (assignedIdStr && assignedIdStr === currentUserId) ||
            (assignedUsername && currentUsername && assignedUsername === currentUsername);

          if (isAssignedToMe) {
            expanded.push({
              ...service,
              _originalId: service._id,
              _id: sub._id || `${service._id}_${idx}`,
              originalServiceId: service._id,
              serviceIndex: idx,
              serviceType:
                sub.serviceType === 'other' && sub.customServiceType
                  ? sub.customServiceType
                  : sub.serviceTypeName || sub.serviceType,
              customServiceType: sub.customServiceType,
              quantity: sub.quantity || 1,
              numberOfDays: sub.numberOfDays || service.numberOfDays || 1,
              location: sub.location || sub.serviceLocation || service.primaryLocation || service.location,
              serviceLocation: sub.location || sub.serviceLocation || service.primaryLocation || service.location,
              status: sub.status || service.status || 'pending',
              itemStatus: sub.status || service.status || 'pending',
              assignedTo: itemAssignedTo || user,
              images: itemImages,
              meterReadings: service.meterReadings || [],
              dailyStats: sub.dailyStats || [],
              isMultiService: true,
              totalItems: service.services.length,
              itemNumber: idx + 1,
            });
          }
        });
      } else {
        expanded.push({
          ...service,
          _originalId: service._id,
          originalServiceId: service._id,
          serviceIndex: 0,
          itemStatus: service.status || 'pending',
          location: service.location || service.primaryLocation,
          serviceLocation: service.location || service.primaryLocation,
          images: service.images || [],
          meterReadings: service.meterReadings || [],
          isMultiService: false,
          totalItems: 1,
          itemNumber: 1,
        });
      }
    });
    return expanded;
  };

  const expandedAll = getExpandedServices(services);
  const totalAssigned = expandedAll.length;
  const activeCount = expandedAll.filter((s) => s.itemStatus === 'active').length;
  const pendingCount = expandedAll.filter((s) => s.itemStatus === 'pending').length;
  const completedCount = expandedAll.filter((s) => s.itemStatus === 'completed').length;

  const displayedServices =
    activeTab === 'services'
      ? expandedAll.filter((s) => s.itemStatus === 'active' || s.itemStatus === 'pending')
      : expandedAll.filter((s) => s.itemStatus === 'completed');

  const getStatusColor = (status) => {
    if (status === 'active') return '#10b981';
    if (status === 'completed') return '#6b7280';
    return '#f59e0b';
  };

  const getDaySummary = (srv) => {
    const totalDays = srv.numberOfDays || 1;
    const imgs = srv.images || [];
    const uniqueDays = new Set(imgs.map((i) => (typeof i === 'object' ? i.dayNumber || 1 : 1)));
    return `Day ${uniqueDays.size}/${totalDays}`;
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header matching ExecutiveDashboard.jsx */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Worker Dashboard</Text>
          <View style={styles.welcomeBadge}>
            <Text style={styles.welcomeText}>Welcome, {user?.username}</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Text style={styles.logoutBtnText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchServices();
            }}
          />
        }
      >
        {/* Live Location Tracker matching ExecutiveDashboard.jsx */}
        <NativeLocationTracker />

        {/* 4 Stat Boxes matching ExecutiveDashboard.jsx */}
        <View style={styles.statsGrid}>
          <View style={[styles.statBox, { borderTopColor: COLORS.primary }]}>
            <View style={styles.statHeader}>
              <Text style={styles.statTitle}>Total Assigned</Text>
              <Text style={styles.statIcon}>📋</Text>
            </View>
            <Text style={[styles.statValue, { color: COLORS.primary }]}>{totalAssigned}</Text>
            <Text style={styles.statDesc}>
              {totalAssigned === 0
                ? 'No services assigned'
                : `${totalAssigned} service${totalAssigned !== 1 ? 's' : ''} assigned`}
            </Text>
          </View>

          <View style={[styles.statBox, { borderTopColor: '#10b981' }]}>
            <View style={styles.statHeader}>
              <Text style={styles.statTitle}>Active</Text>
              <Text style={styles.statIcon}>🟢</Text>
            </View>
            <Text style={[styles.statValue, { color: '#10b981' }]}>{activeCount}</Text>
            <Text style={styles.statDesc}>
              {activeCount === 0 ? 'None in progress' : `${activeCount} currently active`}
            </Text>
          </View>

          <View style={[styles.statBox, { borderTopColor: '#f59e0b' }]}>
            <View style={styles.statHeader}>
              <Text style={styles.statTitle}>Pending</Text>
              <Text style={styles.statIcon}>⏳</Text>
            </View>
            <Text style={[styles.statValue, { color: '#f59e0b' }]}>{pendingCount}</Text>
            <Text style={styles.statDesc}>
              {pendingCount === 0 ? 'All caught up' : `${pendingCount} waiting to start`}
            </Text>
          </View>

          <View style={[styles.statBox, { borderTopColor: '#8b5cf6' }]}>
            <View style={styles.statHeader}>
              <Text style={styles.statTitle}>Completed</Text>
              <Text style={styles.statIcon}>✅</Text>
            </View>
            <Text style={[styles.statValue, { color: '#8b5cf6' }]}>{completedCount}</Text>
            <Text style={styles.statDesc}>
              {completedCount === 0 ? 'None completed yet' : `${completedCount} finished`}
            </Text>
          </View>
        </View>

        {/* Navigation Tabs matching ExecutiveDashboard.jsx */}
        <View style={styles.tabsRow}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'services' && styles.tabBtnActive]}
            onPress={() => setActiveTab('services')}
          >
            <Text
              style={[
                styles.tabBtnText,
                activeTab === 'services' && styles.tabBtnTextActive,
              ]}
            >
              📋 Services ({activeCount + pendingCount})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'completed' && styles.tabBtnActive]}
            onPress={() => setActiveTab('completed')}
          >
            <Text
              style={[
                styles.tabBtnText,
                activeTab === 'completed' && styles.tabBtnTextActive,
              ]}
            >
              ✅ Completed ({completedCount})
            </Text>
          </TouchableOpacity>
        </View>

        {/* ServiceList Cards matching ServiceList.jsx */}
        <View style={styles.listHeaderRow}>
          <Text style={styles.listHeading}>
            Assigned Services ({displayedServices.length})
          </Text>
          {displayedServices.length > 0 && (
            <Text style={styles.listSubHeading}>Tap a service to view details</Text>
          )}
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 30 }} />
        ) : displayedServices.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No services assigned to you yet</Text>
            <Text style={styles.emptySub}>
              Please wait for an admin or owner to assign services to you
            </Text>
          </View>
        ) : (
          displayedServices.map((srv) => {
            const imgCount = srv.images?.length || 0;
            const pct = srv.quantity
              ? Math.min(100, Math.round((imgCount / srv.quantity) * 100))
              : 0;

            return (
              <TouchableOpacity
                key={srv._id}
                style={[
                  styles.serviceCard,
                  srv.isMultiService && {
                    borderLeftWidth: 4,
                    borderLeftColor: COLORS.primary,
                  },
                ]}
                activeOpacity={0.9}
                onPress={() =>
                  navigation.navigate('ServiceDetails', {
                    service: {
                      ...srv,
                      _id: srv.originalServiceId,
                      status: srv.itemStatus,
                      location: srv.serviceLocation,
                    },
                    serviceIndex: srv.serviceIndex,
                    isMultiService: srv.isMultiService,
                  })
                }
              >
                {srv.isMultiService && (
                  <View style={styles.multiBadge}>
                    <Text style={styles.multiBadgeText}>
                      Item {srv.itemNumber} of {srv.totalItems}
                    </Text>
                  </View>
                )}

                <View style={styles.cardTopRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.serviceTypeTitle}>{srv.serviceType}</Text>
                    {!!srv.businessName && (
                      <Text style={styles.businessNameText}>🏢 {srv.businessName}</Text>
                    )}
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: getStatusColor(srv.itemStatus) },
                    ]}
                  >
                    <Text style={styles.statusBadgeText}>
                      {(srv.itemStatus || 'pending').toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.badgesRow}>
                  <View style={styles.qtyPill}>
                    <Text style={styles.qtyPillText}>Qty: {srv.quantity}</Text>
                  </View>
                  <View style={styles.daysPill}>
                    <Text style={styles.daysPillText}>
                      📅 {srv.numberOfDays || 1} {srv.numberOfDays === 1 ? 'day' : 'days'}
                    </Text>
                  </View>
                </View>

                <View style={styles.locationBox}>
                  <Text style={styles.locationText}>
                    📍 {srv.serviceLocation?.address || 'Location not specified'}
                  </Text>
                </View>

                <View style={styles.datesRow}>
                  <Text style={styles.dateText}>
                    Start:{' '}
                    <Text style={{ fontWeight: '700', color: COLORS.text }}>
                      {srv.startDate ? new Date(srv.startDate).toLocaleDateString() : 'N/A'}
                    </Text>
                  </Text>
                  <Text style={styles.dateText}>
                    Delivery:{' '}
                    <Text style={{ fontWeight: '700', color: COLORS.text }}>
                      {srv.endDate ? new Date(srv.endDate).toLocaleDateString() : 'N/A'}
                    </Text>
                  </Text>
                </View>

                <View style={styles.metaRow}>
                  <Text style={styles.metaText}>
                    Created by: {srv.createdBy?.username || 'Admin'}
                  </Text>
                  {srv.assignedTo && (
                    <Text style={styles.assignedText}>
                      👤 Assigned to: {srv.assignedTo.username}
                    </Text>
                  )}
                </View>

                {/* Progress Bar matching ServiceList.jsx */}
                {imgCount > 0 && (
                  <View style={styles.progressSection}>
                    <View style={styles.progressLabels}>
                      <Text style={styles.progressLabelText}>
                        {imgCount} photo{imgCount !== 1 ? 's' : ''} uploaded
                      </Text>
                      <Text style={styles.progressDayText}>{getDaySummary(srv)}</Text>
                    </View>
                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: `${pct}%`,
                            backgroundColor: pct >= 100 ? '#10b981' : COLORS.primary,
                          },
                        ]}
                      />
                    </View>
                  </View>
                )}

                {/* Bottom Action Row matching ServiceList.jsx */}
                <View style={styles.bottomActionRow}>
                  <View style={styles.dayBadgePill}>
                    <Text style={styles.dayBadgePillText}>📷 {getDaySummary(srv)}</Text>
                  </View>

                  <TouchableOpacity
                    style={styles.startViewBtn}
                    onPress={() => {
                      const nextStatus = srv.itemStatus === 'pending' ? 'active' : srv.itemStatus;
                      if (srv.itemStatus === 'pending' && srv.originalServiceId) {
                        API.patch(`/services/${srv.originalServiceId}/status`, {
                          status: 'active',
                          serviceIndex: srv.serviceIndex,
                        }).catch(() => {});
                      }
                      navigation.navigate('ServiceDetails', {
                        service: {
                          ...srv,
                          _id: srv.originalServiceId,
                          status: nextStatus,
                          itemStatus: nextStatus,
                          location: srv.serviceLocation,
                        },
                        serviceIndex: srv.serviceIndex,
                        isMultiService: srv.isMultiService,
                      });
                    }}
                  >
                    <Text style={styles.startViewBtnText}>
                      ▶️ {srv.itemStatus === 'pending' ? 'Start' : 'View'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    flex: 1,
  },
  headerTitle: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: '800',
  },
  welcomeBadge: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
  },
  welcomeText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '600',
  },
  logoutBtn: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  logoutBtnText: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 13,
  },
  scrollContent: {
    padding: 14,
    paddingBottom: 32,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  statBox: {
    width: '48%',
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 14,
    borderTopWidth: 4,
    ...SHADOWS.card,
  },
  statHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  statIcon: {
    fontSize: 18,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
    marginVertical: 4,
  },
  statDesc: {
    fontSize: 11,
    color: '#64748b',
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  tabBtn: {
    flex: 1,
    backgroundColor: COLORS.white,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  tabBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
  },
  tabBtnTextActive: {
    color: COLORS.white,
  },
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  listHeading: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1e293b',
  },
  listSubHeading: {
    fontSize: 11,
    color: '#64748b',
  },
  emptyCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
  },
  serviceCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    ...SHADOWS.card,
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
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  serviceTypeTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1e293b',
  },
  businessNameText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: '700',
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  qtyPill: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  qtyPillText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '700',
  },
  daysPill: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  daysPillText: {
    color: '#0369a1',
    fontSize: 12,
    fontWeight: '700',
  },
  locationBox: {
    backgroundColor: '#f8fafc',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  locationText: {
    fontSize: 12,
    color: '#334155',
  },
  datesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  dateText: {
    fontSize: 12,
    color: '#64748b',
  },
  metaRow: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 8,
    marginBottom: 10,
  },
  metaText: {
    fontSize: 11,
    color: '#94a3b8',
  },
  assignedText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#10b981',
    marginTop: 2,
  },
  progressSection: {
    marginBottom: 12,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  progressLabelText: {
    fontSize: 11,
    color: '#64748b',
  },
  progressDayText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#e2e8f0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  bottomActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 10,
  },
  dayBadgePill: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  dayBadgePillText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  startViewBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  startViewBtnText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '700',
  },
});
