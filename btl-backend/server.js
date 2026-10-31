const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// MongoDB Connection (pooled for high multi-user concurrency)
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mern-login', {
  maxPoolSize: 50,
  minPoolSize: 5,
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000
})
  .then(async () => {
    console.log('MongoDB connected successfully');
    try {
      const usersCol = mongoose.connection.collection('users');
      const indexes = await usersCol.indexes();
      const emailIndex = indexes.find(idx => idx.name === 'email_1' || (idx.key && idx.key.email));
      if (emailIndex && !emailIndex.sparse) {
        console.log('Migrating email_1 index to sparse: true...');
        await usersCol.dropIndex(emailIndex.name);
        await usersCol.createIndex({ email: 1 }, { unique: true, sparse: true });
        console.log('email_1 index successfully migrated to sparse: true');
      }
    } catch (idxErr) {
      console.warn('Email index check note:', idxErr.message);
    }
  })
  .catch(err => console.log('MongoDB connection error:', err.message));

// Import routes
const authRoutes = require('./routes/auth');
const serviceRoutes = require('./routes/services');
const workerRoutes = require('./routes/workers');

// Use routes
app.use('/api/owner', require('./routes/owner'));
app.use('/api/auth', authRoutes);
app.use('/api/services', serviceRoutes);
// Add after other routes

app.use('/api/workers', workerRoutes);
app.use('/api/admin', require('./routes/admin'));
app.use('/api/locations', require('./routes/locations'));
// ============ GEOCODING ROUTES ============
const geocodeCache = new Map();
const GEOCODE_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Get address from GPS coordinates
app.get('/api/geocode/reverse', async (req, res) => {
  try {
    const { lat, lng } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    const cacheKey = `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`;
    const cached = geocodeCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < GEOCODE_CACHE_TTL) {
      return res.json({
        success: true,
        data: cached.data
      });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    // Call OpenStreetMap API from server (no CORS issues)
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'BTLManager/1.0'
        },
        signal: controller.signal
      }
    );
    clearTimeout(timeoutId);

    const data = await response.json();
    if (geocodeCache.size > 1000) geocodeCache.clear();
    geocodeCache.set(cacheKey, { data, ts: Date.now() });
    
    res.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('Geocoding error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get coordinates from address (for map)
app.get('/api/geocode/search', async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q) {
      return res.status(400).json({
        success: false,
        message: 'Address is required'
      });
    }

    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`,
      {
        headers: {
          'User-Agent': 'BTLManager/1.0'
        }
      }
    );

    const data = await response.json();
    
    res.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});
// Default route
app.get('/', (req, res) => {
  res.json({ message: 'MERN Login API is running!' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    success: false, 
    message: 'Route not found' 
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false, 
    message: 'Something went wrong!' 
  });
});

const PORT = process.env.PORT || 5002;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});