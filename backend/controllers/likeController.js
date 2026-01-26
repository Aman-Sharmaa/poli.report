const Like = require('../models/Like');
const Politician = require('../models/Politician');
const { generateDeviceFingerprint, generateAnonymousId, getLocationInfo } = require('../utils/tracking');

const likeController = {
  // Toggle like/unlike (works for both logged-in and anonymous users)
  toggleLike: async (req, res) => {
    try {
      const { slug } = req.params;
      const { actionType } = req.body; // 'like' or 'unlike'
      const userId = req.user?.userId || null;
      
      if (!actionType || !['like', 'unlike'].includes(actionType)) {
        return res.status(400).json({ message: 'Invalid action type. Must be "like" or "unlike"' });
      }
      
      // Generate device fingerprint for tracking
      const locationInfo = getLocationInfo(req);
      const deviceFingerprint = generateDeviceFingerprint(req);
      const anonymousId = userId ? null : generateAnonymousId(deviceFingerprint, locationInfo.ipAddress);
      
      // Check if politician exists
      const politician = await Politician.findOne({ slug });
      if (!politician) {
        return res.status(404).json({ message: 'Politician not found' });
      }
      
      // Find existing like record for this user/device
      let likeRecord = await Like.findOne({
        politicianSlug: slug,
        $or: [
          ...(userId ? [{ userId }] : []),
          { deviceFingerprint, ipAddress: locationInfo.ipAddress }
        ]
      });
      
      if (likeRecord) {
        // Update existing record
        const previousAction = likeRecord.actionType;
        likeRecord.actionType = actionType;
        likeRecord.status = actionType === 'like' ? 'liked' : 'unliked';
        likeRecord.updatedAt = new Date();
        
        // Update location if provided
        if (locationInfo.latitude && locationInfo.longitude) {
          likeRecord.location = {
            latitude: locationInfo.latitude,
            longitude: locationInfo.longitude,
            constituency: locationInfo.constituency,
            state: locationInfo.state,
            city: locationInfo.city,
          };
        }
        
        await likeRecord.save();
        
        // Update politician like counts if action changed
        if (previousAction !== actionType) {
          if (actionType === 'like' && previousAction === 'unlike') {
            // Switching from unlike to like
            politician.credibilityScore = Math.min(100, (politician.credibilityScore || 0) + 0.1);
          } else if (actionType === 'unlike' && previousAction === 'like') {
            // Switching from like to unlike
            politician.credibilityScore = Math.max(0, (politician.credibilityScore || 0) - 0.1);
          }
          await politician.save();
        }
      } else {
        // Create new like record
        likeRecord = new Like({
          politicianSlug: slug,
          userId,
          anonymousId,
          deviceFingerprint,
          ipAddress: locationInfo.ipAddress,
          userAgent: locationInfo.userAgent,
          status: actionType === 'like' ? 'liked' : 'unliked',
          actionType,
          location: locationInfo.latitude && locationInfo.longitude ? {
            latitude: locationInfo.latitude,
            longitude: locationInfo.longitude,
            constituency: locationInfo.constituency,
            state: locationInfo.state,
            city: locationInfo.city,
          } : undefined,
        });
        
        await likeRecord.save();
        
        // Update politician credibility score
        if (actionType === 'like') {
          politician.credibilityScore = Math.min(100, (politician.credibilityScore || 0) + 0.1);
        } else {
          politician.credibilityScore = Math.max(0, (politician.credibilityScore || 0) - 0.1);
        }
        await politician.save();
      }
      
      // Get updated counts
      const likeCount = await Like.countDocuments({ politicianSlug: slug, status: 'liked' });
      const unlikeCount = await Like.countDocuments({ politicianSlug: slug, status: 'unliked' });
      
      res.json({
        success: true,
        actionType,
        likeCount,
        unlikeCount,
        userAction: likeRecord.actionType,
        message: actionType === 'like' ? 'Liked successfully' : 'Unliked successfully',
      });
    } catch (error) {
      console.error('Toggle like error:', error);
      if (error.code === 11000) {
        return res.status(400).json({ message: 'You have already liked/unliked this profile from this device' });
      }
      res.status(500).json({ message: error.message });
    }
  },

  // Get like status and counts for a politician
  getLikeStatus: async (req, res) => {
    try {
      const { slug } = req.params;
      const userId = req.user?.userId || null;
      
      // Generate device fingerprint to check if anonymous user has liked
      const locationInfo = getLocationInfo(req);
      const deviceFingerprint = generateDeviceFingerprint(req);
      
      // Find user's like record
      let userLike = null;
      if (userId) {
        userLike = await Like.findOne({
          politicianSlug: slug,
          userId,
        });
      } else {
        userLike = await Like.findOne({
          politicianSlug: slug,
          deviceFingerprint,
          ipAddress: locationInfo.ipAddress,
        });
      }
      
      // Get total counts
      const likeCount = await Like.countDocuments({ politicianSlug: slug, status: 'liked' });
      const unlikeCount = await Like.countDocuments({ politicianSlug: slug, status: 'unliked' });
      
      res.json({
        likeCount,
        unlikeCount,
        userAction: userLike ? userLike.actionType : null, // 'like', 'unlike', or null
      });
    } catch (error) {
      console.error('Get like status error:', error);
      res.status(500).json({ message: error.message });
    }
  },
};

module.exports = likeController;

