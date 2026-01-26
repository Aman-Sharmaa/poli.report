const express = require('express');
const router = express.Router();
const likeController = require('../controllers/likeController');
const authMiddleware = require('../middleware/auth');

// Public routes - works for both logged-in and anonymous users
router.post('/:slug/toggle', async (req, res, next) => {
  // Apply auth middleware optionally - passes even if not logged in
  if (req.headers.authorization) {
    return authMiddleware(req, res, next);
  }
  next();
}, likeController.toggleLike);

router.get('/:slug/status', likeController.getLikeStatus);

module.exports = router;

