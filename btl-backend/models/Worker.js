const mongoose = require('mongoose');

const workerSchema = new mongoose.Schema({
  workerName: {
    type: String,
    required: true
  },
  contactNumber: {
    type: String,
    required: true
  },
  aadharNumber: {
    type: String,
    required: true,
    unique: true
  },
  email: {
    type: String,
    lowercase: true
  },
  address: {
    type: String,
    required: true
  },
  serviceType: {
    type: String,
    required: true,
    enum: [
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
      'other'
    ]
  },
  vehicleDetails: {
    vehicleNumber: String,
    supplierName: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field on save
workerSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Worker', workerSchema);