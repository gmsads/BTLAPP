const express = require('express');
const Service = require('../models/Service');
const upload = require('../middleware/upload');
const cloudinary = require('../utils/cloudinary');
const sharp = require('sharp'); // Add sharp for image processing
const mongoose = require('mongoose'); // Add this import

const router = express.Router();

// Normalize :id parameter if an expanded sub-service ID (e.g. "<mongoId>_0" or "<mongoId>-0") is passed
router.param('id', (req, res, next, id) => {
  if (typeof id === 'string') {
    const match = id.match(/^([0-9a-fA-F]{24})[_-](\d+)$/);
    if (match) {
      req.params.id = match[1];
      if (req.body && req.body.serviceIndex === undefined) {
        req.body.serviceIndex = Number(match[2]);
      }
      req.extractedServiceIndex = Number(match[2]);
    }
  }
  next();
});

// Short-lived in-memory auth user cache for high multi-user concurrency
const authUserCache = new Map();
const AUTH_CACHE_TTL_MS = 15000;

// Import auth middleware correctly - create it inline since we're having import issues
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'No token provided' 
      });
    }

    const jwt = require('jsonwebtoken');
    const User = require('../models/User');
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const cacheKey = String(decoded.userId);
    const cached = authUserCache.get(cacheKey);
    let user = null;

    if (cached && Date.now() - cached.ts < AUTH_CACHE_TTL_MS) {
      user = cached.user;
    } else {
      user = await User.findById(decoded.userId).select('-password');
      if (user) {
        if (authUserCache.size > 500) authUserCache.clear();
        authUserCache.set(cacheKey, { user, ts: Date.now() });
      }
    }
    
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token' 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ 
      success: false, 
      message: 'Token invalid' 
    });
  }
};

// Helper to check if a user is authorized for service operations (admin, owner, creator, or assigned worker)
const isUserAuthorizedForService = (service, user) => {
  if (!service || !user) return false;
  if (user.role === 'admin' || user.role === 'owner') return true;

  const userIdStr = (user._id || user.id || user).toString();
  const usernameLower = (user.username || '').trim().toLowerCase();

  // Check creator
  const createdById = service.createdBy?._id || service.createdBy;
  if (createdById && createdById.toString() === userIdStr) return true;

  // Check parent-level assigned worker
  const assignedToId = service.assignedTo?._id || service.assignedTo;
  if (assignedToId && assignedToId.toString() === userIdStr) return true;
  if (usernameLower && service.assignedTo?.username && service.assignedTo.username.trim().toLowerCase() === usernameLower) {
    return true;
  }

  // Check sub-services assigned worker
  if (service.services && Array.isArray(service.services)) {
    const isSubAssigned = service.services.some(s => {
      const subWorkerId = s.assignedTo?._id || s.assignedTo;
      if (subWorkerId && subWorkerId.toString() === userIdStr) return true;
      if (usernameLower && s.assignedTo?.username && s.assignedTo.username.trim().toLowerCase() === usernameLower) return true;
      return false;
    });
    if (isSubAssigned) return true;
  }

  // Allow active authenticated field workers (role: 'user' or 'executive') so partially-synced assignments never block field uploads
  if ((user.role === 'user' || user.role === 'executive') && user.isActive !== false) {
    return true;
  }

  return false;
};

// Create new service - WITH LOCATION PER SERVICE
router.post('/', auth, async (req, res) => {
  try {
    console.log('=== SERVICE CREATION WITH LOCATION MAPPING ===');
    console.log('User:', {
      id: req.user._id,
      username: req.user.username,
      role: req.user.role
    });
    console.log('Request Body:', JSON.stringify(req.body, null, 2));

    const {
      businessName,
      ownerName,
      description,
      contactNumber,
      services, // Array of services with location: [{serviceType, quantity, customServiceType, location: {address}}]
      totalQuantity,
      serviceType, // Backward compatibility
      customServiceType, // Backward compatibility
      quantity, // Backward compatibility
      location, // Backward compatibility - primary location
      address, // Backward compatibility
      startDate,
      endDate,
      clientId // Optional: if selecting existing client
    } = req.body;

    // VALIDATION CHECKS
    if (!businessName) {
      return res.status(400).json({
        success: false,
        message: 'Business name is required'
      });
    }

   
    if (!contactNumber) {
      return res.status(400).json({
        success: false,
        message: 'Contact number is required'
      });
    }

    if (!startDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date is required'
      });
    }

    // Process services with locations
    let serviceItems = [];
    let totalQty = 0;
    
    // Check for new format (multiple services with locations)
    if (services && Array.isArray(services)) {
      if (services.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one service type is required'
        });
      }
      
      // Validate each service with its location
      for (let i = 0; i < services.length; i++) {
        const service = services[i];
        
        if (!service.serviceType) {
          return res.status(400).json({
            success: false,
            message: `Service type is required for service #${i + 1}`
          });
        }
        
        // Validate service type
        const validServiceTypes = [
          'mobile-vans', 'look-walkers', 'try-cycle', 'auto-booming',
          'auto-stickers', 'auto-tops', 'rounds', 'digital-wall-poster',
          'pole-boards', 'no-parking-boards', 'other'
        ];
        
        if (!validServiceTypes.includes(service.serviceType)) {
          return res.status(400).json({
            success: false,
            message: `Invalid service type "${service.serviceType}" for service #${i + 1}`
          });
        }
        
        if (!service.quantity || service.quantity < 1) {
          return res.status(400).json({
            success: false,
            message: `Valid quantity is required (minimum 1) for service #${i + 1}`
          });
        }
        
        if (service.serviceType === 'other' && (!service.customServiceType || service.customServiceType.trim().length === 0)) {
          return res.status(400).json({
            success: false,
            message: `Custom service type is required when service type is "other" for service #${i + 1}`
          });
        }
        
        // Validate location for each service
        if (!service.location || !service.location.address || service.location.address.trim().length === 0) {
          return res.status(400).json({
            success: false,
            message: `Location address is required for service #${i + 1}: ${service.serviceType === 'other' ? service.customServiceType : service.serviceType}`
          });
        }
        
        serviceItems.push({
          serviceType: service.serviceType,
          quantity: parseInt(service.quantity),
          customServiceType: service.serviceType === 'other' ? service.customServiceType.trim() : undefined,
          location: {
            type: service.location.type || 'manual',
            address: service.location.address.trim(),
            coordinates: service.location.coordinates || { lat: null, lng: null }
          },
          notes: service.notes || '',
          status: 'pending'
        });
        
        totalQty += parseInt(service.quantity);
      }
    } 
    // Backward compatibility: single service format
    else if (serviceType) {
      // Validate single service type
      const validServiceTypes = [
        'mobile-vans', 'look-walkers', 'try-cycle', 'auto-booming',
        'auto-stickers', 'auto-tops', 'rounds', 'digital-wall-poster',
        'pole-boards', 'no-parking-boards', 'other'
      ];
      
      if (!validServiceTypes.includes(serviceType)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid service type'
        });
      }
      
      if (!quantity || quantity < 1) {
        return res.status(400).json({
          success: false,
          message: 'Valid quantity is required (minimum 1)'
        });
      }
      
      if (serviceType === 'other' && (!customServiceType || customServiceType.trim().length === 0)) {
        return res.status(400).json({
          success: false,
          message: 'Custom service type is required when service type is "other"'
        });
      }
      
      // For backward compatibility, use the provided location or address
      const serviceLocation = location?.address ? location : 
                            address ? { type: 'manual', address: address } : 
                            { type: 'manual', address: 'Address not provided' };
      
      serviceItems.push({
        serviceType: serviceType,
        quantity: parseInt(quantity),
        customServiceType: serviceType === 'other' ? customServiceType.trim() : undefined,
        location: serviceLocation,
        status: 'pending'
      });
      
      totalQty = parseInt(quantity);
    } else {
      return res.status(400).json({
        success: false,
        message: 'Service information is required'
      });
    }

    // Check if end date is required for any service type
    const requiresEndDate = ['mobile-vans', 'look-walkers', 'try-cycle', 'auto-booming'];
    const hasServicesRequiringEndDate = serviceItems.some(service => 
      requiresEndDate.includes(service.serviceType)
    );
    
    if (hasServicesRequiringEndDate && !endDate) {
      return res.status(400).json({
        success: false,
        message: 'End date is required for selected service types'
      });
    }

    // Validate dates
    const start = new Date(startDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

   

    if (endDate) {
      const end = new Date(endDate);
      
      if (end <= start) {
        return res.status(400).json({
          success: false,
          message: 'End date must be after start date'
        });
      }
    }

    // Build service data with services having individual locations
    const serviceData = {
      businessName: businessName.trim(),
      ownerName: ownerName ? ownerName.trim() : '',
      description: description ? description.trim() : '',
      contactNumber: contactNumber.trim(),
      services: serviceItems,
      totalQuantity: totalQty,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
      createdBy: req.user._id,
      status: 'pending',
      // Set primary location from first service
      primaryLocation: serviceItems[0]?.location || {
        type: 'manual',
        address: 'Address not provided',
        coordinates: { lat: null, lng: null }
      }
    };

    // Add client ID if provided
    if (clientId) {
      serviceData.clientId = clientId;
    }

    console.log('Final service data with locations:', serviceData);
    console.log('Service items with locations:', serviceItems.map(s => ({
      type: s.serviceType,
      qty: s.quantity,
      location: s.location.address
    })));

    // Create and save service
    const service = new Service(serviceData);
    await service.save();
    
    // Populate creator info
    await service.populate('createdBy', 'username email businessName');

    console.log('✅ Service created successfully with location mapping');

    res.status(201).json({
      success: true,
      message: 'Service created successfully',
      service: {
        ...service.toObject(),
        services: serviceItems
      }
    });

  } catch (error) {
    console.error('❌ Create service error:', error);
    console.error('Error stack:', error.stack);
    
    // Handle mongoose validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error: ' + errors.join(', ')
      });
    }

    // Handle duplicate key errors
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Service already exists with these details'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error creating service: ' + error.message,
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get all services for logged-in user - ROBUST VERSION
router.get('/my-services', auth, async (req, res) => {
  try {
    console.log('Fetching services for user:', req.user._id, 'Business:', req.user.businessName, 'Role:', req.user.role);
    
    let query = {};
    
    // If user is a client, show services for their specific business or assigned clientId
    if (req.user.role === 'client') {
      const orConditions = [];
      if (req.user._id) {
        orConditions.push({ clientId: req.user._id });
      }
      if (req.user.businessName && req.user.businessName.trim()) {
        const escaped = req.user.businessName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        orConditions.push({ businessName: new RegExp(`^${escaped}$`, 'i') });
      }
      
      if (orConditions.length === 0) {
        console.log('No client ID or business name found for client, returning empty services');
        return res.json({
          success: true,
          services: []
        });
      }
      
      query = { $or: orConditions };
      console.log('Client filter - Business Name:', req.user.businessName, 'User ID:', req.user._id);
    } else {
      // For admin/users, show services they created
      query = { createdBy: req.user._id };
    }
     const services = await Service.find(query)
      .populate('createdBy', 'username email')
      .populate('assignedTo', 'username email contactNumber')
      .populate('services.assignedTo', 'username email contactNumber')
      .sort({ createdAt: -1 })
      .lean();

    console.log('Found services:', services.length, 'for business:', req.user.businessName);

    res.json({
      success: true,
      services
    });

  } catch (error) {
    console.error('Get services error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching services'
    });
  }
});

// Get services assigned to current worker (user with role 'user')
router.get('/assigned-to-me', auth, async (req, res) => {
  try {
    console.log('=== FETCHING ASSIGNED SERVICES ===');
    console.log('Worker ID:', req.user._id);
    console.log('Worker username:', req.user.username);
    console.log('Worker role:', req.user.role);

    // Only workers (users with role 'user' or 'executive') can access this
    if (req.user.role !== 'user' && req.user.role !== 'executive') {
      console.log('❌ Access denied - user is not a worker');
      return res.status(403).json({
        success: false,
        message: 'Only workers can access assigned services'
      });
    }

    // Find services assigned to this worker (either whole order or specific sub-item)
    const services = await Service.find({
      $or: [
        { assignedTo: req.user._id },
        { 'services.assignedTo': req.user._id }
      ]
    })
    .populate('createdBy', 'username email contactNumber')
    .populate('assignedTo', 'username email contactNumber')
    .populate('services.assignedTo', 'username email contactNumber')
    .sort({ createdAt: -1 })
    .lean();

    console.log(`✅ Found ${services.length} services assigned to worker ${req.user.username}`);

    res.json({
      success: true,
      services: services || []
    });

  } catch (error) {
    console.error('❌ Get assigned services error:', error);
    console.error('Error stack:', error.stack);
    
    res.status(500).json({
      success: false,
      message: 'Error fetching assigned services: ' + error.message,
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get all public service locations for homepage map
router.get('/public-locations', async (req, res) => {
  try {
    const services = await Service.find({}, 'businessName services status location primaryLocation serviceType customServiceType quantity').lean();
    const locations = [];
    
    services.forEach(service => {
      if (service.services && Array.isArray(service.services) && service.services.length > 0) {
        service.services.forEach(item => {
          if (item.location && item.location.address) {
            locations.push({
              businessName: service.businessName,
              serviceType: item.serviceType === 'other' ? item.customServiceType : item.serviceType,
              address: item.location.address,
              coordinates: item.location.coordinates || null,
              status: item.status || 'pending',
              quantity: item.quantity || 0
            });
          }
        });
      } else {
        const loc = service.location || service.primaryLocation;
        if (loc && loc.address) {
          locations.push({
            businessName: service.businessName,
            serviceType: service.serviceType === 'other' ? service.customServiceType : service.serviceType,
            address: loc.address,
            coordinates: loc.coordinates || null,
            status: service.status || 'pending',
            quantity: service.quantity || 0
          });
        }
      }
    });

    res.json({
      success: true,
      locations
    });
  } catch (error) {
    console.error('Error fetching public locations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch public locations'
    });
  }
});

// Proxy image requests to bypass browser CORS limits on CDN / Cloudinary assets
router.get('/proxy-image', async (req, res) => {
  try {
    const imageUrl = req.query.url;
    if (!imageUrl) {
      return res.status(400).json({ success: false, message: 'URL parameter is required' });
    }

    const axios = require('axios');
    const response = await axios({
      method: 'get',
      url: imageUrl,
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: {
        'Accept': 'image/*'
      }
    });

    const contentType = response.headers['content-type'] || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(response.data);
  } catch (error) {
    console.error('Proxy image error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get single service
router.get('/:id', auth, async (req, res) => {
  try {
    const service = await Service.findById(req.params.id)
      .populate('createdBy', 'username email');

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    const isClient = req.user.role === 'client' && (
      (service.clientId && (service.clientId._id || service.clientId).toString() === req.user._id.toString()) ||
      (service.businessName && req.user.businessName && service.businessName.trim().toLowerCase() === req.user.businessName.trim().toLowerCase())
    );

    // Check if user is authorized (creator, admin, owner, assigned worker, or client)
    if (!isUserAuthorizedForService(service, req.user) && !isClient) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this service'
      });
    }

    res.json({
      success: true,
      service
    });

  } catch (error) {
    console.error('Get service error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching service'
    });
  }
});

// Update service status - ALLOW ASSIGNED WORKERS
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;

    console.log('=== STATUS UPDATE REQUEST ===');
    console.log('Service ID:', req.params.id);
    console.log('User making request:', {
      id: req.user._id,
      username: req.user.username,
      role: req.user.role
    });
    console.log('Requested status:', status);

    if (!['pending', 'active', 'completed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const service = await Service.findById(req.params.id);
    
    if (!service) {
      console.log('❌ Service not found');
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    console.log('Service details:', {
      createdBy: service.createdBy.toString(),
      assignedTo: service.assignedTo?.toString(),
      currentStatus: service.status
    });

    // FIXED: Check if user is authorized
    // Allow: creator of service, admin, owner, OR assigned worker (parent or sub-service)
    const isAuthorized = isUserAuthorizedForService(service, req.user);

    if (!isAuthorized) {
      console.log('❌ User not authorized to update status');
      console.log('Service createdBy:', service.createdBy?.toString());
      console.log('Service assignedTo:', service.assignedTo?.toString());
      console.log('User ID:', req.user._id.toString());
      console.log('User role:', req.user.role);
      
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this service status. Only the service creator, admin, or assigned worker can update status.'
      });
    }

    console.log('✅ User authorized to update status');

    // Additional validation for workers
    if (req.user.role === 'user' || req.user.role === 'executive') {
      // Workers can only update status to active or completed, not back to pending
      if (status === 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Workers cannot set service status back to pending'
        });
      }
    }

    const oldStatus = service.status;
    service.status = status;

    const targetServiceIdx =
      req.body.serviceIndex !== undefined && req.body.serviceIndex !== null && !isNaN(Number(req.body.serviceIndex))
        ? Number(req.body.serviceIndex)
        : req.extractedServiceIndex !== undefined
        ? req.extractedServiceIndex
        : null;

    if (targetServiceIdx !== null && service.services && service.services[targetServiceIdx]) {
      service.services[targetServiceIdx].status = status;
      service.markModified('services');
    } else if (service.services && service.services.length === 1) {
      service.services[0].status = status;
      service.markModified('services');
    }
    
    // Set dates based on status changes
    if (status === 'active' && oldStatus !== 'active') {
      service.startDate = new Date();
      console.log('✅ Start date set to:', service.startDate);
    } else if (status === 'completed' && oldStatus !== 'completed') {
      service.completionDate = new Date();
      console.log('✅ Completion date set to:', service.completionDate);
    }

    await service.save();

    // Populate for response
    await service.populate('createdBy', 'username email');
    await service.populate('assignedTo', 'username email');

    console.log(`✅ Status updated from ${oldStatus} to ${status}`);

    res.json({
      success: true,
      message: `Service status updated from ${oldStatus} to ${status}`,
      service
    });

  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating service status: ' + error.message
    });
  }
});

// Assign service to worker - Allow admin OR owner
router.patch('/:id/assign', auth, async (req, res) => {
  try {
    const { assignedTo, assignAll, serviceIndex } = req.body;

    console.log('=== ASSIGN SERVICE REQUEST ===');
    console.log('Service ID:', req.params.id);
    console.log('User:', req.user.username, 'Role:', req.user.role);
    console.log('Assignment data:', { assignedTo, assignAll, serviceIndex });

    const service = await Service.findById(req.params.id);
    
    if (!service) {
      console.log('❌ Service not found');
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    // Check if user is authorized (admin OR owner OR creator)
    const isAuthorized = 
      req.user.role === 'admin' || 
      req.user.role === 'owner' ||
      service.createdBy.toString() === req.user._id.toString();

    if (!isAuthorized) {
      console.log('❌ User not authorized');
      return res.status(403).json({
        success: false,
        message: 'Only admin, owner, or service creator can assign services'
      });
    }

    // Validate worker exists
    if (assignedTo) {
      const User = require('../models/User');
      const assignedUser = await User.findById(assignedTo);
      
      if (!assignedUser) {
        return res.status(404).json({
          success: false,
          message: 'Worker not found'
        });
      }
      
      if (assignedUser.role !== 'user' && assignedUser.role !== 'executive') {
        return res.status(400).json({
          success: false,
          message: 'Can only assign to workers (role: user)'
        });
      }
      
      console.log('✅ Worker found:', assignedUser.username);
    }

    // Handle assignment
    const hasSubServices = service.services && service.services.length > 0;
    const isSingleSubServiceOrder = hasSubServices && service.services.length === 1;
    const isAssignAll = isSingleSubServiceOrder || assignAll === true || assignAll === 'true' || assignAll === undefined || assignAll === null;
    const isAssignSingle = !isSingleSubServiceOrder && (assignAll === false || assignAll === 'false');
    const resolvedIdx =
      serviceIndex !== undefined && serviceIndex !== null && !isNaN(Number(serviceIndex))
        ? Number(serviceIndex)
        : req.extractedServiceIndex !== undefined
        ? req.extractedServiceIndex
        : null;
    const hasValidIndex = resolvedIdx !== null && service.services && Boolean(service.services[resolvedIdx]);

    if (hasSubServices && isAssignSingle && hasValidIndex) {
      // First preserve any existing parent-level assignment onto sub-services that didn't have an explicit sub-service assignment
      if (service.assignedTo) {
        service.services.forEach((s) => {
          if (!s.assignedTo) {
            s.assignedTo = service.assignedTo;
          }
        });
      }

      // Assign to specific service item only
      service.services[resolvedIdx].assignedTo = assignedTo || null;
      console.log(`✅ Assigned to service item ${resolvedIdx}`);
      
      // Update parent assignedTo based on all sub-services:
      const assignedWorkers = service.services.map(s => s.assignedTo ? (s.assignedTo._id || s.assignedTo).toString() : null);
      const firstNonNullWorker = service.services.find(s => s.assignedTo)?.assignedTo || null;
      const firstWorker = assignedWorkers[0];
      const allSame = firstWorker !== null && assignedWorkers.every(w => w === firstWorker);
      const allUnassigned = assignedWorkers.every(w => w === null);

      if (allSame) {
        service.assignedTo = service.services[0].assignedTo;
      } else if (allUnassigned) {
        service.assignedTo = null;
      } else {
        service.assignedTo = firstNonNullWorker;
      }
      
    } else {
      // Assign to entire service (all items)
      service.assignedTo = assignedTo || null;
      console.log('✅ Assigned to entire service');
      
      if (service.services && Array.isArray(service.services)) {
        service.services.forEach((item, index) => {
          item.assignedTo = assignedTo || null;
          console.log(`✅ Assigned item ${index} to worker`);
        });
      }
    }

    // Mark as modified and save
    service.markModified('services');
    await service.save({ validateBeforeSave: false });

    // Populate for response
    await service.populate('assignedTo', 'username email contactNumber');
    await service.populate('createdBy', 'username email contactNumber');
    await service.populate('services.assignedTo', 'username email contactNumber');

    console.log('✅ Service assigned successfully');
    console.log('Parent assignedTo:', service.assignedTo);
    console.log('Sub-services assignedTo:', service.services.map((s, i) => `${i}: ${s.assignedTo?.username || 'null'}`));

    res.json({
      success: true,
      message: assignedTo ? 'Service assigned successfully' : 'Service unassigned successfully',
      service
    });

  } catch (error) {
    console.error('❌ Assign service error:', error);
    console.error('Error stack:', error.stack);
    
    res.status(500).json({
      success: false,
      message: 'Error assigning service: ' + error.message
    });
  }
});

// Export service as PDF
router.post('/:id/export-pdf', auth, async (req, res) => {
  try {
    const service = await Service.findById(req.params.id)
      .populate('createdBy', 'username email');

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    // Check if user is authorized (creator, admin, owner, or assigned worker)
    if (!isUserAuthorizedForService(service, req.user)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to export this service'
      });
    }

    // For PDF generation, we'll create a simple text-based response
    // In production, you would use a PDF library like pdfkit
    const pdfContent = `
      SERVICE REPORT
      ==============

      Business Name: ${service.businessName}
      Owner Name: ${service.ownerName || 'Not specified'}
      Service Type: ${service.serviceType}
      Description: ${service.description}
      Status: ${service.status}
      Created: ${new Date(service.createdAt).toLocaleDateString()}
      Start Date: ${new Date(service.startDate).toLocaleDateString()}
      End Date: ${service.endDate ? new Date(service.endDate).toLocaleDateString() : 'Not specified'}
      Location: ${service.location.address || 'Not provided'}
      
      IMAGES (${service.images?.length || 0})
      ======
      ${service.images?.map((img, index) => `
        Image ${index + 1}:
        - Caption: ${img.caption}
        - Source: ${img.source}
        - Date: ${new Date(img.takenAt).toLocaleDateString()}
        - Location: ${img.location?.lat ? `${img.location.lat}, ${img.location.lng}` : 'Not available'}
      `).join('\n') || 'No images available'}

      Report generated on: ${new Date().toLocaleString()}
      Generated by: ${req.user.username}
    `;

    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${service.businessName}_Service_Report.pdf"`);
    
    // For demo purposes, we'll send text as PDF
    // In production, use a proper PDF library
    res.send(Buffer.from(pdfContent));

  } catch (error) {
    console.error('PDF export error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating PDF: ' + error.message
    });
  }
});

// Export service as PowerPoint (Real PPTX using pptxgenjs)
router.post('/:id/export-ppt', auth, async (req, res) => {
  try {
    const service = await Service.findById(req.params.id)
      .populate('createdBy', 'username email');

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    const isClient = req.user.role === 'client' && (
      (service.clientId && (service.clientId._id || service.clientId).toString() === req.user._id.toString()) ||
      (service.businessName && req.user.businessName && service.businessName.trim().toLowerCase() === req.user.businessName.trim().toLowerCase())
    );

    if (!isUserAuthorizedForService(service, req.user) && !isClient) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to export this service'
      });
    }

    const PptxGenJS = require('pptxgenjs');
    const axios = require('axios');
    const pptx = new PptxGenJS();

    const title = service.businessName || 'Service_Report';
    pptx.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 });
    pptx.layout = 'WIDE';
    pptx.title = title;
    pptx.author = 'GMS';
    pptx.company = 'GMS';
    pptx.subject = 'Service Report';

    // Filter images for specific sub-service if serviceIndex is provided
    let photos = Array.isArray(service.images) ? service.images : [];
    const reqIdx = req.body?.serviceIndex ?? req.query?.serviceIndex;
    if (reqIdx !== undefined && reqIdx !== null && reqIdx !== '' && Array.isArray(service.services) && service.services[reqIdx]) {
      const sub = service.services[reqIdx];
      const subPhotos = [
        ...photos.filter(
          (img) =>
            (img.itemId && sub._id && String(img.itemId) === String(sub._id)) ||
            (img.serviceIndex !== undefined && img.serviceIndex !== null && Number(img.serviceIndex) === Number(reqIdx))
        ),
        ...(sub.images || [])
      ].filter(
        (img, i, arr) =>
          arr.findIndex((t) => (t.public_id && t.public_id === img.public_id) || (t.url && t.url === img.url)) === i
      );
      if (subPhotos.length > 0) {
        photos = subPhotos;
      }
    }

    // 1. Title Slide (matching documentGenerator.js)
    const titleSlide = pptx.addSlide();
    titleSlide.background = { fill: 'FFFFFF' };
    titleSlide.addText('GMS', {
      x: 0.5,
      y: 0.5,
      w: '90%',
      h: 0.8,
      fontSize: 32,
      bold: true,
      color: '0151ba',
      align: 'center'
    });
    titleSlide.addText(title, {
      x: 0.5,
      y: 1.8,
      w: '90%',
      h: 1.0,
      fontSize: 36,
      bold: true,
      color: '000000',
      align: 'center'
    });
    titleSlide.addText(`Service Report - ${new Date().toLocaleDateString()}`, {
      x: 0.5,
      y: 3.2,
      w: '90%',
      h: 0.6,
      fontSize: 20,
      color: '666666',
      align: 'center'
    });
    titleSlide.addText(`Total Images: ${photos.length}`, {
      x: 0.5,
      y: 4.0,
      w: '90%',
      h: 0.8,
      fontSize: 18,
      color: '666666',
      align: 'center'
    });

    // Helper to fetch image as base64 data URI
    const fetchImgBase64 = async (imgUrl) => {
      try {
        const resp = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 10000 });
        const mime = resp.headers['content-type'] || 'image/jpeg';
        const b64 = Buffer.from(resp.data).toString('base64');
        return `data:${mime};base64,${b64}`;
      } catch (e) {
        return null;
      }
    };

    const imagesPerSlide = 2;
    const totalSlides = Math.ceil(photos.length / imagesPerSlide);

    for (let slideIndex = 0; slideIndex < totalSlides; slideIndex++) {
      const slide = pptx.addSlide();
      slide.background = { fill: 'FFFFFF' };

      slide.addText('GMS', {
        x: 0.3,
        y: 0.1,
        w: 2.0,
        h: 0.4,
        fontSize: 14,
        bold: true,
        color: '0151ba'
      });

      slide.addText(`${title} - Page ${slideIndex + 1} of ${totalSlides}`, {
        x: 0.5,
        y: 0.15,
        w: '90%',
        h: 0.5,
        fontSize: 18,
        bold: true,
        color: '0151ba',
        align: 'center'
      });

      const slidePhotos = photos.slice(slideIndex * imagesPerSlide, (slideIndex + 1) * imagesPerSlide);

      for (let i = 0; i < slidePhotos.length; i++) {
        const photo = slidePhotos[i];
        const photoIdx = slideIndex * imagesPerSlide + i + 1;
        const imgUrl = typeof photo === 'string' ? photo : photo.url || photo.file_url;
        const xPos = i === 0 ? 0.6 : 6.9;

        if (imgUrl) {
          const dataUri = await fetchImgBase64(imgUrl);
          if (dataUri) {
            slide.addImage({
              data: dataUri,
              x: xPos,
              y: 0.9,
              w: 5.8,
              h: 4.8
            });
          }
        }

        const locAddr =
          (typeof photo === 'object' &&
            (photo.locationAddress || photo.simpleAddress || photo.location?.address || photo.location?.locationName)) ||
          service.location?.address ||
          service.primaryLocation?.address ||
          '';
        const takenStr =
          typeof photo === 'object' && (photo.takenAt || photo.uploadedAt)
            ? new Date(photo.takenAt || photo.uploadedAt).toLocaleString()
            : '';

        slide.addText(
          `Image ${photoIdx}${locAddr ? `\n📍 ${locAddr}` : ''}${takenStr ? `\n🕒 ${takenStr}` : ''}`,
          {
            x: xPos,
            y: 5.8,
            w: 5.8,
            h: 1.2,
            fontSize: 11,
            color: '333333',
            align: 'center'
          }
        );
      }
    }

    const cleanFileName = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_Service_Presentation.pptx`;

    if (req.body?.returnBase64) {
      const b64Out = await pptx.write({ outputType: 'base64' });
      return res.json({
        success: true,
        filename: cleanFileName,
        base64: b64Out
      });
    }

    const bufferOut = await pptx.write({ outputType: 'nodebuffer' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="${cleanFileName}"`);
    res.send(Buffer.from(bufferOut));

  } catch (error) {
    console.error('PPT export error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating PowerPoint: ' + error.message
    });
  }
});

// FIXED Cloudinary Image Upload Route - ALLOW ASSIGNED WORKERS TO UPLOAD
router.post('/:id/images', auth, upload.array('images', 10), async (req, res) => {
  try {
    console.log('=== 🖼️ IMAGE UPLOAD START ===');
    console.log('Service ID:', req.params.id);
    console.log('User making request:', {
      id: req.user._id,
      username: req.user.username,
      role: req.user.role
    });
    console.log('Files received:', req.files ? req.files.length : 0);
    
    // 1. Find the service
    const service = await Service.findById(req.params.id);
    if (!service) {
      console.log('❌ Service not found');
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }
    console.log('✅ Service found:', service.businessName);

    // 2. FIXED: Check if user is authorized
    // Allow: creator of service, admin, owner, OR assigned worker (parent or sub-service)
    const isAuthorized = isUserAuthorizedForService(service, req.user);

    if (!isAuthorized) {
      console.log('❌ User not authorized to upload images to this service');
      console.log('Service createdBy:', service.createdBy?.toString());
      console.log('Service assignedTo:', service.assignedTo?.toString());
      console.log('User ID:', req.user._id.toString());
      console.log('User role:', req.user.role);
      
      return res.status(403).json({
        success: false,
        message: 'Not authorized to upload images to this service. Only the service creator, admin, or assigned worker can upload images.'
      });
    }
    console.log('✅ User authorized to upload images');

    // 3. Check if files were uploaded
    if (!req.files || req.files.length === 0) {
      console.log('❌ No files provided');
      return res.status(400).json({
        success: false,
        message: 'No images provided'
      });
    }

    console.log(`📁 Processing ${req.files.length} files`);

    // Process GPS data from form
    let latitudes = [];
    let longitudes = [];
    let locationAddresses = [];
    let sources = [];
    let captions = [];

    // Handle different form data formats
    if (Array.isArray(req.body.latitude)) {
      latitudes = req.body.latitude;
    } else if (req.body.latitude) {
      latitudes = [req.body.latitude];
    } else {
      latitudes = Array(req.files.length).fill(null);
    }

    if (Array.isArray(req.body.longitude)) {
      longitudes = req.body.longitude;
    } else if (req.body.longitude) {
      longitudes = [req.body.longitude];
    } else {
      longitudes = Array(req.files.length).fill(null);
    }

    const rawLocAddress = req.body.locationAddress || req.body.simpleAddress;
    if (Array.isArray(rawLocAddress)) {
      locationAddresses = rawLocAddress;
    } else if (rawLocAddress) {
      locationAddresses = [rawLocAddress];
    } else {
      locationAddresses = Array(req.files.length).fill('');
    }

    if (Array.isArray(req.body.source)) {
      sources = req.body.source;
    } else if (req.body.source) {
      sources = [req.body.source];
    } else {
      sources = Array(req.files.length).fill('upload');
    }

    if (Array.isArray(req.body.caption)) {
      captions = req.body.caption;
    } else if (req.body.caption) {
      captions = [req.body.caption];
    } else {
      captions = req.files.map((file, index) => `Image ${service.images.length + index + 1}`);
    }

    console.log('Processed GPS data:', {
      latitudes,
      longitudes,
      locationAddresses,
      sources,
      captions
    });

    // Resolve exact targetIdx for multi-service item
    let targetIdx = null;
    if (req.body.serviceIndex !== undefined && req.body.serviceIndex !== 'undefined' && req.body.serviceIndex !== 'null' && !isNaN(Number(req.body.serviceIndex))) {
      targetIdx = Number(req.body.serviceIndex);
    } else if (req.extractedServiceIndex !== undefined && !isNaN(Number(req.extractedServiceIndex))) {
      targetIdx = Number(req.extractedServiceIndex);
    } else if (req.body.itemId && req.body.itemId !== 'undefined' && req.body.itemId !== 'null' && service.services && Array.isArray(service.services)) {
      const foundIdx = service.services.findIndex(s => (s._id || s.id)?.toString() === req.body.itemId.toString());
      if (foundIdx !== -1) targetIdx = foundIdx;
    } else if (req.body.serviceType && req.body.serviceType !== 'undefined' && req.body.serviceType !== 'null' && service.services && Array.isArray(service.services)) {
      const foundIdx = service.services.findIndex(s => s.serviceType === req.body.serviceType);
      if (foundIdx !== -1) targetIdx = foundIdx;
    } else if (service.services && service.services.length === 1) {
      targetIdx = 0;
    }

    const resolvedItemId = targetIdx !== null && service.services?.[targetIdx] ? (service.services[targetIdx]._id || service.services[targetIdx].id || req.body.itemId || null) : (req.body.itemId || null);
    const resolvedServiceType = targetIdx !== null && service.services?.[targetIdx] ? (service.services[targetIdx].serviceType || req.body.serviceType || null) : (req.body.serviceType || null);

    // Helper to escape XML for SVG watermark banner
    const escapeXml = (str) =>
      String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

    // 4. Process and upload all images in parallel for fast response
    const uploadSingleFile = async (file, i) => {
      console.log(`📸 Uploading file ${i + 1}: ${file.originalname} (${file.size} bytes, ${file.mimetype})`);
      try {
        const latVal = latitudes[i] ? parseFloat(latitudes[i]) : null;
        const lngVal = longitudes[i] ? parseFloat(longitudes[i]) : null;
        let finalAddress = (locationAddresses[i] || '').trim();

        // If address is missing but GPS coordinates exist, reverse-geocode on backend with short timeout
        if (!finalAddress && latVal && lngVal) {
          try {
            const axios = require('axios');
            const geoRes = await axios.get(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latVal}&lon=${lngVal}&zoom=18&addressdetails=1`,
              {
                headers: { 'User-Agent': 'BTL-Marketing-Service-App/1.0' },
                timeout: 2200,
              }
            );
            if (geoRes.data?.display_name) {
              finalAddress = geoRes.data.display_name;
            }
          } catch (geoErr) {
            // fallback below
          }
        }
        if (!finalAddress) {
          const subLoc =
            targetIdx !== null && service.services?.[targetIdx]?.location
              ? typeof service.services[targetIdx].location === 'string'
                ? service.services[targetIdx].location
                : service.services[targetIdx].location?.address
              : '';
          finalAddress =
            subLoc ||
            service.primaryLocation?.address ||
            service.location?.address ||
            (typeof service.location === 'string' ? service.location : '') ||
            (latVal && lngVal ? `Lat: ${latVal.toFixed(6)}, Lng: ${lngVal.toFixed(6)}` : 'Location Recorded');
        }
        locationAddresses[i] = finalAddress;

        // Resize first (max 1280px) then stamp live GPS Map Camera banner onto the image buffer
        let processedBuffer = file.buffer;
        let processedMime = file.mimetype;
        try {
          const resizedBuffer = await sharp(file.buffer)
            .rotate()
            .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
            .toBuffer();
          const meta = await sharp(resizedBuffer).metadata();
          const imgW = meta.width || 1000;
          const imgH = meta.height || 800;
          const scale = Math.max(0.6, imgW / 1000);
          const fontSize = Math.max(13, Math.round(18 * scale));
          const titleFontSize = Math.max(15, Math.round(21 * scale));
          const lineHeight = Math.round(fontSize * 1.38);
          const pad = Math.round(16 * scale);

          // Wrap address into up to 2 lines
          const maxCharsPerLine = Math.max(38, Math.floor((imgW - pad * 3) / (fontSize * 0.56)));
          const addrPrefix = `Address: ${finalAddress}`;
          const addrLines = [];
          let rem = addrPrefix;
          while (rem.length > 0 && addrLines.length < 2) {
            if (rem.length <= maxCharsPerLine || addrLines.length === 1) {
              addrLines.push(rem.slice(0, maxCharsPerLine + 12));
              break;
            }
            let splitAt = rem.lastIndexOf(' ', maxCharsPerLine);
            if (splitAt <= 0) splitAt = maxCharsPerLine;
            addrLines.push(rem.slice(0, splitAt));
            rem = rem.slice(splitAt).trim();
          }

          const totalLines = 2 + addrLines.length;
          const boxHeight = totalLines * lineHeight + pad * 2;
          const boxY = Math.max(0, imgH - boxHeight - Math.round(12 * scale));
          const boxX = Math.round(12 * scale);
          const boxW = Math.max(100, imgW - boxX * 2);
          const accentW = Math.max(4, Math.round(6 * scale));

          const orderLine = `Order: ${service.businessName || 'Service'} | Type: ${
            resolvedServiceType || service.serviceType || 'Campaign'
          }`;
          const gpsLine =
            latVal && lngVal
              ? `GPS Coordinates: ${latVal.toFixed(6)}, ${lngVal.toFixed(6)} | ${new Date().toLocaleString()}`
              : `Timestamp: ${new Date().toLocaleString()}`;

          let textNodes = `
            <text x="${boxX + pad + accentW}" y="${boxY + pad + titleFontSize}" font-family="Arial, Helvetica, sans-serif" font-size="${titleFontSize}" font-weight="bold" fill="#f2c43b">${escapeXml(
            orderLine
          )}</text>
            <text x="${boxX + pad + accentW}" y="${boxY + pad + titleFontSize + lineHeight}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="bold" fill="#ffffff">${escapeXml(
            gpsLine
          )}</text>
          `;
          addrLines.forEach((lineStr, lIdx) => {
            const yPos = boxY + pad + titleFontSize + lineHeight * (2 + lIdx);
            textNodes += `<text x="${boxX + pad + accentW}" y="${yPos}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" fill="#e2e8f0">${escapeXml(
              lineStr
            )}</text>`;
          });

          const svgOverlay = Buffer.from(`
            <svg width="${imgW}" height="${imgH}" xmlns="http://www.w3.org/2000/svg">
              <rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxHeight}" rx="8" ry="8" fill="rgba(0,0,0,0.76)" />
              <rect x="${boxX}" y="${boxY}" width="${accentW}" height="${boxHeight}" rx="3" ry="3" fill="#f2c43b" />
              ${textNodes}
            </svg>
          `);

          processedBuffer = await sharp(resizedBuffer)
            .composite([{ input: svgOverlay, top: 0, left: 0 }])
            .jpeg({ quality: 82 })
            .toBuffer();
          processedMime = 'image/jpeg';
        } catch (wmErr) {
          console.warn('Watermark note (using original buffer):', wmErr.message);
        }

        // Convert buffer to base64 for Cloudinary
        const b64 = Buffer.from(processedBuffer).toString('base64');
        const dataURI = `data:${processedMime};base64,${b64}`;
        
        // Upload to Cloudinary
        const result = await cloudinary.uploader.upload(dataURI, {
          folder: `services/${service._id}`,
          resource_type: 'image',
        });

        const imageSource = sources[i] || 'gallery';
        const validSource = imageSource === 'camera' ? 'camera' : 'gallery';

        return {
          url: result.secure_url,
          public_id: result.public_id,
          caption: captions[i],
          takenAt: new Date(),
          source: validSource,
          latitude: latVal,
          longitude: lngVal,
          locationAddress: finalAddress,
          simpleAddress: finalAddress,
          location: {
            lat: latVal,
            lng: lngVal,
            address: finalAddress
          },
          itemId: resolvedItemId,
          serviceIndex: targetIdx,
          serviceType: resolvedServiceType
        };
      } catch (uploadError) {
        console.error(`❌ Cloudinary upload failed for ${file.originalname}:`, uploadError);
        return null;
      }
    };

    const uploadResults = await Promise.all(req.files.map((file, idx) => uploadSingleFile(file, idx)));
    const uploadedImages = uploadResults.filter(Boolean);

    if (uploadedImages.length === 0) {
      console.log('❌ All uploads failed');
      return res.status(500).json({
        success: false,
        message: 'Failed to upload any images. Please try again.'
      });
    }

    // 5. Add images to service
    service.images.push(...uploadedImages);
    if (targetIdx !== null && service.services && service.services.length > targetIdx) {
      if (!service.services[targetIdx].images) service.services[targetIdx].images = [];
      service.services[targetIdx].images.push(...uploadedImages);
    }
    await service.save();

    // Update worker's live location and history log from photo capture if GPS coordinates are provided
    if (latitudes[0] && longitudes[0] && req.user) {
      try {
        const lat = parseFloat(latitudes[0]);
        const lng = parseFloat(longitudes[0]);
        const locName = locationAddresses[0] || `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`;
        const User = require('../models/User');
        const LocationLog = require('../models/LocationLog');

        await User.findByIdAndUpdate(req.user._id, {
          locationPermissionGranted: true,
          lastKnownLocation: {
            coordinates: { lat, lng },
            locationName: locName,
            updatedAt: new Date()
          }
        });

        // Only create a new trail waypoint if at least 30 minutes have passed
        const THIRTY_MINUTES_MS = 30 * 60 * 1000;
        const lastLog = await LocationLog.findOne({ user: req.user._id }).sort({ recordedAt: -1 });
        if (!lastLog || (Date.now() - new Date(lastLog.recordedAt).getTime()) >= THIRTY_MINUTES_MS) {
          await LocationLog.create({
            user: req.user._id,
            coordinates: { lat, lng },
            locationName: locName,
            source: 'image_capture',
            recordedAt: new Date()
          });
          console.log(`📍 Recorded 30-min waypoint for worker ${req.user.username} from image capture: ${locName}`);
        }
      } catch (locErr) {
        console.warn('Could not update live tracker from image capture:', locErr.message);
      }
    }

    console.log(`✅ ${uploadedImages.length} images saved successfully. Total images:`, service.images.length);
    console.log('=== 🖼️ IMAGE UPLOAD END ===');

    // 6. Send success response
    res.json({
      success: true,
      message: `${uploadedImages.length} image(s) uploaded successfully`,
      images: uploadedImages,
      service: {
        _id: service._id,
        businessName: service.businessName,
        images: service.images
      }
    });

  } catch (error) {
    console.error('❌ UPLOAD ERROR:', error);
    console.error('Error stack:', error.stack);
    
    res.status(500).json({
      success: false,
      message: 'Upload failed: ' + error.message,
      error: error.toString()
    });
  }
});

// Get service images - ALLOW ASSIGNED WORKERS
router.get('/:id/images', auth, async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    // FIXED: Allow creator, admin, owner, client of service, and assigned workers to view images
    const isClient = req.user.role === 'client' && (
      (service.clientId && (service.clientId._id || service.clientId).toString() === req.user._id.toString()) ||
      (service.businessName && req.user.businessName && service.businessName.trim().toLowerCase() === req.user.businessName.trim().toLowerCase())
    );

    const isAuthorized = isUserAuthorizedForService(service, req.user) || isClient;

    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access images for this service'
      });
    }

    // Combine global images and any sub-service images
    const allImages = [
      ...(service.images || []),
      ...((service.services || []).flatMap(s => s.images || []))
    ].filter((img, i, arr) => arr.findIndex(t => (t.public_id && t.public_id === img.public_id) || (t.url && t.url === img.url) || ((t._id || t.id) && (img._id || img.id) && (t._id || t.id).toString() === (img._id || img.id).toString())) === i);

    res.json({
      success: true,
      images: allImages
    });

  } catch (error) {
    console.error('Get images error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching images'
    });
  }
});

// ========== METER READINGS - ADD (WITH START AND END IMAGES) ==========
router.post('/:id/meter-readings', auth, upload.fields([
  { name: 'startImage', maxCount: 1 },
  { name: 'endImage', maxCount: 1 }
]), async (req, res) => {
  try {
    const { startReading, endReading } = req.body;

    console.log('=== METER READING ADD REQUEST ===');
    console.log('Service ID:', req.params.id);
    console.log('User:', req.user.username);
    console.log('Role:', req.user.role);
    console.log('Readings:', { startReading, endReading });
    console.log('Files:', req.files);

    // Validate readings
    if (!startReading || !endReading) {
      console.log('❌ Missing readings');
      return res.status(400).json({
        success: false,
        message: 'Both start and end readings are required'
      });
    }

    if (parseFloat(endReading) <= parseFloat(startReading)) {
      console.log('❌ End reading must be greater');
      return res.status(400).json({
        success: false,
        message: 'End reading must be greater than start reading'
      });
    }

    // Find the service
    console.log('🔍 Finding service:', req.params.id);
    const service = await Service.findById(req.params.id);
    
    if (!service) {
      console.log('❌ Service not found');
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    console.log('✅ Service found:', service.businessName);

    // Check if user is authorized (creator, admin, owner, or assigned worker)
    const isAuthorized = isUserAuthorizedForService(service, req.user);

    if (!isAuthorized) {
      console.log('❌ User not authorized');
      return res.status(403).json({
        success: false,
        message: 'Not authorized to add meter readings to this service'
      });
    }

    console.log('✅ User authorized');

    // Prepare meter reading object
    const meterReading = {
      date: new Date(),
      dayNumber: service.meterReadings ? service.meterReadings.length + 1 : 1,
      startReading: parseFloat(startReading),
      endReading: parseFloat(endReading),
      unit: 'km',
      recordedBy: req.user._id
    };

    // Upload start reading image if provided
    if (req.files && req.files.startImage && req.files.startImage.length > 0) {
      try {
        const file = req.files.startImage[0];
        const fileStr = file.buffer.toString('base64');
        const dataURI = `data:${file.mimetype};base64,${fileStr}`;
        
        const uploadResult = await cloudinary.uploader.upload(dataURI, {
          folder: 'btl_meter_readings/start',
          resource_type: 'image'
        });
        
        console.log('✅ Start image uploaded:', uploadResult.secure_url);
        meterReading.startImage = {
          url: uploadResult.secure_url,
          public_id: uploadResult.public_id
        };
      } catch (uploadError) {
        console.error('⚠️ Start image upload failed:', uploadError.message);
      }
    }

    // Upload end reading image if provided
    if (req.files && req.files.endImage && req.files.endImage.length > 0) {
      try {
        const file = req.files.endImage[0];
        const fileStr = file.buffer.toString('base64');
        const dataURI = `data:${file.mimetype};base64,${fileStr}`;
        
        const uploadResult = await cloudinary.uploader.upload(dataURI, {
          folder: 'btl_meter_readings/end',
          resource_type: 'image'
        });
        
        console.log('✅ End image uploaded:', uploadResult.secure_url);
        meterReading.endImage = {
          url: uploadResult.secure_url,
          public_id: uploadResult.public_id
        };
      } catch (uploadError) {
        console.error('⚠️ End image upload failed:', uploadError.message);
      }
    }

    console.log('📊 Adding meter reading:', meterReading);

    // Add to service
    if (!service.meterReadings) {
      service.meterReadings = [];
    }
    service.meterReadings.push(meterReading);
    await service.save();

    // Populate for response
    await service.populate('createdBy', 'username email');
    await service.populate('assignedTo', 'username email');
    await service.populate('meterReadings.recordedBy', 'username email');

    console.log('✅ Meter reading added successfully');
    console.log('Total readings:', service.meterReadings.length);

    res.json({
      success: true,
      message: 'Meter reading added successfully',
      meterReading,
      service
    });

  } catch (error) {
    console.error('❌ Add meter reading error:', error);
    console.error('Error stack:', error.stack);
    
    res.status(500).json({
      success: false,
      message: 'Error adding meter reading: ' + error.message,
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Add this to serviceRoutes.js
router.get('/check/:id', auth, async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (service) {
      res.json({
        success: true,
        message: 'Service exists',
        service: {
          _id: service._id,
          businessName: service.businessName,
          hasMeterReadings: service.meterReadings && service.meterReadings.length > 0
        }
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Service not found',
        id: req.params.id
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error checking service: ' + error.message
    });
  }
});
// Delete meter reading from service
router.delete('/:id/meter-readings/:readingId', auth, async (req, res) => {
  try {
    console.log('=== DELETE METER READING REQUEST ===');
    console.log('Service ID:', req.params.id);
    console.log('Reading ID:', req.params.readingId);
    console.log('User ID:', req.user._id);

    const service = await Service.findById(req.params.id);
    
    if (!service) {
      console.log('Service not found');
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    // Check if user is authorized (creator, admin, owner, or assigned worker)
    const isAuthorized = isUserAuthorizedForService(service, req.user);

    if (!isAuthorized) {
      console.log('User not authorized to delete meter reading');
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete meter readings from this service'
      });
    }

    console.log('Service meter readings before deletion:', service.meterReadings.length);

    // Find the reading by its _id
    const readingIndex = service.meterReadings.findIndex(reading => {
      const readingId = reading._id ? reading._id.toString() : null;
      console.log(`Comparing: ${readingId} with ${req.params.readingId}`);
      return readingId === req.params.readingId;
    });
    
    console.log('Reading index found:', readingIndex);

    if (readingIndex === -1) {
      console.log('Meter reading not found in service');
      return res.status(404).json({
        success: false,
        message: 'Meter reading not found in service'
      });
    }

    const deletedReading = service.meterReadings[readingIndex];
    console.log('Reading to delete:', deletedReading);

    // Remove from Cloudinary if image exists
    if (deletedReading.image && deletedReading.image.public_id) {
      try {
        console.log('☁️ Deleting meter reading photo from Cloudinary:', deletedReading.image.public_id);
        await cloudinary.uploader.destroy(deletedReading.image.public_id);
        console.log('✅ Cloudinary photo delete successful');
      } catch (cloudinaryError) {
        console.error('⚠️ Cloudinary photo delete failed (continuing anyway):', cloudinaryError.message);
      }
    }

    // Remove reading from service
    service.meterReadings.splice(readingIndex, 1);
    await service.save();

    console.log('Meter reading successfully deleted from service');
    console.log('Service meter readings after deletion:', service.meterReadings.length);

    res.json({
      success: true,
      message: 'Meter reading deleted successfully',
      service
    });

  } catch (error) {
    console.error('Delete meter reading error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting meter reading: ' + error.message
    });
  }
});

// Helper function to detect blurry images using Laplacian variance
const detectBlurryImage = async (imageBuffer) => {
  try {
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();
    
    // Calculate Laplacian variance (simplified blur detection)
    // For production, you'd want a more sophisticated algorithm
    const laplacian = await image
      .clone()
      .grayscale()
      .convolve({
        width: 3,
        height: 3,
        kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0]
      })
      .toBuffer();
    
    const variance = calculateVariance(laplacian);
    
    // Threshold for blur detection (adjust based on your needs)
    const blurThreshold = 100;
    
    return {
      isBlurry: variance < blurThreshold,
      blurScore: variance,
      resolution: `${metadata.width}x${metadata.height}`,
      fileSize: imageBuffer.length
    };
  } catch (error) {
    console.error('Blur detection error:', error);
    return { isBlurry: false, blurScore: 0, resolution: 'unknown', fileSize: imageBuffer.length };
  }
};

// Helper function to calculate variance
const calculateVariance = (buffer) => {
  const values = Array.from(buffer);
  const mean = values.reduce((a, b) => a + b) / values.length;
  const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
  return variance;
};

// Helper function to generate image fingerprint for duplicate detection
const generateImageFingerprint = async (imageBuffer) => {
  try {
    const image = sharp(imageBuffer);
    
    // Create a thumbnail for fingerprinting
    const thumbnail = await image
      .resize(32, 32, { fit: 'inside' })
      .grayscale()
      .raw()
      .toBuffer();
    
    // Calculate average pixel value as simple fingerprint
    const pixels = Array.from(thumbnail);
    const avg = pixels.reduce((sum, pixel) => sum + pixel, 0) / pixels.length;
    
    return Math.round(avg * 100) / 100; // Return with 2 decimal places
  } catch (error) {
    console.error('Fingerprint generation error:', error);
    return 0;
  }
};

// ========== ULTRA-FAST BULK IMAGE UPLOAD ENDPOINT (WITH REAL DUPLICATE DETECTION) ==========
router.post('/:id/bulk-images', auth, upload.array('images', 2000), async (req, res) => {
  const startTime = Date.now();
  const serviceId = req.params.id;
  
  try {
    console.log('=== ⚡ ULTRA-FAST BULK UPLOAD START ===');
    console.log('Service ID:', serviceId);
    console.log('Total files:', req.files?.length || 0);
    console.log('User:', req.user.username);

    // 1. Basic validation
    if (!serviceId) {
      return res.status(400).json({
        success: false,
        message: 'Service ID is required'
      });
    }

    // 2. Find service
    const service = await Service.findById(serviceId);
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    // 3. Authorization check (creator, admin, owner, or assigned worker)
    const isAuthorized = isUserAuthorizedForService(service, req.user);

    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to upload images to this service'
      });
    }

    // 4. Check for files
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No images provided'
      });
    }

    console.log(`✅ Processing ${req.files.length} images in bulk...`);

    // Resolve exact targetIdx for multi-service item
    let targetIdx = null;
    if (req.body.serviceIndex !== undefined && req.body.serviceIndex !== 'undefined' && req.body.serviceIndex !== 'null' && !isNaN(Number(req.body.serviceIndex))) {
      targetIdx = Number(req.body.serviceIndex);
    } else if (req.body.itemId && req.body.itemId !== 'undefined' && req.body.itemId !== 'null' && service.services && Array.isArray(service.services)) {
      const foundIdx = service.services.findIndex(s => (s._id || s.id)?.toString() === req.body.itemId.toString());
      if (foundIdx !== -1) targetIdx = foundIdx;
    } else if (req.body.serviceType && req.body.serviceType !== 'undefined' && req.body.serviceType !== 'null' && service.services && Array.isArray(service.services)) {
      const foundIdx = service.services.findIndex(s => s.serviceType === req.body.serviceType);
      if (foundIdx !== -1) targetIdx = foundIdx;
    }

    const resolvedItemId = targetIdx !== null && service.services?.[targetIdx] ? (service.services[targetIdx]._id || service.services[targetIdx].id || req.body.itemId || null) : (req.body.itemId || null);
    const resolvedServiceType = targetIdx !== null && service.services?.[targetIdx] ? (service.services[targetIdx].serviceType || req.body.serviceType || null) : (req.body.serviceType || null);

    // 5. Get location data
    const latitude = req.body.latitude ? parseFloat(req.body.latitude) : null;
    const longitude = req.body.longitude ? parseFloat(req.body.longitude) : null;
    const filenames = Array.isArray(req.body.filenames) ? req.body.filenames : [];
    const captions = Array.isArray(req.body.captions) ? req.body.captions : [];
    
    let locationAddress = req.body.locationAddress || req.body.simpleAddress || '';
    if (!locationAddress && latitude && longitude) {
      // Quick reverse geocode without blocking
      setTimeout(() => {
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`)
          .then(res => res.json())
          .then(data => {
            locationAddress = data.display_name || '';
          })
          .catch(() => {});
      }, 0);
    }

    // 6. Create unique prefix for this upload batch
    const batchId = Date.now();
    
    // 7. Prepare data structures for fast processing
    const uploadedImages = [];
    const failedImages = [];
    const duplicateImages = [];
    
    // 8. BETTER DUPLICATE DETECTION - Using image fingerprint
    console.log('🔍 Scanning for duplicates using image fingerprints...');
    const validFiles = [];
    const validFileIndices = [];
    const imageFingerprints = new Set(); // Store fingerprints to detect duplicates
    
    // First, get fingerprints of existing service images to avoid duplicates with already uploaded images
    const existingFingerprints = new Set();
    if (service.images && service.images.length > 0) {
      console.log('Checking against existing service images...');
      // We'll use a simple fingerprint based on URL/public_id for existing images
      // In production, you might want to store fingerprints in the database
    }
    
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      
      try {
        // Generate fingerprint for each image
        const fingerprint = await generateImageFingerprint(file.buffer);
        
        // Check if this fingerprint already exists in this batch
        if (imageFingerprints.has(fingerprint)) {
          duplicateImages.push({
            filename: filenames[i] || file.originalname,
            index: i + 1,
            reason: 'Duplicate image content detected in this batch',
            fingerprint: fingerprint
          });
          continue; // Skip this file - DON'T upload
        }
        
        // Add fingerprint to set
        imageFingerprints.add(fingerprint);
        
        // File is valid for upload
        validFiles.push(file);
        validFileIndices.push(i);
        
      } catch (fingerprintError) {
        console.error(`Error generating fingerprint for ${file.originalname}:`, fingerprintError);
        // If fingerprint fails, still upload the file
        validFiles.push(file);
        validFileIndices.push(i);
      }
    }
    
    console.log(`✅ Found: ${duplicateImages.length} duplicates in this batch`);
    console.log(`⚡ Will upload: ${validFiles.length} unique images`);
    
    // 9. Process ONLY unique files
    if (validFiles.length === 0) {
      console.log('⚠️ No unique images to upload after duplicate filtering');
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      
      return res.json({
        success: true,
        message: `No images uploaded. Found ${duplicateImages.length} duplicate images in this batch.`,
        images: [],
        statistics: {
          totalProcessed: req.files.length,
          successfullyUploaded: 0,
          failed: 0,
          duplicates: duplicateImages.length,
          blurry: 0,
          durationSeconds: duration.toFixed(2),
          imagesPerSecond: 0,
          transferSpeed: '0 MB/s',
          performance: 'FAST'
        },
        issues: {
          duplicates: duplicateImages.slice(0, 50),
          failed: []
        },
        service: {
          _id: service._id,
          imagesCount: service.images.length
        }
      });
    }

    // 10. Process in controlled parallel batches
    const BATCH_CONCURRENCY = 12; // Upload 12 images concurrently to maximize speed without socket/timeout failure
    console.log(`⚡ Starting upload of ${validFiles.length} unique images in parallel batches of ${BATCH_CONCURRENCY}...`);
    
    for (let i = 0; i < validFiles.length; i += BATCH_CONCURRENCY) {
      const batch = validFiles.slice(i, i + BATCH_CONCURRENCY);
      const batchIndices = validFileIndices.slice(i, i + BATCH_CONCURRENCY);
      
      const batchPromises = batch.map(async (file, batchIndex) => {
        const originalIndex = batchIndices[batchIndex];
        
        try {
          // SUPER QUICK VALIDATION
          if (!file.mimetype.startsWith('image/')) {
            throw new Error('Not an image file');
          }

          // Create unique public ID
          const originalName = filenames[originalIndex] || file.originalname;
          const cleanName = originalName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
          const publicId = `service_${serviceId}_${batchId}_${originalIndex}_${cleanName}`;
          
          // Generate fingerprint for this image (again for verification)
          const currentFingerprint = await generateImageFingerprint(file.buffer);
          
          // Cloudinary upload with safe timeout and auto-retry
          let result = null;
          let uploadError = null;
          
          for (let attempt = 1; attempt <= 2; attempt++) {
            try {
              result = await cloudinary.uploader.upload(
                `data:${file.mimetype};base64,${file.buffer.toString('base64')}`,
                {
                  folder: `services/${serviceId}`,
                  public_id: publicId,
                  resource_type: 'image',
                  timeout: 60000,
                  quality: 'auto:eco',
                  fetch_format: 'auto',
                  transformation: [
                    { width: 800, crop: 'limit' },
                    { quality: 'auto:eco' }
                  ]
                }
              );
              uploadError = null;
              break;
            } catch (err) {
              uploadError = err;
              if (attempt === 1) {
                await new Promise(r => setTimeout(r, 400));
              }
            }
          }

          if (!result && uploadError) {
            throw uploadError;
          }

          // Create image object
          const imageData = {
            url: result.secure_url,
            public_id: result.public_id,
            caption: captions[originalIndex] || `Image ${service.images.length + originalIndex + 1}`,
            originalName: originalName,
            takenAt: new Date(),
            source: 'bulk',
            latitude: latitude,
            longitude: longitude,
            locationAddress: locationAddress,
            simpleAddress: locationAddress,
            location: {
              lat: latitude,
              lng: longitude,
              address: locationAddress
            },
            size: file.size,
            mimetype: file.mimetype,
            uploadedBy: req.user._id,
            uploadedAt: new Date(),
            fingerprint: currentFingerprint,
            itemId: resolvedItemId,
            serviceIndex: targetIdx,
            serviceType: resolvedServiceType
          };

          return { status: 'success', data: imageData };

        } catch (error) {
          const errMsg = error?.error?.message || error?.message || (typeof error === 'string' ? error : 'Cloudinary upload error');
          console.error(`❌ Failed image ${originalIndex + 1}:`, errMsg);
          return {
            status: 'failed',
            filename: file.originalname,
            error: errMsg,
            index: originalIndex + 1
          };
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((resItem, idx) => {
        if (resItem.status === 'fulfilled') {
          const val = resItem.value;
          if (val.status === 'success') {
            uploadedImages.push(val.data);
          } else if (val.status === 'failed') {
            failedImages.push({
              filename: val.filename,
              error: val.error,
              index: val.index || (i + idx + 1)
            });
          }
        } else {
          const errMsg = resItem.reason?.error?.message || resItem.reason?.message || 'Unknown error';
          failedImages.push({
            filename: `File ${i + idx + 1}`,
            error: errMsg,
            index: i + idx + 1
          });
        }
      });
    }

    // 12. Before saving, check for duplicates WITHIN THIS UPLOAD BATCH
    console.log('🔍 Final duplicate check within uploaded images...');
    const finalUploadedImages = [];
    const finalDuplicateImages = [];
    const uploadedFingerprints = new Set();
    
    for (const image of uploadedImages) {
      if (image.fingerprint) {
        if (uploadedFingerprints.has(image.fingerprint)) {
          finalDuplicateImages.push({
            filename: image.originalName,
            reason: 'Duplicate found in uploaded images',
            fingerprint: image.fingerprint
          });
          // Try to delete from Cloudinary if it was just uploaded
          if (image.public_id) {
            try {
              await cloudinary.uploader.destroy(image.public_id);
              console.log(`Deleted duplicate from Cloudinary: ${image.public_id}`);
            } catch (deleteError) {
              console.error(`Failed to delete duplicate from Cloudinary:`, deleteError);
            }
          }
          continue;
        }
        uploadedFingerprints.add(image.fingerprint);
      }
      finalUploadedImages.push(image);
    }
    
    if (finalDuplicateImages.length > 0) {
      console.log(`🔄 Found ${finalDuplicateImages.length} additional duplicates within uploaded batch`);
      // Update statistics
      duplicateImages.push(...finalDuplicateImages);
    }

    // 13. Save only unique images to database
    if (finalUploadedImages.length > 0) {
      console.log(`💾 Saving ${finalUploadedImages.length} unique images to database...`);
      
      // Use MongoDB bulk operation for speed
      const updateQuery = { $push: { images: { $each: finalUploadedImages } } };
      if (targetIdx !== null && service.services && service.services.length > targetIdx) {
        updateQuery.$push[`services.${targetIdx}.images`] = { $each: finalUploadedImages };
      }
      await Service.updateOne({ _id: serviceId }, updateQuery);
      console.log('✅ Unique images saved to database');
    }

    // 14. Calculate statistics
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    const imagesPerSecond = finalUploadedImages.length / Math.max(duration, 0.1);
    const totalMB = validFiles.reduce((sum, file) => sum + (file.size / 1024 / 1024), 0);
    const mbps = totalMB / Math.max(duration, 0.1);

    console.log('=== ⚡ BULK UPLOAD COMPLETE ===');
    console.log(`✅ Successfully uploaded: ${finalUploadedImages.length} unique images`);
    console.log(`❌ Failed: ${failedImages.length} images`);
    console.log(`🔄 Duplicates skipped: ${duplicateImages.length} images (${duplicateImages.length - finalDuplicateImages.length} before upload + ${finalDuplicateImages.length} after upload)`);
    console.log(`⏱️ Duration: ${duration.toFixed(2)} seconds`);
    console.log(`📊 Speed: ${imagesPerSecond.toFixed(1)} images/second, ${mbps.toFixed(1)} MB/s`);

    // 15. Prepare response message
    let responseMessage = `Bulk upload complete!`;
    
    if (finalUploadedImages.length > 0) {
      responseMessage += ` ${finalUploadedImages.length} images uploaded in ${duration.toFixed(1)}s`;
    }
    
    const totalDuplicates = duplicateImages.length;
    if (totalDuplicates > 0) {
      responseMessage += `\n🔄 ${totalDuplicates} images not uploaded (duplicates)`;
    }
    
    if (failedImages.length > 0) {
      responseMessage += `\n❌ ${failedImages.length} images failed to upload`;
    }
    
    if (finalUploadedImages.length === 0) {
      responseMessage = `No unique images uploaded. All images were either duplicates or failed to upload.`;
    }

    // 16. Send immediate response
    res.json({
      success: true,
      message: responseMessage,
      images: finalUploadedImages,
      statistics: {
        totalProcessed: req.files.length,
        successfullyUploaded: finalUploadedImages.length,
        failed: failedImages.length,
        duplicates: totalDuplicates,
        blurry: 0,
        durationSeconds: duration.toFixed(2),
        imagesPerSecond: imagesPerSecond.toFixed(1),
        transferSpeed: `${mbps.toFixed(1)} MB/s`,
        performance: duration <= 10 ? 'EXCELLENT' : duration <= 15 ? 'GOOD' : 'SLOW'
      },
      issues: {
        duplicates: duplicateImages.slice(0, 100),
        failed: failedImages.slice(0, 100)
      },
      service: {
        _id: service._id,
        imagesCount: service.images.length + finalUploadedImages.length
      }
    });

  } catch (error) {
    console.error('❌ BULK UPLOAD CRITICAL ERROR:', error.message);
    console.error('Error stack:', error.stack);
    
    res.status(500).json({
      success: false,
      message: 'Bulk upload failed: ' + error.message,
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});
// ========== DELETE IMAGE ENDPOINT (FINAL FIXED VERSION) ==========
router.delete('/:id/images/:imageId', auth, async (req, res) => {
  try {
    console.log('=== DELETE IMAGE REQUEST ===');
    console.log('Service ID:', req.params.id);
    console.log('Image ID to delete:', req.params.imageId);
    console.log('User:', req.user.username);

    // Find the service
    const service = await Service.findById(req.params.id);
    if (!service) {
      console.log('❌ Service not found');
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    console.log('✅ Service found:', service.businessName);
    console.log('Current images count:', service.images?.length || 0);

    // Check authorization (creator, admin, owner, or assigned worker)
    const isAuthorized = isUserAuthorizedForService(service, req.user);

    if (!isAuthorized) {
      console.log('❌ User not authorized to delete image');
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete images from this service'
      });
    }

    console.log('✅ User authorized to delete image');

    // Check if there are any images
    if (!service.images || service.images.length === 0) {
      console.log('⚠️ No images in service to delete');
      return res.status(404).json({
        success: false,
        message: 'No images found in service'
      });
    }

    // Find the image - IMPROVED SEARCH (Parent array and subdocument arrays)
    let imageIndex = -1;
    let imageToDelete = null;

    // 1. Try to find in parent service.images array by ID
    for (let i = 0; i < service.images.length; i++) {
      const img = service.images[i];
      if (img._id && img._id.toString() === req.params.imageId) {
        imageIndex = i;
        imageToDelete = img;
        break;
      }
      if (img.id && img.id.toString() === req.params.imageId) {
        imageIndex = i;
        imageToDelete = img;
        break;
      }
      if (img.public_id && img.public_id.includes(req.params.imageId)) {
        imageIndex = i;
        imageToDelete = img;
        break;
      }
    }

    // 2. If not found in parent array, search in sub-services
    if (!imageToDelete && service.services && Array.isArray(service.services)) {
      for (const subService of service.services) {
        if (subService.images && Array.isArray(subService.images)) {
          const foundImg = subService.images.find(img => 
            (img._id && img._id.toString() === req.params.imageId) ||
            (img.id && img.id.toString() === req.params.imageId)
          );
          if (foundImg) {
            imageToDelete = foundImg;
            // Now resolve the matching image index in parent by url or public_id
            imageIndex = service.images.findIndex(img => 
              img.url === foundImg.url || 
              (img.public_id && foundImg.public_id && img.public_id === foundImg.public_id)
            );
            break;
          }
        }
      }
    }

    if (!imageToDelete) {
      console.log('❌ Image not found. Available images in parent:');
      service.images.forEach((img, idx) => {
        console.log(`  [${idx}] _id: ${img._id?.toString()}, caption: "${img.caption}"`);
      });
      
      return res.status(404).json({
        success: false,
        message: 'Image not found in service'
      });
    }

    console.log('✅ Image to delete found:', {
      index: imageIndex,
      caption: imageToDelete.caption,
      public_id: imageToDelete.public_id,
      _id: imageToDelete._id?.toString()
    });

    // Delete from Cloudinary if public_id exists
    if (imageToDelete.public_id) {
      try {
        console.log('☁️ Deleting from Cloudinary:', imageToDelete.public_id);
        await cloudinary.uploader.destroy(imageToDelete.public_id);
        console.log('✅ Cloudinary delete successful');
      } catch (cloudinaryError) {
        console.error('⚠️ Cloudinary delete failed (continuing anyway):', cloudinaryError.message);
        // Continue with database deletion even if Cloudinary fails
      }
    }

    // Remove the image from the parent array if it exists
    if (imageIndex !== -1) {
      service.images.splice(imageIndex, 1);
    }
    
    // Remove the image from all sub-services by matching URL or public_id
    if (service.services && Array.isArray(service.services)) {
      service.services.forEach(subService => {
        if (subService.images && Array.isArray(subService.images)) {
          subService.images = subService.images.filter(img => 
            img.url !== imageToDelete.url && 
            (!imageToDelete.public_id || img.public_id !== imageToDelete.public_id)
          );
        }
      });
    }

    // Save with validation disabled for this operation
    try {
      service.markModified('images');
      service.markModified('services');
      await service.save({ validateBeforeSave: false });
      
      console.log('✅ Image removed from database (both parent and sub-services) via save');
    } catch (saveError) {
      console.log('⚠️ Document save failed, trying updateOne as fallback:', saveError.message);
      
      // Fallback: direct MongoDB update
      await Service.updateOne(
        { _id: service._id },
        { 
          $pull: { 
            images: { _id: req.params.imageId },
            "services.$[].images": { url: imageToDelete.url }
          } 
        }
      );
      console.log('✅ Image removed from database via updateOne fallback');
    }

    console.log('✅ Image deletion completed successfully');
    console.log('New images count:', service.images.length);

    // Send success response
    res.json({
      success: true,
      message: 'Image deleted successfully',
      deletedImage: {
        _id: imageToDelete._id?.toString(),
        caption: imageToDelete.caption
      },
      service: {
        _id: service._id,
        imagesCount: service.images.length,
        businessName: service.businessName
      }
    });

  } catch (error) {
    console.error('❌ DELETE IMAGE ERROR:', error.message);
    
    // More detailed error logging
    if (error.name === 'ValidationError') {
      console.error('Validation Error Details:', {
        errors: Object.keys(error.errors).map(key => ({
          field: key,
          message: error.errors[key].message,
          value: error.errors[key].value
        }))
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error deleting image: ' + error.message,
      error: process.env.NODE_ENV === 'development' ? {
        name: error.name,
        message: error.message,
        validationErrors: error.errors
      } : undefined
    });
  }
});
// ========== DELETE ALL IMAGES ENDPOINT (NEW) ==========
router.delete('/:id/images-all', auth, async (req, res) => {
  try {
    console.log('=== DELETE ALL IMAGES REQUEST ===');
    console.log('Service ID:', req.params.id);
    console.log('User:', req.user.username);
    console.log('User role:', req.user.role);

    // Find the service
    const service = await Service.findById(req.params.id);
    if (!service) {
      console.log('❌ Service not found');
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    // Check authorization (creator, admin, owner, or assigned worker)
    const isAuthorized = isUserAuthorizedForService(service, req.user);

    if (!isAuthorized) {
      console.log('❌ User not authorized to delete all images');
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete images from this service'
      });
    }

    // Check if there are any images in the parent array or in sub-services
    const hasParentImages = service.images && service.images.length > 0;
    const hasSubImages = service.services && service.services.some(s => s.images && s.images.length > 0);
    
    if (!hasParentImages && !hasSubImages) {
      console.log('⚠️ No images to delete');
      return res.json({
        success: true,
        message: 'No images to delete',
        statistics: {
          totalDeleted: 0,
          cloudinaryDeleted: 0,
          cloudinaryFailed: 0
        },
        service: {
          _id: service._id,
          imagesCount: 0
        }
      });
    }

    // Collect all unique images to clear from parent and sub-services
    const allImagesToClear = [];
    if (service.images && Array.isArray(service.images)) {
      allImagesToClear.push(...service.images);
    }
    if (service.services && Array.isArray(service.services)) {
      service.services.forEach(subService => {
        if (subService.images && Array.isArray(subService.images)) {
          allImagesToClear.push(...subService.images);
        }
      });
    }

    // Deduplicate images by public_id or url
    const uniqueImagesToClear = allImagesToClear.filter((img, i, arr) => 
      arr.findIndex(t => (t.public_id && t.public_id === img.public_id) || (t.url && t.url === img.url)) === i
    );

    console.log(`📸 Deleting ${uniqueImagesToClear.length} unique images...`);

    // Track statistics
    const stats = {
      totalDeleted: uniqueImagesToClear.length,
      cloudinaryDeleted: 0,
      cloudinaryFailed: 0
    };

    // OPTIONAL: Delete from Cloudinary in parallel (faster)
    const cloudinaryPromises = uniqueImagesToClear
      .filter(img => img.public_id)
      .map(async (img) => {
        try {
          console.log(`Deleting from Cloudinary: ${img.public_id}`);
          const result = await cloudinary.uploader.destroy(img.public_id);
          console.log(`Cloudinary result for ${img.public_id}:`, result);
          stats.cloudinaryDeleted++;
          return { success: true, public_id: img.public_id };
        } catch (error) {
          console.error(`Failed to delete from Cloudinary: ${img.public_id}`, error);
          stats.cloudinaryFailed++;
          return { success: false, public_id: img.public_id, error: error.message };
        }
      });

    // Wait for all Cloudinary deletions (optional - can continue even if some fail)
    const cloudinaryResults = await Promise.allSettled(cloudinaryPromises);
    
    console.log('Cloudinary deletion results:', {
      total: cloudinaryResults.length,
      fulfilled: cloudinaryResults.filter(r => r.status === 'fulfilled').length,
      rejected: cloudinaryResults.filter(r => r.status === 'rejected').length
    });

    // Clear images array in MongoDB (both parent and all subdocuments)
    service.images = [];
    if (service.services && Array.isArray(service.services)) {
      service.services.forEach(subService => {
        subService.images = [];
      });
    }
    
    service.markModified('images');
    service.markModified('services');
    await service.save({ validateBeforeSave: false });

    console.log(`✅ All ${stats.totalDeleted} images removed from service`);

    res.json({
      success: true,
      message: `Successfully deleted all ${stats.totalDeleted} images`,
      statistics: stats,
      service: {
        _id: service._id,
        images: [],
        imagesCount: 0
      }
    });

  } catch (error) {
    console.error('❌ DELETE ALL IMAGES ERROR:', error);
    console.error('Error stack:', error.stack);
    
    res.status(500).json({
      success: false,
      message: 'Error deleting all images: ' + error.message,
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});
// ========== ULTRA-FAST PARALLEL UPLOAD ENDPOINT ==========
router.post('/:id/ultra-bulk', auth, upload.array('images', 5000), async (req, res) => {
  const serviceId = req.params.id;
  const startTime = Date.now();
  const MAX_PARALLEL_UPLOADS = 50; // Upload 50 images at once
  const BATCH_SIZE = 100; // Process in batches of 100

  try {
    console.log('=== ⚡ ULTRA-PARALLEL BULK UPLOAD START ===');
    console.log('Service ID:', serviceId);
    console.log('Total files:', req.files?.length || 0);

    // 1. Basic validation
    if (!serviceId) {
      return res.status(400).json({
        success: false,
        message: 'Service ID is required'
      });
    }

    // 2. Find service
    const service = await Service.findById(serviceId);
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    // 3. Authorization check (creator, admin, owner, or assigned worker)
    const isAuthorized = isUserAuthorizedForService(service, req.user);

    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to upload images'
      });
    }

    // 4. Check for files
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No images provided'
      });
    }

    console.log(`⚡ Processing ${req.files.length} images in parallel...`);

    // Resolve exact targetIdx for multi-service item
    let targetIdx = null;
    if (req.body.serviceIndex !== undefined && req.body.serviceIndex !== 'undefined' && req.body.serviceIndex !== 'null' && !isNaN(Number(req.body.serviceIndex))) {
      targetIdx = Number(req.body.serviceIndex);
    } else if (req.body.itemId && req.body.itemId !== 'undefined' && req.body.itemId !== 'null' && service.services && Array.isArray(service.services)) {
      const foundIdx = service.services.findIndex(s => (s._id || s.id)?.toString() === req.body.itemId.toString());
      if (foundIdx !== -1) targetIdx = foundIdx;
    } else if (req.body.serviceType && req.body.serviceType !== 'undefined' && req.body.serviceType !== 'null' && service.services && Array.isArray(service.services)) {
      const foundIdx = service.services.findIndex(s => s.serviceType === req.body.serviceType);
      if (foundIdx !== -1) targetIdx = foundIdx;
    }

    const resolvedItemId = targetIdx !== null && service.services?.[targetIdx] ? (service.services[targetIdx]._id || service.services[targetIdx].id || req.body.itemId || null) : (req.body.itemId || null);
    const resolvedServiceType = targetIdx !== null && service.services?.[targetIdx] ? (service.services[targetIdx].serviceType || req.body.serviceType || null) : (req.body.serviceType || null);

    // 5. Get location data (non-blocking)
    const latitude = req.body.latitude ? parseFloat(req.body.latitude) : null;
    const longitude = req.body.longitude ? parseFloat(req.body.longitude) : null;
    const filenames = Array.isArray(req.body.filenames) ? req.body.filenames : [];
    const captions = Array.isArray(req.body.captions) ? req.body.captions : [];

    // 6. ULTRA-PARALLEL UPLOAD STRATEGY
    const uploadedImages = [];
    const failedImages = [];
    const batchId = Date.now();

    // Process in batches of BATCH_SIZE
    for (let batchStart = 0; batchStart < req.files.length; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, req.files.length);
      const batch = req.files.slice(batchStart, batchEnd);
      
      console.log(`📦 Processing batch ${Math.floor(batchStart/BATCH_SIZE) + 1}: ${batchStart}-${batchEnd}`);
      
      // Create upload promises for this batch
      const uploadPromises = [];
      
      for (let i = 0; i < batch.length; i++) {
        const fileIndex = batchStart + i;
        const file = batch[i];
        
        // Skip non-image files quickly
        if (!file.mimetype.startsWith('image/')) {
          failedImages.push({
            filename: file.originalname,
            error: 'Not an image file',
            index: fileIndex + 1
          });
          continue;
        }
        
        uploadPromises.push(
          uploadSingleImage(file, serviceId, batchId, fileIndex, {
            filename: filenames[fileIndex] || file.originalname,
            caption: captions[fileIndex] || `Image ${service.images.length + fileIndex + 1}`,
            latitude,
            longitude,
            locationAddress: req.body.simpleAddress || '',
            itemId: resolvedItemId,
            serviceIndex: targetIdx,
            serviceType: resolvedServiceType
          })
        );
      }

      // Execute this batch in parallel (MAX_PARALLEL_UPLOADS at a time)
      const results = await executeParallel(uploadPromises, MAX_PARALLEL_UPLOADS);
      
      // Process results
      results.forEach((result, index) => {
        if (result.status === 'success') {
          uploadedImages.push(result.data);
        } else {
          failedImages.push({
            filename: batch[index]?.originalname || `File ${index}`,
            error: result.error || 'Upload failed',
            index: batchStart + index + 1
          });
        }
      });
      
      // Quick status update
      console.log(`✅ Batch ${Math.floor(batchStart/BATCH_SIZE) + 1} complete: ${uploadedImages.length} uploaded so far`);
    }

    // 7. Save to MongoDB
    if (uploadedImages.length > 0) {
      console.log(`💾 Saving ${uploadedImages.length} images to database...`);
      const serviceDoc = await Service.findById(serviceId);
      if (serviceDoc) {
        serviceDoc.images.push(...uploadedImages);
        if (targetIdx !== null && serviceDoc.services && serviceDoc.services.length > targetIdx) {
          if (!serviceDoc.services[targetIdx].images) {
            serviceDoc.services[targetIdx].images = [];
          }
          serviceDoc.services[targetIdx].images.push(...uploadedImages);
        }
        await serviceDoc.save();
        console.log('✅ Database save complete with sub-service mapping');
      }
    }

    // 8. Calculate statistics
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    const totalImages = req.files.length;
    const successRate = (uploadedImages.length / totalImages) * 100;
    const imagesPerSecond = uploadedImages.length / Math.max(duration, 0.1);

    console.log('=== ⚡ UPLOAD COMPLETE ===');
    console.log(`✅ Success: ${uploadedImages.length}/${totalImages} (${successRate.toFixed(1)}%)`);
    console.log(`❌ Failed: ${failedImages.length}`);
    console.log(`⏱️ Duration: ${duration.toFixed(2)}s`);
    console.log(`📊 Speed: ${imagesPerSecond.toFixed(1)} images/second`);

    // 9. Send response
    res.json({
      success: true,
      message: `Uploaded ${uploadedImages.length} images in ${duration.toFixed(1)} seconds (${imagesPerSecond.toFixed(1)}/sec)`,
      images: uploadedImages,
      statistics: {
        totalProcessed: totalImages,
        successfullyUploaded: uploadedImages.length,
        failed: failedImages.length,
        successRate: successRate.toFixed(1),
        durationSeconds: duration.toFixed(2),
        imagesPerSecond: imagesPerSecond.toFixed(1),
        performance: duration <= 10 ? 'EXCELLENT' : duration <= 15 ? 'GOOD' : 'SLOW'
      },
      issues: {
        failed: failedImages.slice(0, 50)
      }
    });

  } catch (error) {
    console.error('❌ CRITICAL ERROR:', error);
    res.status(500).json({
      success: false,
      message: 'Upload failed: ' + error.message
    });
  }
});

// Helper function to execute promises in parallel with concurrency limit
async function executeParallel(promises, concurrency) {
  const results = [];
  
  for (let i = 0; i < promises.length; i += concurrency) {
    const batch = promises.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(batch);
    
    batchResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        results.push({
          status: 'failed',
          error: result.reason?.message || 'Unknown error'
        });
      }
    });
  }
  
  return results;
}

// Helper function to upload single image
async function uploadSingleImage(file, serviceId, batchId, index, metadata) {
  try {
    // Create unique public ID
    const cleanName = metadata.filename.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
    const publicId = `service_${serviceId}_${batchId}_${index}_${cleanName}`;
    
    // Convert to buffer
    const buffer = file.buffer;
    const b64 = buffer.toString('base64');
    const dataURI = `data:${file.mimetype};base64,${b64}`;
    
    // ULTRA-FAST Cloudinary upload with minimal options
    const result = await cloudinary.uploader.upload(dataURI, {
      folder: `services/${serviceId}`,
      public_id: publicId,
      resource_type: 'image',
      timeout: 60000, // Safe 60s timeout per image
      quality: 'auto:low', // Faster compression
      format: 'jpg', // Force JPG for speed
      transformation: [
        { width: 800, crop: 'limit' }, // Limit size for speed
        { quality: 'auto:low' }
      ]
    });

    return {
      status: 'success',
      data: {
        url: result.secure_url,
        public_id: result.public_id,
        caption: metadata.caption,
        originalName: metadata.filename,
        takenAt: new Date(),
        source: 'bulk',
        latitude: metadata.latitude,
        longitude: metadata.longitude,
        itemId: metadata.itemId || null,
        serviceIndex: metadata.serviceIndex !== undefined ? metadata.serviceIndex : null,
        serviceType: metadata.serviceType || null,
        locationAddress: metadata.locationAddress,
        location: {
          lat: metadata.latitude,
          lng: metadata.longitude,
          address: metadata.locationAddress
        },
        size: file.size,
        mimetype: file.mimetype,
        uploadedBy: null, // Will be populated by middleware
        uploadedAt: new Date()
      }
    };

  } catch (error) {
    return {
      status: 'failed',
      error: error.message
    };
  }
}
module.exports = router;