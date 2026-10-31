// routes/owner.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Service = require('../models/Service');
const mongoose = require('mongoose');

const ownerAuthCache = new Map();
const OWNER_AUTH_TTL_MS = 15000;

// Owner auth middleware
const ownerAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'No token provided' 
      });
    }

    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const cacheKey = String(decoded.userId);
    const cached = ownerAuthCache.get(cacheKey);
    let user = null;

    if (cached && Date.now() - cached.ts < OWNER_AUTH_TTL_MS) {
      user = cached.user;
    } else {
      user = await User.findById(decoded.userId).select('-password');
      if (user) {
        if (ownerAuthCache.size > 200) ownerAuthCache.clear();
        ownerAuthCache.set(cacheKey, { user, ts: Date.now() });
      }
    }
    
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token' 
      });
    }

    if (user.role !== 'owner') {
      return res.status(403).json({ 
        success: false, 
        message: 'Owner access required' 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Owner auth middleware error:', error);
    res.status(401).json({ 
      success: false, 
      message: 'Token invalid' 
    });
  }
};

router.use(ownerAuth);

// 1. Get owner dashboard statistics (ONLY owner's data)
router.get('/stats', async (req, res) => {
  try {
    const [
      totalUsers,
      totalWorkers,
      totalClients,
      totalServices,
      servicesByStatus,
      assignedServices,
      unassignedServices
    ] = await Promise.all([
      User.countDocuments({
        createdBy: req.user._id,
        role: { $in: ['user', 'client'] }
      }),
      User.countDocuments({
        createdBy: req.user._id,
        role: 'user'
      }),
      User.countDocuments({
        createdBy: req.user._id,
        role: 'client'
      }),
      Service.countDocuments({
        createdBy: req.user._id
      }),
      Service.aggregate([
        { $match: { createdBy: req.user._id } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Service.countDocuments({
        createdBy: req.user._id,
        $or: [
          { assignedTo: { $ne: null } },
          { 'services.assignedTo': { $ne: null } }
        ]
      }),
      Service.countDocuments({
        createdBy: req.user._id,
        assignedTo: null,
        $or: [
          { services: { $size: 0 } },
          { services: { $not: { $elemMatch: { assignedTo: { $ne: null } } } } }
        ]
      })
    ]);

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalWorkers,
        totalClients,
        totalServices,
        servicesByStatus,
        assignedServices,
        unassignedServices
      }
    });
  } catch (error) {
    console.error('Get owner stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching owner statistics: ' + error.message
    });
  }
});

// 2. Get users created by this owner only
router.get('/users', async (req, res) => {
  try {
    const users = await User.find({ 
      createdBy: req.user._id,
      role: { $in: ['user', 'client'] } 
    }).select('-password').sort({ createdAt: -1 }).lean();
    
    res.json({
      success: true,
      users
    });
  } catch (error) {
    console.error('Get owner users error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching users: ' + error.message
    });
  }
});

// 2.5 Get business users created by this owner only
router.get('/business-users', async (req, res) => {
  try {
    const users = await User.find({
      $or: [
        { createdBy: req.user._id, businessName: { $exists: true, $ne: '', $ne: null }, isActive: true },
        { _id: req.user._id, businessName: { $exists: true, $ne: '', $ne: null }, isActive: true }
      ]
    })
    .select('username email contactNumber businessName')
    .sort({ businessName: 1 })
    .lean();

    res.json({
      success: true,
      count: users.length,
      users: users.map(user => ({
        _id: user._id,
        username: user.username,
        email: user.email || '',
        contactNumber: user.contactNumber || '',
        businessName: user.businessName || ''
      }))
    });
  } catch (error) {
    console.error('Get owner business users error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching business users: ' + error.message
    });
  }
});

// 3. Get services created by this owner only
router.get('/services', async (req, res) => {
  try {
    const { status } = req.query;
    
    // Only show services created by this owner
    let filter = { createdBy: req.user._id };
    
    if (status && status !== 'all') {
      filter.status = status;
    }

    const services = await Service.find(filter)
      .populate('createdBy', 'username email role contactNumber')
      .populate('assignedTo', 'username email contactNumber')
      .populate('services.assignedTo', 'username email contactNumber')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      services
    });
  } catch (error) {
    console.error('Get owner services error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching services: ' + error.message
    });
  }
});

// 4. Get available workers (created by this owner) - UPDATED
router.get('/available-workers', async (req, res) => {
  try {
    const workers = await User.find({ 
      createdBy: req.user._id,
      role: 'user',
      isActive: true 
    }).select('username email contactNumber');

    res.json({
      success: true,
      workers
    });

  } catch (error) {
    console.error('Get workers error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching workers: ' + error.message
    });
  }
});

// 5. Create new user (with createdBy field) - UPDATED WITH CONTACT NUMBER
router.post('/users', async (req, res) => {
  try {
    const { username, email, password, contactNumber, role = 'user', businessName } = req.body;

    // Validation
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username and password are required' 
      });
    }

    if (!contactNumber || !contactNumber.toString().trim()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Contact number is required' 
      });
    }

    const cleanContactNumber = contactNumber.toString().trim().replace(/[\s-]/g, '');
    const mobileRegex = /^[0-9]{10,15}$/;
    if (!mobileRegex.test(cleanContactNumber)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please enter a valid mobile number (10-15 digits)' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password must be at least 6 characters' 
      });
    }

    // Validate business name for clients
    if (role === 'client' && !businessName) {
      return res.status(400).json({ 
        success: false, 
        message: 'Business name is required for client registration' 
      });
    }

    // Owner cannot create admins or other owners
    if (role === 'admin' || role === 'owner') {
      return res.status(403).json({
        success: false,
        message: 'Owners cannot create admin or owner accounts'
      });
    }

    // Check if contact number already exists
    const existingContact = await User.findOne({ contactNumber: cleanContactNumber });
    if (existingContact) {
      return res.status(400).json({
        success: false,
        message: 'User with this contact number already exists'
      });
    }

    // Check if username already exists
    const existingUsername = await User.findOne({ username: username.trim() });
    if (existingUsername) {
      return res.status(400).json({
        success: false,
        message: 'Username is already taken'
      });
    }

    // Check if email already exists (only if email is provided and non-empty)
    if (email && typeof email === 'string' && email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        return res.status(400).json({
          success: false,
          message: 'Please enter a valid email address'
        });
      }
      const existingEmail = await User.findOne({ email: email.trim().toLowerCase() });
      if (existingEmail) {
        return res.status(400).json({
          success: false,
          message: 'User with this email already exists'
        });
      }
    }

    // Create user data object
    const userData = { 
      username: username.trim(), 
      contactNumber: cleanContactNumber,
      password, 
      role,
      createdBy: req.user._id // Track who created this user
    };

    // Email is strictly optional - only set if provided and non-empty
    if (email && typeof email === 'string' && email.trim()) {
      userData.email = email.trim().toLowerCase();
    }

    if (role === 'client') {
      userData.businessName = businessName;
    }

    // Create user with createdBy field
    const user = new User(userData);
    await user.save();

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: {
        id: user._id,
        username: user.username,
        email: user.email || '',
        contactNumber: user.contactNumber || '',
        role: user.role,
        businessName: user.businessName,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    console.error('Create user error:', error);
    if (error.code === 11000) {
      if (error.keyPattern?.contactNumber || error.message?.includes('contactNumber')) {
        return res.status(400).json({
          success: false,
          message: 'User with this contact number already exists'
        });
      }
      if (error.keyPattern?.username || error.message?.includes('username')) {
        return res.status(400).json({
          success: false,
          message: 'Username is already taken'
        });
      }
      if ((error.keyPattern?.email || error.message?.includes('email')) && req.body.email && req.body.email.toString().trim()) {
        return res.status(400).json({
          success: false,
          message: 'User with this email already exists'
        });
      }
    }
    res.status(500).json({
      success: false,
      message: 'Error creating user: ' + error.message
    });
  }
});

// 6. Update user (only if created by this owner) - UPDATED WITH CONTACT NUMBER
router.put('/users/:id', async (req, res) => {
  try {
    const { username, email, contactNumber, role, businessName } = req.body;

    // Validation
    if (!username || !role) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username and role are required' 
      });
    }

    // Owner cannot update users to admin/owner
    if (role === 'admin' || role === 'owner') {
      return res.status(403).json({
        success: false,
        message: 'Owners cannot change roles to admin or owner'
      });
    }

    // First, check if this user was created by the current owner
    const existingUser = await User.findOne({
      _id: req.params.id,
      createdBy: req.user._id
    });

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found or you do not have permission to edit this user'
      });
    }

    // Check if username already exists (excluding current user)
    const duplicateUser = await User.findOne({
      _id: { $ne: req.params.id },
      username: username.trim()
    });

    if (duplicateUser) {
      return res.status(400).json({
        success: false,
        message: 'Username is already taken'
      });
    }

    // Prepare update data
    const updateData = { 
      username: username.trim(), 
      role
    };

    // Check if contactNumber already exists (excluding current user)
    if (contactNumber && contactNumber.toString().trim()) {
      const cleanContactNumber = contactNumber.toString().trim().replace(/[\s-]/g, '');
      const mobileRegex = /^[0-9]{10,15}$/;
      if (!mobileRegex.test(cleanContactNumber)) {
        return res.status(400).json({
          success: false,
          message: 'Please enter a valid mobile number (10-15 digits)'
        });
      }
      const existingContact = await User.findOne({
        _id: { $ne: req.params.id },
        contactNumber: cleanContactNumber
      });
      if (existingContact) {
        return res.status(400).json({
          success: false,
          message: 'User with this contact number already exists'
        });
      }
      updateData.contactNumber = cleanContactNumber;
    }

    if (email !== undefined) {
      if (email && typeof email === 'string' && email.trim()) {
        const cleanEmail = email.trim().toLowerCase();
        const existingEmail = await User.findOne({
          _id: { $ne: req.params.id },
          email: cleanEmail
        });
        if (existingEmail) {
          return res.status(400).json({
            success: false,
            message: 'User with this email already exists'
          });
        }
        updateData.email = cleanEmail;
      } else {
        updateData.$unset = { email: 1 };
      }
    }
    
    // Only include businessName if role is client
    if (role === 'client') {
      if (!businessName) {
        return res.status(400).json({ 
          success: false, 
          message: 'Business name is required for client role' 
        });
      }
      updateData.businessName = businessName;
    } else {
      updateData.businessName = undefined;
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      success: true,
      message: 'User updated successfully',
      user: updatedUser
    });

  } catch (error) {
    console.error('Update user error:', error);
    if (error.code === 11000) {
      if (error.keyPattern?.contactNumber || error.message?.includes('contactNumber')) {
        return res.status(400).json({
          success: false,
          message: 'User with this contact number already exists'
        });
      }
      if (error.keyPattern?.username || error.message?.includes('username')) {
        return res.status(400).json({
          success: false,
          message: 'Username is already taken'
        });
      }
      if ((error.keyPattern?.email || error.message?.includes('email')) && req.body.email && req.body.email.toString().trim()) {
        return res.status(400).json({
          success: false,
          message: 'User with this email already exists'
        });
      }
    }
    res.status(500).json({
      success: false,
      message: 'Error updating user: ' + error.message
    });
  }
});

// 7. Delete user (only if created by this owner)
router.delete('/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Check if user exists AND was created by this owner
    const userToDelete = await User.findOne({
      _id: userId,
      createdBy: req.user._id
    });
    
    if (!userToDelete) {
      return res.status(404).json({
        success: false,
        message: 'User not found or you do not have permission to delete this user'
      });
    }

    // Delete the user
    await User.findByIdAndDelete(userId);
    
    // Also delete all services created by this user
    await Service.deleteMany({ createdBy: userId });

    res.json({
      success: true,
      message: 'User and their services deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting user: ' + error.message
    });
  }
});

// 8. Delete service (only if created by this owner)
router.delete('/services/:id', async (req, res) => {
  try {
    // Check if service exists AND was created by this owner
    const service = await Service.findOne({
      _id: req.params.id,
      createdBy: req.user._id
    });
    
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found or you do not have permission to delete this service'
      });
    }

    // Delete images from Cloudinary first
    if (service.images && service.images.length > 0) {
      const cloudinary = require('../utils/cloudinary');
      
      for (const image of service.images) {
        if (image.public_id) {
          try {
            await cloudinary.uploader.destroy(image.public_id);
          } catch (cloudinaryError) {
            console.error('Failed to delete image from Cloudinary:', cloudinaryError);
          }
        }
      }
    }

    // Delete the service from database
    await Service.findByIdAndDelete(req.params.id);
    
    res.json({
      success: true,
      message: 'Service deleted successfully'
    });

  } catch (error) {
    console.error('❌ Owner delete service error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting service: ' + error.message
    });
  }
});

// Delete individual service item from a multi-service order (Owner specific)
router.delete('/services/:serviceId/items/:itemId', async (req, res) => {
  try {
    const service = await Service.findOne({
      _id: req.params.serviceId,
      createdBy: req.user._id
    });
    
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found or you do not have permission to delete items from this service'
      });
    }

    const serviceItemIndex = service.services.findIndex(item => 
      item._id.toString() === req.params.itemId
    );

    if (serviceItemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Service item not found'
      });
    }

    service.services.splice(serviceItemIndex, 1);

    let totalQty = 0;
    service.services.forEach(item => {
      totalQty += item.quantity || 0;
    });
    service.totalQuantity = totalQty;

    if (service.services.length === 0) {
      if (service.images && service.images.length > 0) {
        const cloudinary = require('../utils/cloudinary');
        for (const image of service.images) {
          if (image.public_id) {
            try {
              await cloudinary.uploader.destroy(image.public_id);
            } catch (error) {
              console.error('Error deleting image from Cloudinary:', error);
            }
          }
        }
      }
      
      await Service.findByIdAndDelete(req.params.serviceId);
      return res.json({
        success: true,
        message: 'Service item deleted. No items left, entire service deleted.'
      });
    }

    if (service.services[0]) {
      service.serviceType = service.services[0].serviceType;
      service.customServiceType = service.services[0].customServiceType;
      service.quantity = service.services[0].quantity;
    }

    await service.save();

    res.json({
      success: true,
      message: 'Service item deleted successfully'
    });
  } catch (error) {
    console.error('❌ Owner delete service item error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting service item: ' + error.message
    });
  }
});

// 9. Assign service to worker (only if service created by this owner)
router.patch('/services/:id/assign', async (req, res) => {
  try {
    const { assignedTo, assignAll, serviceIndex } = req.body;
    const rawId = String(req.params.id || '');
    const idMatch = rawId.match(/^([0-9a-fA-F]{24})[_-](\d+)$/);
    const serviceId = idMatch ? idMatch[1] : rawId;
    const extractedIdx = idMatch ? Number(idMatch[2]) : undefined;

    console.log('=== OWNER ASSIGN SERVICE REQUEST ===');
    console.log('Service ID:', serviceId);
    console.log('Owner:', req.user.username);
    console.log('Assignment data:', { assignedTo, assignAll, serviceIndex });

    // Validate service ID
    if (!mongoose.Types.ObjectId.isValid(serviceId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid service ID'
      });
    }

    // First, check if service exists AND was created by this owner
    const service = await Service.findOne({
      _id: serviceId,
      createdBy: req.user._id
    });

    if (!service) {
      console.log('❌ Service not found or not created by this owner');
      return res.status(404).json({
        success: false,
        message: 'Service not found or you do not have permission to modify this service'
      });
    }

    console.log('✅ Service found:', service.businessName);
    console.log('Current assignedTo:', service.assignedTo);

    // If assigning to a worker, validate the worker
    if (assignedTo && assignedTo !== 'null' && assignedTo !== 'undefined') {
      // Validate worker ID
      if (!mongoose.Types.ObjectId.isValid(assignedTo)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid worker ID'
        });
      }

      const assignedUser = await User.findOne({
        _id: assignedTo,
        role: { $in: ['user', 'executive'] }
      });
      
      if (!assignedUser) {
        console.log('❌ Worker not found or not authorized');
        return res.status(404).json({
          success: false,
          message: 'Worker not found or not authorized'
        });
      }
      
      console.log('✅ Worker found:', assignedUser.username);
    }

    const workerVal = assignedTo && assignedTo !== 'null' && assignedTo !== 'undefined' ? assignedTo : null;

    // Handle assignment based on assignAll flag
    const hasSubServices = service.services && service.services.length > 0;
    const isSingleSubServiceOrder = hasSubServices && service.services.length === 1;
    const resolvedIdx =
      serviceIndex !== undefined && serviceIndex !== null && !isNaN(Number(serviceIndex))
        ? Number(serviceIndex)
        : extractedIdx !== undefined
        ? extractedIdx
        : null;
    const isAssignSingle =
      !isSingleSubServiceOrder &&
      (assignAll === false || assignAll === 'false') &&
      resolvedIdx !== null &&
      service.services &&
      Boolean(service.services[resolvedIdx]);

    if (hasSubServices && isAssignSingle) {
      // First preserve any existing parent-level assignment onto sub-services that didn't have an explicit sub-service assignment
      if (service.assignedTo) {
        service.services.forEach((s) => {
          if (!s.assignedTo) {
            s.assignedTo = service.assignedTo;
          }
        });
      }

      // Assign to specific service item only
      service.services[resolvedIdx].assignedTo = workerVal;
      console.log(`✅ Assigned to service item ${resolvedIdx}`);
      
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
      service.assignedTo = workerVal;
      console.log('✅ Assigned to entire service');
      
      if (service.services && Array.isArray(service.services)) {
        service.services.forEach((item, index) => {
          item.assignedTo = workerVal;
          console.log(`✅ Assigned item ${index} to worker`);
        });
      }
    }

    // Mark modified and save
    service.markModified('services');
    await service.save({ validateBeforeSave: false });

    // Populate for response
    const updatedService = await Service.findById(serviceId)
      .populate('assignedTo', 'username email contactNumber')
      .populate('createdBy', 'username email contactNumber')
      .populate('services.assignedTo', 'username email contactNumber');

    console.log('✅ Service assigned successfully');
    console.log('Parent assignedTo:', updatedService.assignedTo);
    console.log('Sub-services assignedTo:', updatedService.services.map((s, i) => `${i}: ${s.assignedTo?.username || 'null'}`));

    res.json({
      success: true,
      message: assignedTo ? 'Service assigned successfully' : 'Service unassigned successfully',
      service: updatedService
    });

  } catch (error) {
    console.error('❌ Owner assign service error:', error);
    console.error('Error stack:', error.stack);
    
    res.status(500).json({
      success: false,
      message: 'Error assigning service: ' + error.message
    });
  }
});

module.exports = router;