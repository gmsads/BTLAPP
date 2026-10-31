// src/screens/Shared/AddServiceScreen.js
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import API from '../../utils/api';
import { COLORS, SERVICE_TYPES, formatServiceType } from '../../utils/theme';

export default function AddServiceForm({ onSuccess, onServiceAdded, userRole, currentUser }) {
  const todayStr = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const [formData, setFormData] = useState({
    businessName: '',
    ownerName: '',
    description: '',
    contactNumber: '',
    startDate: todayStr,
    endDate: tomorrow,
    clientId: null,
  });

  const [services, setServices] = useState([
    {
      serviceType: 'pole-boards',
      quantity: '1',
      customServiceType: '',
      address: '',
    },
  ]);

  const [businessClients, setBusinessClients] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchBusinessUsers();
  }, []);

  const fetchBusinessUsers = async () => {
    try {
      const isOwner = userRole === 'owner' || currentUser?.role === 'owner';
      const endpoint = isOwner ? '/owner/business-users' : '/auth/business-users';
      let res;
      try {
        res = await API.get(endpoint);
      } catch (e) {
        res = await API.get('/auth/business-users');
      }
      if (res.data?.success) {
        setBusinessClients(res.data.users || []);
      }
    } catch (e) {
      // ignore if none
    }
  };

  const selectExistingClient = (client) => {
    setFormData((prev) => ({
      ...prev,
      clientId: client._id,
      businessName: client.businessName || '',
      ownerName: client.username || client.businessName || '',
      contactNumber: client.contactNumber || '',
    }));
  };

  const updateServiceRow = (index, field, value) => {
    const updated = [...services];
    updated[index] = { ...updated[index], [field]: value };
    setServices(updated);
  };

  const addServiceRow = () => {
    setServices([
      ...services,
      { serviceType: 'pole-boards', quantity: '1', customServiceType: '', address: '' },
    ]);
  };

  const removeServiceRow = (index) => {
    if (services.length > 1) {
      setServices(services.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = async () => {
    if (!formData.businessName.trim() || !formData.ownerName.trim() || !formData.contactNumber.trim()) {
      Alert.alert('Validation', 'Business Name, Owner Name, and Contact Number are required.');
      return;
    }

    const validServices = services.filter(
      (s) => s.serviceType && parseInt(s.quantity, 10) > 0 && s.address.trim()
    );

    if (validServices.length === 0) {
      Alert.alert('Validation', 'Please enter at least one service with quantity and location address.');
      return;
    }

    const totalQuantity = validServices.reduce(
      (sum, s) => sum + (parseInt(s.quantity, 10) || 1),
      0
    );

    const payload = {
      businessName: formData.businessName.trim(),
      ownerName: formData.ownerName.trim(),
      description: formData.description.trim(),
      contactNumber: formData.contactNumber.trim(),
      startDate: formData.startDate,
      endDate: formData.endDate || undefined,
      clientId: formData.clientId || undefined,
      totalQuantity,
      services: validServices.map((s) => ({
        serviceType: s.serviceType,
        quantity: parseInt(s.quantity, 10) || 1,
        customServiceType: s.serviceType === 'other' ? s.customServiceType.trim() : undefined,
        location: {
          type: 'manual',
          address: s.address.trim(),
        },
      })),
    };

    try {
      setLoading(true);
      const res = await API.post('/services', payload);
      if (res.data?.success) {
        Alert.alert('Success', 'Campaign service created successfully!');
        if (onSuccess) onSuccess(res.data.service);
        if (onServiceAdded) onServiceAdded(res.data.service);
      } else {
        Alert.alert('Error', res.data?.message || 'Could not create service');
      }
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>➕ Create New BTL Campaign</Text>

      {businessClients.length > 0 && (
        <View style={{ marginBottom: 12 }}>
          <Text style={styles.label}>Quick Select Existing Client:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {businessClients.map((c) => {
              const selected = formData.clientId === c._id;
              return (
                <TouchableOpacity
                  key={c._id}
                  style={[styles.clientChip, selected && styles.clientChipActive]}
                  onPress={() => selectExistingClient(c)}
                >
                  <Text style={[styles.clientChipText, selected && { color: COLORS.white }]}>
                    🏢 {c.businessName}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.label}>Business / Brand Name *</Text>
        <TextInput
          style={styles.input}
          value={formData.businessName}
          onChangeText={(v) => setFormData({ ...formData, businessName: v })}
          placeholder="Enter client business name"
        />

        <Text style={styles.label}>Owner / Contact Person Name *</Text>
        <TextInput
          style={styles.input}
          value={formData.ownerName}
          onChangeText={(v) => setFormData({ ...formData, ownerName: v })}
          placeholder="Enter owner name"
        />

        <Text style={styles.label}>Contact Mobile Number *</Text>
        <TextInput
          style={styles.input}
          value={formData.contactNumber}
          onChangeText={(v) => setFormData({ ...formData, contactNumber: v })}
          keyboardType="phone-pad"
          placeholder="10-digit mobile number"
        />

        <View style={styles.dateRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Start Date (YYYY-MM-DD) *</Text>
            <TextInput
              style={styles.input}
              value={formData.startDate}
              onChangeText={(v) => setFormData({ ...formData, startDate: v })}
              placeholder="2026-10-24"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>End Date (YYYY-MM-DD) *</Text>
            <TextInput
              style={styles.input}
              value={formData.endDate}
              onChangeText={(v) => setFormData({ ...formData, endDate: v })}
              placeholder="2026-10-31"
            />
          </View>
        </View>

        <Text style={styles.label}>Campaign Notes / Description</Text>
        <TextInput
          style={styles.input}
          value={formData.description}
          onChangeText={(v) => setFormData({ ...formData, description: v })}
          placeholder="Optional instructions"
        />
      </View>

      <View style={styles.servicesHeader}>
        <Text style={styles.subHeading}>🛠️ Service Items ({services.length})</Text>
        <TouchableOpacity style={styles.addRowBtn} onPress={addServiceRow}>
          <Text style={styles.addRowBtnText}>+ Add Another Location/Service</Text>
        </TouchableOpacity>
      </View>

      {services.map((item, idx) => (
        <View key={idx} style={styles.serviceCard}>
          <View style={styles.serviceTopRow}>
            <Text style={styles.serviceItemTitle}>Service Item #{idx + 1}</Text>
            {services.length > 1 && (
              <TouchableOpacity onPress={() => removeServiceRow(idx)}>
                <Text style={styles.removeBtn}>✕ Remove</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.label}>Select Service Type *</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
            {SERVICE_TYPES.map((t) => {
              const active = item.serviceType === t;
              return (
                <TouchableOpacity
                  key={t}
                  style={[styles.typeChip, active && styles.typeChipActive]}
                  onPress={() => updateServiceRow(idx, 'serviceType', t)}
                >
                  <Text style={[styles.typeChipText, active && { color: COLORS.white }]}>
                    {formatServiceType(t)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {item.serviceType === 'other' && (
            <>
              <Text style={styles.label}>Custom Service Name *</Text>
              <TextInput
                style={styles.input}
                value={item.customServiceType}
                onChangeText={(v) => updateServiceRow(idx, 'customServiceType', v)}
                placeholder="Specify service type"
              />
            </>
          )}

          <View style={styles.dateRow}>
            <View style={{ width: 90 }}>
              <Text style={styles.label}>Quantity *</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={String(item.quantity)}
                onChangeText={(v) => updateServiceRow(idx, 'quantity', v)}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Location Address *</Text>
              <TextInput
                style={styles.input}
                value={item.address}
                onChangeText={(v) => updateServiceRow(idx, 'address', v)}
                placeholder="Area / Street / City"
              />
            </View>
          </View>
        </View>
      ))}

      <TouchableOpacity
        style={styles.submitBtn}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={COLORS.primaryDark} />
        ) : (
          <Text style={styles.submitBtnText}>🚀 Create Campaign Order</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 28,
  },
  heading: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.primary,
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  clientChip: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    marginRight: 8,
  },
  clientChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  clientChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 14,
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
  dateRow: {
    flexDirection: 'row',
    gap: 10,
  },
  servicesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  subHeading: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.primary,
  },
  addRowBtn: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  addRowBtnText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  serviceCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.secondary,
    marginBottom: 12,
  },
  serviceTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  serviceItemTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.primary,
  },
  removeBtn: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  typeChip: {
    backgroundColor: COLORS.lightGrey,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  typeChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  typeChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },
  submitBtn: {
    backgroundColor: COLORS.secondary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  submitBtnText: {
    color: COLORS.primaryDark,
    fontSize: 15,
    fontWeight: '800',
  },
});
