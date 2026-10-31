// src/screens/Owner/OwnerDashboard.js
import React, { useState, useEffect, useContext, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Alert,
  Modal,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthContext } from '../../context/AuthContext';
import API from '../../utils/api';
import { COLORS, SHADOWS } from '../../utils/theme';
import { exportServiceReport } from '../../utils/reportExporter';
import AddServiceScreen from '../Shared/AddServiceScreen';
import LiveTrackingMap from '../../components/LiveTrackingMap';
import BusinessAuditView from '../../components/BusinessAuditView';
import NativeImageUpload from '../../components/NativeImageUpload';

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: '📊' },
  { key: 'users', label: 'Users', icon: '👥' },
  { key: 'all-services', label: 'All Services', icon: '📋' },
  { key: 'active-services', label: 'Active Services', icon: '🟢' },
  { key: 'add-service', label: 'Add Service', icon: '➕' },
  { key: 'live-tracking', label: 'Live Tracking', icon: '📍' },
];

export default function OwnerDashboard() {
  const { user, logout } = useContext(AuthContext);

  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [dashboardData, setDashboardData] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [availableWorkers, setAvailableWorkers] = useState([]);
  const [allServices, setAllServices] = useState([]);
  const [activeServices, setActiveServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [selectedData, setSelectedData] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [trackingTargetWorker, setTrackingTargetWorker] = useState(null);

  // Add / Edit User Modal
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userForm, setUserForm] = useState({
    username: '',
    email: '',
    contactNumber: '',
    password: '',
    role: 'user',
    businessName: '',
  });

  // Assign Worker Modal
  const [assignModal, setAssignModal] = useState({
    visible: false,
    service: null,
    serviceIndex: null,
    assignAll: false,
    selectedWorkerId: '',
  });

  // Image Viewer Modal
  const [imageModal, setImageModal] = useState({
    visible: false,
    images: [],
    serviceInfo: null,
    serviceId: null,
    serviceIndex: null,
    isMultiService: false,
  });

  // Upload Modal
  const [uploadModal, setUploadModal] = useState({
    visible: false,
    serviceId: null,
    serviceType: '',
    serviceInfo: null,
    serviceIndex: null,
    isMultiService: false,
  });

  const [selectedBusiness, setSelectedBusiness] = useState(null);

  const fetchOwnerData = useCallback(async () => {
    try {
      const [dashRes, usersRes, workersRes, srvRes] = await Promise.all([
        API.get('/owner/stats').catch(() => ({ data: null })),
        API.get('/owner/users').catch(() => ({ data: { users: [] } })),
        API.get('/owner/available-workers').catch(() => ({ data: { workers: [] } })),
        API.get('/owner/services').catch(() => ({ data: { services: [] } })),
      ]);
      if (dashRes.data) setDashboardData(dashRes.data.stats || dashRes.data);
      const usersList = usersRes.data?.users || usersRes.data || [];
      const fetchedWorkers = workersRes.data?.workers || [];
      const srvList = srvRes.data?.services || srvRes.data || [];
      const validSrvList = Array.isArray(srvList) ? srvList : [];
      setAllUsers(Array.isArray(usersList) ? usersList : []);
      setAvailableWorkers(Array.isArray(fetchedWorkers) ? fetchedWorkers : []);
      setAllServices(validSrvList);
      setActiveServices(validSrvList.filter((s) => s.status === 'active'));
    } catch (err) {
      console.warn('Owner fetch error:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchOwnerData();
  }, [fetchOwnerData]);

  const getExpandedServices = (list) => {
    const expanded = [];
    list.forEach((service) => {
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
            _originalId: service._id,
            originalServiceId: service._id,
            serviceIndex: idx,
            subServiceId: sub._id,
            serviceType:
              sub.serviceType === 'other' && sub.customServiceType
                ? sub.customServiceType
                : sub.serviceTypeName || sub.serviceType,
            quantity: sub.quantity,
            numberOfDays: sub.numberOfDays || service.numberOfDays || 1,
            serviceLocation: sub.location || sub.serviceLocation || service.primaryLocation || service.location,
            itemStatus: sub.status || service.status,
            assignedTo: sub.assignedTo || service.assignedTo,
            images: itemImages,
            dailyStats: service.meterReadings || sub.dailyStats || [],
            isMultiService: service.services.length > 1,
            totalItems: service.services.length,
            itemNumber: idx + 1,
          });
        });
      } else {
        expanded.push({
          ...service,
          _originalId: service._id,
          originalServiceId: service._id,
          serviceIndex: null,
          itemStatus: service.status,
          serviceLocation: service.location || service.primaryLocation,
          isMultiService: false,
          totalItems: 1,
          itemNumber: 1,
        });
      }
    });
    return expanded;
  };

  const handleStatClick = (type, filter = null) => {
    if (type === 'total-users') {
      setSelectedData({ type: 'users', filter: 'all', title: 'All Users', count: allUsers.length });
      setActiveTab('users');
    } else if (type === 'workers') {
      const c = allUsers.filter((u) => u.role === 'user' || u.role === 'executive').length;
      setSelectedData({ type: 'users', filter: 'user', title: 'Workers', count: c });
      setActiveTab('users');
    } else if (type === 'clients') {
      const c = allUsers.filter((u) => u.role === 'client').length;
      setSelectedData({ type: 'users', filter: 'client', title: 'Clients', count: c });
      setActiveTab('users');
    } else if (type === 'total-services') {
      setSelectedData({
        type: 'services',
        filter: 'all',
        title: 'All Services',
        count: allServices.length,
      });
      setActiveTab('all-services');
    } else if (type === 'services-by-status' && filter) {
      const c = allServices.filter((s) => s.status === filter).length;
      setSelectedData({
        type: 'services',
        filter,
        title: `${filter.toUpperCase()} Services`,
        count: c,
      });
      setActiveTab('all-services');
    } else if (type === 'assigned-services') {
      const c = allServices.filter(
        (s) =>
          s.assignedTo ||
          (s.services && s.services.some((sub) => sub.assignedTo))
      ).length;
      setSelectedData({ type: 'services', filter: 'assigned', title: 'Assigned Services', count: c });
      setActiveTab('all-services');
    } else if (type === 'unassigned-services') {
      const c = allServices.filter(
        (s) =>
          !s.assignedTo &&
          (!s.services || s.services.every((sub) => !sub.assignedTo))
      ).length;
      setSelectedData({
        type: 'services',
        filter: 'unassigned',
        title: 'Unassigned Services',
        count: c,
      });
      setActiveTab('all-services');
    } else if (type === 'active-services') {
      setSelectedData(null);
      setActiveTab('active-services');
    }
  };

  const handleSaveUser = async () => {
    if (!userForm.username || !userForm.email || !userForm.contactNumber) {
      Alert.alert('Validation', 'Please fill Username, Email, and Contact Number.');
      return;
    }
    if (!editingUser && (!userForm.password || userForm.password.length < 6)) {
      Alert.alert('Validation', 'Password must be at least 6 characters.');
      return;
    }
    if (userForm.role === 'client' && !userForm.businessName.trim()) {
      Alert.alert('Validation', 'Business Name is required for Clients.');
      return;
    }

    try {
      const payload = {
        username: userForm.username.trim(),
        email: userForm.email.trim(),
        contactNumber: userForm.contactNumber.trim(),
        role: userForm.role,
        businessName: userForm.role === 'client' ? userForm.businessName.trim() : undefined,
      };
      if (userForm.password) payload.password = userForm.password;

      if (editingUser) {
        await API.put(`/owner/users/${editingUser._id}`, payload);
        Alert.alert('Success', 'User updated successfully!');
      } else {
        await API.post('/owner/users', payload);
        Alert.alert('Success', 'User created successfully!');
      }
      setShowUserModal(false);
      setEditingUser(null);
      fetchOwnerData();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to save user');
    }
  };

  const handleDeleteUser = (userId, username) => {
    Alert.alert('Delete User', `Are you sure you want to delete "${username}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await API.delete(`/owner/users/${userId}`);
            fetchOwnerData();
          } catch (err) {
            Alert.alert('Error', err.response?.data?.message || 'Failed to delete user');
          }
        },
      },
    ]);
  };

  const handleConfirmAssign = async () => {
    if (!assignModal.selectedWorkerId) {
      Alert.alert('Select Worker', 'Please choose a worker to assign');
      return;
    }
    try {
      const srv = assignModal.service;
      await API.patch(`/owner/services/${srv.originalServiceId}/assign`, {
        assignedTo: assignModal.selectedWorkerId,
        serviceIndex: assignModal.assignAll ? undefined : assignModal.serviceIndex,
        assignAll: assignModal.assignAll,
      });
      setAssignModal({
        visible: false,
        service: null,
        serviceIndex: null,
        assignAll: false,
        selectedWorkerId: '',
      });
      fetchOwnerData();
      Alert.alert('Success', 'Worker assigned successfully!');
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to assign worker');
    }
  };

  const handleUnassignWorker = async (srv) => {
    try {
      await API.patch(`/owner/services/${srv.originalServiceId}/assign`, {
        assignedTo: null,
        serviceIndex: srv.isMultiService ? srv.serviceIndex : undefined,
        assignAll: !srv.isMultiService,
      });
      fetchOwnerData();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to unassign worker');
    }
  };

  const handleDeleteServiceItem = (srv, deleteAll = false) => {
    const label =
      srv.isMultiService && !deleteAll
        ? `Item ${srv.itemNumber} (${srv.serviceType})`
        : `Entire service for "${srv.businessName}"`;

    Alert.alert('Confirm Delete', `Delete ${label}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            if (srv.isMultiService && !deleteAll && srv.subServiceId) {
              await API.delete(
                `/owner/services/${srv.originalServiceId}/items/${srv.subServiceId}`
              );
            } else {
              await API.delete(`/owner/services/${srv.originalServiceId}`);
            }
            fetchOwnerData();
          } catch (err) {
            Alert.alert('Error', err.response?.data?.message || 'Failed to delete service');
          }
        },
      },
    ]);
  };

  const handleDeleteSingleImage = async (imgObj) => {
    try {
      const imgId = typeof imgObj === 'object' ? imgObj._id || imgObj.id : null;
      const imageUrl = typeof imgObj === 'string' ? imgObj : imgObj?.url;
      if (imgId) {
        await API.delete(`/services/${imageModal.serviceId}/images/${imgId}`);
      } else {
        await API.delete(`/services/${imageModal.serviceId}/images/single`, {
          data: {
            imageUrl,
            serviceIndex: imageModal.isMultiService ? imageModal.serviceIndex : undefined,
          },
        });
      }
      const updated = imageModal.images.filter((img) => {
        if (imgId && typeof img === 'object' && (img._id || img.id)) {
          return (img._id || img.id).toString() !== imgId.toString();
        }
        const u = typeof img === 'string' ? img : img.url;
        return u !== imageUrl;
      });
      setImageModal({ ...imageModal, images: updated });
      fetchOwnerData();
    } catch (err) {
      Alert.alert('Error', 'Failed to delete image');
    }
  };

  const getFilteredUsers = () => {
    let list = allUsers;
    if (selectedData?.type === 'users' && selectedData.filter !== 'all') {
      if (selectedData.filter === 'user') {
        list = list.filter((u) => u.role === 'user' || u.role === 'executive');
      } else {
        list = list.filter((u) => u.role === selectedData.filter);
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (u) =>
          (u.username || '').toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q) ||
          (u.businessName || '').toLowerCase().includes(q) ||
          (u.contactNumber || '').includes(q)
      );
    }
    return list;
  };

  const getFilteredExpandedServices = (isActiveTab = false) => {
    const rawList = isActiveTab ? activeServices : allServices;
    let expanded = getExpandedServices(rawList);

    if (!isActiveTab && selectedData?.type === 'services' && selectedData.filter !== 'all') {
      if (selectedData.filter === 'assigned') {
        expanded = expanded.filter((s) => !!s.assignedTo);
      } else if (selectedData.filter === 'unassigned') {
        expanded = expanded.filter((s) => !s.assignedTo);
      } else {
        expanded = expanded.filter((s) => s.itemStatus === selectedData.filter);
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      expanded = expanded.filter(
        (s) =>
          (s.businessName || '').toLowerCase().includes(q) ||
          (s.serviceType || '').toLowerCase().includes(q) ||
          (s.serviceLocation?.address || '').toLowerCase().includes(q) ||
          (s.assignedTo?.username || '').toLowerCase().includes(q)
      );
    }
    return expanded;
  };

  const workersList =
    availableWorkers.length > 0
      ? availableWorkers
      : allUsers.filter((u) => u.role === 'user' || u.role === 'executive');

  const getDaySummaryText = (srv) => {
    const totalDays = srv.numberOfDays || 1;
    const imgs = srv.images || [];
    if (imgs.length === 0) return `View Images (0)`;
    const uniqueDays = new Set(imgs.map((i) => (typeof i === 'object' ? i.dayNumber || 1 : 1)));
    return `Day ${uniqueDays.size}/${totalDays} (${imgs.length})`;
  };

  const renderServiceCard = (srv) => {
    const statusColor =
      srv.itemStatus === 'active'
        ? '#16a34a'
        : srv.itemStatus === 'completed'
        ? '#0151ba'
        : '#d97706';

    return (
      <View
        key={srv._id}
        style={[
          styles.srvCard,
          srv.isMultiService && { borderLeftWidth: 4, borderLeftColor: COLORS.primary },
        ]}
      >
        {srv.isMultiService && (
          <View style={styles.multiBadge}>
            <Text style={styles.multiBadgeText}>
              Item {srv.itemNumber} of {srv.totalItems}
            </Text>
          </View>
        )}

        <View style={styles.srvHeader}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.srvBusinessName}>
                {srv.businessName || 'No Business Name'}
              </Text>
              {!!srv.businessName && (
                <TouchableOpacity
                  style={styles.auditFolderBtn}
                  onPress={() => setSelectedBusiness(srv.businessName)}
                >
                  <Text style={{ fontSize: 13 }}>📁</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.srvTypeText}>{srv.serviceType}</Text>
          </View>
          <View style={styles.qtyBadge}>
            <Text style={styles.qtyBadgeText}>Qty: {srv.quantity}</Text>
          </View>
        </View>

        <View style={styles.infoBoxBlue}>
          <Text style={styles.infoLabelBlue}>📅 DURATION</Text>
          <Text style={styles.infoValueBlue}>
            {srv.numberOfDays || 1} {srv.numberOfDays === 1 ? 'day' : 'days'}
          </Text>
        </View>

        <View style={styles.infoBoxGrey}>
          <Text style={styles.infoLabelGrey}>📍 LOCATION FOR THIS SERVICE</Text>
          <Text style={styles.infoValueGrey}>
            {srv.serviceLocation?.address || srv.location?.address || 'Location not specified'}
          </Text>
        </View>

        <View style={styles.statusRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoLabelGrey}>ITEM STATUS</Text>
            <View style={[styles.statusPill, { backgroundColor: statusColor }]}>
              <Text style={styles.statusPillText}>
                {(srv.itemStatus || 'pending').toUpperCase()}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.datesGrid}>
          <View style={styles.dateBox}>
            <Text style={styles.infoLabelGrey}>START DATE</Text>
            <Text style={styles.dateValue}>
              {srv.startDate ? new Date(srv.startDate).toLocaleDateString() : 'N/A'}
            </Text>
          </View>
          <View style={styles.dateBox}>
            <Text style={styles.infoLabelGrey}>DELIVERY DATE</Text>
            <Text style={styles.dateValue}>
              {srv.endDate ? new Date(srv.endDate).toLocaleDateString() : 'N/A'}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.assignSection,
            srv.assignedTo ? styles.assignSectionActive : styles.assignSectionEmpty,
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.infoLabelGrey}>ASSIGNED TO</Text>
            {srv.assignedTo ? (
              <Text style={styles.assignedWorkerName}>👤 {srv.assignedTo.username}</Text>
            ) : (
              <Text style={styles.unassignedText}>⚠️ Unassigned</Text>
            )}
          </View>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {srv.assignedTo ? (
              <>
                <TouchableOpacity
                  style={styles.unassignBtn}
                  onPress={() => handleUnassignWorker(srv)}
                >
                  <Text style={styles.unassignBtnText}>Unassign</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.liveTraceBtn}
                  onPress={() => {
                    setTrackingTargetWorker(srv.assignedTo.username);
                    setActiveTab('live-tracking');
                  }}
                >
                  <Text style={styles.liveTraceBtnText}>📍 Live Trace</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={styles.assignWorkerBtn}
                onPress={() =>
                  setAssignModal({
                    visible: true,
                    service: srv,
                    serviceIndex: srv.serviceIndex,
                    assignAll: !srv.isMultiService,
                    selectedWorkerId: workersList[0]?._id || '',
                  })
                }
              >
                <Text style={styles.assignWorkerBtnText}>Assign Worker</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.actionsGrid}>
          <TouchableOpacity
            style={[
              styles.actionBtn,
              {
                backgroundColor:
                  (srv.images?.length || 0) > 0 ? COLORS.primary : '#94a3b8',
              },
            ]}
            onPress={() =>
              setImageModal({
                visible: true,
                images: srv.images || [],
                serviceInfo: {
                  serviceType: srv.serviceType,
                  businessName: srv.businessName,
                  location: srv.serviceLocation?.address,
                  status: srv.itemStatus,
                },
                serviceId: srv.originalServiceId,
                serviceIndex: srv.serviceIndex,
                isMultiService: srv.isMultiService,
              })
            }
          >
            <Text style={styles.actionBtnText}>🖼️ {getDaySummaryText(srv)}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#10b981' }]}
            onPress={() =>
              setUploadModal({
                visible: true,
                serviceId: srv.originalServiceId,
                serviceType: srv.serviceType,
                serviceInfo: {
                  businessName: srv.businessName,
                  location: srv.serviceLocation?.address,
                },
                serviceIndex: srv.serviceIndex,
                isMultiService: srv.isMultiService,
              })
            }
          >
            <Text style={styles.actionBtnText}>📷 Upload</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#f59e0b' }]}
            onPress={() => exportServiceReport(srv, 'PPT')}
          >
            <Text style={styles.actionBtnText}>📊 PPT</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#ef4444' }]}
            onPress={() => exportServiceReport(srv, 'PDF')}
          >
            <Text style={styles.actionBtnText}>📄 PDF</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#dc2626' }]}
            onPress={() => handleDeleteServiceItem(srv, false)}
          >
            <Text style={styles.actionBtnText}>
              🗑️ {srv.isMultiService ? 'Delete Item' : 'Delete'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (selectedBusiness) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={{ padding: 14 }}>
          <BusinessAuditView
            businessName={selectedBusiness}
            services={allServices.filter((s) => s.businessName === selectedBusiness)}
            onBack={() => setSelectedBusiness(null)}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Header with ☰ Menu Button matching OwnerDashboard.jsx */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.menuBtn}
            onPress={() => setSidebarOpen(true)}
          >
            <Text style={styles.menuBtnText}>☰ Menu</Text>
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>
              {NAV_ITEMS.find((n) => n.key === activeTab)?.icon}{' '}
              {NAV_ITEMS.find((n) => n.key === activeTab)?.label || 'Owner Panel'}
            </Text>
            <Text style={styles.headerSub}>
              👑 {user?.username} ({(user?.ownerLevel || 'owner').toUpperCase()})
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Text style={styles.logoutBtnText}>🚪 Logout</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchOwnerData();
            }}
          />
        }
      >
        {loading ? (
          <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* 1. DASHBOARD TAB */}
            {activeTab === 'dashboard' && (
              <View>
                <View style={styles.statsGrid}>
                  <TouchableOpacity
                    style={[styles.statCard, { borderLeftColor: COLORS.primary }]}
                    onPress={() => handleStatClick('total-users')}
                  >
                    <View style={styles.statTopRow}>
                      <Text style={styles.statLabel}>TOTAL USERS</Text>
                      <Text style={styles.statIcon}>👥</Text>
                    </View>
                    <Text style={[styles.statValue, { color: COLORS.primary }]}>
                      {dashboardData?.users?.total ?? allUsers.length}
                    </Text>
                    <Text style={styles.statHint}>Click to view all users</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.statCard, { borderLeftColor: '#f59e0b' }]}
                    onPress={() => handleStatClick('workers')}
                  >
                    <View style={styles.statTopRow}>
                      <Text style={styles.statLabel}>WORKERS</Text>
                      <Text style={styles.statIcon}>👷</Text>
                    </View>
                    <Text style={[styles.statValue, { color: '#f59e0b' }]}>
                      {dashboardData?.totalWorkers ??
                        dashboardData?.users?.executives ??
                        allUsers.filter((u) => u.role === 'user' || u.role === 'executive').length}
                    </Text>
                    <Text style={styles.statHint}>Click to view workers</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.statCard, { borderLeftColor: '#10b981' }]}
                    onPress={() => handleStatClick('clients')}
                  >
                    <View style={styles.statTopRow}>
                      <Text style={styles.statLabel}>CLIENTS</Text>
                      <Text style={styles.statIcon}>👔</Text>
                    </View>
                    <Text style={[styles.statValue, { color: '#10b981' }]}>
                      {dashboardData?.users?.clients ??
                        allUsers.filter((u) => u.role === 'client').length}
                    </Text>
                    <Text style={styles.statHint}>Click to view clients</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.statCard, { borderLeftColor: '#8b5cf6' }]}
                    onPress={() => handleStatClick('total-services')}
                  >
                    <View style={styles.statTopRow}>
                      <Text style={styles.statLabel}>SERVICES</Text>
                      <Text style={styles.statIcon}>📋</Text>
                    </View>
                    <Text style={[styles.statValue, { color: '#8b5cf6' }]}>
                      {dashboardData?.services?.total ?? allServices.length}
                    </Text>
                    <Text style={styles.statHint}>Click to view all services</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.panelCard}>
                  <Text style={styles.panelTitle}>📈 Services by Status</Text>
                  <View style={styles.miniGrid}>
                    {['pending', 'active', 'completed'].map((st) => {
                      const count = allServices.filter((s) => s.status === st).length;
                      return (
                        <TouchableOpacity
                          key={st}
                          style={styles.miniStatBox}
                          onPress={() => handleStatClick('services-by-status', st)}
                        >
                          <Text style={styles.miniStatCount}>{count}</Text>
                          <Text style={styles.miniStatLabel}>{st.toUpperCase()}</Text>
                          <Text style={styles.miniStatClick}>Click to view</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.panelCard}>
                  <Text style={styles.panelTitle}>👥 Services by Assignment</Text>
                  <View style={styles.miniGrid}>
                    <TouchableOpacity
                      style={styles.miniStatBox}
                      onPress={() => handleStatClick('assigned-services')}
                    >
                      <Text style={[styles.miniStatCount, { color: '#10b981' }]}>
                        {
                          allServices.filter(
                            (s) =>
                              s.assignedTo ||
                              (s.services && s.services.some((sub) => sub.assignedTo))
                          ).length
                        }
                      </Text>
                      <Text style={styles.miniStatLabel}>ASSIGNED</Text>
                      <Text style={styles.miniStatClick}>Click to view</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.miniStatBox}
                      onPress={() => handleStatClick('unassigned-services')}
                    >
                      <Text style={[styles.miniStatCount, { color: '#ef4444' }]}>
                        {
                          allServices.filter(
                            (s) =>
                              !s.assignedTo &&
                              (!s.services || s.services.every((sub) => !sub.assignedTo))
                          ).length
                        }
                      </Text>
                      <Text style={styles.miniStatLabel}>UNASSIGNED</Text>
                      <Text style={styles.miniStatClick}>Click to view</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.miniStatBox}
                      onPress={() => handleStatClick('active-services')}
                    >
                      <Text style={[styles.miniStatCount, { color: COLORS.primary }]}>
                        {activeServices.length}
                      </Text>
                      <Text style={styles.miniStatLabel}>ACTIVE SERVICES</Text>
                      <Text style={styles.miniStatClick}>Click to view</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.panelCard}>
                  <View style={styles.panelHeaderRow}>
                    <Text style={styles.panelTitle}>
                      🟢 Active Services ({activeServices.length})
                    </Text>
                    {activeServices.length > 0 && (
                      <TouchableOpacity
                        style={styles.viewAllBtn}
                        onPress={() => setActiveTab('active-services')}
                      >
                        <Text style={styles.viewAllBtnText}>View All Active</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {activeServices.length === 0 ? (
                    <Text style={styles.emptyText}>No active services at the moment</Text>
                  ) : (
                    activeServices.slice(0, 4).map((srv) => (
                      <TouchableOpacity
                        key={srv._id}
                        style={styles.previewItem}
                        onPress={() => setActiveTab('active-services')}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.previewTitle}>
                            {srv.businessName || srv.serviceType}
                          </Text>
                          <Text style={styles.previewSub}>
                            📍 {srv.location?.address || 'N/A'} • 👤{' '}
                            {srv.assignedTo?.username || 'Unassigned'}
                          </Text>
                        </View>
                        <View style={styles.activeBadgeSmall}>
                          <Text style={styles.activeBadgeSmallText}>ACTIVE</Text>
                        </View>
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              </View>
            )}

            {/* 2. USERS TAB */}
            {activeTab === 'users' && (
              <View>
                <View style={styles.topActionRow}>
                  <TextInput
                    style={[styles.searchInput, { flex: 1 }]}
                    placeholder="🔍 Search users..."
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                  />
                  <TouchableOpacity
                    style={styles.addPrimaryBtn}
                    onPress={() => {
                      setEditingUser(null);
                      setUserForm({
                        username: '',
                        email: '',
                        contactNumber: '',
                        password: '',
                        role: 'executive',
                        businessName: '',
                      });
                      setShowUserModal(true);
                    }}
                  >
                    <Text style={styles.addPrimaryBtnText}>👤 + Add User</Text>
                  </TouchableOpacity>
                </View>

                {selectedData?.type === 'users' && selectedData.filter !== 'all' && (
                  <View style={styles.filterBanner}>
                    <Text style={styles.filterBannerText}>
                      Showing only: {selectedData.filter.toUpperCase()} (
                      {getFilteredUsers().length})
                    </Text>
                    <TouchableOpacity onPress={() => setSelectedData(null)}>
                      <Text style={styles.clearFilterText}>Show All Users ✕</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {getFilteredUsers().map((u) => (
                  <View key={u._id} style={styles.userCard}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={styles.userName}>{u.username}</Text>
                        <View
                          style={[
                            styles.roleBadge,
                            {
                              backgroundColor:
                                u.role === 'client' ? '#8b5cf6' : COLORS.primary,
                            },
                          ]}
                        >
                          <Text style={styles.roleBadgeText}>
                            {u.role === 'executive' ? 'WORKER' : (u.role || '').toUpperCase()}
                          </Text>
                        </View>
                      </View>
                      {!!u.businessName && (
                        <Text style={styles.userBiz}>🏢 {u.businessName}</Text>
                      )}
                      <Text style={styles.userMeta}>
                        📞 {u.contactNumber} • ✉️ {u.email}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <TouchableOpacity
                        style={styles.editBtn}
                        onPress={() => {
                          setEditingUser(u);
                          setUserForm({
                            username: u.username || '',
                            email: u.email || '',
                            contactNumber: u.contactNumber || '',
                            password: '',
                            role: u.role === 'executive' ? 'user' : u.role || 'user',
                            businessName: u.businessName || '',
                          });
                          setShowUserModal(true);
                        }}
                      >
                        <Text style={styles.editBtnText}>✏️ Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => handleDeleteUser(u._id, u.username)}
                      >
                        <Text style={styles.deleteBtnText}>🗑️</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* 3. ALL SERVICES TAB */}
            {activeTab === 'all-services' && (
              <View>
                <TextInput
                  style={[styles.searchInput, { marginBottom: 10 }]}
                  placeholder="🔍 Search business, service type, location, worker..."
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />

                {selectedData?.type === 'services' && selectedData.filter !== 'all' && (
                  <View style={styles.filterBanner}>
                    <Text style={styles.filterBannerText}>
                      Showing only: {selectedData.title} (
                      {getFilteredExpandedServices(false).length})
                    </Text>
                    <TouchableOpacity onPress={() => setSelectedData(null)}>
                      <Text style={styles.clearFilterText}>Show All Services ✕</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {getFilteredExpandedServices(false).length === 0 ? (
                  <Text style={styles.emptyText}>No services found.</Text>
                ) : (
                  getFilteredExpandedServices(false).map((srv) => renderServiceCard(srv))
                )}
              </View>
            )}

            {/* 4. ACTIVE SERVICES TAB */}
            {activeTab === 'active-services' && (
              <View>
                <TextInput
                  style={[styles.searchInput, { marginBottom: 10 }]}
                  placeholder="🔍 Search active services..."
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {getFilteredExpandedServices(true).length === 0 ? (
                  <Text style={styles.emptyText}>No active services at the moment.</Text>
                ) : (
                  getFilteredExpandedServices(true).map((srv) => renderServiceCard(srv))
                )}
              </View>
            )}

            {/* 5. ADD SERVICE TAB */}
            {activeTab === 'add-service' && (
              <AddServiceScreen
                embedded
                onServiceAdded={() => {
                  fetchOwnerData();
                  setActiveTab('all-services');
                }}
              />
            )}

            {/* 6. LIVE TRACKING TAB */}
            {activeTab === 'live-tracking' && (
              <LiveTrackingMap initialWorker={trackingTargetWorker} />
            )}
          </>
        )}
      </ScrollView>

      {/* SLIDE-OUT SIDEBAR DRAWER matching OwnerDashboard.jsx */}
      <Modal visible={sidebarOpen} transparent animationType="fade">
        <View style={styles.sidebarOverlay}>
          <View style={styles.sidebarDrawer}>
            <View style={styles.sidebarHeader}>
              <View>
                <Text style={styles.sidebarBrand}>👑 Owner Panel</Text>
                <Text style={styles.sidebarUser}>
                  {user?.username} ({(user?.ownerLevel || 'owner').toUpperCase()})
                </Text>
              </View>
              <TouchableOpacity
                style={styles.closeSidebarBtn}
                onPress={() => setSidebarOpen(false)}
              >
                <Text style={styles.closeSidebarText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1, paddingVertical: 10 }}>
              {NAV_ITEMS.map((item) => {
                const isActive = activeTab === item.key;
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={[styles.sidebarItem, isActive && styles.sidebarItemActive]}
                    onPress={() => {
                      setActiveTab(item.key);
                      if (item.key !== 'users' && item.key !== 'all-services') {
                        setSelectedData(null);
                      }
                      setSidebarOpen(false);
                    }}
                  >
                    <Text style={styles.sidebarIcon}>{item.icon}</Text>
                    <Text
                      style={[
                        styles.sidebarLabel,
                        isActive && styles.sidebarLabelActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={styles.sidebarLogoutBtn}
              onPress={() => {
                setSidebarOpen(false);
                logout();
              }}
            >
              <Text style={styles.sidebarLogoutText}>🚪 Logout</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setSidebarOpen(false)}
          />
        </View>
      </Modal>

      {/* ADD / EDIT USER MODAL */}
      <Modal visible={showUserModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editingUser ? `✏️ Edit User: ${editingUser.username}` : '👤 Add New User'}
            </Text>

            <Text style={styles.inputLabel}>Username *</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter username"
              value={userForm.username}
              onChangeText={(v) => setUserForm({ ...userForm, username: v })}
            />

            <Text style={styles.inputLabel}>Email *</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter email"
              keyboardType="email-address"
              autoCapitalize="none"
              value={userForm.email}
              onChangeText={(v) => setUserForm({ ...userForm, email: v })}
            />

            <Text style={styles.inputLabel}>Contact Number *</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter mobile number"
              keyboardType="phone-pad"
              value={userForm.contactNumber}
              onChangeText={(v) => setUserForm({ ...userForm, contactNumber: v })}
            />

            <Text style={styles.inputLabel}>
              {editingUser ? 'New Password (optional)' : 'Password *'}
            </Text>
            <TextInput
              style={styles.input}
              placeholder={editingUser ? 'Leave blank to keep existing' : 'Min 6 characters'}
              secureTextEntry
              value={userForm.password}
              onChangeText={(v) => setUserForm({ ...userForm, password: v })}
            />

            <Text style={styles.inputLabel}>Role *</Text>
            <View style={styles.roleRow}>
              {[
                { key: 'user', label: 'Worker' },
                { key: 'client', label: 'Client' },
              ].map((r) => (
                <TouchableOpacity
                  key={r.key}
                  style={[
                    styles.roleOption,
                    userForm.role === r.key && styles.roleOptionActive,
                  ]}
                  onPress={() => setUserForm({ ...userForm, role: r.key })}
                >
                  <Text
                    style={[
                      styles.roleOptionText,
                      userForm.role === r.key && { color: COLORS.white },
                    ]}
                  >
                    {r.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {userForm.role === 'client' && (
              <>
                <Text style={styles.inputLabel}>Business Name *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter client business name"
                  value={userForm.businessName}
                  onChangeText={(v) => setUserForm({ ...userForm, businessName: v })}
                />
              </>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  setShowUserModal(false);
                  setEditingUser(null);
                }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveUser}>
                <Text style={styles.saveBtnText}>
                  {editingUser ? 'Update User' : 'Create User'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ASSIGN WORKER MODAL */}
      <Modal visible={assignModal.visible} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>👤 Assign Service to Worker</Text>
            {assignModal.service?.isMultiService && (
              <View style={{ marginVertical: 10 }}>
                <TouchableOpacity
                  style={styles.radioRow}
                  onPress={() => setAssignModal({ ...assignModal, assignAll: false })}
                >
                  <Text style={styles.radioIcon}>
                    {!assignModal.assignAll ? '🔘' : '⚪'}
                  </Text>
                  <Text style={styles.radioLabel}>
                    Assign ONLY this service (Item {assignModal.service.itemNumber})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.radioRow}
                  onPress={() => setAssignModal({ ...assignModal, assignAll: true })}
                >
                  <Text style={styles.radioIcon}>
                    {assignModal.assignAll ? '🔘' : '⚪'}
                  </Text>
                  <Text style={styles.radioLabel}>
                    Assign ALL {assignModal.service.totalItems} services in this order
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <Text style={styles.inputLabel}>Select Worker:</Text>
            <ScrollView style={{ maxHeight: 220 }}>
              {workersList.map((w) => {
                const selected = assignModal.selectedWorkerId === w._id;
                return (
                  <TouchableOpacity
                    key={w._id}
                    style={[styles.workerSelectRow, selected && styles.workerSelectActive]}
                    onPress={() =>
                      setAssignModal({ ...assignModal, selectedWorkerId: w._id })
                    }
                  >
                    <Text
                      style={[
                        styles.workerSelectName,
                        selected && { color: COLORS.white },
                      ]}
                    >
                      👷 {w.username} ({w.contactNumber})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setAssignModal({ ...assignModal, visible: false })}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleConfirmAssign}>
                <Text style={styles.saveBtnText}>Assign Worker</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* VIEW IMAGES MODAL */}
      <Modal visible={imageModal.visible} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxHeight: '90%' }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>
                🖼️ {imageModal.serviceInfo?.serviceType || 'Service'} Photos (
                {imageModal.images.length})
              </Text>
              <TouchableOpacity
                onPress={() => setImageModal({ ...imageModal, visible: false })}
              >
                <Text style={{ fontSize: 22, fontWeight: '800', color: COLORS.textLight }}>
                  ✕
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ marginTop: 10 }}>
              {imageModal.images.length === 0 ? (
                <Text style={styles.emptyText}>No images uploaded yet.</Text>
              ) : (
                imageModal.images.map((img, i) => {
                  const url = typeof img === 'string' ? img : img.url;
                  const dayNum = typeof img === 'object' ? img.dayNumber || 1 : 1;
                  const locName =
                    (typeof img === 'object'
                      ? img.locationAddress ||
                        img.simpleAddress ||
                        img.location?.address ||
                        img.location?.locationName ||
                        (img.latitude && img.longitude
                          ? `GPS: ${Number(img.latitude).toFixed(5)}, ${Number(img.longitude).toFixed(5)}`
                          : '')
                      : '') ||
                    imageModal.serviceInfo?.location ||
                    '';
                  return (
                    <View key={i} style={styles.photoCard}>
                      <View style={{ position: 'relative' }}>
                        <Image
                          source={{ uri: url }}
                          style={styles.photoPreview}
                          resizeMode="cover"
                        />
                        {!!locName && (
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
                              📍 {locName}
                            </Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.photoFooter}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.photoDayBadge}>📅 Day {dayNum}</Text>
                          {!!locName && (
                            <Text style={styles.photoLocText}>📍 {locName}</Text>
                          )}
                        </View>
                        <TouchableOpacity
                          style={styles.deleteSinglePhotoBtn}
                          onPress={() => handleDeleteSingleImage(img)}
                        >
                          <Text style={{ color: COLORS.white, fontSize: 12, fontWeight: '700' }}>
                            🗑️ Delete
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* UPLOAD IMAGES MODAL */}
      <Modal visible={uploadModal.visible} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxHeight: '90%' }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>
                📷 Upload Photos — {uploadModal.serviceType}
              </Text>
              <TouchableOpacity
                onPress={() => setUploadModal({ ...uploadModal, visible: false })}
              >
                <Text style={{ fontSize: 22, fontWeight: '800', color: COLORS.textLight }}>
                  ✕
                </Text>
              </TouchableOpacity>
            </View>
            <ScrollView>
              <NativeImageUpload
                serviceId={uploadModal.serviceId}
                serviceType={uploadModal.serviceType}
                serviceIndex={
                  uploadModal.isMultiService ? uploadModal.serviceIndex : null
                }
                onUploadSuccess={() => {
                  setUploadModal({ ...uploadModal, visible: false });
                  fetchOwnerData();
                }}
              />
            </ScrollView>
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
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  menuBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  menuBtnText: {
    color: COLORS.white,
    fontWeight: '800',
    fontSize: 13,
  },
  headerTitle: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '800',
  },
  headerSub: {
    color: COLORS.secondaryLight,
    fontSize: 11,
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
  scrollContent: {
    padding: 14,
    paddingBottom: 32,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  statCard: {
    width: '48%',
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
    ...SHADOWS.card,
  },
  statTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
  },
  statIcon: {
    fontSize: 20,
  },
  statValue: {
    fontSize: 26,
    fontWeight: '800',
    marginVertical: 4,
  },
  statHint: {
    fontSize: 10,
    color: '#94a3b8',
  },
  panelCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    ...SHADOWS.card,
  },
  panelHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  panelTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.primary,
    marginBottom: 10,
  },
  miniGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  miniStatBox: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  miniStatCount: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.primary,
  },
  miniStatLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
    marginTop: 2,
    textAlign: 'center',
  },
  miniStatClick: {
    fontSize: 9,
    color: '#94a3b8',
    marginTop: 2,
  },
  viewAllBtn: {
    backgroundColor: '#10b981',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  viewAllBtnText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: '700',
  },
  previewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#166534',
  },
  previewSub: {
    fontSize: 11,
    color: '#15803d',
    marginTop: 2,
  },
  activeBadgeSmall: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  activeBadgeSmallText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: '700',
  },
  topActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  searchInput: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: COLORS.text,
  },
  addPrimaryBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: 10,
  },
  addPrimaryBtnText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 13,
  },
  filterBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#e0f2fe',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  filterBannerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0369a1',
  },
  clearFilterText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#dc2626',
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    ...SHADOWS.card,
  },
  userName: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  roleBadgeText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: '700',
  },
  userBiz: {
    fontSize: 12,
    color: '#6d28d9',
    fontWeight: '600',
    marginTop: 2,
  },
  userMeta: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  editBtn: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
  },
  editBtnText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: '700',
  },
  deleteBtn: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
  },
  deleteBtnText: {
    color: COLORS.white,
    fontSize: 12,
  },
  srvCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
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
  srvHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  srvBusinessName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1e293b',
  },
  auditFolderBtn: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  srvTypeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginTop: 2,
  },
  qtyBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  qtyBadgeText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '700',
  },
  infoBoxBlue: {
    backgroundColor: '#f0f9ff',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  infoLabelBlue: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0369a1',
  },
  infoValueBlue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0284c7',
    marginTop: 2,
  },
  infoBoxGrey: {
    backgroundColor: '#f8fafc',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  infoLabelGrey: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
  },
  infoValueGrey: {
    fontSize: 12,
    color: '#334155',
    marginTop: 2,
  },
  statusRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  statusPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 4,
  },
  statusPillText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: '700',
  },
  datesGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  dateBox: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 8,
    borderRadius: 8,
  },
  dateValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 2,
  },
  assignSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
  },
  assignSectionActive: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac',
  },
  assignSectionEmpty: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  assignedWorkerName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#166534',
    marginTop: 2,
  },
  unassignedText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#dc2626',
    marginTop: 2,
  },
  assignWorkerBtn: {
    backgroundColor: '#10b981',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
  },
  assignWorkerBtnText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: '700',
  },
  unassignBtn: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  unassignBtnText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: '700',
  },
  liveTraceBtn: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  liveTraceBtnText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: '700',
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: '700',
  },
  sidebarOverlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sidebarDrawer: {
    width: 270,
    backgroundColor: '#1e293b',
    height: '100%',
    paddingBottom: 20,
  },
  sidebarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  sidebarBrand: {
    color: COLORS.white,
    fontSize: 17,
    fontWeight: '800',
  },
  sidebarUser: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
  },
  closeSidebarBtn: {
    padding: 6,
  },
  closeSidebarText: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: '700',
  },
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 18,
    gap: 12,
  },
  sidebarItemActive: {
    backgroundColor: COLORS.primary,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.secondary,
  },
  sidebarIcon: {
    fontSize: 18,
  },
  sidebarLabel: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '600',
  },
  sidebarLabelActive: {
    color: COLORS.white,
    fontWeight: '800',
  },
  sidebarLogoutBtn: {
    marginHorizontal: 16,
    backgroundColor: '#dc2626',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  sidebarLogoutText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 14,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 18,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.primary,
    marginBottom: 8,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginTop: 8,
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
  },
  roleRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  roleOption: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  roleOptionActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  roleOptionText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#e2e8f0',
  },
  cancelBtnText: {
    fontWeight: '700',
    color: '#475569',
  },
  saveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
  },
  saveBtnText: {
    fontWeight: '700',
    color: COLORS.white,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  radioIcon: {
    fontSize: 16,
  },
  radioLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  workerSelectRow: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 6,
  },
  workerSelectActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  workerSelectName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  photoCard: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 12,
  },
  photoPreview: {
    width: '100%',
    height: 200,
    backgroundColor: '#f1f5f9',
  },
  photoFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#f8fafc',
  },
  photoDayBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
  photoLocText: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  deleteSinglePhotoBtn: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  emptyText: {
    textAlign: 'center',
    color: '#94a3b8',
    paddingVertical: 24,
    fontSize: 13,
  },
});
