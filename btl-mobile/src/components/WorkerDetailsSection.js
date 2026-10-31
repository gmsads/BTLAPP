// src/components/WorkerDetailsSection.js
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import API from '../utils/api';
import { COLORS, SERVICE_TYPES, formatServiceType } from '../utils/theme';

export default function WorkerDetailsSection() {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingWorker, setEditingWorker] = useState(null);
  const [formLoading, setFormLoading] = useState(false);

  const initialForm = {
    workerName: '',
    contactNumber: '',
    aadharNumber: '',
    email: '',
    address: '',
    serviceType: 'mobile-vans',
    vehicleNumber: '',
    supplierName: '',
  };
  const [formData, setFormData] = useState(initialForm);

  useEffect(() => {
    fetchWorkers();
  }, []);

  const fetchWorkers = async () => {
    try {
      setLoading(true);
      const res = await API.get('/workers');
      setWorkers(Array.isArray(res.data) ? res.data : res.data?.workers || []);
    } catch (err) {
      Alert.alert('Error', 'Could not load worker KYC directory');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEdit = (w) => {
    setEditingWorker(w);
    setFormData({
      workerName: w.workerName || '',
      contactNumber: w.contactNumber || '',
      aadharNumber: w.aadharNumber || '',
      email: w.email || '',
      address: w.address || '',
      serviceType: w.serviceType || 'mobile-vans',
      vehicleNumber: w.vehicleDetails?.vehicleNumber || '',
      supplierName: w.vehicleDetails?.supplierName || '',
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.workerName.trim() || !formData.contactNumber.trim() || !formData.aadharNumber.trim() || !formData.address.trim()) {
      Alert.alert('Validation', 'Name, Contact Number, Aadhar Number, and Address are required.');
      return;
    }

    if (formData.serviceType === 'mobile-vans' && !formData.vehicleNumber.trim()) {
      Alert.alert('Validation', 'Vehicle Number is required for Mobile Vans.');
      return;
    }

    const payload = {
      workerName: formData.workerName.trim(),
      contactNumber: formData.contactNumber.trim(),
      aadharNumber: formData.aadharNumber.trim(),
      email: formData.email.trim() || undefined,
      address: formData.address.trim(),
      serviceType: formData.serviceType,
      vehicleDetails:
        formData.serviceType === 'mobile-vans'
          ? {
              vehicleNumber: formData.vehicleNumber.trim(),
              supplierName: formData.supplierName.trim(),
            }
          : undefined,
    };

    try {
      setFormLoading(true);
      if (editingWorker) {
        await API.put(`/workers/${editingWorker._id}`, payload);
      } else {
        await API.post('/workers', payload);
      }
      setShowForm(false);
      setEditingWorker(null);
      setFormData(initialForm);
      fetchWorkers();
    } catch (err) {
      Alert.alert('Save Failed', err.response?.data?.message || err.message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = (workerId) => {
    Alert.alert('Delete Worker', 'Are you sure you want to delete this worker record?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await API.delete(`/workers/${workerId}`);
            fetchWorkers();
          } catch (err) {
            Alert.alert('Error', err.response?.data?.message || err.message);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>👷 Worker KYC Directory ({workers.length})</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => {
            setEditingWorker(null);
            setFormData(initialForm);
            setShowForm(!showForm);
          }}
        >
          <Text style={styles.addBtnText}>{showForm ? '✕ Close' : '+ Add Worker'}</Text>
        </TouchableOpacity>
      </View>

      {showForm && (
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>
            {editingWorker ? 'Edit Worker Details' : 'New Worker KYC'}
          </Text>

          <Text style={styles.label}>Worker Name *</Text>
          <TextInput
            style={styles.input}
            value={formData.workerName}
            onChangeText={(v) => setFormData({ ...formData, workerName: v })}
            placeholder="Full Name"
          />

          <Text style={styles.label}>Contact Number *</Text>
          <TextInput
            style={styles.input}
            value={formData.contactNumber}
            onChangeText={(v) => setFormData({ ...formData, contactNumber: v })}
            keyboardType="phone-pad"
            placeholder="10-digit mobile number"
          />

          <Text style={styles.label}>Aadhar Number *</Text>
          <TextInput
            style={styles.input}
            value={formData.aadharNumber}
            onChangeText={(v) => setFormData({ ...formData, aadharNumber: v })}
            keyboardType="numeric"
            placeholder="12-digit Aadhar number"
          />

          <Text style={styles.label}>Email (Optional)</Text>
          <TextInput
            style={styles.input}
            value={formData.email}
            onChangeText={(v) => setFormData({ ...formData, email: v })}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="worker@example.com"
          />

          <Text style={styles.label}>Address *</Text>
          <TextInput
            style={[styles.input, { height: 64 }]}
            value={formData.address}
            onChangeText={(v) => setFormData({ ...formData, address: v })}
            multiline
            placeholder="Full residential address"
          />

          <Text style={styles.label}>Service Specialization *</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            {SERVICE_TYPES.map((type) => {
              const active = formData.serviceType === type;
              return (
                <TouchableOpacity
                  key={type}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setFormData({ ...formData, serviceType: type })}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {formatServiceType(type)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {formData.serviceType === 'mobile-vans' && (
            <View style={styles.vehicleBox}>
              <Text style={styles.label}>Vehicle Number *</Text>
              <TextInput
                style={styles.input}
                value={formData.vehicleNumber}
                onChangeText={(v) => setFormData({ ...formData, vehicleNumber: v })}
                placeholder="e.g. TS09AB1234"
              />
              <Text style={styles.label}>Supplier Name</Text>
              <TextInput
                style={styles.input}
                value={formData.supplierName}
                onChangeText={(v) => setFormData({ ...formData, supplierName: v })}
                placeholder="Supplier / Vendor Name"
              />
            </View>
          )}

          <TouchableOpacity
            style={styles.saveBtn}
            onPress={handleSave}
            disabled={formLoading}
          >
            <Text style={styles.saveBtnText}>
              {formLoading ? 'Saving...' : editingWorker ? 'Update Worker' : 'Save Worker'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 24 }} />
      ) : workers.length === 0 ? (
        <Text style={styles.emptyText}>No worker KYC records found.</Text>
      ) : (
        workers.map((w) => (
          <View key={w._id} style={styles.workerCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.workerName}>{w.workerName}</Text>
              <Text style={styles.workerMeta}>📞 {w.contactNumber} • 🪪 Aadhar: {w.aadharNumber}</Text>
              <Text style={styles.workerMeta}>
                🛠️ {formatServiceType(w.serviceType)}
                {w.vehicleDetails?.vehicleNumber ? ` • 🚐 ${w.vehicleDetails.vehicleNumber}` : ''}
              </Text>
              <Text style={styles.workerAddress}>📍 {w.address}</Text>
            </View>
            <View style={styles.cardActions}>
              <TouchableOpacity style={styles.editBtn} onPress={() => handleOpenEdit(w)}>
                <Text style={styles.editBtnText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.delBtn} onPress={() => handleDelete(w._id)}>
                <Text style={styles.delBtnText}>Delete</Text>
              </TouchableOpacity>
            </View>
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.primary,
  },
  addBtn: {
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addBtnText: {
    color: COLORS.primaryDark,
    fontWeight: '700',
    fontSize: 12,
  },
  formCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 14,
    borderWidth: 2,
    borderColor: COLORS.secondary,
    marginBottom: 16,
  },
  formTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 10,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
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
    fontSize: 13,
    marginBottom: 10,
    color: COLORS.text,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: COLORS.lightGrey,
    marginRight: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: {
    fontSize: 12,
    color: COLORS.text,
    fontWeight: '600',
  },
  chipTextActive: {
    color: COLORS.white,
  },
  vehicleBox: {
    backgroundColor: '#eff6ff',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  saveBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveBtnText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 14,
  },
  emptyText: {
    textAlign: 'center',
    color: COLORS.textLight,
    marginTop: 20,
  },
  workerCard: {
    backgroundColor: COLORS.white,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  workerName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.primary,
  },
  workerMeta: {
    fontSize: 12,
    color: COLORS.text,
    marginTop: 2,
  },
  workerAddress: {
    fontSize: 11,
    color: COLORS.textLight,
    marginTop: 3,
  },
  cardActions: {
    gap: 6,
  },
  editBtn: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
  },
  editBtnText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  delBtn: {
    backgroundColor: '#fef2f2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
  },
  delBtnText: {
    color: COLORS.danger,
    fontSize: 11,
    fontWeight: '700',
  },
});
