const mongoose = require('mongoose');

const developmentVerificationSchema = new mongoose.Schema({
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
  // Number of references in this section (triggers verification if >= 10)
  referenceCount: {
    type: Number,
    required: true,
  },
  // Verification status: 'pending' (needs votes), 'verified' (majority verified), 'rejected' (majority rejected)
  status: {
    type: String,
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending',
  },
  // Votes
  votes: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    deviceFingerprint: String,
    ipAddress: String,
    userAgent: String,
    vote: {
      type: String,
      enum: ['verified', 'not_verified'],
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  }],
  // Counts
  verifiedCount: {
    type: Number,
    default: 0,
  },
  notVerifiedCount: {
    type: Number,
    default: 0,
  },
  // Minimum votes required for verification (default 10, increases with reference count)
  minimumVotesRequired: {
    type: Number,
    default: 10,
  },
  verifiedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Index for finding pending verifications
developmentVerificationSchema.index({ status: 1, politicianSlug: 1 });

module.exports = mongoose.model('DevelopmentVerification', developmentVerificationSchema);

