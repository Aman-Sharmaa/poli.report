const Feedback = require('../models/Feedback');

const feedbackController = {
  // Get feedback for a politician
  getBySlug: async (req, res) => {
    try {
      const feedback = await Feedback.find({ politicianSlug: req.params.slug })
        .sort({ createdAt: -1 });
      res.json(feedback);
    } catch (error) {
      console.error('Get feedback error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Submit feedback
  submit: async (req, res) => {
    try {
      const { politicianSlug, comment, rating, reference, anonymous } = req.body;
      const User = require('../models/User');
      const ipAddress = req.ip || req.connection.remoteAddress;
      
      if (!politicianSlug) {
        return res.status(400).json({ message: 'Politician slug is required' });
      }

      const { generateDeviceFingerprint, getLocationInfo } = require('../utils/tracking');
      const locationInfo = getLocationInfo(req);
      const deviceFingerprint = generateDeviceFingerprint(req);
      
      // Check for duplicate feedback from same device (prevent spam)
      const existingFeedback = await Feedback.findOne({
        politicianSlug,
        deviceFingerprint,
        ipAddress: locationInfo.ipAddress,
        createdAt: {
          $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Within last 24 hours
        }
      });
      
      if (existingFeedback) {
        return res.status(400).json({ 
          message: 'You have already submitted feedback for this politician recently. Please wait 24 hours before submitting again.' 
        });
      }
      
      // Opinions are ALWAYS anonymous - only track userId for contribution counting, never display
      let userId = null;
      if (req.user?.userId) {
        const user = await User.findById(req.user.userId);
        if (user) {
          userId = user._id;
          // Never store userName - opinions are always anonymous
        }
      }

      const feedback = new Feedback({
        politicianSlug,
        comment,
        rating,
        reference,
        anonymous: true, // Always anonymous - no option to show name
        userId, // Stored for contribution tracking only, not displayed
        // userName is never set - always anonymous
        deviceFingerprint,
        ipAddress: locationInfo.ipAddress,
        location: locationInfo.latitude && locationInfo.longitude ? {
          latitude: locationInfo.latitude,
          longitude: locationInfo.longitude,
        } : undefined,
        createdAt: new Date(),
      });
      
      await feedback.save();
      
      // Update politician credibility based on feedback (averaged with other feedbacks)
      const Politician = require('../models/Politician');
      const politician = await Politician.findOne({ slug: politicianSlug });
      if (politician) {
        // Get average rating from all feedbacks
        const allFeedbacks = await Feedback.find({ politicianSlug });
        const avgRating = allFeedbacks.reduce((sum, fb) => sum + (fb.rating || 0), 0) / allFeedbacks.length;
        
        // Convert 1-5 rating to credibility impact - REDUCED SCORING for public opinion (1 = -0.3, 5 = +0.3)
        // Public opinion has less weight than verified developments
        const credibilityImpact = (avgRating - 3) * 0.1; // Reduced from 0.5 to 0.1
        politician.credibilityScore = Math.max(0, Math.min(100, (politician.credibilityScore || 50) + credibilityImpact));
        await politician.save();
      }
      
      // Update user contributions if logged in
      if (userId) {
        const user = await User.findById(userId);
        if (user) {
          user.contributions.feedbacksGiven += 1;
          await user.save();
        }
      }
      
      res.status(201).json(feedback);
    } catch (error) {
      console.error('Submit feedback error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Mark feedback as helpful (credibility-weighted voting)
  markHelpful: async (req, res) => {
    try {
      const User = require('../models/User');
      const { id } = req.params;
      const userId = req.user?.userId;
      const ipAddress = req.ip || req.connection.remoteAddress;
      
      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      
      const feedback = await Feedback.findById(id);
      if (!feedback) {
        return res.status(404).json({ message: 'Feedback not found' });
      }
      
      // Check if user already voted
      const hasVoted = feedback.helpfulVotes.some(v => v.userId && v.userId.toString() === userId.toString());
      if (hasVoted) {
        return res.status(400).json({ message: 'You have already marked this feedback as helpful' });
      }
      
      // Get voter's credibility for weighted vote
      const voterUser = await User.findById(userId);
      if (!voterUser) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      let voteWeight = voterUser.credibilityScore / 100;
      voteWeight = Math.max(0.1, voteWeight);
      
      // Add vote
      feedback.helpfulVotes.push({
        userId,
        voteWeight,
        ipAddress,
        createdAt: new Date(),
      });
      
      // Update helpful score (credibility-weighted)
      feedback.helpfulScore = (feedback.helpfulScore || 0) + voteWeight;
      
      // If helpfulScore >= 5 (threshold for "helpful"), award credibility to feedback creator
      if (feedback.helpfulScore >= 5 && !feedback.isHelpful && feedback.userId) {
        feedback.isHelpful = true;
        const feedbackCreator = await User.findById(feedback.userId);
        if (feedbackCreator) {
          // Award 2-5 points based on how much the score exceeded threshold
          const pointsToAward = Math.min(5, Math.max(2, Math.floor(feedback.helpfulScore - 4)));
          feedback.helpfulCredibilityAwarded = pointsToAward;
          
          // Get approvers list
          const approvers = feedback.helpfulVotes
            .filter((v) => v.userId)
            .map((v) => v.userId.toString());
          
          await feedbackCreator.addCredibility(
            pointsToAward,
            'Feedback marked as helpful by community',
            {
              actionType: 'feedback_helpful',
              entityId: feedback._id.toString(),
              entityType: 'feedback',
              sectionName: null,
              politicianSlug: feedback.politicianSlug,
              approvedBy: approvers,
              approvalCount: Math.round(feedback.helpfulScore),
              requiresApproval: true,
              approved: true,
              proofLink: feedback.reference || '',
            }
          );
          await feedbackCreator.save();
        }
      }
      
      await feedback.save();
      res.json(feedback);
    } catch (error) {
      console.error('Mark feedback helpful error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Get public perception metrics (aggregated from anonymous opinions)
  getPublicPerception: async (req, res) => {
    try {
      const { slug } = req.params;
      
      // Get all feedback/opinions for this politician
      const feedback = await Feedback.find({ politicianSlug: slug });
      
      if (!feedback || feedback.length === 0) {
        return res.json({
          politicianSlug: slug,
          totalOpinions: 0,
          averageRating: 0,
          ratingDistribution: {},
          positiveSentiment: 0, // Percentage
          negativeSentiment: 0, // Percentage
          neutralSentiment: 0, // Percentage
          credibleOpinions: 0, // Opinions from high-credibility users
          message: 'No opinions yet'
        });
      }
      
      // Calculate aggregate metrics
      const totalOpinions = feedback.length;
      const ratingsSum = feedback.reduce((sum, fb) => sum + (fb.rating || 0), 0);
      const averageRating = ratingsSum / totalOpinions;
      
      // Rating distribution (1-5 scale)
      const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      feedback.forEach(fb => {
        if (fb.rating >= 1 && fb.rating <= 5) {
          ratingDistribution[fb.rating] = (ratingDistribution[fb.rating] || 0) + 1;
        }
      });
      
      // Sentiment analysis (based on rating)
      // Positive: 4-5 stars, Negative: 1-2 stars, Neutral: 3 stars
      const positiveCount = feedback.filter(fb => fb.rating >= 4).length;
      const negativeCount = feedback.filter(fb => fb.rating <= 2).length;
      const neutralCount = feedback.filter(fb => fb.rating === 3).length;
      
      const positiveSentiment = (positiveCount / totalOpinions) * 100;
      const negativeSentiment = (negativeCount / totalOpinions) * 100;
      const neutralSentiment = (neutralCount / totalOpinions) * 100;
      
      // Count credible opinions (from users with credibility >= 50)
      const User = require('../models/User');
      let credibleOpinions = 0;
      const userIds = feedback
        .map(fb => fb.userId)
        .filter(id => id && id !== 'anonymous' && id !== null);
      
      if (userIds.length > 0) {
        const users = await User.find({ 
          _id: { $in: userIds },
          credibilityScore: { $gte: 50 }
        });
        credibleOpinions = users.length;
      }
      
      res.json({
        politicianSlug: slug,
        totalOpinions,
        averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal
        ratingDistribution,
        positiveSentiment: Math.round(positiveSentiment * 10) / 10,
        negativeSentiment: Math.round(negativeSentiment * 10) / 10,
        neutralSentiment: Math.round(neutralSentiment * 10) / 10,
        credibleOpinions,
        calculatedAt: new Date(),
      });
    } catch (error) {
      console.error('Get public perception error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Delete feedback (admin only)
  delete: async (req, res) => {
    try {
      const feedback = await Feedback.findByIdAndDelete(req.params.id);
      if (!feedback) {
        return res.status(404).json({ message: 'Feedback not found' });
      }
      res.json({ message: 'Feedback deleted successfully' });
    } catch (error) {
      console.error('Delete feedback error:', error);
      res.status(500).json({ message: error.message });
    }
  },
};

module.exports = feedbackController;

