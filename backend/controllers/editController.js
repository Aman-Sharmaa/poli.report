const Edit = require('../models/Edit');
const Politician = require('../models/Politician');

const editController = {
  // Get edits for a specific person by slug
  getBySlug: async (req, res) => {
    try {
      const { slug } = req.params;
      // Return all edits (pending, under_review, approved, rejected) so users can see history
      const edits = await Edit.find({ 
        personId: slug
      })
        .sort({ createdAt: -1 });
      res.json(edits);
    } catch (error) {
      console.error('Get edits by slug error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Get edits created by a user
  getByUser: async (req, res) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      // Find edits where userId matches (can be string or ObjectId)
      // Need to handle both ObjectId and string formats
      const mongoose = require('mongoose');
      let query;
      if (mongoose.Types.ObjectId.isValid(userId)) {
        // If userId is a valid ObjectId, search for both ObjectId and string versions
        query = {
          $or: [
            { userId: new mongoose.Types.ObjectId(userId) },
            { userId: userId.toString() }
          ]
        };
      } else {
        // If userId is a string, just search for exact match
        query = { userId: userId };
      }
      
      const edits = await Edit.find(query)
        .sort({ createdAt: -1 });
      res.json(edits);
    } catch (error) {
      console.error('Get edits by user error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Get pending and under_review edits
  getPending: async (req, res) => {
    try {
      const edits = await Edit.find({ 
        status: { $in: ['pending', 'under_review'] } 
      })
        .sort({ createdAt: -1 });
      res.json(edits);
    } catch (error) {
      console.error('Get pending edits error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Vote on an edit review
  voteOnEdit: async (req, res) => {
    try {
      const User = require('../models/User');
      const { vote, constituency, latitude, longitude } = req.body;
      const ipAddress = req.ip || req.connection.remoteAddress;
      
      if (!vote || !['approve', 'reject'].includes(vote)) {
        return res.status(400).json({ message: 'Valid vote (approve/reject) is required' });
      }
      
      const edit = await Edit.findById(req.params.id);
      if (!edit) {
        return res.status(404).json({ message: 'Edit not found' });
      }
      
      if (edit.status !== 'under_review') {
        return res.status(400).json({ message: 'Edit is no longer under review' });
      }
      
      // Check if user already voted from this IP
      const hasVoted = edit.reviewVotes.some(v => v.ipAddress === ipAddress);
      if (hasVoted) {
        return res.status(400).json({ message: 'You have already voted on this edit' });
      }
      
      // Credibility-weighted voting: vote weight = credibilityScore / 100
      let voteWeight = 1.0; // Default for anonymous voters
      
      if (req.user?.userId) {
        const voterUser = await User.findById(req.user.userId);
        if (voterUser) {
          voteWeight = voterUser.credibilityScore / 100;
          // Minimum weight of 0.1 to ensure low-credibility users can still contribute
          voteWeight = Math.max(0.1, voteWeight);
        }
      }
      
      // Add vote with weight
      edit.reviewVotes.push({
        userId: req.user?.userId || 'anonymous',
        vote,
        voteWeight,
        ipAddress,
        location: { latitude, longitude, constituency },
        createdAt: new Date(),
      });
      
      // Update counts with weighted vote
      if (vote === 'approve') {
        edit.approvalCount = (edit.approvalCount || 0) + voteWeight;
      } else {
        edit.rejectCount = (edit.rejectCount || 0) + voteWeight;
      }
      
      // Update voter's credibility and contributions
      if (req.user?.userId) {
        try {
          const voterUser = await User.findById(req.user.userId);
          if (voterUser) {
            voterUser.contributions.reviewVotesCast += 1;
            
            // Get politician info for metadata
            const Politician = require('../models/Politician');
            const politician = await Politician.findOne({ slug: edit.personId });
            
            await voterUser.addCredibility(2, `Voted on edit review: ${vote}`, {
              actionType: 'review_vote',
              entityId: edit._id.toString(),
              entityType: 'edit',
              sectionName: edit.section,
              politicianSlug: edit.personId,
              approvedBy: [],
              approvalCount: 0,
              requiresApproval: false,
              approved: true,
              proofLink: '',
            });
            await voterUser.save();
          }
        } catch (userError) {
          console.error('Error updating voter credibility:', userError);
        }
      }
      
      // Check if enough approvals (using weighted votes)
      const approvalThreshold = edit.requiresApprovalCount || 10;
      if (edit.approvalCount >= approvalThreshold) {
        edit.status = 'approved';
        edit.reviewedBy = 'community';
        edit.reviewedAt = new Date();
        
        // Apply the edit to politician data
        const Politician = require('../models/Politician');
        const politician = await Politician.findOne({ slug: edit.personId });
        
        if (politician) {
          if (edit.section === 'name') {
            politician.name = edit.newContent;
          } else if (politician.articles) {
            const articleIndex = politician.articles.findIndex(a => a.section === edit.section);
            if (articleIndex !== -1) {
              politician.articles[articleIndex].content = edit.newContent;
            }
          }
          await politician.save();
        }
        
        // Update edit creator's credibility if they're registered
        if (edit.userId && edit.userId !== 'anonymous') {
          try {
            const editCreator = await User.findById(edit.userId);
            if (editCreator) {
              editCreator.contributions.editsApproved += 1;
              
              // Get approvers list
              const approvers = edit.reviewVotes
                .filter((v) => v.vote === 'approve')
                .map((v) => v.userId)
                .filter((id) => id && id !== 'anonymous');
              
              await editCreator.addCredibility(5, 'Edit was approved by community', {
                actionType: 'edit_approved',
                entityId: edit._id.toString(),
                entityType: 'edit',
                sectionName: edit.section,
                politicianSlug: edit.personId,
                approvedBy: approvers,
                approvalCount: Math.round(edit.approvalCount),
                requiresApproval: true,
                approved: true,
                proofLink: '',
              });
              await editCreator.save();
            }
          } catch (userError) {
            console.error('Error updating edit creator credibility:', userError);
          }
        }
      } else if (edit.rejectCount >= approvalThreshold) {
        edit.status = 'rejected';
        edit.reviewedBy = 'community';
        edit.reviewedAt = new Date();
        
        // Update edit creator's credibility (negative for rejected edit)
        if (edit.userId && edit.userId !== 'anonymous') {
          try {
            const editCreator = await User.findById(edit.userId);
            if (editCreator) {
              editCreator.contributions.editsRejected += 1;
              
              // Get rejecters list
              const rejecters = edit.reviewVotes
                .filter((v) => v.vote === 'reject')
                .map((v) => v.userId)
                .filter((id) => id && id !== 'anonymous');
              
              await editCreator.addCredibility(-3, 'Edit was rejected by community', {
                actionType: 'edit_rejected',
                entityId: edit._id.toString(),
                entityType: 'edit',
                sectionName: edit.section,
                politicianSlug: edit.personId,
                approvedBy: rejecters,
                approvalCount: Math.round(edit.rejectCount),
                requiresApproval: true,
                approved: false,
                proofLink: '',
              });
              await editCreator.save();
            }
          } catch (userError) {
            console.error('Error updating edit creator credibility:', userError);
          }
        }
      }
      
      await edit.save();
      res.json(edit);
    } catch (error) {
      console.error('Vote on edit error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Submit an edit
  submit: async (req, res) => {
    try {
      const User = require('../models/User');
      
      const { personId, section, newContent, latitude, longitude } = req.body;
      const ipAddress = req.ip || req.connection.remoteAddress;
      
      if (!personId || !section || !newContent) {
        return res.status(400).json({ message: 'personId, section, and newContent are required' });
      }

      // Get user ID if logged in (optional auth)
      let userId = req.body.userId; // From request body
      if (req.user?.userId) {
        userId = req.user.userId; // Override with authenticated user ID if available
      }

      // Find the politician to get current content
      const politician = await Politician.findOne({ slug: personId });
      
      if (!politician) {
        return res.status(404).json({ message: 'Politician not found' });
      }
      
      // Verify credibility if user is logged in
      if (userId && userId !== 'anonymous') {
        const user = await User.findById(userId);
        if (user) {
          // Check if user can edit (credibility >= 50) - no admin exceptions
          if (!user.canEdit()) {
            return res.status(403).json({
              message: 'You need a credibility score of 50+ to submit edits. Review more edits to increase your score.',
              currentScore: user.credibilityScore,
              requiredScore: 50
            });
          }
          
          // Update contributions
          user.contributions.editsCreated += 1;
          await user.save();
        }
      }
      
      // Create edit proposal - starts as 'under_review'
      const edit = new Edit({
        personId,
        section,
        currentContent: 'None', // Default for new items
        newContent,
        userId: userId || 'anonymous',
        status: 'under_review',
        approvalCount: 0,
        rejectCount: 0,
        requiresApprovalCount: 10, // Minimum 10 reviews required
        reviewVotes: [],
        ipAddress,
        location: {
          latitude,
          longitude,
        },
      });
      
      await edit.save();
      res.status(201).json(edit);
    } catch (error) {
      console.error('Submit edit error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Approve an edit
  approve: async (req, res) => {
    try {
      const { reviewedBy } = req.body;
      
      const edit = await Edit.findById(req.params.id);
      
      if (!edit) {
        return res.status(404).json({ message: 'Edit not found' });
      }
      
      // Apply the edit to the politician document
      const politician = await Politician.findOne({ slug: edit.personId });
      
      if (!politician) {
        return res.status(404).json({ message: 'Politician not found' });
      }
      
      // Update the politician based on the edit
      if (edit.section === 'name') {
        politician.name = edit.newContent;
      } else if (edit.section.startsWith('article')) {
        const articleIndex = politician.articles.findIndex(a => a.section === edit.section);
        if (articleIndex !== -1) {
          politician.articles[articleIndex].content = edit.newContent;
        }
      }
      
      await politician.save();
      
      // Update edit status
      edit.status = 'approved';
      edit.reviewedBy = reviewedBy || 'admin';
      edit.reviewedAt = new Date();
      await edit.save();
      
      res.json(edit);
    } catch (error) {
      console.error('Approve edit error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Reject an edit
  reject: async (req, res) => {
    try {
      const { reviewedBy } = req.body;
      
      const edit = await Edit.findById(req.params.id);
      
      if (!edit) {
        return res.status(404).json({ message: 'Edit not found' });
      }
      
      edit.status = 'rejected';
      edit.reviewedBy = reviewedBy || 'admin';
      edit.reviewedAt = new Date();
      await edit.save();
      
      res.json(edit);
    } catch (error) {
      console.error('Reject edit error:', error);
      res.status(500).json({ message: error.message });
    }
  },
};

module.exports = editController;

