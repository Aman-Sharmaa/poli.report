const express = require('express');
const router = express.Router();
const editController = require('../controllers/editController');
const authMiddleware = require('../middleware/auth');

// Public routes (anonymous edits allowed)
router.post('/', async (req, res, next) => {
  // Apply auth middleware optionally - passes even if not logged in
  if (req.headers.authorization) {
    return authMiddleware(req, res, next);
  }
  next();
}, editController.submit);
router.post('/:id/vote', editController.voteOnEdit); // Allow anonymous voting
router.get('/person/:slug', editController.getBySlug); // Get edits for a specific person

// Protected routes (require authentication for review and admin actions)
router.get('/user/my-edits', authMiddleware, editController.getByUser);
router.get('/pending', authMiddleware, editController.getPending);
router.post('/:id/approve', authMiddleware, editController.approve);
router.post('/:id/reject', authMiddleware, editController.reject);

module.exports = router;

