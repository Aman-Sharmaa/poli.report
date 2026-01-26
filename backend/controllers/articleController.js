const Article = require('../models/Article');

const articleController = {
  // Get articles for a politician
  getBySlug: async (req, res) => {
    try {
      const articles = await Article.find({ politicianSlug: req.params.slug });
      res.json(articles);
    } catch (error) {
      console.error('Get articles error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Create or update article (with version history)
  createOrUpdate: async (req, res) => {
    try {
      const { section, sectionType, title, content, references, items, tableHeaders, tableRows, proofLink } = req.body;
      const userId = req.user?.userId || null;
      const User = require('../models/User');
      
      let article = await Article.findOne({
        politicianSlug: req.params.slug,
        section,
      });
      
      let user = null;
      if (userId) {
        user = await User.findById(userId);
      }
      
      // If updating existing article, save current version to history
      if (article) {
        // Create version snapshot before updating
        if (!article.versions) {
          article.versions = [];
        }
        
        article.versions.push({
          content: article.content,
          title: article.title,
          items: article.items || [],
          references: article.references || [],
          editedBy: article.editedBy,
          editedByName: user ? user.name || user.email : 'anonymous',
          editedByCredibility: user ? user.credibilityScore : 0,
          proofLink: proofLink || '',
          createdAt: new Date(),
        });
        
        // Check if this section has 10+ references (trigger development verification)
      const DevelopmentVerification = require('../models/DevelopmentVerification');
      const newItems = items || article.items || [];
      const referenceCount = newItems.filter(item => item.ref && item.ref.trim()).length;
      
      // Create or update development verification if 10+ references
      if (referenceCount >= 10 && section) {
        let verification = await DevelopmentVerification.findOne({
          politicianSlug: req.params.slug,
          articleId: article._id,
          section,
        });
        
        if (!verification || verification.referenceCount < 10) {
          // Create new verification request
          if (!verification) {
            verification = new DevelopmentVerification({
              politicianSlug: req.params.slug,
              articleId: article._id,
              section,
              referenceCount,
              minimumVotesRequired: Math.max(10, Math.floor(referenceCount / 10) * 5),
              status: 'pending',
            });
            await verification.save();
          } else {
            verification.referenceCount = referenceCount;
            verification.minimumVotesRequired = Math.max(10, Math.floor(referenceCount / 10) * 5);
            await verification.save();
          }
        }
      }
      
      // Now update to new version
        article.sectionType = sectionType || article.sectionType;
        article.title = title;
        article.content = content;
        article.references = references;
        article.items = items || article.items;
        article.tableHeaders = tableHeaders || article.tableHeaders;
        article.tableRows = tableRows || article.tableRows;
        article.updatedAt = new Date();
        article.editedBy = userId;
      } else {
        article = new Article({
          politicianSlug: req.params.slug,
          section,
          sectionType: sectionType || 'text',
          title,
          content,
          references,
          items,
          tableHeaders,
          tableRows,
          createdBy: userId,
          editedBy: userId,
          versions: [], // Initialize versions array
        });
        
        // Add initial version
        article.versions.push({
          content: content || '',
          title: title || '',
          items: items || [],
          references: references || [],
          editedBy: userId,
          editedByName: user ? user.name || user.email : 'anonymous',
          editedByCredibility: user ? user.credibilityScore : 0,
          proofLink: proofLink || '',
          createdAt: new Date(),
        });
      }
      
      await article.save();
      
      // DO NOT award credibility on creation - only after approval
      // Sections must be reviewed and approved before awarding points
      // Points will be awarded when section items are approved via community voting
      
      // Just update contribution count (but don't award points yet)
      if (userId) {
        const User = require('../models/User');
        const user = await User.findById(userId);
        if (user) {
          user.contributions.sectionsAdded += 1;
          await user.save();
        }
      }
      
      res.json(article);
    } catch (error) {
      console.error('Create or update article error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Update article by ID
  updateById: async (req, res) => {
    try {
      const { sectionType, title, content, references, items, tableHeaders, tableRows } = req.body;
      
      const article = await Article.findById(req.params.id);
      if (!article) {
        return res.status(404).json({ message: 'Article not found' });
      }
      
      article.sectionType = sectionType || article.sectionType;
      article.title = title;
      article.content = content;
      article.references = references;
      article.items = items || article.items;
      article.tableHeaders = tableHeaders || article.tableHeaders;
      article.tableRows = tableRows || article.tableRows;
      article.updatedAt = new Date();
      
      await article.save();
      res.json(article);
    } catch (error) {
      console.error('Update article by ID error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Delete article
  delete: async (req, res) => {
    try {
      const article = await Article.findByIdAndDelete(req.params.id);
      if (!article) {
        return res.status(404).json({ message: 'Article not found' });
      }
      res.json({ message: 'Article deleted successfully' });
    } catch (error) {
      console.error('Delete article error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Add item to section
  addItem: async (req, res) => {
    try {
      const { slug } = req.params;
      const { section, item } = req.body;
      const userId = req.user?.userId || null;
      
      let article = await Article.findOne({
        politicianSlug: slug,
        section,
      });
      
      if (!article) {
        return res.status(404).json({ message: 'Section not found' });
      }
      
      const newItem = {
        ...item,
        createdBy: userId,
        status: 'pending',
        approvalCount: 0,
        rejectCount: 0,
        requiresApprovalCount: 10,
        createdAt: new Date()
      };
      
      article.items.push(newItem);
      await article.save();
      
      res.json(article);
    } catch (error) {
      console.error('Add item error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Vote on an item (approve/reject)
  voteOnItem: async (req, res) => {
    try {
      const { id, itemIndex } = req.params;
      const { vote } = req.body;
      const userId = req.user?.userId || 'anonymous';
      
      if (!vote || !['approve', 'reject'].includes(vote)) {
        return res.status(400).json({ message: 'Valid vote (approve/reject) is required' });
      }
      
      const article = await Article.findById(id);
      if (!article) {
        return res.status(404).json({ message: 'Article not found' });
      }
      
      const item = article.items[itemIndex];
      if (!item) {
        return res.status(404).json({ message: 'Item not found' });
      }
      
      if (item.status === 'approved' || item.status === 'rejected') {
        return res.status(400).json({ message: 'Item is already reviewed' });
      }
      
      // Initialize votes array if not exists
      if (!item.votes) {
        item.votes = [];
      }
      
      // Get IP address for duplicate detection
      const ipAddress = req.ip || req.connection.remoteAddress;
      
      // Check if user already voted (by userId or IP for anonymous)
      const hasVoted = item.votes.some((v) => 
        (v.userId && userId !== 'anonymous' && v.userId.toString() === userId.toString()) || 
        (userId === 'anonymous' && v.ipAddress === ipAddress && !v.userId)
      );
      
      if (hasVoted) {
        return res.status(400).json({ message: 'You have already voted on this item' });
      }
      
      // Credibility-weighted voting: vote weight = credibilityScore / 100
      const User = require('../models/User');
      let voteWeight = 1.0; // Default for anonymous voters
      
      if (userId && userId !== 'anonymous') {
        const voterUser = await User.findById(userId);
        if (voterUser) {
          voteWeight = voterUser.credibilityScore / 100;
          voteWeight = Math.max(0.1, voteWeight);
          
          // Award +2 points for voting
          voterUser.contributions.reviewVotesCast += 1;
          await voterUser.addCredibility(2, `Voted on item review: ${vote}`, {
            actionType: 'review_vote',
            entityId: article._id.toString(),
            entityType: 'article',
            sectionName: article.section,
            politicianSlug: article.politicianSlug,
            approvedBy: [],
            approvalCount: 0,
            requiresApproval: false,
            approved: true,
            proofLink: '',
          });
          await voterUser.save();
        }
      }
      
      // Add vote to votes array
      item.votes.push({
        userId: userId !== 'anonymous' ? userId : null,
        vote,
        voteWeight,
        ipAddress,
        createdAt: new Date(),
      });
      
      // Update counts with weighted vote
      if (vote === 'approve') {
        item.approvalCount = (item.approvalCount || 0) + voteWeight;
      } else {
        item.rejectCount = (item.rejectCount || 0) + voteWeight;
      }
      
      // Check if threshold met for auto-approval
      if (item.approvalCount >= item.requiresApprovalCount) {
        item.status = 'approved';
        item.reviewedBy = 'community';
        item.reviewedAt = new Date();
        
        // Track who approved (for transparency) - get from item votes
        const approvers = item.votes
          .filter((v) => v.vote === 'approve')
          .map((v) => v.userId)
          .filter((id) => id && id !== 'anonymous' && id !== null);
        
        // Update creator's credibility (+5 for accepted article/item)
        // +10 bonus if item has verified reference (proof)
        if (item.createdBy) {
          const User = require('../models/User');
          try {
            const creator = await User.findById(item.createdBy);
            if (creator) {
              creator.contributions.editsApproved += 1;
              
              // Base points for approved edit
              let pointsToAdd = 5;
              let reason = 'Article/item accepted by community';
              
              // Bonus +10 points if item has a verified reference/proof
              if (item.refUrl && item.refUrl.trim()) {
                // Check if reference is verified by editors (approved by multiple credible editors)
                // If approval count >= 10 (weighted), the reference is considered verified
                const hasVerifiedReference = item.approvalCount >= 10 && approvers.length >= 3;
                
                if (hasVerifiedReference) {
                  pointsToAdd += 10; // Bonus for verified reference
                  reason = 'Article/item with verified reference accepted by community';
                  
                  // Add to verified proofs
                  if (!creator.verifiedProofs) {
                    creator.verifiedProofs = [];
                  }
                  
                  // Check if this proof already exists
                  const existingProof = creator.verifiedProofs.find(p => p.url === item.refUrl);
                  if (!existingProof) {
                    creator.verifiedProofs.push({
                      url: item.refUrl,
                      verified: true,
                      verifiedAt: new Date(),
                      verifiedBy: 'community',
                      points: 10,
                      type: 'reference'
                    });
                    
                    // Update proof score
                    creator.proofScore = (creator.proofScore || 0) + 10;
                  } else if (!existingProof.verified) {
                    // Update existing unverified proof to verified
                    existingProof.verified = true;
                    existingProof.verifiedAt = new Date();
                    existingProof.verifiedBy = 'community';
                    existingProof.points = 10;
                    creator.proofScore = (creator.proofScore || 0) + 10;
                  }
                }
              }
              
              await creator.addCredibility(pointsToAdd, reason, {
                actionType: 'edit_approved',
                entityId: article._id.toString(),
                entityType: 'article',
                sectionName: article.section,
                politicianSlug: article.politicianSlug,
                approvedBy: approvers,
                approvalCount: Math.round(item.approvalCount),
                requiresApproval: true,
                approved: true,
                proofLink: item.refUrl || '',
              });
              
              // Recalculate credibility with new formula including proof score
              creator.recalculateCredibility();
              await creator.save();
            }
          } catch (userError) {
            console.error('Error updating creator credibility:', userError);
          }
        }
        
        // Award section creator +8 points when first item is approved
        // Only award once per section, not per item
        if (article.createdBy && article.createdBy.toString() !== item.createdBy?.toString()) {
          const User = require('../models/User');
          try {
            const sectionCreator = await User.findById(article.createdBy);
            if (sectionCreator) {
              // Check if we already awarded points for this section
              const alreadyAwarded = sectionCreator.credibilityHistory.some((entry) => 
                entry.entityId === article._id.toString() && 
                entry.actionType === 'section_added' && 
                entry.approved === true
              );
              
              if (!alreadyAwarded) {
                await sectionCreator.addCredibility(8, `Section "${article.section}" approved after community review`, {
                  actionType: 'section_added',
                  entityId: article._id.toString(),
                  entityType: 'article',
                  sectionName: article.section,
                  politicianSlug: article.politicianSlug,
                  approvedBy: approvers,
                  approvalCount: Math.round(item.approvalCount),
                  requiresApproval: true,
                  approved: true,
                  proofLink: '',
                });
                await sectionCreator.save();
              }
            }
          } catch (userError) {
            console.error('Error updating section creator credibility:', userError);
          }
        }
      } else if (item.rejectCount >= item.requiresApprovalCount) {
        item.status = 'rejected';
        item.reviewedBy = 'community';
        item.reviewedAt = new Date();
        
        // Track who rejected (for transparency)
        const rejecters = item.votes
          .filter((v) => v.vote === 'reject')
          .map((v) => v.userId)
          .filter((id) => id && id !== 'anonymous' && id !== null);
        
        // Update creator's credibility (negative)
        if (item.createdBy) {
          const User = require('../models/User');
          try {
            const creator = await User.findById(item.createdBy);
            if (creator) {
              creator.contributions.editsRejected += 1;
              await creator.addCredibility(-3, 'Item rejected by community', {
                actionType: 'edit_rejected',
                entityId: article._id.toString(),
                entityType: 'article',
                sectionName: article.section,
                politicianSlug: article.politicianSlug,
                approvedBy: rejecters,
                approvalCount: Math.round(item.rejectCount),
                requiresApproval: true,
                approved: false,
                proofLink: item.refUrl || '',
              });
              await creator.save();
            }
          } catch (userError) {
            console.error('Error updating creator credibility:', userError);
          }
        }
      }
      
      await article.save();
      res.json(article);
    } catch (error) {
      console.error('Vote on item error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Get article version history
  getVersions: async (req, res) => {
    try {
      const article = await Article.findById(req.params.id);
      if (!article) {
        return res.status(404).json({ message: 'Article not found' });
      }
      
      res.json({
        articleId: article._id,
        section: article.section,
        currentVersion: {
          title: article.title,
          content: article.content,
          items: article.items,
          references: article.references,
          editedBy: article.editedBy,
          updatedAt: article.updatedAt,
        },
        versions: article.versions || [],
      });
    } catch (error) {
      console.error('Get article versions error:', error);
      res.status(500).json({ message: error.message });
    }
  },
  
  // Add verified proof to article (awards +10 credibility)
  addVerifiedProof: async (req, res) => {
    try {
      const { userId, proofUrl, proofType } = req.body;
      const User = require('../models/User');
      
      if (!userId || !proofUrl) {
        return res.status(400).json({ message: 'UserId and proof URL are required' });
      }
      
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      // Initialize verifiedProofs array if needed
      if (!user.verifiedProofs) {
        user.verifiedProofs = [];
      }
      
      // Check if this proof already exists
      const existingProof = user.verifiedProofs.find(p => p.url === proofUrl);
      if (existingProof && existingProof.verified) {
        return res.status(400).json({ message: 'This proof has already been verified' });
      }
      
      // Add or update proof
      if (existingProof) {
        existingProof.verified = true;
        existingProof.verifiedAt = new Date();
        existingProof.verifiedBy = 'community';
        existingProof.points = 10;
      } else {
        user.verifiedProofs.push({
          url: proofUrl,
          verified: true,
          verifiedAt: new Date(),
          verifiedBy: 'community',
          points: 10,
          type: proofType || 'general',
        });
      }
      
      // Update proof score
      user.proofScore = user.verifiedProofs
        .filter(p => p.verified)
        .reduce((sum, p) => sum + (p.points || 10), 0);
      
      // Recalculate credibility with new formula
      user.recalculateCredibility();
      
      // Award +10 credibility for verified proof (also tracked in proofScore)
      await user.addCredibility(10, 'Verified proof added', {
        actionType: 'proof_verified',
        entityId: null,
        entityType: 'proof',
        sectionName: null,
        politicianSlug: null,
        approvedBy: [],
        approvalCount: 0,
        requiresApproval: true,
        approved: true,
        proofLink: proofUrl,
      });
      
      // Check for auto-lock
      user.checkAutoLock();
      
      await user.save();
      
      res.json({ 
        message: 'Proof verified, credibility updated', 
        user: { 
          credibilityScore: user.credibilityScore,
          credibilityTier: user.credibilityTier,
          proofScore: user.proofScore,
        } 
      });
    } catch (error) {
      console.error('Verify proof error:', error);
      res.status(500).json({ message: error.message });
    }
  },
  
  // Reject/invalidate a proof (remove credibility)
  invalidateProof: async (req, res) => {
    try {
      const { userId, proofUrl, reason } = req.body;
      const User = require('../models/User');
      
      if (!userId || !proofUrl) {
        return res.status(400).json({ message: 'UserId and proof URL are required' });
      }
      
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      const proof = user.verifiedProofs?.find(p => p.url === proofUrl);
      if (!proof || !proof.verified) {
        return res.status(400).json({ message: 'Proof not found or not verified' });
      }
      
      // Mark as invalid
      proof.verified = false;
      proof.points = -20; // Negative points for fake proof
      
      // Update proof score
      user.proofScore = user.verifiedProofs
        .filter(p => p.verified)
        .reduce((sum, p) => sum + (p.points || 10), 0);
      
      // Recalculate credibility
      user.recalculateCredibility();
      
      // Penalty for invalid proof
      await user.addCredibility(-20, `Proof invalidated: ${reason || 'Fake or unverifiable'}`, {
        actionType: 'proof_invalidated',
        entityId: null,
        entityType: 'proof',
        sectionName: null,
        politicianSlug: null,
        approvedBy: [],
        approvalCount: 0,
        requiresApproval: true,
        approved: false,
        proofLink: proofUrl,
      });
      
      // Check for auto-lock (especially for big personalities)
      user.checkAutoLock();
      
      await user.save();
      
      res.json({ 
        message: 'Proof invalidated, credibility updated', 
        user: { 
          credibilityScore: user.credibilityScore,
          credibilityTier: user.credibilityTier,
          profileStatus: user.profileStatus,
        } 
      });
    } catch (error) {
      console.error('Invalidate proof error:', error);
      res.status(500).json({ message: error.message });
    }
  },
};

module.exports = articleController;

