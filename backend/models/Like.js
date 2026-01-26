const mongoose = require('mongoose');

const likeSchema = new mongoose.Schema({
  politicianSlug: {
    type: String,
    required: true,
    index: true, // For faster queries
  },
  // User tracking for anonymous users
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null, // Null for anonymous users
  },
  // Anonymous tracking - unique identifier
  anonymousId: {
    type: String,
    default: null, // Browser fingerprint + IP hash
  },
  // Device fingerprint for duplicate prevention
  deviceFingerprint: {
    type: String,
    required: true,
    index: true,
  },
  ipAddress: {
    type: String,
    required: true,
    index: true,
  },
  userAgent: String,
  // Like status: 'liked' or 'unliked' (null means no action)
  status: {
    type: String,
    enum: ['liked', 'unliked', null],
    default: null,
  },
  // Toggle tracking - if user likes then unlikes, we track the latest
  actionType: {
    type: String,
    enum: ['like', 'unlike'],
    required: true,
  },
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
    index: true,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Compound index to prevent duplicate likes from same device+IP+politician
likeSchema.index({ politicianSlug: 1, deviceFingerprint: 1, ipAddress: 1 }, { unique: true });

// Index for fast queries by politician
likeSchema.index({ politicianSlug: 1, status: 1 });

module.exports = mongoose.model('Like', likeSchema);

