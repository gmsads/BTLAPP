const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  businessName: {
    type: String,
    required: true,
    trim: true
  },
  ownerName: {
    type: String,
    required: true,
    trim: true
  },
  
  // SINGLE SERVICE (for backward compatibility)
  serviceType: {
    type: String,
    enum: ['mobile-vans','look-walkers','try-cycle','auto-booming','auto-stickers','auto-tops','rounds', 'digital-wall-poster','pole-boards', 'no-parking-boards','other']
  },
  customServiceType: {
    type: String,
    trim: true
  },
  quantity: {
    type: Number,
    min: 1
  },
  
  // MULTIPLE SERVICES (UPDATED with location per service)
  services: [{
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      auto: true
    },
    serviceType: {
      type: String,
      required: true,
      enum: ['mobile-vans','look-walkers','try-cycle','auto-booming','auto-stickers','auto-tops','rounds', 'digital-wall-poster','pole-boards', 'no-parking-boards','other']
    },
    customServiceType: {
      type: String,
      trim: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    // Location specific to this service item
    location: {
      type: {
        type: String,
        enum: ['automatic', 'manual'],
        default: 'manual'
      },
      coordinates: {
        lat: Number,
        lng: Number
      },
      address: {
        type: String,
        trim: true,
        // Only required if type is 'manual'
        validate: {
          validator: function(value) {
            if (this.type === 'manual') {
              return value && value.trim().length > 0;
            }
            return true;
          },
          message: 'Address is required for manual location'
        }
      }
    },
    notes: {
      type: String,
      trim: true
    },
    status: {
      type: String,
      enum: ['pending', 'in-progress', 'completed'],
      default: 'pending'
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    images: [{
      url: String,
      caption: String,
      uploadedAt: { type: Date, default: Date.now }
    }]
  }],
  
  // TOTAL QUANTITY (sum of all services)
  totalQuantity: {
    type: Number,
    default: 0,
    min: 0
  },
  
  description: {
    type: String,
    default: ''
  },
  contactNumber: {
    type: String,
    required: true,
    trim: true
  },
  
  // PRIMARY LOCATION (for the entire order)
  primaryLocation: {
    type: {
      type: String,
      enum: ['automatic', 'manual'],
      default: 'manual'
    },
    coordinates: {
      lat: Number,
      lng: Number
    },
    address: {
      type: String,
      trim: true
    }
  },
  
  // ADDITIONAL LOCATIONS (for the entire order)
  additionalLocations: [{
    type: {
      type: String,
      enum: ['automatic', 'manual'],
      default: 'manual'
    },
    coordinates: {
      lat: Number,
      lng: Number
    },
    address: {
      type: String,
      trim: true
    }
  }],
  
  // SERVICE ORDER STATUS
  status: {
    type: String,
    enum: ['pending', 'active', 'completed'],
    default: 'pending'
  },
  
  // GLOBAL IMAGES (for the entire order)
  images: [{
    url: {
      type: String,
      required: true
    },
    public_id: String,
    caption: {
      type: String,
      default: ''
    },
    takenAt: { 
      type: Date, 
      default: Date.now 
    },
    originalName: String,
    source: {
      type: String,
      enum: ['camera', 'gallery', 'folder', 'bulk', 'upload'],
      default: 'upload'
    },
    latitude: Number,
    longitude: Number,
    locationAddress: String,
    location: {
      lat: Number,
      lng: Number,
      address: String
    },
    size: Number,
    mimetype: String,
    uploadedBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User' 
    },
    uploadedAt: { 
      type: Date, 
      default: Date.now 
    },
    // For tracking duplicates
    fingerprint: Number,
    // For tracking service items
    itemId: mongoose.Schema.Types.ObjectId,
    serviceIndex: Number,
    serviceType: String
  }],
  
  // METER READINGS - Image is OPTIONAL
  meterReadings: [{
    date: {
      type: Date,
      required: true,
      default: Date.now
    },
    dayNumber: {
      type: Number,
      required: true,
      min: 1
    },
    startReading: {
      type: Number,
      required: true,
      min: 0
    },
    endReading: {
      type: Number,
      required: true,
      min: 0
    },
    unit: {
      type: String,
      default: 'km'
    },
    location: {
      type: {
        type: String,
        enum: ['automatic', 'manual'],
        default: 'automatic'
      },
      coordinates: {
        lat: Number,
        lng: Number
      },
      address: String
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    // Image is now OPTIONAL - not required
    image: {
      url: String,
      public_id: String
    }
  }],
  
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  startDate: {
    type: Date,
    required: true
  },
  
  endDate: {
    type: Date,
    default: null
  },
  
  completionDate: {
    type: Date,
    default: null
  },
  
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
  
}, {
  timestamps: true
});

// Middleware to handle backward compatibility and calculate totalQuantity
serviceSchema.pre('save', function(next) {
  // Validate end date
  if (this.endDate && this.startDate && this.endDate <= this.startDate) {
    return next(new Error('End date must be after start date'));
  }
  
  // Calculate total quantity
  let totalQty = 0;
  
  if (this.services && this.services.length > 0) {
    // New format: multiple services
    this.services.forEach(service => {
      totalQty += service.quantity || 0;
    });
    
    // Set single service fields from first service for backward compatibility
    if (this.services[0]) {
      this.serviceType = this.services[0].serviceType;
      this.customServiceType = this.services[0].customServiceType;
      this.quantity = this.services[0].quantity;
    }
  } else if (this.quantity) {
    // Old format: single service
    totalQty = this.quantity;
    
    // Create services array from single service with primary location
    this.services = [{
      serviceType: this.serviceType,
      customServiceType: this.customServiceType,
      quantity: this.quantity,
      location: this.primaryLocation || { type: 'manual', address: 'Not specified' },
      status: this.status || 'pending'
    }];
  }
  
  // Set total quantity
  this.totalQuantity = totalQty;
  
  // Validate that we have at least one service
  if (!this.services || this.services.length === 0) {
    return next(new Error('At least one service is required'));
  }
  
  // Set primary location from first service if not set
  if (!this.primaryLocation && this.services[0] && this.services[0].location) {
    this.primaryLocation = this.services[0].location;
  }
  
  next();
});

// Virtual for checking if any service requires end date
serviceSchema.virtual('requiresEndDate').get(function() {
  const typesRequiringEndDate = ['mobile-vans', 'look-walkers', 'try-cycle', 'auto-booming', 'auto-stickers', 'auto-tops', 'rounds', 'digital-wall-poster', 'other'];
  
  if (this.services && this.services.length > 0) {
    return this.services.some(service => 
      typesRequiringEndDate.includes(service.serviceType)
    );
  }
  
  // Backward compatibility check
  return typesRequiringEndDate.includes(this.serviceType);
});

// Method to get service summary with locations
serviceSchema.methods.getServiceSummary = function() {
  if (this.services && this.services.length > 0) {
    return this.services.map(service => 
      `${service.serviceType === 'other' ? service.customServiceType : service.serviceType}: ${service.quantity} units at ${service.location?.address || 'No location'}`
    ).join(' | ');
  }
  
  // Backward compatibility
  return `${this.serviceType === 'other' ? this.customServiceType : this.serviceType}: ${this.quantity} units`;
};

// Method to check overall service completion
serviceSchema.methods.isFullyCompleted = function() {
  if (!this.services || this.services.length === 0) return false;
  
  return this.services.every(service => service.status === 'completed');
};

// Method to get meter readings summary
serviceSchema.methods.getMeterReadingsSummary = function() {
  if (!this.meterReadings || this.meterReadings.length === 0) {
    return 'No meter readings recorded';
  }
  
  const totalDistance = this.meterReadings.reduce((sum, reading) => {
    return sum + (reading.endReading - reading.startReading);
  }, 0);
  
  return `${this.meterReadings.length} readings, ${totalDistance.toFixed(2)} km total`;
};

// Static method to find services assigned to a worker
serviceSchema.statics.findAssignedToWorker = function(workerId) {
  return this.find({
    $or: [
      { assignedTo: workerId },
      { 'services.assignedTo': workerId }
    ]
  }).populate('createdBy', 'username email')
    .populate('assignedTo', 'username email contactNumber')
    .populate('services.assignedTo', 'username email contactNumber');
};

module.exports = mongoose.model('Service', serviceSchema);