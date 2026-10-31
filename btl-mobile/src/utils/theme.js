// src/utils/theme.js

export const COLORS = {
  primary: '#0151ba',
  primaryLight: '#2670e8',
  primaryDark: '#003a8c',
  secondary: '#f2c43b',
  secondaryLight: '#fde68a',
  secondaryDark: '#d97706',
  background: '#f8fafc',
  white: '#ffffff',
  lightGrey: '#f1f5f9',
  border: '#e2e8f0',
  text: '#1e293b',
  textLight: '#64748b',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#0151ba',
};

export const SHADOWS = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  button: {
    shadowColor: '#0151ba',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
};

export const SERVICE_TYPES = [
  'mobile-vans',
  'look-walkers',
  'try-cycle',
  'auto-booming',
  'auto-stickers',
  'auto-tops',
  'rounds',
  'digital-wall-poster',
  'pole-boards',
  'no-parking-boards',
  'other',
];

export const SERVICE_EMOJIS = {
  'mobile-vans': '🚐',
  'look-walkers': '🚶',
  'try-cycle': '🚲',
  'auto-booming': '🛺',
  'auto-stickers': '🏷️',
  'auto-tops': '🎪',
  'rounds': '🔄',
  'digital-wall-poster': '🖥️',
  'pole-boards': '💈',
  'no-parking-boards': '🚫',
  other: '📍',
};

export const formatServiceType = (serviceType, customServiceType) => {
  if (serviceType === 'other' && customServiceType) {
    return customServiceType;
  }
  if (!serviceType) return 'Service';
  return serviceType
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
};

export const getCampaignTotalDays = (startDate, endDate) => {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  const diffTime = Math.abs(end - start);
  const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return days <= 0 ? 1 : days;
};

export const getCampaignDayNumber = (date, startDate) => {
  if (!date || !startDate) return 1;
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const current = new Date(date);
  current.setHours(0, 0, 0, 0);
  const diffTime = current - start;
  return Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
};

export const getCompletedDays = (service) => {
  const startDate = service?.startDate;
  const endDate = service?.endDate || service?.deliveryDate;
  if (!startDate || !endDate) return 0;

  const totalDays = getCampaignTotalDays(startDate, endDate);
  if (totalDays <= 0) return 0;

  const isVehicleService = service.serviceType === 'mobile-vans';
  const readingsDays = new Set();

  if (service.meterReadings && Array.isArray(service.meterReadings)) {
    service.meterReadings.forEach((reading) => {
      const hasImg =
        (reading.image && reading.image.url) ||
        (reading.startImage && reading.startImage.url) ||
        (reading.endImage && reading.endImage.url) ||
        reading.startReading !== undefined;
      if (hasImg) {
        const day = reading.dayNumber || getCampaignDayNumber(reading.date, startDate);
        if (day >= 1 && day <= totalDays) {
          readingsDays.add(day);
        }
      }
    });
  }

  const imagesDays = new Set();
  if (service.images && Array.isArray(service.images)) {
    service.images.forEach((img) => {
      const day = getCampaignDayNumber(
        img.takenAt || img.uploadedAt || img.createdAt,
        startDate
      );
      if (day >= 1 && day <= totalDays) {
        imagesDays.add(day);
      }
    });
  }

  let completedCount = 0;
  for (let d = 1; d <= totalDays; d++) {
    if (isVehicleService && readingsDays.size > 0) {
      if (readingsDays.has(d) && imagesDays.has(d)) {
        completedCount++;
      }
    } else if (imagesDays.has(d)) {
      completedCount++;
    }
  }
  return completedCount;
};

export const getServiceProgress = (service) => {
  const hasCampaign = service?.startDate && (service?.endDate || service?.deliveryDate);
  const imageCount = Array.isArray(service?.images) ? service.images.length : 0;

  if (hasCampaign) {
    const totalDays = getCampaignTotalDays(
      service.startDate,
      service.endDate || service.deliveryDate
    );
    const completedDays = getCompletedDays(service);
    return {
      current: completedDays,
      total: totalDays,
      imageCount,
      progress: totalDays > 0 ? Math.min((completedDays / totalDays) * 100, 100) : 0,
      isComplete: totalDays > 0 && completedDays >= totalDays,
      text: `Day ${completedDays}/${totalDays}`,
      isCampaign: true,
    };
  }

  const quantity = service?.quantity || 0;
  return {
    current: imageCount,
    total: quantity,
    imageCount,
    progress: quantity > 0 ? Math.min((imageCount / quantity) * 100, 100) : 0,
    isComplete: quantity > 0 ? imageCount >= quantity : imageCount > 0,
    text: `${imageCount}/${quantity} images`,
    isCampaign: false,
  };
};

export const getServiceStatus = (service) => {
  const progress = getServiceProgress(service);
  if (progress.isComplete) return 'completed';
  return service?.status || service?.itemStatus || 'pending';
};

// Expand multi-service orders into individual work items (matching web frontend logic)
export const expandServicesList = (rawServices, filterWorkerId = null) => {
  if (!rawServices || !Array.isArray(rawServices)) return [];
  const expanded = [];

  rawServices.forEach((service) => {
    if (service.services && Array.isArray(service.services) && service.services.length > 0) {
      service.services.forEach((serviceItem, index) => {
        const itemLocAddress = (
          typeof serviceItem.location === 'string'
            ? serviceItem.location
            : serviceItem.location?.address || ''
        )
          .trim()
          .toLowerCase();

        const parentMatchedImages = (service.images || []).filter((img) => {
          if (!img) return false;
          if (img.itemId && serviceItem._id && img.itemId.toString() === serviceItem._id.toString()) {
            return true;
          }
          if (
            img.serviceIndex !== undefined &&
            img.serviceIndex !== null &&
            Number(img.serviceIndex) === index
          ) {
            return true;
          }
          if (img.itemId && serviceItem._id && img.itemId.toString() !== serviceItem._id.toString()) {
            return false;
          }
          if (
            img.serviceIndex !== undefined &&
            img.serviceIndex !== null &&
            Number(img.serviceIndex) !== index
          ) {
            return false;
          }
          const imgLocAddress = (
            img.locationAddress ||
            img.simpleAddress ||
            (typeof img.location === 'string' ? img.location : img.location?.address) ||
            ''
          )
            .trim()
            .toLowerCase();
          if (
            itemLocAddress &&
            imgLocAddress &&
            (imgLocAddress.includes(itemLocAddress) || itemLocAddress.includes(imgLocAddress))
          ) {
            if (
              img.serviceType &&
              serviceItem.serviceType &&
              img.serviceType !== serviceItem.serviceType
            ) {
              return false;
            }
            return true;
          }
          return false;
        });

        const enrichedSubImages = (serviceItem.images || [])
          .filter(Boolean)
          .map((subImg) => {
            const match = (service.images || []).find(
              (p) =>
                (p.public_id && subImg.public_id && p.public_id === subImg.public_id) ||
                (p.url && subImg.url && p.url === subImg.url)
            );
            return match ? { ...subImg, ...match } : subImg;
          });

        const itemImages = [...parentMatchedImages, ...enrichedSubImages].filter(
          (img, idx, arr) =>
            arr.findIndex(
              (t) =>
                (t.public_id && t.public_id === img.public_id) ||
                (t.url && t.url === img.url) ||
                ((t._id || t.id) &&
                  (img._id || img.id) &&
                  (t._id || t.id).toString() === (img._id || img.id).toString())
            ) === idx
        );

        const finalImages =
          service.services.length === 1
            ? itemImages.length > 0
              ? itemImages
              : service.images || []
            : itemImages;

        const itemAssignedTo =
          serviceItem.assignedTo ||
          (service.assignedTo && !service.services.some((s) => s.assignedTo)
            ? service.assignedTo
            : null);

        if (filterWorkerId) {
          const assignedId = (itemAssignedTo?._id || itemAssignedTo)?.toString();
          if (assignedId !== filterWorkerId.toString()) return;
        }

        expanded.push({
          ...service,
          _originalId: service._id,
          _id: serviceItem._id || `${service._id}-${index}`,
          _rowId: `${service._id}-${serviceItem._id || index}`,
          serviceType: serviceItem.serviceType,
          customServiceType: serviceItem.customServiceType,
          quantity: serviceItem.quantity || 1,
          location: serviceItem.location || service.primaryLocation || service.location,
          notes: serviceItem.notes || '',
          status: serviceItem.status || service.status || 'pending',
          assignedTo: itemAssignedTo,
          images: finalImages,
          meterReadings: service.meterReadings || [],
          isMultiService: true,
          serviceIndex: index,
          totalServices: service.services.length,
          serviceName: `${service.businessName} - ${formatServiceType(
            serviceItem.serviceType,
            serviceItem.customServiceType
          )}`,
        });
      });
    } else {
      if (filterWorkerId) {
        const assignedId = (service.assignedTo?._id || service.assignedTo)?.toString();
        if (assignedId !== filterWorkerId.toString()) return;
      }
      expanded.push({
        ...service,
        _originalId: service._id,
        _id: service._id,
        _rowId: service._id,
        isMultiService: false,
        serviceIndex: 0,
        totalServices: 1,
        quantity: service.quantity || 1,
        location: service.location || service.primaryLocation,
        images: service.images || [],
        meterReadings: service.meterReadings || [],
        serviceName: `${service.businessName} - ${formatServiceType(
          service.serviceType,
          service.customServiceType
        )}`,
        status: service.status || 'pending',
      });
    }
  });

  return expanded;
};
