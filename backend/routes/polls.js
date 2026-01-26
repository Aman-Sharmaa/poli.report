const express = require('express');
const router = express.Router();
const pollController = require('../controllers/pollController');
const authMiddleware = require('../middleware/auth');

// Public routes
router.get('/:slug', pollController.getBySlug);
router.get('/:slug/stats', pollController.getStats);
router.post('/:id/response', async (req, res, next) => {
  // Apply auth middleware optionally - passes even if not logged in
  if (req.headers.authorization) {
    return authMiddleware(req, res, next);
  }
  next();
}, pollController.submitResponse); // Anonymous submissions allowed, but can include name if logged in

// Protected routes (require authentication for create/delete)
router.post('/', authMiddleware, pollController.create);
router.get('/user/my-polls', authMiddleware, pollController.getByUser);
router.delete('/:id', authMiddleware, pollController.delete);

module.exports = router;

