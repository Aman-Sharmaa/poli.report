const PublicDataEntry = require('../models/PublicDataEntry');
const Politician = require('../models/Politician');
const User = require('../models/User');

const publicDataEntryController = {
  // Create a new public data entry (editors only: credibility >= 70)
  create: async (req, res) => {
    try {
      const { politicianSlug, title, description, references } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      // Check if user can create (must be editor: credibility >= 70)
      const user = await User.findById(userId);
      if (!user || user.credibilityScore < 70) {
        return res.status(403).json({ 
          message: 'You need a credibility score of 70+ to add public data entries' 
        });
      }

      // Verify politician exists
      const politician = await Politician.findOne({ slug: politicianSlug });
      if (!politician) {
        return res.status(404).json({ message: 'Politician not found' });
      }

      // Validate references
      const validatedReferences = (references || []).map(ref => ({
        url: ref.url || ref,
        title: ref.title || '',
        description: ref.description || '',
      }));

      // Create entry
      const entry = new PublicDataEntry({
        politicianSlug,
        title,
        description,
        references: validatedReferences,
        createdBy: userId,
        createdByCredibility: user.credibilityScore,
      });

      await entry.save();

      // Recalculate politician's overall credibility based on all entries
      await publicDataEntryController.recalculatePoliticianCredibility(politicianSlug);

      res.status(201).json({
        message: 'Public data entry created successfully',
        entry: await PublicDataEntry.findById(entry._id).populate('createdBy', 'name credibilityScore'),
      });
    } catch (error) {
      console.error('Create public data entry error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Get all public data entries for a politician
  getByPoliticianSlug: async (req, res) => {
    try {
      const { slug } = req.params;
      const userId = req.user?.id;

      const entries = await PublicDataEntry.find({ politicianSlug: slug, status: 'active' })
        .sort({ credibilityScore: -1, createdAt: -1 })
        .populate('createdBy', 'name credibilityScore username');

      // Calculate user's vote status for each entry
      const entriesWithUserVote = entries.map(entry => {
        const entryObj = entry.toObject();
        if (userId) {
          entryObj.userVote = entry.getUserVote(userId);
          entryObj.canVote = entry.canUserVote(userId);
        } else {
          entryObj.userVote = null;
          entryObj.canVote = false;
        }
        return entryObj;
      });

      res.json({
        entries: entriesWithUserVote,
        total: entriesWithUserVote.length,
      });
    } catch (error) {
      console.error('Get public data entries error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Get single entry by ID
  getById: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      const entry = await PublicDataEntry.findById(id)
        .populate('createdBy', 'name credibilityScore username');

      if (!entry) {
        return res.status(404).json({ message: 'Entry not found' });
      }

      const entryObj = entry.toObject();
      if (userId) {
        entryObj.userVote = entry.getUserVote(userId);
        entryObj.canVote = entry.canUserVote(userId);
      } else {
        entryObj.userVote = null;
        entryObj.canVote = false;
      }

      res.json(entry);
    } catch (error) {
      console.error('Get public data entry error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Vote on a public data entry (upvote or downvote)
  vote: async (req, res) => {
    try {
      const { id } = req.params;
      const { voteType } = req.body; // 'upvote' or 'downvote'
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      if (!['upvote', 'downvote'].includes(voteType)) {
        return res.status(400).json({ message: 'Invalid vote type. Must be "upvote" or "downvote"' });
      }

      const entry = await PublicDataEntry.findById(id);
      if (!entry) {
        return res.status(404).json({ message: 'Entry not found' });
      }

      // Check if user already voted
      if (!entry.canUserVote(userId)) {
        // Allow changing vote
        const existingVoteIndex = entry.votes.findIndex(v => v.userId.toString() === userId.toString());
        if (existingVoteIndex >= 0) {
          const existingVote = entry.votes[existingVoteIndex];
          if (existingVote.voteType === voteType) {
            return res.status(400).json({ message: 'You have already voted this way' });
          }
          // Remove old vote
          entry.votes.splice(existingVoteIndex, 1);
        }
      }

      // Get user for credibility weighting
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Add new vote
      const vote = {
        userId: userId,
        voteType: voteType,
        voterCredibility: user.credibilityScore,
        voteWeight: Math.max(0.1, Math.min(1.0, user.credibilityScore / 100)),
        ipAddress: req.ip || req.connection.remoteAddress,
        location: req.user.location || {},
      };

      entry.votes.push(vote);

      // Recalculate credibility
      await entry.recalculateCredibility();

      // Recalculate politician's overall credibility
      await publicDataEntryController.recalculatePoliticianCredibility(entry.politicianSlug);

      const updatedEntry = await PublicDataEntry.findById(id)
        .populate('createdBy', 'name credibilityScore username');

      const entryObj = updatedEntry.toObject();
      entryObj.userVote = updatedEntry.getUserVote(userId);
      entryObj.canVote = false; // Can't vote again (unless they change their vote)

      res.json({
        message: 'Vote recorded successfully',
        entry: entryObj,
      });
    } catch (error) {
      console.error('Vote on public data entry error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Update an entry (only creator or high-credibility editors)
  update: async (req, res) => {
    try {
      const { id } = req.params;
      const { title, description, references } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      const entry = await PublicDataEntry.findById(id);
      if (!entry) {
        return res.status(404).json({ message: 'Entry not found' });
      }

      const user = await User.findById(userId);
      
      // Only creator or users with 80+ credibility can edit
      const isCreator = entry.createdBy.toString() === userId.toString();
      const canEdit = isCreator || (user && user.credibilityScore >= 80);

      if (!canEdit) {
        return res.status(403).json({ 
          message: 'Only the creator or editors with 80+ credibility can edit entries' 
        });
      }

      if (title) entry.title = title;
      if (description) entry.description = description;
      if (references) {
        entry.references = references.map(ref => ({
          url: ref.url || ref,
          title: ref.title || '',
          description: ref.description || '',
        }));
      }

      // Recalculate reference factor
      entry.calculateCredibility();
      await entry.save();

      const updatedEntry = await PublicDataEntry.findById(id)
        .populate('createdBy', 'name credibilityScore username');

      res.json({
        message: 'Entry updated successfully',
        entry: updatedEntry,
      });
    } catch (error) {
      console.error('Update public data entry error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Delete an entry (only creator or high-credibility editors)
  delete: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      const entry = await PublicDataEntry.findById(id);
      if (!entry) {
        return res.status(404).json({ message: 'Entry not found' });
      }

      const user = await User.findById(userId);
      
      // Only creator or users with 80+ credibility can delete
      const isCreator = entry.createdBy.toString() === userId.toString();
      const canDelete = isCreator || (user && user.credibilityScore >= 80);

      if (!canDelete) {
        return res.status(403).json({ 
          message: 'Only the creator or editors with 80+ credibility can delete entries' 
        });
      }

      const politicianSlug = entry.politicianSlug;
      await PublicDataEntry.findByIdAndDelete(id);

      // Recalculate politician's overall credibility
      await publicDataEntryController.recalculatePoliticianCredibility(politicianSlug);

      res.json({ message: 'Entry deleted successfully' });
    } catch (error) {
      console.error('Delete public data entry error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Recalculate politician's overall credibility based on all public data entries
  recalculatePoliticianCredibility: async (politicianSlug) => {
    try {
      const entries = await PublicDataEntry.find({ 
        politicianSlug, 
        status: 'active' 
      });

      if (entries.length === 0) {
        // If no entries, politician credibility remains unchanged
        return;
      }

      // Calculate average credibility of all active entries
      const totalCredibility = entries.reduce((sum, entry) => sum + entry.credibilityScore, 0);
      const averageCredibility = Math.round(totalCredibility / entries.length);

      // Update politician's credibility score
      await Politician.findOneAndUpdate(
        { slug: politicianSlug },
        { 
          credibilityScore: averageCredibility,
          updatedAt: Date.now(),
        }
      );
    } catch (error) {
      console.error('Recalculate politician credibility error:', error);
    }
  },
};

module.exports = publicDataEntryController;

