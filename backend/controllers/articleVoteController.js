const ArticleVote = require('../models/ArticleVote');
const Article = require('../models/Article');
const Politician = require('../models/Politician');
const DevelopmentVerification = require('../models/DevelopmentVerification');
const { generateDeviceFingerprint, getLocationInfo, isWithinRadius } = require('../utils/tracking');

const articleVoteController = {
  // Vote on article/section (like/dislike)
  voteOnArticle: async (req, res) => {
    try {
      const { slug } = req.params;
      const { articleId, section, itemIndex, voteType } = req.body;
      const userId = req.user?.userId || null;
      
      if (!voteType || !['like', 'neutral', 'dislike'].includes(voteType)) {
        return res.status(400).json({ message: 'Invalid vote type. Must be "like", "neutral", or "dislike"' });
      }
      
      const locationInfo = getLocationInfo(req);
      const deviceFingerprint = generateDeviceFingerprint(req);
      
      // Check if article exists
      const article = await Article.findById(articleId);
      if (!article || article.politicianSlug !== slug) {
        return res.status(404).json({ message: 'Article not found' });
      }
      
      // Get politician location for radius check
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
      
      // Check for existing vote - also check nearby locations (same IP area)
      const existingVote = await ArticleVote.findOne({
        articleId,
        section,
        itemIndex: itemIndex !== undefined ? itemIndex : null,
        $or: [
          { deviceFingerprint, ipAddress: locationInfo.ipAddress },
          { ipAddress: locationInfo.ipAddress } // Same IP = same area/radius
        ]
      });
      
      if (existingVote) {
        if (existingVote.voteType === voteType) {
          return res.status(400).json({ message: 'You have already voted ' + voteType + ' on this item from your area' });
        }
        // Update existing vote (toggle)
        existingVote.voteType = voteType;
        existingVote.updatedAt = new Date();
        if (locationInfo.latitude && locationInfo.longitude) {
          existingVote.location = {
            latitude: locationInfo.latitude,
            longitude: locationInfo.longitude,
            constituency: locationInfo.constituency,
            state: locationInfo.state,
            city: locationInfo.city,
          };
        }
        await existingVote.save();
      } else {
        // Create new vote
        const vote = new ArticleVote({
          politicianSlug: slug,
          articleId,
          section,
          itemIndex: itemIndex !== undefined ? itemIndex : null,
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
      
      // Calculate vote counts and update credibility
      await articleVoteController.updateArticleCredibility(slug, section, articleId);
      
      // Get updated counts
      const likeCount = await ArticleVote.countDocuments({ 
        articleId, 
        section, 
        itemIndex: itemIndex !== undefined ? itemIndex : null,
        voteType: 'like' 
      });
      const neutralCount = await ArticleVote.countDocuments({ 
        articleId, 
        section, 
        itemIndex: itemIndex !== undefined ? itemIndex : null,
        voteType: 'neutral' 
      });
      const dislikeCount = await ArticleVote.countDocuments({ 
        articleId, 
        section, 
        itemIndex: itemIndex !== undefined ? itemIndex : null,
        voteType: 'dislike' 
      });
      
      res.json({
        success: true,
        voteType,
        likeCount,
        neutralCount,
        dislikeCount,
      });
    } catch (error) {
      console.error('Vote on article error:', error);
      if (error.code === 11000) {
        return res.status(400).json({ message: 'You have already voted on this item' });
      }
      res.status(500).json({ message: error.message });
    }
  },

  // Vote on development verification (if 10+ references)
  voteOnDevelopment: async (req, res) => {
    try {
      const { slug } = req.params;
      const { articleId, section, vote } = req.body; // vote: 'verified' or 'not_verified'
      const userId = req.user?.userId || null;
      
      if (!vote || !['verified', 'not_verified'].includes(vote)) {
        return res.status(400).json({ message: 'Invalid vote. Must be "verified" or "not_verified"' });
      }
      
      const locationInfo = getLocationInfo(req);
      const deviceFingerprint = generateDeviceFingerprint(req);
      
      // Get politician for radius check
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
      
      // Find or create development verification
      let verification = await DevelopmentVerification.findOne({
        politicianSlug: slug,
        articleId,
        section,
      });
      
      if (!verification) {
        // Get reference count from article
        const article = await Article.findById(articleId);
        if (!article) {
          return res.status(404).json({ message: 'Article not found' });
        }
        
        const items = article.items || [];
        const referenceCount = items.filter(item => item.ref && item.ref.trim()).length;
        
        if (referenceCount < 10) {
          return res.status(400).json({ 
            message: 'Development verification requires at least 10 references' 
          });
        }
        
        verification = new DevelopmentVerification({
          politicianSlug: slug,
          articleId,
          section,
          referenceCount,
          minimumVotesRequired: Math.max(10, Math.floor(referenceCount / 10) * 5), // More refs = more votes needed
        });
      }
      
      // Check if already voted
      const hasVoted = verification.votes.some(v => 
        (userId && v.userId && v.userId.toString() === userId.toString()) ||
        (!userId && v.deviceFingerprint === deviceFingerprint && v.ipAddress === locationInfo.ipAddress)
      );
      
      if (hasVoted) {
        return res.status(400).json({ message: 'You have already voted on this development verification' });
      }
      
      // Add vote
      verification.votes.push({
        userId,
        deviceFingerprint,
        ipAddress: locationInfo.ipAddress,
        userAgent: locationInfo.userAgent,
        vote,
        createdAt: new Date(),
      });
      
      // Update counts
      if (vote === 'verified') {
        verification.verifiedCount += 1;
      } else {
        verification.notVerifiedCount += 1;
      }
      
      // Check if we have enough votes to verify/reject
      const totalVotes = verification.verifiedCount + verification.notVerifiedCount;
      if (totalVotes >= verification.minimumVotesRequired) {
        const verifiedPercentage = (verification.verifiedCount / totalVotes) * 100;
        if (verifiedPercentage >= 60) {
          verification.status = 'verified';
          verification.verifiedAt = new Date();
          // Major credibility boost for verified development
          await articleVoteController.awardDevelopmentCredibility(slug, section);
        } else if (verifiedPercentage <= 40) {
          verification.status = 'rejected';
        }
      }
      
      await verification.save();
      
      res.json({
        success: true,
        vote,
        verifiedCount: verification.verifiedCount,
        notVerifiedCount: verification.notVerifiedCount,
        status: verification.status,
        minimumVotesRequired: verification.minimumVotesRequired,
      });
    } catch (error) {
      console.error('Vote on development error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Get vote counts for article/section
  getVoteCounts: async (req, res) => {
    try {
      const { articleId, section, itemIndex } = req.query;
      
      const likeCount = await ArticleVote.countDocuments({ 
        articleId, 
        section, 
        itemIndex: itemIndex !== undefined ? parseInt(itemIndex) : null,
        voteType: 'like' 
      });
      const neutralCount = await ArticleVote.countDocuments({ 
        articleId, 
        section, 
        itemIndex: itemIndex !== undefined ? parseInt(itemIndex) : null,
        voteType: 'neutral' 
      });
      const dislikeCount = await ArticleVote.countDocuments({ 
        articleId, 
        section, 
        itemIndex: itemIndex !== undefined ? parseInt(itemIndex) : null,
        voteType: 'dislike' 
      });
      
      res.json({
        likeCount,
        neutralCount,
        dislikeCount,
        score: likeCount - dislikeCount, // Net score (neutral doesn't affect score)
      });
    } catch (error) {
      console.error('Get vote counts error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Get dynamic credibility parameters based on section name
  getSectionParameters: function (sectionName) {
    const normalizedSection = (sectionName || '').toLowerCase();
    
    // Define section-specific parameters
    const sectionConfigs = {
      // Achievements typically have positive impact but require higher thresholds
      'achievements': {
        baseImpact: 2.5,
        strongThreshold: 0.75, // Higher threshold for strong positive
        positiveThreshold: 0.65,
        neutralThreshold: 0.55,
        negativeThreshold: 0.35,
        voteScalingFactor: 15, // More votes needed for full impact
      },
      // Reforms are significant but need validation
      'reforms': {
        baseImpact: 2.0,
        strongThreshold: 0.7,
        positiveThreshold: 0.6,
        neutralThreshold: 0.5,
        negativeThreshold: 0.3,
        voteScalingFactor: 20,
      },
      // Controversies have high negative impact potential
      'controversies': {
        baseImpact: 3.0,
        strongThreshold: 0.7,
        positiveThreshold: 0.6,
        neutralThreshold: 0.5,
        negativeThreshold: 0.25, // Lower threshold for strong negative
        voteScalingFactor: 18,
      },
      // Public impact sections are moderate
      'publicimpact': {
        baseImpact: 1.5,
        strongThreshold: 0.7,
        positiveThreshold: 0.6,
        neutralThreshold: 0.5,
        negativeThreshold: 0.3,
        voteScalingFactor: 25,
      },
      // Default parameters for other sections
      'default': {
        baseImpact: 2.0,
        strongThreshold: 0.7,
        positiveThreshold: 0.6,
        neutralThreshold: 0.5,
        negativeThreshold: 0.3,
        voteScalingFactor: 20,
      },
    };
    
    // Get config for this section or default
    return sectionConfigs[normalizedSection] || sectionConfigs['default'];
  },

  // Update article credibility based on votes (internal method) - NOW DYNAMIC
  updateArticleCredibility: async function (slug, section, articleId) {
    try {
      const article = await Article.findById(articleId);
      if (!article) return;
      
      // Get all votes for this section (both section-level and item-level)
      const sectionVotes = await ArticleVote.find({ articleId, section, itemIndex: null });
      const itemVotes = await ArticleVote.find({ articleId, section, itemIndex: { $ne: null } });
      
      const likeCount = [...sectionVotes, ...itemVotes].filter(v => v.voteType === 'like').length;
      const neutralCount = [...sectionVotes, ...itemVotes].filter(v => v.voteType === 'neutral').length;
      const dislikeCount = [...sectionVotes, ...itemVotes].filter(v => v.voteType === 'dislike').length;
      const totalVotes = likeCount + neutralCount + dislikeCount;
      
      if (totalVotes === 0) return;
      
      // Calculate ratio based on like vs dislike (neutral doesn't count in ratio but counts in total)
      const likeRatio = totalVotes > neutralCount ? likeCount / (totalVotes - neutralCount) : 0.5;
      
      // Get dynamic parameters for this section
      const params = articleVoteController.getSectionParameters(section);
      
      // Calculate credibility change based on section-specific thresholds
      let credibilityChange = 0;
      if (likeRatio >= params.strongThreshold) {
        credibilityChange = params.baseImpact; // Strong positive
      } else if (likeRatio >= params.positiveThreshold) {
        credibilityChange = params.baseImpact * 0.5; // Positive
      } else if (likeRatio >= params.neutralThreshold) {
        credibilityChange = params.baseImpact * 0.25; // Slightly positive
      } else if (likeRatio <= params.negativeThreshold) {
        credibilityChange = -params.baseImpact; // Strong negative
      } else if (likeRatio <= (params.neutralThreshold - 0.1)) {
        credibilityChange = -params.baseImpact * 0.5; // Negative
      } else {
        credibilityChange = -params.baseImpact * 0.25; // Slightly negative
      }
      
      // Dynamic vote scaling: more votes = more confidence, but scales differently per section
      // Scale based on section-specific vote scaling factor
      const weightMultiplier = Math.min(1.0, totalVotes / params.voteScalingFactor);
      credibilityChange *= weightMultiplier;
      
      // Additional scaling: if votes are very high, cap the impact to prevent manipulation
      // Sections with more votes get diminishing returns after a point
      if (totalVotes > 100) {
        const excessFactor = Math.max(0.5, 1.0 - ((totalVotes - 100) / 500));
        credibilityChange *= excessFactor;
      }
      
      // Update politician credibility
      const politician = await Politician.findOne({ slug });
      if (!politician) return;
      
      const oldScore = politician.credibilityScore || 50;
      const newScore = Math.max(0, Math.min(100, oldScore + credibilityChange));
      
      politician.credibilityScore = newScore;
      
      // Track in credibility history if significant change
      if (Math.abs(credibilityChange) > 0.1) {
        if (!politician.credibilityHistory) {
          politician.credibilityHistory = [];
        }
        
        // Add timeline entry (group by month for better visualization)
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        
        // Find or create entry for this month
        let historyEntry = politician.credibilityHistory.find(
          h => h.year === year && h.month === month
        );
        
        if (!historyEntry) {
          historyEntry = { year, month, credibility: newScore, change: credibilityChange, section, totalVotes, date: now };
          politician.credibilityHistory.push(historyEntry);
        } else {
          // Update existing entry with latest score and aggregate changes
          historyEntry.credibility = newScore;
          historyEntry.change = (historyEntry.change || 0) + credibilityChange;
          historyEntry.totalVotes = (historyEntry.totalVotes || 0) + totalVotes;
          historyEntry.date = now;
        }
      }
      
      await politician.save();
    } catch (error) {
      console.error('Update article credibility error:', error);
    }
  },

  // Award major credibility boost for verified development (internal method)
  awardDevelopmentCredibility: async function (slug, section) {
    try {
      const politician = await Politician.findOne({ slug });
      if (!politician) return;
      
      // Major development gets significant boost (5-10 points)
      const boost = 7.5;
      const oldScore = politician.credibilityScore || 50;
      politician.credibilityScore = Math.min(100, oldScore + boost);
      
      // Store in credibility history
      if (!politician.credibilityHistory) {
        politician.credibilityHistory = [];
      }
      
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      
      politician.credibilityHistory.push({
        year,
        month,
        credibility: politician.credibilityScore,
        change: boost,
        section: section || 'development_verification',
        totalVotes: 0,
        date: now,
      });
      
      await politician.save();
    } catch (error) {
      console.error('Award development credibility error:', error);
    }
  },

  // Get credibility timeline for a politician
  getCredibilityTimeline: async (req, res) => {
    try {
      const { slug } = req.params;
      const politician = await Politician.findOne({ slug });
      
      if (!politician) {
        return res.status(404).json({ message: 'Politician not found' });
      }
      
      // Get timeline from politician's credibility history
      const timeline = (politician.credibilityHistory || [])
        .map(entry => {
          let entryDate;
          if (entry.date) {
            entryDate = entry.date instanceof Date ? entry.date : new Date(entry.date);
          } else if (entry.year !== undefined) {
            entryDate = new Date(entry.year, entry.month !== undefined ? entry.month : 0, 1);
          } else {
            entryDate = new Date();
          }
          
          return {
            date: entryDate,
            credibility: entry.credibility,
            change: entry.change || 0,
            section: entry.section || 'unknown',
            totalVotes: entry.totalVotes || 0,
          };
        })
        .sort((a, b) => {
          const dateA = a.date instanceof Date ? a.date : new Date(a.date);
          const dateB = b.date instanceof Date ? b.date : new Date(b.date);
          return dateA.getTime() - dateB.getTime();
        });
      
      // Also get vote data over time from ArticleVote collection
      const ArticleVote = require('../models/ArticleVote');
      const votes = await ArticleVote.find({ politicianSlug: slug })
        .sort({ createdAt: 1 })
        .select('createdAt section voteType');
      
      // Aggregate votes by month to show vote trends
      const voteTimeline = {};
      votes.forEach(vote => {
        const date = new Date(vote.createdAt);
        const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        if (!voteTimeline[yearMonth]) {
          voteTimeline[yearMonth] = { date, likes: 0, dislikes: 0, sections: {} };
        }
        
        if (vote.voteType === 'like') {
          voteTimeline[yearMonth].likes++;
        } else if (vote.voteType === 'dislike') {
          voteTimeline[yearMonth].dislikes++;
        }
        
        if (!voteTimeline[yearMonth].sections[vote.section]) {
          voteTimeline[yearMonth].sections[vote.section] = { likes: 0, dislikes: 0 };
        }
        
        if (vote.voteType === 'like') {
          voteTimeline[yearMonth].sections[vote.section].likes++;
        } else if (vote.voteType === 'dislike') {
          voteTimeline[yearMonth].sections[vote.section].dislikes++;
        }
      });
      
      res.json({
        timeline: timeline.map(entry => ({
          ...entry,
          date: entry.date.toISOString ? entry.date.toISOString() : entry.date,
        })),
        voteTimeline: Object.values(voteTimeline).map(entry => ({
          ...entry,
          date: entry.date.toISOString ? entry.date.toISOString() : entry.date,
        })),
        currentCredibility: politician.credibilityScore || 50,
      });
    } catch (error) {
      console.error('Get credibility timeline error:', error);
      res.status(500).json({ message: error.message });
    }
  },
};

module.exports = articleVoteController;

