const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  politicianSlug: String,
  constituency: String,
  comment: String,
  rating: {
    type: Number,
    min: 1,
    max: 5,
  },
  reference: String,
  location: {
    latitude: Number,
    longitude: Number,
  },
  anonymous: {
    type: Boolean,
    default: true,
  },
  // Opinions are always anonymous - userId stored for tracking contributions only, not displayed
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  // userName is never stored for opinions (always anonymous)
  deviceFingerprint: String, // For duplicate prevention
  ipAddress: String,
  // Community validation for helpful feedback
  helpfulVotes: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    voteWeight: {
      type: Number,
      default: 1.0,
    },
    ipAddress: String,
    createdAt: {
      type: Date,
      default: Date.now,
    },
  }],
  helpfulScore: {
    type: Number,
    default: 0, // Credibility-weighted helpful votes
  },
  isHelpful: {
    type: Boolean,
    default: false, // Becomes true when helpfulScore >= threshold
  },
  helpfulCredibilityAwarded: {
    type: Number,
    default: 0, // 2-5 points awarded when marked helpful
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Feedback', feedbackSchema);

