const express = require('express');
const router = express.Router();
const articleController = require('../controllers/articleController');
const authMiddleware = require('../middleware/auth');

// Public routes
router.get('/:slug', articleController.getBySlug);

// Protected routes (require authentication for create/update/delete)
router.post('/:slug', authMiddleware, articleController.createOrUpdate);
router.put('/:id', authMiddleware, articleController.updateById);
router.delete('/:id', authMiddleware, articleController.delete);

// Item management routes
router.post('/:slug/item', authMiddleware, articleController.addItem);
router.post('/:id/item/:itemIndex/vote', articleController.voteOnItem); // Public voting

// Version history and proof verification
router.get('/:id/versions', articleController.getVersions); // Public - anyone can view version history
router.post('/:id/verify-proof', authMiddleware, articleController.addVerifiedProof); // Requires auth
router.post('/:id/invalidate-proof', authMiddleware, articleController.invalidateProof); // Requires auth

module.exports = router;

