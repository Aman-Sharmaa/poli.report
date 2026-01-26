const mongoose = require('mongoose');

// Article version history schema
const articleVersionSchema = new mongoose.Schema({
  content: String,
  title: String,
  items: [{
    text: String,
    date: String,
    ref: String,
    refUrl: String,
  }],
  references: [String],
  editedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  editedByName: String,
  editedByCredibility: Number,
  proofLink: String, // Reference/proof backing this version
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const articleSchema = new mongoose.Schema({
  politicianSlug: {
    type: String,
    required: true,
  },
  section: String,
  sectionType: {
    type: String,
    enum: ['timeline', 'bullet-points', 'table', 'text'],
    default: 'text'
  },
  title: String,
  content: String,
  references: [String],
  // Version history - every edit creates a new version
  versions: [articleVersionSchema],
  // For structured data (timeline, bullet points, table)
  items: [{
    text: String,
    date: String, // For timeline
    ref: String,
    refUrl: String,
    status: String, // For pending review
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    reviewedBy: String,
    reviewedAt: Date,
    approvalCount: {
      type: Number,
      default: 0
    },
    rejectCount: {
      type: Number,
      default: 0
    },
    requiresApprovalCount: {
      type: Number,
      default: 10
    },
    // Track votes for transparency
    votes: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      vote: {
        type: String,
        enum: ['approve', 'reject'],
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
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  // For table type sections
  tableHeaders: [String],
  tableRows: [[String]],
  editedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
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

module.exports = mongoose.model('Article', articleSchema);

