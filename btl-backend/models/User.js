const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  contactNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 10,
    maxlength: 15,
    validate: {
      validator: function(v) {
        return /^[0-9]{10,15}$/.test(v);
      },
      message: 'Please enter a valid mobile number (10-15 digits)'
    }
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    sparse: true,
    validate: {
      validator: function(v) {
        if (!v) return true; // Email is optional
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: 'Please enter a valid email address'
    }
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    enum: ['user', 'admin', 'client', 'owner'],
    default: 'user'
  },
  businessName: {
    type: String,
    trim: true,
    maxlength: 100,
    required: function() {
      return this.role === 'client';
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  ownerLevel: {
    type: String,
    enum: ['standard', 'premium', 'enterprise', ''],
    default: '',
    required: function() {
      return this.role === 'owner';
    }
  },
  subscriptionStatus: {
    type: String,
    enum: ['active', 'inactive', 'expired', ''],
    default: ''
  },
  subscriptionExpiry: {
    type: Date
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Virtual for checking if user is owner
userSchema.virtual('isOwner').get(function() {
  return this.role === 'owner';
});

// Virtual for displaying phone number with country code
userSchema.virtual('formattedContactNumber').get(function() {
  if (!this.contactNumber) return '';
  
  // Add country code if not present
  if (!this.contactNumber.startsWith('+')) {
    return `+${this.contactNumber}`;
  }
  return this.contactNumber;
});

// Index for better query performance
userSchema.index({ contactNumber: 1 });
userSchema.index({ username: 1 });
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ subscriptionStatus: 1 });

module.exports = mongoose.model('User', userSchema);