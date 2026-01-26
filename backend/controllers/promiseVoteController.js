const PromiseVote = require('../models/PromiseVote');
const Politician = require('../models/Politician');
const { generateDeviceFingerprint, getLocationInfo, isWithinRadius } = require('../utils/tracking');

const promiseVoteController = {
  // Vote on promise (fulfilled/not_fulfilled/in_progress)
  voteOnPromise: async (req, res) => {
    try {
      const { slug } = req.params;
      const { promiseId, voteType } = req.body;
      const userId = req.user?.userId || null;
      
      if (!voteType || !['fulfilled', 'not_fulfilled', 'in_progress'].includes(voteType)) {
        return res.status(400).json({ 
          message: 'Invalid vote type. Must be "fulfilled", "not_fulfilled", or "in_progress"' 
        });
      }
      
      const locationInfo = getLocationInfo(req);
      const deviceFingerprint = generateDeviceFingerprint(req);
      
      // Check if politician exists
      const politician = await Politician.findOne({ slug });
      if (!politician) {
        return res.status(404).json({ message: 'Politician not found' });
      }
      
      // Check if user is within voting radius (50km)
      if (locationInfo.latitude && locationInfo.longitude && 
          politician.location?.coordinates?.latitude && politician.location?.coordinates?.longitude) {
        const withinRadius = isWithinRadius(
          locationInfo.latitude,
          locationInfo.longitude,
          politician.location.coordinates.latitude,
          politician.location.coordinates.longitude,
          50 // 50km radius
        );
        
        if (!withinRadius) {
          return res.status(403).json({ 
            message: 'You can only vote if you are within 50km radius of the politician\'s location' 
          });
        }
      }
      
      // Find promise
      const promise = politician.promises?.find(p => p._id?.toString() === promiseId);
      if (!promise) {
        return res.status(404).json({ message: 'Promise not found' });
      }
      
      // Check for existing vote - also check same IP area
      const existingVote = await PromiseVote.findOne({
        politicianSlug: slug,
        promiseId,
        $or: [
          { deviceFingerprint, ipAddress: locationInfo.ipAddress },
          { ipAddress: locationInfo.ipAddress } // Same IP = same area
        ]
      });
      
      if (existingVote) {
        if (existingVote.voteType === voteType) {
          return res.status(400).json({ message: 'You have already voted ' + voteType + ' on this promise' });
        }
        // Update existing vote
        existingVote.voteType = voteType;
        existingVote.updatedAt = new Date();
        await existingVote.save();
      } else {
        // Create new vote
        const vote = new PromiseVote({
          politicianSlug: slug,
          promiseId,
          voteType,
          userId,
          deviceFingerprint,
          ipAddress: locationInfo.ipAddress,
          userAgent: locationInfo.userAgent,
          location: locationInfo.latitude && locationInfo.longitude ? {
            latitude: locationInfo.latitude,
            longitude: locationInfo.longitude,
            constituency: locationInfo.constituency,
            state: locationInfo.state,
            city: locationInfo.city,
          } : undefined,
        });
        await vote.save();
      }
      
      // Update promise status based on votes
      await promiseVoteController.updatePromiseStatus(slug, promiseId);
      
      // Get updated counts
      const fulfilledCount = await PromiseVote.countDocuments({ 
        politicianSlug: slug, 
        promiseId, 
        voteType: 'fulfilled' 
      });
      const notFulfilledCount = await PromiseVote.countDocuments({ 
        politicianSlug: slug, 
        promiseId, 
        voteType: 'not_fulfilled' 
      });
      const inProgressCount = await PromiseVote.countDocuments({ 
        politicianSlug: slug, 
        promiseId, 
        voteType: 'in_progress' 
      });
      
      res.json({
        success: true,
        voteType,
        fulfilledCount,
        notFulfilledCount,
        inProgressCount,
      });
    } catch (error) {
      console.error('Vote on promise error:', error);
      if (error.code === 11000) {
        return res.status(400).json({ message: 'You have already voted on this promise' });
      }
      res.status(500).json({ message: error.message });
    }
  },

  // Get promise vote counts
  getPromiseVotes: async (req, res) => {
    try {
      const { slug } = req.params;
      const { promiseId } = req.query;
      
      const fulfilledCount = await PromiseVote.countDocuments({ 
        politicianSlug: slug, 
        promiseId, 
        voteType: 'fulfilled' 
      });
      const notFulfilledCount = await PromiseVote.countDocuments({ 
        politicianSlug: slug, 
        promiseId, 
        voteType: 'not_fulfilled' 
      });
      const inProgressCount = await PromiseVote.countDocuments({ 
        politicianSlug: slug, 
        promiseId, 
        voteType: 'in_progress' 
      });
      
      res.json({
        fulfilledCount,
        notFulfilledCount,
        inProgressCount,
        totalVotes: fulfilledCount + notFulfilledCount + inProgressCount,
      });
    } catch (error) {
      console.error('Get promise votes error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Update promise status and credibility based on votes
  updatePromiseStatus: async (slug, promiseId) => {
    try {
      const politician = await Politician.findOne({ slug });
      if (!politician) return;
      
      const promise = politician.promises?.find(p => p._id?.toString() === promiseId);
      if (!promise) return;
      
      // Get all votes for this promise
      const votes = await PromiseVote.find({ politicianSlug: slug, promiseId });
      const fulfilledCount = votes.filter(v => v.voteType === 'fulfilled').length;
      const notFulfilledCount = votes.filter(v => v.voteType === 'not_fulfilled').length;
      const inProgressCount = votes.filter(v => v.voteType === 'in_progress').length;
      const totalVotes = fulfilledCount + notFulfilledCount + inProgressCount;
      
      if (totalVotes < 10) {
        // Not enough votes to change status
        return;
      }
      
      // Determine status based on majority vote
      const fulfilledPercentage = (fulfilledCount / totalVotes) * 100;
      const notFulfilledPercentage = (notFulfilledCount / totalVotes) * 100;
      
      let newStatus = promise.status;
      if (fulfilledPercentage >= 60) {
        newStatus = 'fulfilled';
        // Update promise status
        promise.status = 'fulfilled';
        politician.fulfilledPromises = (politician.fulfilledPromises || 0) + 1;
        
        // Credibility boost for fulfilled promise
        politician.credibilityScore = Math.min(100, (politician.credibilityScore || 50) + 2);
      } else if (notFulfilledPercentage >= 60) {
        newStatus = 'broken';
        promise.status = 'broken';
        // Credibility penalty for broken promise
        politician.credibilityScore = Math.max(0, (politician.credibilityScore || 50) - 3);
      } else if (inProgressCount > fulfilledCount && inProgressCount > notFulfilledCount) {
        newStatus = 'in_progress';
        promise.status = 'in_progress';
      }
      
      await politician.save();
    } catch (error) {
      console.error('Update promise status error:', error);
    }
  },
};

module.exports = promiseVoteController;

