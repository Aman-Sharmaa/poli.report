const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');
const { validateRegister } = require('../middleware/validation');

// Public routes
router.post('/register', validateRegister, authController.register);
router.post('/login', authController.login);

// Protected routes
router.get('/me', authMiddleware, authController.me);
router.get('/activity', authMiddleware, authController.getActivity);
router.post('/increase-credibility', authMiddleware, authController.increaseCredibility);
router.put('/update-profile', authMiddleware, authController.updateProfile);

// Public routes (for transparency)
router.get('/user/:identifier', authController.getPublicProfile); // Public user profile (by username or userId)

module.exports = router;

