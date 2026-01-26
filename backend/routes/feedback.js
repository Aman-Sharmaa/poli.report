const express = require('express');
const router = express.Router();
const feedbackController = require('../controllers/feedbackController');
const authMiddleware = require('../middleware/auth');

// Public routes (anonymous feedback allowed)
router.get('/:slug', feedbackController.getBySlug);

// POST with optional auth - if user is logged in, info is captured; if not, anonymous is allowed
router.post('/', async (req, res, next) => {
  // Apply auth middleware optionally - passes even if not logged in
  if (req.headers.authorization) {
    return authMiddleware(req, res, next);
  }
  next();
}, feedbackController.submit);

// Protected routes
router.post('/:id/helpful', authMiddleware, feedbackController.markHelpful); // Mark feedback as helpful
router.delete('/:id', authMiddleware, feedbackController.delete);

module.exports = router;

