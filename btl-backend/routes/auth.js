const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();

// Auth middleware
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'No token provided' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    
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

// Register endpoint - Mobile number based
router.post('/register', async (req, res) => {
  try {
    const { username, contactNumber, password, email, role = 'user', businessName, ownerLevel } = req.body;

    // Validate required fields
    if (!username || !contactNumber || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username, mobile number and password are required' 
      });
    }

    // Validate mobile number format
    const cleanContactNumber = contactNumber.toString().trim().replace(/[\s-]/g, '');
    const mobileRegex = /^[0-9]{10,15}$/;
    if (!mobileRegex.test(cleanContactNumber)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please enter a valid mobile number (10-15 digits)' 
      });
    }

    // Validate password length
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

    // Create user data object
    const userData = { 
      username: username.trim(), 
      contactNumber: cleanContactNumber, 
      password, 
      role
    };

    // Add optional email if provided and non-empty
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
      userData.email = email.trim().toLowerCase();
    }

    // Add business name for clients
    if (role === 'client') {
      userData.businessName = businessName;
    }

    // Add owner-specific fields
    if (role === 'owner') {
      userData.ownerLevel = ownerLevel;
      userData.subscriptionStatus = 'active';
      userData.subscriptionExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days trial
    }

    const user = new User(userData);
    await user.save();

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { 
      expiresIn: '7d' 
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        username: user.username,
        contactNumber: user.contactNumber,
        email: user.email || '',
        role: user.role,
        businessName: user.businessName || '',
        ownerLevel: user.ownerLevel || '',
        subscriptionStatus: user.subscriptionStatus || '',
        subscriptionExpiry: user.subscriptionExpiry || null,
        isActive: user.isActive
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    
    // Handle MongoDB validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }

    // Handle duplicate key error
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
      return res.status(400).json({
        success: false,
        message: 'User with this contact number already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error during registration'
    });
  }
});

// Login endpoint - Mobile number based
router.post('/login', async (req, res) => {
  try {
    const { contactNumber, password } = req.body;

    if (!contactNumber || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Mobile number and password are required' 
      });
    }

    // Validate mobile number format
    const mobileRegex = /^[0-9]{10,15}$/;
    if (!mobileRegex.test(contactNumber)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please enter a valid mobile number' 
      });
    }

    // Find user by contactNumber
    const user = await User.findOne({ contactNumber });
    
    if (!user) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid mobile number or password' 
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({ 
        success: false, 
        message: 'Your account has been deactivated' 
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid mobile number or password' 
      });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { 
      expiresIn: '7d' 
    });

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        username: user.username,
        contactNumber: user.contactNumber,
        email: user.email || '',
        role: user.role,
        businessName: user.businessName || '',
        ownerLevel: user.ownerLevel || '',
        subscriptionStatus: user.subscriptionStatus || '',
        subscriptionExpiry: user.subscriptionExpiry || null,
        isActive: user.isActive,
        formattedContactNumber: user.formattedContactNumber
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
});

router.get('/business-users', auth, async (req, res) => {
  try {
    console.log('=== FETCHING BUSINESS USERS FOR DROPDOWN ===');
    
    // If the logged-in user is an owner, only return their created businesses (and their own business if applicable)
    let query = { 
      businessName: { 
        $exists: true, 
        $ne: '', 
        $ne: null 
      },
      isActive: true
    };

    if (req.user && req.user.role === 'owner') {
      query.$or = [
        { createdBy: req.user._id },
        { _id: req.user._id }
      ];
    }

    const users = await User.find(query)
    .select('username email contactNumber businessName')
    .sort({ businessName: 1 });

    console.log(`✅ Found ${users.length} business users for role ${req.user ? req.user.role : 'unknown'}`);

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
    console.error('❌ Business users error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching business users: ' + error.message
    });
  }
});
// Get current user
router.get('/me', auth, async (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

// Admin only route
router.get('/admin-data', auth, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ 
      success: false, 
      message: 'Admin access required' 
    });
  }
  
  res.json({
    success: true,
    message: 'Welcome to admin panel!',
    user: req.user
  });
});

// Update user profile (mobile number can't be changed)
router.put('/profile', auth, async (req, res) => {
  try {
    const updates = req.body;
    const allowedUpdates = ['username', 'email', 'businessName'];
    const filteredUpdates = {};
    
    // Only allow certain fields to be updated
    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        filteredUpdates[key] = updates[key];
      }
    }

    // If trying to update email, validate it
    if (filteredUpdates.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(filteredUpdates.email)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Please enter a valid email address' 
        });
      }
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      filteredUpdates,
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user
    });

  } catch (error) {
    console.error('Profile update error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Username or email already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error during profile update'
    });
  }
});

module.exports = router;