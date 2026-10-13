const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const LocationLog = require('../models/LocationLog');

const router = express.Router();

// General Auth Middleware
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Location auth error:', error.message);
    res.status(401).json({ success: false, message: 'Authentication failed' });
  }
};

// Admin or Owner Middleware
const managerAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }

    if (user.role !== 'admin' && user.role !== 'owner') {
      return res.status(403).json({ success: false, message: 'Access denied: Manager rights required' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Manager auth error:', error.message);
    res.status(401).json({ success: false, message: 'Authentication failed' });
  }
};

// In-memory cache for reverse geocoding to prevent Nominatim rate-limits
const geocodeCache = new Map();

async function getExactAddress(lat, lng) {
  const roundedKey = `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`;
  if (geocodeCache.has(roundedKey)) {
    return geocodeCache.get(roundedKey);
  }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'BTLManager/1.0 (LiveLocationTracker)'
      }
    });

    if (!response.ok) {
      throw new Error(`Nominatim responded with status ${response.status}`);
    }

    const data = await response.json();
    const addr = data.address || {};

    const road = addr.road || addr.pedestrian || addr.street || '';
    const suburb = addr.suburb || addr.neighbourhood || addr.subdistrict || '';
    const city = addr.city || addr.town || addr.village || addr.county || '';
    const state = addr.state || '';
    const postcode = addr.postcode || '';
    const country = addr.country || '';

    // Build specific exact address
    const parts = [road, suburb, city, state, postcode].filter(Boolean);
    const locationName = data.display_name || (parts.length > 0 ? parts.join(', ') : `Lat: ${Number(lat).toFixed(5)}, Lng: ${Number(lng).toFixed(5)}`);

    const result = {
      locationName,
      addressDetails: {
        road,
        suburb,
        city,
        state,
        postcode,
        country
      }
    };

    if (geocodeCache.size > 500) {
      const firstKey = geocodeCache.keys().next().value;
      geocodeCache.delete(firstKey);
    }
    geocodeCache.set(roundedKey, result);

    return result;
  } catch (error) {
    console.error('Reverse geocode error in locations route:', error.message);
    return {
      locationName: `Lat: ${Number(lat).toFixed(5)}, Lng: ${Number(lng).toFixed(5)}`,
      addressDetails: {}
    };
  }
}

// 1. Worker periodic 30-min update or initial ping
router.post('/track', auth, async (req, res) => {
  try {
    const { lat, lng, accuracy, source } = req.body;

    if (lat === undefined || lng === undefined || isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({
        success: false,
        message: 'Valid latitude and longitude are required'
      });
    }

    const numLat = parseFloat(lat);
    const numLng = parseFloat(lng);

    // Resolve exact location name
    const geo = await getExactAddress(numLat, numLng);

    // Save snapshot log
    const log = new LocationLog({
      user: req.user._id,
      coordinates: {
        lat: numLat,
        lng: numLng
      },
      accuracy: accuracy || null,
      locationName: geo.locationName,
      addressDetails: geo.addressDetails,
      source: source || 'auto_30min',
      recordedAt: new Date()
    });
    await log.save();

    // Update user's lastKnownLocation and mark permission granted
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      {
        locationPermissionGranted: true,
        lastKnownLocation: {
          coordinates: {
            lat: numLat,
            lng: numLng
          },
          accuracy: accuracy || null,
          locationName: geo.locationName,
          addressDetails: geo.addressDetails,
          updatedAt: new Date()
        }
      },
      { new: true }
    ).select('-password');

    res.json({
      success: true,
      message: 'Location tracked successfully',
      data: {
        locationName: geo.locationName,
        coordinates: { lat: numLat, lng: numLng },
        updatedAt: log.recordedAt
      }
    });
  } catch (error) {
    console.error('Error tracking location:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to track location'
    });
  }
});

// 2. Update user's permission state
router.post('/permission', auth, async (req, res) => {
  try {
    const { granted } = req.body;
    await User.findByIdAndUpdate(req.user._id, {
      locationPermissionGranted: Boolean(granted)
    });

    res.json({
      success: true,
      message: 'Location permission status updated'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 3. Get all live workers' locations (for Admin & Owner)
router.get('/live', managerAuth, async (req, res) => {
  try {
    const Service = require('../models/Service');
    const Worker = require('../models/Worker');

    // Fetch users who are field workers / executives (role 'user' or any non-client)
    const users = await User.find({
      role: { $in: ['user', 'admin', 'owner'] } // can see all active personnel
    }).select('username contactNumber email role lastKnownLocation locationPermissionGranted updatedAt createdAt');

    // Fetch active services to identify what vehicle/van/auto each worker is running
    const activeServices = await Service.find({
      status: { $in: ['pending', 'active'] }
    }).select('businessName serviceType services assignedTo primaryLocation startDate deliveryDate');

    // Fetch worker profiles for vehicle numbers
    const workerProfiles = await Worker.find().select('workerName contactNumber serviceType vehicleDetails');

    const now = Date.now();
    const ACTIVE_THRESHOLD_MS = 40 * 60 * 1000; // 40 minutes (30m interval + 10m buffer)

    const workers = users.map(user => {
      const lastLoc = user.lastKnownLocation;
      const hasLocation = lastLoc && lastLoc.coordinates && lastLoc.coordinates.lat !== undefined && lastLoc.coordinates.lng !== undefined;
      
      let isOnline = false;
      let minutesAgo = null;

      if (hasLocation && lastLoc.updatedAt) {
        const diffMs = now - new Date(lastLoc.updatedAt).getTime();
        minutesAgo = Math.max(0, Math.round(diffMs / (60 * 1000)));
        isOnline = diffMs <= ACTIVE_THRESHOLD_MS;
      }

      // Check what vans, autos, or services this worker is running
      const assigned = [];
      activeServices.forEach(srv => {
        if (srv.assignedTo && srv.assignedTo.toString() === user._id.toString()) {
          assigned.push({
            businessName: srv.businessName,
            serviceType: srv.serviceType,
            location: srv.primaryLocation?.address || ''
          });
        }
        if (srv.services && Array.isArray(srv.services)) {
          srv.services.forEach(item => {
            if (item.assignedTo && item.assignedTo.toString() === user._id.toString()) {
              assigned.push({
                businessName: srv.businessName,
                serviceType: item.serviceType || srv.serviceType,
                location: item.location?.address || srv.primaryLocation?.address || ''
              });
            }
          });
        }
      });

      const workerProfile = workerProfiles.find(w => w.contactNumber === user.contactNumber);
      const vehicleDetails = workerProfile ? workerProfile.vehicleDetails : null;
      const vehicleType = assigned[0]?.serviceType || workerProfile?.serviceType || null;

      return {
        _id: user._id,
        username: user.username,
        contactNumber: user.contactNumber,
        email: user.email,
        role: user.role,
        locationPermissionGranted: Boolean(user.locationPermissionGranted),
        hasLocation: Boolean(hasLocation),
        coordinates: hasLocation ? lastLoc.coordinates : null,
        accuracy: hasLocation ? lastLoc.accuracy : null,
        locationName: hasLocation ? (lastLoc.locationName || 'Unknown address') : 'Location not yet recorded',
        addressDetails: hasLocation ? lastLoc.addressDetails : null,
        lastUpdated: hasLocation ? lastLoc.updatedAt : null,
        isOnline,
        minutesAgo,
        runningServices: assigned,
        vehicleDetails,
        vehicleType
      };
    });

    res.json({
      success: true,
      count: workers.length,
      workers
    });
  } catch (error) {
    console.error('Error fetching live locations:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch live locations'
    });
  }
});

// 4. Get 30-minute interval location history for a specific worker
router.get('/history/:userId', managerAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { date } = req.query; // optional YYYY-MM-DD

    let startOfDay, endOfDay;
    if (date) {
      startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
    } else {
      // Default to today
      startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);
    }

    const logs = await LocationLog.find({
      user: userId,
      recordedAt: { $gte: startOfDay, $lte: endOfDay }
    }).sort({ recordedAt: 1 });

    const worker = await User.findById(userId).select('username contactNumber');

    res.json({
      success: true,
      worker,
      date: startOfDay.toISOString().split('T')[0],
      count: logs.length,
      logs
    });
  } catch (error) {
    console.error('Error fetching location history:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch location history'
    });
  }
});

module.exports = router;
