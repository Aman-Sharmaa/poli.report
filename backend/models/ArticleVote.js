const mongoose = require('mongoose');

const articleVoteSchema = new mongoose.Schema({
  politicianSlug: {
    type: String,
    required: true,
    index: true,
  },
  articleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Article',
    required: true,
    index: true,
  },
  section: {
    type: String,
    required: true,
  },
  // For item-level voting (if voting on specific items within a section)
  itemIndex: {
    type: Number,
    default: null, // Null means voting on entire section
  },
  // Vote type: 'like' (+1), 'neutral' (0), 'dislike' (-1), or 'development_verified', 'development_not_verified'
  voteType: {
    type: String,
    enum: ['like', 'neutral', 'dislike', 'development_verified', 'development_not_verified'],
    required: true,
  },
  // User tracking
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  // Anonymous tracking
  deviceFingerprint: {
    type: String,
    required: true,
    index: true,
  },
  ipAddress: {
    type: String,
    required: true,
  },
  userAgent: String,
  location: {
    latitude: Number,
    longitude: Number,
    constituency: String,
    state: String,
    city: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Compound index to prevent duplicate votes
articleVoteSchema.index({ articleId: 1, section: 1, itemIndex: 1, deviceFingerprint: 1, ipAddress: 1 }, { unique: true });

// Index for aggregation queries
articleVoteSchema.index({ politicianSlug: 1, section: 1, voteType: 1 });

module.exports = mongoose.model('ArticleVote', articleVoteSchema);

