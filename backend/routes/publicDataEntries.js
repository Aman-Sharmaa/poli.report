const express = require('express');
const router = express.Router();
const publicDataEntryController = require('../controllers/publicDataEntryController');
const authMiddleware = require('../middleware/auth');

// Public routes
router.get('/politician/:slug', publicDataEntryController.getByPoliticianSlug);
router.get('/:id', publicDataEntryController.getById);

// Protected routes (require authentication)
router.post('/', authMiddleware, publicDataEntryController.create);
router.put('/:id', authMiddleware, publicDataEntryController.update);
router.delete('/:id', authMiddleware, publicDataEntryController.delete);
router.post('/:id/vote', authMiddleware, publicDataEntryController.vote);

module.exports = router;

