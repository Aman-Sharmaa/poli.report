const mongoose = require('mongoose');

const editSchema = new mongoose.Schema({
  personId: {
    type: String,
    required: true,
  },
  section: {
    type: String,
    required: true,
  },
  currentContent: {
    type: String,
    required: true,
  },
  newContent: {
    type: String,
    required: true,
  },
  userId: String,
  status: {
    type: String,
    enum: ['pending', 'under_review', 'approved', 'rejected'],
    default: 'under_review',
  },
  // Anti-spam tracking for edit submissions
  ipAddress: String,
  deviceInfo: {
    userAgent: String,
    platform: String,
  },
  location: {
    latitude: Number,
    longitude: Number,
  },
  // Review voting system
  reviewVotes: [{
    userId: String,
    vote: {
      type: String,
      enum: ['approve', 'reject'],
    },
    voteWeight: {
      type: Number,
      default: 1.0, // Credibility-weighted vote (0.1 to 1.0)
    },
    ipAddress: String,
    location: {
      latitude: Number,
      longitude: Number,
      constituency: String,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  }],
  approvalCount: {
    type: Number,
    default: 0,
  },
  rejectCount: {
    type: Number,
    default: 0,
  },
  requiresApprovalCount: {
    type: Number,
    default: 10, // Minimum 10 credible reviews required (can be increased to 15)
    min: 10,
    max: 15,
  },
  reviewedBy: String,
  reviewedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Edit', editSchema);

