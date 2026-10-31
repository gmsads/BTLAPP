const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const LocationLog = require('../models/LocationLog');

const router = express.Router();

const locAuthCache = new Map();
const LOC_AUTH_TTL_MS = 15000;

async function getCachedAuthUser(userId) {
  const key = String(userId);
  const cached = locAuthCache.get(key);
  if (cached && Date.now() - cached.ts < LOC_AUTH_TTL_MS) {
    return cached.user;
  }
  const user = await User.findById(userId).select('-password');
  if (user) {
    if (locAuthCache.size > 500) locAuthCache.clear();
    locAuthCache.set(key, { user, ts: Date.now() });
  }
  return user;
}

// General Auth Middleware
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await getCachedAuthUser(decoded.userId);
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
    const user = await getCachedAuthUser(decoded.userId);
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'BTLManager/1.0 (LiveLocationTracker)'
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

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

    // Always update user's lastKnownLocation and mark permission granted for real-time tracking
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

    // Only save a new waypoint in LocationLog every 30 minutes
    const THIRTY_MINUTES_MS = 30 * 60 * 1000;
    const lastLog = await LocationLog.findOne({ user: req.user._id }).sort({ recordedAt: -1 });
    const shouldRecordWaypoint = !lastLog || (Date.now() - new Date(lastLog.recordedAt).getTime()) >= THIRTY_MINUTES_MS;

    let savedTime = new Date();
    if (shouldRecordWaypoint) {
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
        recordedAt: savedTime
      });
      await log.save();
    } else if (lastLog) {
      savedTime = lastLog.recordedAt;
    }

    res.json({
      success: true,
      message: 'Location tracked successfully',
      data: {
        locationName: geo.locationName,
        coordinates: { lat: numLat, lng: numLng },
        updatedAt: savedTime
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

    const now = Date.now();
    const ONE_HOUR_MS = 60 * 60 * 1000; // 1 hour threshold

    const [users, activeServices, workerProfiles, recentLogs] = await Promise.all([
      User.find({
        role: { $in: ['user', 'admin', 'owner'] }
      }).select('username contactNumber email role lastKnownLocation locationPermissionGranted updatedAt createdAt').lean(),
      Service.find({
        status: { $in: ['pending', 'active'] }
      }).select('businessName serviceType services assignedTo primaryLocation startDate deliveryDate').lean(),
      Worker.find().select('workerName contactNumber serviceType vehicleDetails').lean(),
      LocationLog.find({
        recordedAt: { $gte: new Date(now - 2 * ONE_HOUR_MS) }
      }).select('user coordinates recordedAt').sort({ recordedAt: -1 }).lean()
    ]);

    const workers = users.map(user => {
      const lastLoc = user.lastKnownLocation;
      const hasLocation = lastLoc && lastLoc.coordinates && lastLoc.coordinates.lat !== undefined && lastLoc.coordinates.lng !== undefined;
      
      let isOnline = false;
      let isLive = false;
      let isMoving = false;
      let minutesAgo = null;

      if (hasLocation && lastLoc.updatedAt) {
        const diffMs = now - new Date(lastLoc.updatedAt).getTime();
        minutesAgo = Math.max(0, Math.round(diffMs / (60 * 1000)));

        // If not updated within 1 hr (60 minutes), it has not moved > 1 hr -> Show last location, NOT live
        if (diffMs <= ONE_HOUR_MS) {
          // Check if vehicle has actually moved or has been stationary in same spot
          const userLogs = recentLogs.filter(l => l.user.toString() === user._id.toString());
          if (userLogs.length >= 2) {
            const newest = userLogs[0].coordinates;
            const oldestInWindow = userLogs[userLogs.length - 1].coordinates;
            
            // Haversine distance
            const R = 6371000;
            const dLat = (oldestInWindow.lat - newest.lat) * Math.PI / 180;
            const dLon = (oldestInWindow.lng - newest.lng) * Math.PI / 180;
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                      Math.cos(newest.lat * Math.PI / 180) * Math.cos(oldestInWindow.lat * Math.PI / 180) *
                      Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const dist = R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
            const timeDiffMin = Math.round((new Date(userLogs[0].recordedAt).getTime() - new Date(userLogs[userLogs.length - 1].recordedAt).getTime()) / (60 * 1000));

            // If at the exact same spot (< 50 meters) for 60+ minutes, not moved > 1 hr
            if (timeDiffMin >= 60 && dist < 50) {
              isMoving = false;
              isLive = false;
            } else {
              isMoving = true;
              isLive = true;
            }
          } else {
            // Reported recently within the last hour
            isMoving = true;
            isLive = true;
          }
        } else {
          // diffMs > 1 hour -> Not moved in more than 1 hr, show last location, NOT live
          isMoving = false;
          isLive = false;
        }

        isOnline = isLive;
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
        isLive,
        isMoving,
        status: isLive ? 'live' : 'last_location',
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

    const allLogs = await LocationLog.find({
      user: userId,
      recordedAt: { $gte: startOfDay, $lte: endOfDay }
    }).sort({ recordedAt: 1 });

    // Filter waypoints so they only show at 30-minute intervals (not every minute)
    const THIRTY_MINUTES_MS = 30 * 60 * 1000;
    const logs = [];

    if (allLogs.length > 0) {
      // 1. Always include the very first point of the day (Start Point)
      logs.push(allLogs[0]);
      let lastIncludedTime = new Date(allLogs[0].recordedAt).getTime();

      // 2. Include intermediate points spaced by at least 30 minutes
      for (let i = 1; i < allLogs.length; i++) {
        const itemTime = new Date(allLogs[i].recordedAt).getTime();
        if (itemTime - lastIncludedTime >= THIRTY_MINUTES_MS) {
          logs.push(allLogs[i]);
          lastIncludedTime = itemTime;
        }
      }

      // 3. If the latest available log is at least 15 minutes past the last included point,
      // and not already in logs, include it as the latest / live position
      const latestLog = allLogs[allLogs.length - 1];
      const latestTime = new Date(latestLog.recordedAt).getTime();
      const lastInArray = logs[logs.length - 1];
      const lastInArrayTime = new Date(lastInArray.recordedAt).getTime();

      if (latestLog._id.toString() !== lastInArray._id.toString() && (latestTime - lastInArrayTime) >= 15 * 60 * 1000) {
        logs.push(latestLog);
      }
    }

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
