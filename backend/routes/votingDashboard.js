const express = require('express');
const router = express.Router();
const votingDashboardController = require('../controllers/votingDashboardController');
const authMiddleware = require('../middleware/auth');

// Public route - works for both logged-in and anonymous users
router.get('/:slug/all-items', async (req, res, next) => {
  // Apply auth middleware optionally
  if (req.headers.authorization) {
    return authMiddleware(req, res, next);
  }
  next();
}, votingDashboardController.getAllVotableItems);

module.exports = router;

