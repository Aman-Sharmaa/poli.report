const express = require('express');
const router = express.Router();
const promiseVoteController = require('../controllers/promiseVoteController');
const authMiddleware = require('../middleware/auth');

// Public routes - works for both logged-in and anonymous users
router.post('/:slug/vote', async (req, res, next) => {
  // Apply auth middleware optionally
  if (req.headers.authorization) {
    return authMiddleware(req, res, next);
  }
  next();
}, promiseVoteController.voteOnPromise);

router.get('/:slug/votes', promiseVoteController.getPromiseVotes);

module.exports = router;

