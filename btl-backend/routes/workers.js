const express = require('express');
const router = express.Router();
const Worker = require('../models/Worker');

// Get all workers
router.get('/', async (req, res) => {
  try {
    const workers = await Worker.find().sort({ createdAt: -1 });
    res.json(workers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get single worker
router.get('/:id', async (req, res) => {
  try {
    const worker = await Worker.findById(req.params.id);
    if (!worker) {
      return res.status(404).json({ message: 'Worker not found' });
    }
    res.json(worker);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create new worker
router.post('/', async (req, res) => {
  try {
    const workerData = req.body;
    
    // If service type is mobile-vans, validate vehicle details
    if (workerData.serviceType === 'mobile-vans' && 
        (!workerData.vehicleDetails || !workerData.vehicleDetails.vehicleNumber)) {
      return res.status(400).json({ 
        message: 'Vehicle number is required for mobile-vans service' 
      });
    }

    const worker = new Worker(workerData);
    const newWorker = await worker.save();
    res.status(201).json(newWorker);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update worker
router.put('/:id', async (req, res) => {
  try {
    const worker = await Worker.findById(req.params.id);
    if (!worker) {
      return res.status(404).json({ message: 'Worker not found' });
    }

    Object.assign(worker, req.body);
    const updatedWorker = await worker.save();
    res.json(updatedWorker);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete worker
router.delete('/:id', async (req, res) => {
  try {
    const worker = await Worker.findById(req.params.id);
    if (!worker) {
      return res.status(404).json({ message: 'Worker not found' });
    }
    
    await worker.deleteOne();
    res.json({ message: 'Worker deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;