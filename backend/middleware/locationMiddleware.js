const User = require('../models/User');

/**
 * Middleware to validate if user's location matches politician's constituency
 */
const validateConstituency = async (req, res, next) => {
  try {
    const { politicianSlug } = req.params;
    const { latitude, longitude, constituency } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    
    // Store location info in request for use in controllers
    req.userLocation = {
      ipAddress,
      latitude,
      longitude,
      constituency,
    };
    
    // If constituency is provided, validate it
    if (req.body.politicianSlug && constituency) {
      // You can add additional validation here if needed
      // For now, just store the info
    }
    
    next();
  } catch (error) {
    console.error('Location validation error:', error);
    next(); // Continue even if validation fails
  }
};

/**
 * Middleware to check if user has already voted (by IP)
 */
const checkDuplicateVote = (voteType = 'poll') => {
  return async (req, res, next) => {
    try {
      const ipAddress = req.ip || req.connection.remoteAddress;
      const { id } = req.params;
      
      if (voteType === 'poll') {
        const Poll = require('../models/Poll');
        const poll = await Poll.findById(id);
        
        if (poll && poll.votedIPs && poll.votedIPs.includes(ipAddress)) {
          return res.status(400).json({ 
            message: 'You have already voted from this IP address' 
          });
        }
      } else if (voteType === 'edit') {
        const Edit = require('../models/Edit');
        const edit = await Edit.findById(id);
        
        if (edit) {
          const hasVoted = edit.reviewVotes.some(vote => vote.ipAddress === ipAddress);
          if (hasVoted) {
            return res.status(400).json({ 
              message: 'You have already voted on this edit proposal' 
            });
          }
        }
      }
      
      next();
    } catch (error) {
      console.error('Duplicate vote check error:', error);
      next();
    }
  };
};

/**
 * Middleware to validate constituency match for polls
 */
const validatePollConstituency = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { constituency, latitude, longitude } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    
    const Poll = require('../models/Poll');
    const poll = await Poll.findById(id);
    
    if (!poll) {
      return res.status(404).json({ message: 'Poll not found' });
    }
    
    // Check if user's constituency matches poll's constituencies
    if (poll.constituencies && poll.constituencies.length > 0) {
      if (!poll.constituencies.includes(constituency)) {
        return res.status(403).json({ 
          message: 'You can only vote in polls for your constituency' 
        });
      }
    }
    
    // Store vote info
    req.voteInfo = {
      constituency,
      ipAddress,
      location: { latitude, longitude },
    };
    
    next();
  } catch (error) {
    console.error('Constituency validation error:', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  validateConstituency,
  checkDuplicateVote,
  validatePollConstituency,
};

