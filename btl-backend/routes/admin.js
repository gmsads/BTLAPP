const express = require('express');
const User = require('../models/User');
const Service = require('../models/Service');

const router = express.Router();

// Admin auth middleware (keep this as is)
const adminAuth = async (req, res, next) => {
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
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token' 
      });
    }

    if (user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Admin access required' 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Admin auth middleware error:', error);
    res.status(401).json({ 
      success: false, 
      message: 'Token invalid' 
    });
  }
};

// Get available workers (users with role 'user')
router.get('/available-workers', adminAuth, async (req, res) => {
  try {
    console.log('Fetching available workers...');
    
    const workers = await User.find({ 
      role: 'user',
      isActive: true 
    }).select('username email contactNumber');

    console.log(`Found ${workers.length} available workers`);

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

// Get all users (for admin)
router.get('/users', adminAuth, async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    
    res.json({
      success: true,
      users
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching users'
    });
  }
});

// Create new user (admin only) - UPDATED WITH CONTACT NUMBER
router.post('/users', adminAuth, async (req, res) => {
  try {
    const { username, email, password, contactNumber, role = 'user', businessName, ownerLevel } = req.body;

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

    // Validate owner level for owners
    if (role === 'owner' && !ownerLevel) {
      return res.status(400).json({ 
        success: false, 
        message: 'Owner level is required for owner registration' 
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
      role
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

    if (role === 'owner') {
      userData.ownerLevel = ownerLevel;
      userData.subscriptionStatus = 'active';
      userData.subscriptionExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days trial
    }

    // Create user
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
        ownerLevel: user.ownerLevel,
        subscriptionStatus: user.subscriptionStatus,
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

// Update user (admin only) - UPDATED WITH CONTACT NUMBER
router.put('/users/:id', adminAuth, async (req, res) => {
  try {
    const { username, email, contactNumber, role, businessName, ownerLevel } = req.body;

    // Validation
    if (!username || !role) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username and role are required' 
      });
    }

    // Check if email or username already exists (excluding current user)
    const searchConditions = [{ username }];
    if (email && email.trim()) {
      searchConditions.push({ email: email.trim().toLowerCase() });
    }
    const existingUser = await User.findOne({
      $and: [
        { _id: { $ne: req.params.id } },
        { $or: searchConditions }
      ]
    });

    if (existingUser) {
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

    // Handle owner-specific fields
    if (role === 'owner') {
      if (!ownerLevel) {
        return res.status(400).json({ 
          success: false, 
          message: 'Owner level is required for owner role' 
        });
      }
      updateData.ownerLevel = ownerLevel;
      updateData.subscriptionStatus = 'active';
    } else {
      updateData.ownerLevel = undefined;
      updateData.subscriptionStatus = undefined;
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

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

// Get all services with user info (admin only)
router.get('/services', adminAuth, async (req, res) => {
  try {
    const { status, userId } = req.query;
    
    let filter = {};
    if (status && status !== 'all') {
      filter.status = status;
    }
    if (userId && userId !== 'all') {
      filter.createdBy = userId;
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
    console.error('Get services error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching services'
    });
  }
});

// Get dashboard statistics
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalAdmins = await User.countDocuments({ role: 'admin' });
    const totalWorkers = await User.countDocuments({ role: 'user' });
    const totalServices = await Service.countDocuments();
    
    const servicesByStatus = await Service.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const servicesByUser = await Service.aggregate([
      {
        $group: {
          _id: '$createdBy',
          count: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $project: {
          username: '$user.username',
          email: '$user.email',
          contactNumber: '$user.contactNumber',
          count: 1
        }
      },
      { $sort: { count: -1 } }
    ]);

    const assignedServices = await Service.countDocuments({ assignedTo: { $ne: null } });
    const unassignedServices = await Service.countDocuments({ assignedTo: null });

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalAdmins,
        totalWorkers,
        totalServices,
        servicesByStatus,
        servicesByUser,
        assignedServices,
        unassignedServices
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching statistics'
    });
  }
});

// Delete user (admin only)
router.delete('/users/:id', adminAuth, async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Prevent admin from deleting themselves
    if (userId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account'
      });
    }

    const user = await User.findByIdAndDelete(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

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
      message: 'Error deleting user'
    });
  }
});

// Delete service (admin only)
router.delete('/services/:id', adminAuth, async (req, res) => {
  try {
    console.log('=== ADMIN DELETE SERVICE REQUEST ===');
    console.log('Service ID:', req.params.id);
    console.log('Admin user:', {
      id: req.user._id,
      username: req.user.username,
      role: req.user.role
    });

    const service = await Service.findById(req.params.id);
    
    if (!service) {
      console.log('❌ Service not found');
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    console.log('Service to delete:', {
      businessName: service.businessName,
      serviceType: service.serviceType,
      createdBy: service.createdBy,
      imagesCount: service.images?.length || 0
    });

    // Delete images from Cloudinary first
    if (service.images && service.images.length > 0) {
      console.log(`Deleting ${service.images.length} images from Cloudinary...`);
      
      const cloudinary = require('../utils/cloudinary');
      
      for (const image of service.images) {
        if (image.public_id) {
          try {
            await cloudinary.uploader.destroy(image.public_id);
            console.log(`✅ Deleted image: ${image.public_id}`);
          } catch (cloudinaryError) {
            console.error(`❌ Failed to delete image from Cloudinary: ${image.public_id}`, cloudinaryError);
            // Continue with deletion even if Cloudinary fails
          }
        }
      }
    }

    // Delete the service from database
    await Service.findByIdAndDelete(req.params.id);
    
    console.log('✅ Service deleted successfully from database');

    res.json({
      success: true,
      message: 'Service deleted successfully'
    });

  } catch (error) {
    console.error('❌ Admin delete service error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting service: ' + error.message
    });
  }
});
// Delete individual service item from a multi-service order
router.delete('/services/:serviceId/items/:itemId', adminAuth, async (req, res) => {
  try {
    console.log('=== DELETE INDIVIDUAL SERVICE ITEM ===');
    console.log('Service ID:', req.params.serviceId);
    console.log('Service Item ID:', req.params.itemId);
    console.log('Admin user:', req.user.username);

    // Find the service
    const service = await Service.findById(req.params.serviceId);
    
    if (!service) {
      console.log('❌ Service not found');
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    console.log('Service found:', service.businessName);
    console.log('Total service items before:', service.services.length);

    // Find the specific service item
    const serviceItemIndex = service.services.findIndex(item => 
      item._id.toString() === req.params.itemId
    );

    if (serviceItemIndex === -1) {
      console.log('❌ Service item not found');
      return res.status(404).json({
        success: false,
        message: 'Service item not found'
      });
    }

    console.log('Service item to delete:', {
      type: service.services[serviceItemIndex].serviceType,
      quantity: service.services[serviceItemIndex].quantity,
      location: service.services[serviceItemIndex].location?.address
    });

    // Remove the specific service item
    service.services.splice(serviceItemIndex, 1);

    // Recalculate total quantity
    let totalQty = 0;
    service.services.forEach(item => {
      totalQty += item.quantity || 0;
    });
    service.totalQuantity = totalQty;

    // If no service items left, delete the entire service
    if (service.services.length === 0) {
      console.log('No service items left, deleting entire service...');
      
      // Delete images from Cloudinary
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
      console.log('✅ Entire service deleted');
      
      return res.json({
        success: true,
        message: 'Service item deleted. No items left, entire service deleted.'
      });
    }

    // Update single service fields from first remaining item
    if (service.services[0]) {
      service.serviceType = service.services[0].serviceType;
      service.customServiceType = service.services[0].customServiceType;
      service.quantity = service.services[0].quantity;
    }

    // Save the updated service
    await service.save();

    console.log('✅ Service item deleted successfully');
    console.log('Total service items after:', service.services.length);
    console.log('New total quantity:', service.totalQuantity);

    res.json({
      success: true,
      message: 'Service item deleted successfully',
      service: {
        _id: service._id,
        businessName: service.businessName,
        services: service.services,
        totalQuantity: service.totalQuantity,
        servicesCount: service.services.length
      }
    });

  } catch (error) {
    console.error('❌ Delete service item error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting service item: ' + error.message
    });
  }
});
module.exports = router;