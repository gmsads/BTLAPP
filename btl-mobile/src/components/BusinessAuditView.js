// src/components/BusinessAuditView.js
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ScrollView } from 'react-native';
import { COLORS, expandServicesList, formatServiceType } from '../utils/theme';
import { exportServiceReportPDF, exportServiceReportPPT } from '../utils/reportExporter';

export default function BusinessAuditView({ businessName, services, onBack }) {
  const flattened = expandServicesList(services).sort(
    (a, b) => new Date(a.startDate) - new Date(b.startDate)
  );

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            style={[styles.pdfAllBtn, { backgroundColor: '#f59e0b' }]}
            onPress={() => exportServiceReportPPT(flattened, `${businessName}_Audit`)}
          >
            <Text style={styles.pdfAllText}>📊 All PPT</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.pdfAllBtn}
            onPress={() => exportServiceReportPDF(flattened, `${businessName}_Audit`)}
          >
            <Text style={styles.pdfAllText}>📄 All PDF</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.heading}>📁 Business Audit: {businessName}</Text>
      <Text style={styles.subHeading}>
        Showing {flattened.length} campaign item(s) in chronological order
      </Text>

      {flattened.map((item, idx) => {
        const imgs = Array.isArray(item.images) ? item.images : [];
        return (
          <View key={item._rowId || item._id || idx} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.campaignIndex}>Campaign #{idx + 1}</Text>
                <Text style={styles.serviceTitle}>
                  {formatServiceType(item.serviceType, item.customServiceType)} (Qty: {item.quantity})
                </Text>
                <Text style={styles.metaText}>
                  📅 {item.startDate ? new Date(item.startDate).toLocaleDateString() : '-'} →{' '}
                  {item.endDate || item.deliveryDate
                    ? new Date(item.endDate || item.deliveryDate).toLocaleDateString()
                    : '-'}
                </Text>
                <Text style={styles.metaText}>
                  📍{' '}
                  {typeof item.location === 'string'
                    ? item.location
                    : item.location?.address || 'No location'}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity
                  style={styles.singlePdfBtn}
                  onPress={() => exportServiceReportPPT([item], `${businessName}_${item.serviceType}`)}
                >
                  <Text style={styles.singlePdfText}>📊 PPT</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.singlePdfBtn}
                  onPress={() => exportServiceReportPDF([item], `${businessName}_${item.serviceType}`)}
                >
                  <Text style={styles.singlePdfText}>📄 PDF</Text>
                </TouchableOpacity>
              </View>
            </View>

            <Text style={styles.photoCount}>📸 Proof Photos ({imgs.length})</Text>
            {imgs.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {imgs.map((img, iIdx) => {
                  const fallbackItemLoc =
                    typeof item.location === 'string'
                      ? item.location
                      : item.location?.address || '';
                  const imgAddr =
                    (typeof img === 'object' &&
                      (img.locationAddress ||
                        img.simpleAddress ||
                        img.location?.address ||
                        img.location?.locationName)) ||
                    fallbackItemLoc;
                  return (
                    <View
                      key={img._id || iIdx}
                      style={{ width: 120, marginRight: 10 }}
                    >
                      <View style={{ position: 'relative' }}>
                        <Image
                          source={{ uri: typeof img === 'string' ? img : img.url }}
                          style={styles.thumb}
                        />
                        {!!imgAddr && (
                          <View
                            style={{
                              position: 'absolute',
                              bottom: 0,
                              left: 0,
                              right: 0,
                              backgroundColor: 'rgba(0,0,0,0.72)',
                              borderLeftWidth: 2,
                              borderLeftColor: '#f2c43b',
                              paddingHorizontal: 4,
                              paddingVertical: 2,
                              borderBottomLeftRadius: 8,
                              borderBottomRightRadius: 8,
                            }}
                          >
                            <Text
                              style={{ color: '#fff', fontSize: 8, fontWeight: '600' }}
                              numberOfLines={2}
                            >
                              📍 {imgAddr}
                            </Text>
                          </View>
                        )}
                      </View>
                      {!!imgAddr && (
                        <Text
                          style={{
                            fontSize: 9,
                            color: COLORS.primary,
                            fontWeight: '600',
                            marginTop: 3,
                          }}
                          numberOfLines={2}
                        >
                          📍 {imgAddr}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            ) : (
              <Text style={styles.noPhotos}>No photos uploaded yet</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 24,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  backBtn: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  backBtnText: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 13,
  },
  pdfAllBtn: {
    backgroundColor: COLORS.success,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  pdfAllText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 12,
  },
  heading: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.primary,
  },
  subHeading: {
    fontSize: 12,
    color: COLORS.textLight,
    marginBottom: 14,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  campaignIndex: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textLight,
    textTransform: 'uppercase',
  },
  serviceTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.primary,
    marginVertical: 2,
  },
  metaText: {
    fontSize: 12,
    color: COLORS.text,
    marginTop: 2,
  },
  singlePdfBtn: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  singlePdfBtnText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  singlePdfText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  photoCount: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  thumb: {
    width: 120,
    height: 95,
    borderRadius: 8,
    backgroundColor: '#e2e8f0',
  },
  noPhotos: {
    fontSize: 12,
    color: COLORS.textLight,
    fontStyle: 'italic',
  },
});
