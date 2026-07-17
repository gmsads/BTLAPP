// routes/owner.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Service = require('../models/Service');
const mongoose = require('mongoose');

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
    const user = await User.findById(decoded.userId).select('-password');
    
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
    // Get users created by this owner
    const totalUsers = await User.countDocuments({ 
      createdBy: req.user._id,
      role: { $in: ['user', 'client'] } 
    });
    
    // Get workers created by this owner
    const totalWorkers = await User.countDocuments({ 
      createdBy: req.user._id,
      role: 'user' 
    });
    
    // Get clients created by this owner
    const totalClients = await User.countDocuments({ 
      createdBy: req.user._id,
      role: 'client' 
    });
    
    // Get services created by this owner
    const totalServices = await Service.countDocuments({ 
      createdBy: req.user._id 
    });
    
    // Get services by status (owner's services only)
    const servicesByStatus = await Service.aggregate([
      {
        $match: { createdBy: req.user._id }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get assigned vs unassigned services (owner's services only)
    const assignedServices = await Service.countDocuments({ 
      createdBy: req.user._id,
      assignedTo: { $ne: null } 
    });
    
    const unassignedServices = await Service.countDocuments({ 
      createdBy: req.user._id,
      assignedTo: null 
    });

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
    }).select('-password').sort({ createdAt: -1 });
    
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
    .sort({ businessName: 1 });

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
      .sort({ createdAt: -1 });

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

    // Check if user exists
    const searchConditions = [{ username }];
    if (email && email.trim()) {
      searchConditions.push({ email: email.trim().toLowerCase() });
    }
    const existingUser = await User.findOne({ 
      $or: searchConditions 
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email or username'
      });
    }

    // Create user data object
    const userData = { 
      username, 
      password, 
      role,
      createdBy: req.user._id // Track who created this user
    };

    if (email && email.trim()) {
      userData.email = email.trim().toLowerCase();
    }

    // Add optional fields if provided
    if (contactNumber) {
      userData.contactNumber = contactNumber;
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
        email: user.email,
        contactNumber: user.contactNumber || '',
        role: user.role,
        businessName: user.businessName,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    console.error('Create user error:', error);
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

    // Check if email or username already exists (excluding current user)
    const searchConditions = [{ username }];
    if (email && email.trim()) {
      searchConditions.push({ email: email.trim().toLowerCase() });
    }
    const duplicateUser = await User.findOne({
      $and: [
        { _id: { $ne: req.params.id } },
        { $or: searchConditions }
      ]
    });

    if (duplicateUser) {
      return res.status(400).json({
        success: false,
        message: 'Username or email already exists'
      });
    }

    // Prepare update data
    const updateData = { 
      username, 
      role,
      contactNumber: contactNumber || '' // Set to empty string if not provided
    };

    if (email !== undefined) {
      updateData.email = email && email.trim() ? email.trim().toLowerCase() : null;
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
    const serviceId = req.params.id;

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

      // Check if worker was created by this owner OR is the owner themselves
      const assignedUser = await User.findOne({
        _id: assignedTo,
        $or: [
          { createdBy: req.user._id },
          { _id: req.user._id } // Allow assigning to self if owner is also a worker
        ],
        role: 'user'
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
    const isAssignSingle = (assignAll === false || assignAll === 'false') && 
                           serviceIndex !== undefined && 
                           serviceIndex !== null && 
                           !isNaN(Number(serviceIndex));

    if (hasSubServices && isAssignSingle) {
      // Assign to specific service item only
      const idx = Number(serviceIndex);
      if (service.services[idx]) {
        service.services[idx].assignedTo = workerVal;
        console.log(`✅ Assigned to service item ${idx}`);
      }
      // Also set parent assignedTo to the same worker so it shows up in parent view
      service.assignedTo = workerVal;
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