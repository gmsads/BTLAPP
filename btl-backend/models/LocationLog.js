const mongoose = require('mongoose');

const locationLogSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  coordinates: {
    lat: {
      type: Number,
      required: true
    },
    lng: {
      type: Number,
      required: true
    }
  },
  accuracy: {
    type: Number,
    default: null
  },
  locationName: {
    type: String,
    required: true,
    trim: true
  },
  addressDetails: {
    road: { type: String, default: '' },
    suburb: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    postcode: { type: String, default: '' },
    country: { type: String, default: '' }
  },
  source: {
    type: String,
    enum: ['auto_30min', 'manual_ping', 'app_start', 'image_capture'],
    default: 'auto_30min'
  },
  recordedAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

locationLogSchema.index({ user: 1, recordedAt: -1 });

module.exports = mongoose.model('LocationLog', locationLogSchema);
