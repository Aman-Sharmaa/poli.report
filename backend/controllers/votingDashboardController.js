const Article = require('../models/Article');
const ArticleVote = require('../models/ArticleVote');
const PromiseVote = require('../models/PromiseVote');
const DevelopmentVerification = require('../models/DevelopmentVerification');
const Poll = require('../models/Poll');
const Politician = require('../models/Politician');
const { getLocationInfo, isWithinRadius } = require('../utils/tracking');

const votingDashboardController = {
  // Get all votable items for a politician
  getAllVotableItems: async (req, res) => {
    try {
      const { slug } = req.params;
      const userId = req.user?.userId || null;
      
      // Get politician
      const politician = await Politician.findOne({ slug });
      if (!politician) {
        return res.status(404).json({ message: 'Politician not found' });
      }
      
      // Get all articles
      const articles = await Article.find({ politicianSlug: slug });
      
      // Get all votes by user to mark what they've already voted on
      const locationInfo = getLocationInfo(req);
      const userVotes = await ArticleVote.find({
        politicianSlug: slug,
        $or: [
          ...(userId ? [{ userId }] : []),
          { ipAddress: locationInfo.ipAddress }
        ]
      });
      const votedArticleIds = new Set(userVotes.map(v => v.articleId.toString()));
      const votedItems = new Set(userVotes.map(v => `${v.articleId}-${v.section}-${v.itemIndex || 'section'}`));
      
      // Build votable items list
      const votableItems = [];
      
      // 1. Article sections and items
      for (const article of articles) {
        // Section-level voting
        votableItems.push({
          type: 'article_section',
          id: `section-${article._id}-${article.section}`,
          articleId: article._id,
          section: article.section,
          title: `Section: ${article.section}`,
          content: article.title || article.content || '',
          itemIndex: null,
          likeCount: await ArticleVote.countDocuments({ 
            articleId: article._id, 
            section: article.section, 
            itemIndex: null,
            voteType: 'like' 
          }),
          dislikeCount: await ArticleVote.countDocuments({ 
            articleId: article._id, 
            section: article.section, 
            itemIndex: null,
            voteType: 'dislike' 
          }),
          userVoted: votedItems.has(`${article._id}-${article.section}-section`),
          userVoteType: userVotes.find(v => 
            v.articleId.toString() === article._id.toString() && 
            v.section === article.section && 
            v.itemIndex === null
          )?.voteType || null,
        });
        
        // Item-level voting
        if (article.items && article.items.length > 0) {
          for (let idx = 0; idx < article.items.length; idx++) {
            const item = article.items[idx];
            if (!item.pending) { // Only show approved items
              votableItems.push({
                type: 'article_item',
                id: `item-${article._id}-${article.section}-${idx}`,
                articleId: article._id,
                section: article.section,
                title: `Item: ${item.text?.substring(0, 50)}${item.text?.length > 50 ? '...' : ''}`,
                content: item.text || '',
                itemIndex: idx,
                ref: item.ref || item.refUrl || '',
                likeCount: await ArticleVote.countDocuments({ 
                  articleId: article._id, 
                  section: article.section, 
                  itemIndex: idx,
                  voteType: 'like' 
                }),
                dislikeCount: await ArticleVote.countDocuments({ 
                  articleId: article._id, 
                  section: article.section, 
                  itemIndex: idx,
                  voteType: 'dislike' 
                }),
                userVoted: votedItems.has(`${article._id}-${article.section}-${idx}`),
                userVoteType: userVotes.find(v => 
                  v.articleId.toString() === article._id.toString() && 
                  v.section === article.section && 
                  v.itemIndex === idx
                )?.voteType || null,
              });
            }
          }
        }
      }
      
      // 2. Development verifications (pending ones)
      const pendingVerifications = await DevelopmentVerification.find({
        politicianSlug: slug,
        status: 'pending'
      }).populate('articleId');
      
      for (const verification of pendingVerifications) {
        const hasVoted = verification.votes.some(v => 
          (userId && v.userId && v.userId.toString() === userId.toString()) ||
          (!userId && v.ipAddress === locationInfo.ipAddress)
        );
        
        votableItems.push({
          type: 'development_verification',
          id: `dev-${verification._id}`,
          articleId: verification.articleId._id || verification.articleId,
          section: verification.section,
          title: `Development Verification: ${verification.section} (${verification.referenceCount} references)`,
          content: `This section has ${verification.referenceCount} references. Verify if development happened?`,
          verifiedCount: verification.verifiedCount,
          notVerifiedCount: verification.notVerifiedCount,
          minimumVotesRequired: verification.minimumVotesRequired,
          userVoted: hasVoted,
          userVoteType: hasVoted ? verification.votes.find(v => 
            (userId && v.userId && v.userId.toString() === userId.toString()) ||
            (!userId && v.ipAddress === locationInfo.ipAddress)
          )?.vote : null,
        });
      }
      
      // 3. Promises
      const promiseVotes = await PromiseVote.find({
        politicianSlug: slug,
        $or: [
          ...(userId ? [{ userId }] : []),
          { ipAddress: locationInfo.ipAddress }
        ]
      });
      const votedPromiseIds = new Set(promiseVotes.map(v => v.promiseId));
      
      if (politician.promises && politician.promises.length > 0) {
        for (const promise of politician.promises) {
          votableItems.push({
            type: 'promise',
            id: `promise-${promise._id}`,
            promiseId: promise._id.toString(),
            title: promise.title,
            content: promise.description || '',
            status: promise.status,
            fulfilledCount: await PromiseVote.countDocuments({ 
              politicianSlug: slug, 
              promiseId: promise._id.toString(), 
              voteType: 'fulfilled' 
            }),
            notFulfilledCount: await PromiseVote.countDocuments({ 
              politicianSlug: slug, 
              promiseId: promise._id.toString(), 
              voteType: 'not_fulfilled' 
            }),
            inProgressCount: await PromiseVote.countDocuments({ 
              politicianSlug: slug, 
              promiseId: promise._id.toString(), 
              voteType: 'in_progress' 
            }),
            userVoted: votedPromiseIds.has(promise._id?.toString() || promise._id),
            userVoteType: promiseVotes.find(v => v.promiseId === (promise._id?.toString() || promise._id))?.voteType || null,
          });
        }
      }
      
      res.json({
        politicianSlug: slug,
        politicianName: politician.name,
        totalItems: votableItems.length,
        items: votableItems,
      });
    } catch (error) {
      console.error('Get all votable items error:', error);
      res.status(500).json({ message: error.message });
    }
  },
};

module.exports = votingDashboardController;

