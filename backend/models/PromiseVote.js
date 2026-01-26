const mongoose = require('mongoose');

const promiseVoteSchema = new mongoose.Schema({
  politicianSlug: {
    type: String,
    required: true,
    index: true,
  },
  promiseId: {
    type: String,
    required: true,
    index: true,
  },
  // Vote type: 'fulfilled', 'not_fulfilled', 'in_progress'
  voteType: {
    type: String,
    enum: ['fulfilled', 'not_fulfilled', 'in_progress'],
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
promiseVoteSchema.index({ politicianSlug: 1, promiseId: 1, deviceFingerprint: 1, ipAddress: 1 }, { unique: true });

// Index for aggregation
promiseVoteSchema.index({ politicianSlug: 1, promiseId: 1, voteType: 1 });

module.exports = mongoose.model('PromiseVote', promiseVoteSchema);

