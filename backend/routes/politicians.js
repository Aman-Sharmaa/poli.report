const express = require('express');
const router = express.Router();
const politicianController = require('../controllers/politicianController');
const authMiddleware = require('../middleware/auth');

// Public routes
router.get('/', politicianController.getAll);
router.get('/search/:query', politicianController.search);
router.get('/stats/summary', politicianController.getStats);
router.post('/bulk-create', politicianController.bulkCreate); // Public bulk create endpoint (must be before /:slug)
router.get('/:slug', politicianController.getBySlug);

// Protected routes (require authentication)
router.post('/', authMiddleware, politicianController.create);
router.put('/:slug', authMiddleware, politicianController.update);
router.delete('/:slug', authMiddleware, politicianController.delete);

module.exports = router;

