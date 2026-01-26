const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Edit = require('../models/Edit');
const Poll = require('../models/Poll');
const Feedback = require('../models/Feedback');
const Article = require('../models/Article');
const PromiseVote = require('../models/PromiseVote');

const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '7d' }
  );
};

const authController = {
  // Register a new user
  register: async (req, res) => {
    try {
      const { email, password, ipAddress, location } = req.body;

      // Validation
      if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
      }

      // Check if user exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: 'User already exists' });
      }

      // Create user (all users are equal, no admin roles)
      // Create user
      const user = new User({
        email,
        password,
        ipAddress,
        location,
        name: req.body.name || '',
        area: req.body.area || '',
      });

      await user.save();

      // Generate token
      const token = generateToken(user._id);

      res.status(201).json({
        token,
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          area: user.area,
          credibilityScore: user.credibilityScore,
          contributions: user.contributions,
        },
      });
    } catch (error) {
      console.error('Register error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Login user
  login: async (req, res) => {
    try {
      const { email, password } = req.body;

      // Validation
      if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
      }

      // Find user
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      // Check password
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      // Update last login
      user.lastLoginAt = new Date();
      await user.save();

      // Generate token
      const token = generateToken(user._id);

      res.json({
        token,
        userId: user._id,
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          area: user.area,
          credibilityScore: user.credibilityScore,
          contributions: user.contributions,
        },
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Get current user
  me: async (req, res) => {
    try {
      const user = await User.findById(req.user.userId).select('-password');
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      // Recalculate credibility based on current contributions
      user.recalculateCredibility();
      await user.save();
      
      const tierInfo = user.getCredibilityTierInfo();
      
      res.json({
        id: user._id,
        email: user.email,
        name: user.name,
        username: user.username, // Always return actual username (stored separately)
        anonymousIdentifier: user.anonymousIdentifier, // Anonymous identifier (generated when anonymous)
        displayAsAnonymous: user.displayAsAnonymous,
        area: user.area,
        credibilityScore: user.credibilityScore,
        credibilityTier: user.credibilityTier,
        credibilityTierInfo: tierInfo,
        personalityType: user.personalityType,
        proofScore: user.proofScore || 0,
        communityValidation: user.communityValidation || 0,
        contributionQuality: user.contributionQuality || 0,
        profileStatus: user.profileStatus || 'active',
        verifiedProofs: user.verifiedProofs || [],
        contributions: user.contributions,
        credibilityHistory: user.credibilityHistory || [],
        location: user.location,
        ipAddress: user.ipAddress, // Include for preview in settings
        deviceInfo: user.deviceInfo, // Include for preview in settings
        canCreateProfile: user.canCreateProfile(),
        canEdit: user.canEdit(),
        canReview: user.canReview(),
        canAddSection: user.canAddSection(),
      });
    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Get user activity
  getActivity: async (req, res) => {
    try {
      const userId = req.user.userId;

      // Fetch all user activity
      const [editsCreated, editsReviewed, pollsAttended, feedbacksGiven, sectionsCreated, promiseVotes] = await Promise.all([
        // Edits created by this user
        Edit.find({ userId }).select('personId section status createdAt newContent'),
        
        // Edits reviewed by this user
        Edit.find({ 
          'reviewVotes.userId': userId 
        }).select('personId section reviewVotes createdAt'),
        
        // Polls where user voted
        Poll.find({ 
          'responses.userId': userId 
        }).select('question responses createdAt'),
        
        // Feedback given by user
        Feedback.find({ userId }).select('politicianSlug rating comment createdAt'),
        
        // Sections created/edited by user (articles) - include full items with references
        Article.find({ 
          $or: [
            { createdBy: userId },
            { editedBy: userId },
            { 'items.createdBy': userId }
          ]
        }).select('politicianSlug section sectionType title createdAt updatedAt createdBy editedBy items _id'),
        
        // Promise votes by user
        PromiseVote.find({ userId }).select('politicianSlug promiseId voteType createdAt'),
      ]);

      // Format edits reviewed to extract this user's vote
      const formattedReviews = editsReviewed.map(edit => {
        const userVote = edit.reviewVotes.find(vote => vote.userId === userId);
        return {
          id: edit._id,
          section: edit.section,
          vote: userVote?.vote || 'unknown',
          date: edit.createdAt,
          politicianSlug: edit.personId,
        };
      });

      // Format polls attended
      const formattedPolls = pollsAttended.map(poll => {
        const userResponse = poll.responses.find(r => r.userId === userId);
        return {
          id: poll._id,
          question: poll.question,
          response: userResponse?.option || 'N/A',
          date: poll.createdAt,
        };
      });

      // Format feedbacks
      const formattedFeedbacks = feedbacksGiven.map(fb => ({
        id: fb._id,
        politician: fb.politicianSlug,
        rating: fb.rating,
        date: fb.createdAt,
      }));

      // Format sections - group by politician and section, include items with references
      const sectionsByPolitician = {};
      
      sectionsCreated.forEach(article => {
        const slug = article.politicianSlug;
        if (!sectionsByPolitician[slug]) {
          sectionsByPolitician[slug] = [];
        }
        
        // Check if section already exists in array
        const existingSection = sectionsByPolitician[slug].find(s => s.section === article.section);
        
        // Get items created by this user (filter out fake references)
        const userItems = (article.items || []).filter(item => {
          const isUserItem = item.createdBy && item.createdBy.toString() === userId.toString();
          const hasValidRef = item.refUrl && !item.refUrl.includes('example.com');
          return isUserItem && (hasValidRef || item.text);
        }).map(item => ({
          text: item.text,
          ref: item.ref,
          refUrl: item.refUrl,
          date: item.date,
          approvalCount: item.approvalCount || 0,
          rejectCount: item.rejectCount || 0,
          status: item.status || 'pending',
        }));
        
        if (existingSection) {
          // Update if this article is more recent or if user created it
          const isCreator = article.createdBy && article.createdBy.toString() === userId.toString();
          const isRecentEditor = article.editedBy && article.editedBy.toString() === userId.toString();
          if (isCreator || (isRecentEditor && new Date(article.updatedAt) > new Date(existingSection.updatedAt))) {
            existingSection.sectionType = article.sectionType;
            existingSection.title = article.title;
            existingSection.createdAt = article.createdAt;
            existingSection.updatedAt = article.updatedAt;
            existingSection.isCreator = isCreator;
            existingSection.items = userItems;
            existingSection.itemsCount = userItems.length;
            existingSection.articleId = article._id.toString();
          }
        } else {
          // Add new section
          const isCreator = article.createdBy && article.createdBy.toString() === userId.toString();
          sectionsByPolitician[slug].push({
            section: article.section,
            sectionType: article.sectionType,
            title: article.title,
            createdAt: article.createdAt,
            updatedAt: article.updatedAt,
            isCreator: isCreator,
            items: userItems,
            itemsCount: userItems.length,
            articleId: article._id.toString(),
          });
        }
      });

      // Format sections into flat array with politician info
      const formattedSections = [];
      Object.entries(sectionsByPolitician).forEach(([slug, sections]) => {
        sections.forEach(section => {
          formattedSections.push({
            ...section,
            politicianSlug: slug,
          });
        });
      });

      // Format promise votes - calculate promise score
      const promiseStats = {
        totalVotes: promiseVotes.length,
        fulfilled: promiseVotes.filter(v => v.voteType === 'fulfilled').length,
        notFulfilled: promiseVotes.filter(v => v.voteType === 'not_fulfilled').length,
        inProgress: promiseVotes.filter(v => v.voteType === 'in_progress').length,
        byPolitician: {},
      };

      promiseVotes.forEach(vote => {
        if (!promiseStats.byPolitician[vote.politicianSlug]) {
          promiseStats.byPolitician[vote.politicianSlug] = {
            total: 0,
            fulfilled: 0,
            notFulfilled: 0,
            inProgress: 0,
          };
        }
        promiseStats.byPolitician[vote.politicianSlug].total++;
        promiseStats.byPolitician[vote.politicianSlug][vote.voteType]++;
      });

      // Calculate promise score (percentage of fulfilled votes)
      const promiseScore = promiseStats.totalVotes > 0
        ? Math.round((promiseStats.fulfilled / promiseStats.totalVotes) * 100)
        : 0;

      res.json({
        pollsAttended: formattedPolls,
        editsCreated: editsCreated.map(e => ({
          id: e._id,
          section: e.section,
          status: e.status,
          date: e.createdAt,
          politicianSlug: e.personId,
        })),
        editsReviewed: formattedReviews,
        feedbacksGiven: formattedFeedbacks,
        sectionsCreated: formattedSections,
        promiseActivity: {
          votes: promiseVotes.map(v => ({
            id: v._id,
            politicianSlug: v.politicianSlug,
            promiseId: v.promiseId,
            voteType: v.voteType,
            date: v.createdAt,
          })),
          stats: promiseStats,
          promiseScore: promiseScore,
        },
      });
    } catch (error) {
      console.error('Get activity error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Increase credibility (for educational/demo purposes only)
  // NOTE: This is a development/testing endpoint. In production, credibility should only be earned through contributions.
  increaseCredibility: async (req, res) => {
    try {
      // Disable in production environment - credibility must be earned through contributions
      if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ 
          message: 'This endpoint is disabled in production. Earn credibility through contributions: review edits, submit edits, create polls, and provide helpful feedback.' 
        });
      }
      
      const userId = req.user.userId;
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Add 40 points to reach 50 (minimum for editing)
      // If user already has 50+, add 20 points
      const currentScore = user.credibilityScore || 0;
      const pointsToAdd = currentScore < 50 ? 40 : 20;
      
      await user.addCredibility(pointsToAdd, 'Test grant - Development only');
      await user.save();

      res.json({
        message: 'Credibility increased (development mode only)',
        oldScore: currentScore,
        newScore: user.credibilityScore,
        pointsAdded: pointsToAdd,
        warning: 'This is a development/testing feature. In production, credibility is earned through contributions.',
      });
    } catch (error) {
      console.error('Increase credibility error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Get public user profile (for transparency)
  getPublicProfile: async (req, res) => {
    try {
      const { identifier } = req.params; // Can be username or userId
      
      let user;
      
      // Check if identifier looks like a username (lowercase, numbers, underscores)
      const looksLikeUsername = identifier.match(/^[a-z0-9_]+$/);
      const looksLikeUserId = identifier.match(/^[0-9a-fA-F]{24}$/);
      const looksLikeAnonymous = identifier.match(/^anonymous[0-9]+$/);
      
      // Priority: Check anonymous identifier first if it matches pattern
      if (looksLikeAnonymous) {
        user = await User.findOne({ anonymousIdentifier: identifier }).select('-password -ipAddress');
      }
      
      // If not found by anonymous identifier, try username
      if (!user && looksLikeUsername && !looksLikeAnonymous) {
        // Try to find by username
        user = await User.findOne({ username: identifier }).select('-password -ipAddress');
        
        // If found by username but user is anonymous, redirect to anonymous identifier
        if (user && user.displayAsAnonymous && user.anonymousIdentifier) {
          return res.status(301).json({ 
            redirect: true,
            anonymousIdentifier: user.anonymousIdentifier,
            message: 'User is anonymous, redirecting to anonymous identifier'
          });
        }
      }
      
      // If not found by username and it looks like a userId, try as userId
      if (!user && looksLikeUserId) {
        user = await User.findById(identifier).select('-password -ipAddress');
        
        // If user found by userId and is anonymous, redirect to anonymous identifier
        if (user && user.displayAsAnonymous && user.anonymousIdentifier) {
          return res.status(301).json({ 
            redirect: true,
            anonymousIdentifier: user.anonymousIdentifier,
            message: 'User is anonymous, redirecting to anonymous identifier'
          });
        }
        
        // If user found by userId but has a username (and not anonymous), redirect to username
        if (user && user.username && !user.displayAsAnonymous) {
          return res.status(301).json({ 
            redirect: true,
            username: user.username,
            message: 'Redirecting to username URL'
          });
        }
      }
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      // If user is anonymous but identifier is username, redirect to anonymous identifier
      if (user.displayAsAnonymous && user.anonymousIdentifier && identifier === user.username) {
        return res.status(301).json({ 
          redirect: true,
          anonymousIdentifier: user.anonymousIdentifier,
          message: 'User is anonymous, redirecting to anonymous identifier'
        });
      }
      
      // If user has a username but identifier is userId and user is not anonymous, redirect
      if (user.username && looksLikeUserId && identifier !== user.username && !user.displayAsAnonymous) {
        return res.status(301).json({ 
          redirect: true,
          username: user.username,
          message: 'Redirecting to username URL'
        });
      }
      
      // Simple privacy: displayAsAnonymous = true means hide all personal details
      // displayAsAnonymous = false means show all public details
      
      let displayName = 'Anonymous User';
      if (!user.displayAsAnonymous) {
        displayName = user.name || user.email.split('@')[0] || 'Anonymous User';
      }
      
      // Build response based on simple privacy setting
      // For anonymous users, return anonymous identifier instead of username
      const publicUsername = user.displayAsAnonymous 
        ? (user.anonymousIdentifier || null)
        : (user.username || null);
      
      const response = {
        id: user._id,
        username: publicUsername,
        anonymousIdentifier: user.displayAsAnonymous ? user.anonymousIdentifier : null,
        isAnonymous: user.displayAsAnonymous,
        name: displayName,
        credibilityScore: user.credibilityScore,
        contributions: user.contributions,
        credibilityHistory: user.displayAsAnonymous 
          ? [] // Hide history if anonymous
          : (user.credibilityHistory || []), // Show history if public
        createdAt: user.createdAt,
        // Public stats only
        publicStats: {
          totalContributions: 
            (user.contributions.profilesCreated || 0) +
            (user.contributions.editsCreated || 0) +
            (user.contributions.editsApproved || 0) +
            (user.contributions.reviewVotesCast || 0) +
            (user.contributions.sectionsAdded || 0) +
            (user.contributions.feedbacksGiven || 0),
        },
      };
      
      // Only add personal details if NOT anonymous
      if (!user.displayAsAnonymous) {
        // Public mode - show all public details
        response.email = user.email;
        
        if (user.area) {
          response.area = user.area;
        }
        
        if (user.location) {
          response.location = {
            state: user.location?.state,
            city: user.location?.city,
            district: user.location?.district,
            constituency: user.location?.constituency,
          };
        }
      }
      // If anonymous, don't include email, area, type, location, ipAddress, deviceInfo
      
      res.json(response);
    } catch (error) {
      console.error('Get public profile error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Update user profile (username, display settings, privacy settings, etc.)
  updateProfile: async (req, res) => {
    try {
      const { 
        username, 
        name, 
        displayAsAnonymous, 
        area
      } = req.body;
      const userId = req.user?.userId;
      
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      // Update username if provided
      // Always store the actual username, even if user is anonymous
      // The anonymousIdentifier is used for public profile URL when anonymous
      if (username !== undefined) {
        // Validate username format
        if (username && !/^[a-z0-9_]+$/.test(username)) {
          return res.status(400).json({ message: 'Username can only contain lowercase letters, numbers, and underscores' });
        }
        
        // Check if username is already taken (by another user)
        if (username) {
          const existingUser = await User.findOne({ 
            username: username.toLowerCase().trim(),
            _id: { $ne: userId } // Exclude current user
          });
          if (existingUser) {
            return res.status(400).json({ message: 'Username already taken' });
          }
        }
        
        // Always store the actual username (even when anonymous, for switching back)
        user.username = username ? username.toLowerCase().trim() : null;
      }
      
      // Update basic fields
      if (name !== undefined) user.name = name;
      // Email cannot be changed (it's used for login authentication)
      // Only privacy setting for email can be changed
      if (displayAsAnonymous !== undefined) {
        user.displayAsAnonymous = displayAsAnonymous;
        
        // Generate anonymous identifier if enabling anonymous mode and doesn't have one
        if (displayAsAnonymous && !user.anonymousIdentifier) {
          // Generate a random anonymous identifier: "anonymous" + random number
          const randomNum = Math.floor(Math.random() * 1000000);
          user.anonymousIdentifier = `anonymous${randomNum}`;
          
          // Ensure uniqueness
          let attempts = 0;
          let existingUser = await User.findOne({ anonymousIdentifier: user.anonymousIdentifier });
          while (existingUser && attempts < 10) {
            const randomNum = Math.floor(Math.random() * 1000000);
            user.anonymousIdentifier = `anonymous${randomNum}`;
            existingUser = await User.findOne({ anonymousIdentifier: user.anonymousIdentifier });
            attempts++;
          }
        } else if (!displayAsAnonymous) {
          // Clear anonymous identifier if disabling anonymous mode
          user.anonymousIdentifier = null;
        }
      }
      if (area !== undefined) user.area = area;
      
      await user.save();
      
      // Return updated user info
      // Always return both username and anonymousIdentifier so frontend knows both values
      res.json({
        id: user._id,
        email: user.email,
        name: user.name,
        username: user.username, // Actual username (stored separately, even when anonymous)
        anonymousIdentifier: user.anonymousIdentifier, // Anonymous identifier (for anonymous profile URL)
        displayAsAnonymous: user.displayAsAnonymous,
        area: user.area,
      });
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({ message: error.message });
    }
  },
};

module.exports = authController;

