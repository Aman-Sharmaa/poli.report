const mongoose = require('mongoose');

const pollSchema = new mongoose.Schema({
  politicianSlug: String,
  question: {
    type: String,
    required: true,
  },
  constituencies: [String],
  options: [String],
  pollType: {
    type: String,
    enum: ['multiple-choice', 'rating'],
    default: 'multiple-choice'
  },
  ratingRange: {
    min: { type: Number, default: 0 },
    max: { type: Number, default: 10 },
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  createdByName: String,
  responses: [{
    constituency: String,
    option: String,
    rating: Number, // For rating type polls
    anonymous: Boolean,
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    userName: String,
    voteWeight: {
      type: Number,
      default: 1.0, // Credibility-weighted vote (0.1 to 1.0)
    },
    deviceFingerprint: String, // For duplicate prevention
    ipAddress: String,
    userAgent: String,
    location: {
      latitude: Number,
      longitude: Number,
      constituency: String,
      state: String,
      city: String,
    },
    createdAt: Date,
  }],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Poll', pollSchema);

