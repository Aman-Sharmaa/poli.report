const express = require('express');
const router = express.Router();
const articleVoteController = require('../controllers/articleVoteController');
const authMiddleware = require('../middleware/auth');

// Public routes - works for both logged-in and anonymous users
router.post('/:slug/vote', async (req, res, next) => {
  // Apply auth middleware optionally
  if (req.headers.authorization) {
    return authMiddleware(req, res, next);
  }
  next();
}, articleVoteController.voteOnArticle);

router.post('/:slug/development-vote', async (req, res, next) => {
  if (req.headers.authorization) {
    return authMiddleware(req, res, next);
  }
  next();
}, articleVoteController.voteOnDevelopment);

router.get('/counts', articleVoteController.getVoteCounts);

router.get('/:slug/timeline', articleVoteController.getCredibilityTimeline);

module.exports = router;

