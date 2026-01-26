const Poll = require('../models/Poll');

const pollController = {
  // Get polls for a politician
  getBySlug: async (req, res) => {
    try {
      const polls = await Poll.find({ politicianSlug: req.params.slug });
      res.json(polls);
    } catch (error) {
      console.error('Get polls error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Get polls created by a user
  getByUser: async (req, res) => {
    try {
      const polls = await Poll.find({ createdBy: req.user.userId })
        .sort({ createdAt: -1 });
      res.json(polls);
    } catch (error) {
      console.error('Get polls by user error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Get polls with statistics
  getStats: async (req, res) => {
    try {
      const polls = await Poll.find({ politicianSlug: req.params.slug });
      
      const pollsWithStats = polls.map(poll => {
        const optionCounts = {};
        const optionWeights = {}; // Weighted counts
        poll.options.forEach(opt => {
          optionCounts[opt] = 0;
          optionWeights[opt] = 0;
        });
        
        poll.responses.forEach(response => {
          const weight = response.voteWeight || 1.0;
          optionCounts[response.option] = (optionCounts[response.option] || 0) + 1;
          optionWeights[response.option] = (optionWeights[response.option] || 0) + weight;
        });
        
        return {
          _id: poll._id,
          question: poll.question,
          options: poll.options,
          optionCounts, // Raw vote counts
          optionWeights, // Credibility-weighted vote counts
          totalResponses: poll.responses.length,
          totalWeight: poll.responses.reduce((sum, r) => sum + (r.voteWeight || 1.0), 0),
        };
      });
      
      res.json(pollsWithStats);
    } catch (error) {
      console.error('Get poll stats error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Create poll
  create: async (req, res) => {
    try {
      const User = require('../models/User');
      const user = await User.findById(req.user.userId);
      
      const pollData = {
        ...req.body,
        createdBy: req.user.userId,
        createdByName: user.email.split('@')[0] // Use username part of email
      };
      
      const poll = new Poll(pollData);
      await poll.save();
      res.status(201).json(poll);
    } catch (error) {
      console.error('Create poll error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Submit poll response
  submitResponse: async (req, res) => {
    try {
      const Politician = require('../models/Politician');
      const User = require('../models/User');
      
      const { constituency, option, rating, latitude, longitude, anonymous = true } = req.body;
      const ipAddress = req.ip || req.connection.remoteAddress;
      
      const poll = await Poll.findById(req.params.id);
      if (!poll) {
        return res.status(404).json({ message: 'Poll not found' });
      }
      
      if (!constituency) {
        return res.status(400).json({ message: 'Constituency is required' });
      }
      
      // Validate based on poll type
      if (poll.pollType === 'rating') {
        if (rating === undefined || rating === null) {
          return res.status(400).json({ message: 'Rating is required for rating poll' });
        }
        if (rating < poll.ratingRange.min || rating > poll.ratingRange.max) {
          return res.status(400).json({ 
            message: `Rating must be between ${poll.ratingRange.min} and ${poll.ratingRange.max}` 
          });
        }
      } else {
        // multiple-choice (default)
        if (!option) {
          return res.status(400).json({ message: 'Option is required for multiple-choice poll' });
        }
        if (!poll.options.includes(option)) {
          return res.status(400).json({ message: 'Invalid option for this poll' });
        }
      }
      
      // Get user info if logged in
      let userId = null;
      let userName = null;
      if (req.user?.userId) {
        const user = await User.findById(req.user.userId);
        if (user) {
          userId = user._id;
          userName = user.email.split('@')[0];
        }
      }
      
      // STRICT ENFORCEMENT: User must match poll's constituencies AND politician's location
      if (poll.constituencies && poll.constituencies.length > 0) {
        if (!poll.constituencies.includes(constituency)) {
          return res.status(403).json({ 
            message: 'You can only vote in polls for your constituency',
            requiredConstituencies: poll.constituencies,
            yourConstituency: constituency
          });
        }
      }
      
      // Additional check: Get the politician and verify user's constituency matches politician's location
      const politician = await Politician.findOne({ slug: poll.politicianSlug });
      if (politician && politician.location && politician.location.constituency) {
        // Check if politician has specific constituencies defined
        if (politician.constituencies && politician.constituencies.length > 0) {
          if (!politician.constituencies.includes(constituency)) {
            return res.status(403).json({ 
              message: 'You can only vote in polls for politicians from your constituency. The politician you are voting for is not from your constituency.',
              politicianConstituencies: politician.constituencies,
              yourConstituency: constituency
            });
          }
        }
      }
      
      // Credibility-weighted voting: vote weight = credibilityScore / 100
      let voteWeight = 1.0; // Default for anonymous voters
      
      if (req.user?.userId) {
        const user = await User.findById(req.user.userId);
        if (user) {
          voteWeight = user.credibilityScore / 100;
          // Minimum weight of 0.1 to ensure low-credibility users can still contribute
          voteWeight = Math.max(0.1, voteWeight);
        }
      }
      
      // Add response with device tracking
      poll.responses.push({
        constituency,
        option, // For multiple-choice
        rating, // For rating type
        anonymous,
        userId,
        userName: anonymous ? undefined : userName, // Only include name if not anonymous
        voteWeight,
        deviceFingerprint,
        ipAddress,
        userAgent: locationInfo.userAgent,
        location: locationInfo.latitude && locationInfo.longitude ? {
          latitude: locationInfo.latitude,
          longitude: locationInfo.longitude,
          constituency: locationInfo.constituency,
          state: locationInfo.state,
          city: locationInfo.city,
        } : { latitude, longitude },
        createdAt: new Date(),
      });
      
      // Update politician credibility based on poll results
      // Positive polls (rating >= 7 or positive options) increase credibility slightly
      if (politician && rating && rating >= 7) {
        politician.credibilityScore = Math.min(100, (politician.credibilityScore || 0) + 0.05);
        await politician.save();
      }
      
      // Update user's feedback contributions if logged in
      if (req.user?.userId) {
        try {
          const user = await User.findById(req.user.userId);
          if (user) {
            user.contributions.feedbacksGiven += 1;
            await user.addCredibility(1, 'Participated in poll');
            await user.save();
          }
        } catch (userError) {
          console.error('Error updating user credibility for poll:', userError);
        }
      }
      
      await poll.save();
      res.json(poll);
    } catch (error) {
      console.error('Submit poll response error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Delete poll
  delete: async (req, res) => {
    try {
      const poll = await Poll.findByIdAndDelete(req.params.id);
      if (!poll) {
        return res.status(404).json({ message: 'Poll not found' });
      }
      res.json({ message: 'Poll deleted successfully' });
    } catch (error) {
      console.error('Delete poll error:', error);
      res.status(500).json({ message: error.message });
    }
  },
};

module.exports = pollController;

