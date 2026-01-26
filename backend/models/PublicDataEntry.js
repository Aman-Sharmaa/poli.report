const mongoose = require('mongoose');

const voteSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  voteType: {
    type: String,
    enum: ['upvote', 'downvote'],
    required: true,
  },
  voterCredibility: {
    type: Number,
    default: 0, // The voter's credibility at time of vote
  },
  voteWeight: {
    type: Number,
    default: 1.0, // Weight based on voter credibility (0.1 to 1.0)
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
});

const publicDataEntrySchema = new mongoose.Schema({
  politicianSlug: {
    type: String,
    required: true,
    index: true,
  },
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  // References provided by editor
  references: [{
    url: String,
    title: String,
    description: String,
  }],
  // Editor who created this entry (must have credibility >= 70)
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  createdByCredibility: {
    type: Number,
    default: 0, // Editor's credibility at creation time
  },
  // Voting system
  votes: [voteSchema],
  // Calculated scores
  upvotes: {
    type: Number,
    default: 0,
  },
  downvotes: {
    type: Number,
    default: 0,
  },
  weightedUpvotes: {
    type: Number,
    default: 0,
  },
  weightedDownvotes: {
    type: Number,
    default: 0,
  },
  credibilityScore: {
    type: Number,
    default: 50, // Auto-calculated
    min: 0,
    max: 100,
  },
  // Reference factor (0-5 points based on number and quality of references)
  referenceFactor: {
    type: Number,
    default: 0,
    min: 0,
    max: 5,
  },
  // Status tracking
  status: {
    type: String,
    enum: ['active', 'disputed', 'archived'],
    default: 'active',
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

// Calculate credibility score before save
publicDataEntrySchema.pre('save', function (next) {
  this.calculateCredibility();
  this.updatedAt = Date.now();
  next();
});

// Method to calculate credibility score
publicDataEntrySchema.methods.calculateCredibility = function () {
  // Calculate weighted votes
  let weightedUpvotes = 0;
  let weightedDownvotes = 0;
  
  this.votes.forEach(vote => {
    if (vote.voteType === 'upvote') {
      weightedUpvotes += vote.voteWeight || 1.0;
    } else {
      weightedDownvotes += vote.voteWeight || 1.0;
    }
  });
  
  this.weightedUpvotes = weightedUpvotes;
  this.weightedDownvotes = weightedDownvotes;
  
  // Count simple upvotes/downvotes
  this.upvotes = this.votes.filter(v => v.voteType === 'upvote').length;
  this.downvotes = this.votes.filter(v => v.voteType === 'downvote').length;
  
  // Calculate base score: (weightedUpvotes / (weightedUpvotes + weightedDownvotes)) * 100
  const totalWeightedVotes = weightedUpvotes + weightedDownvotes;
  let baseScore = 50; // Default neutral score
  
  if (totalWeightedVotes > 0) {
    baseScore = (weightedUpvotes / totalWeightedVotes) * 100;
  }
  
  // Calculate reference factor (0-5 points)
  // Each reference adds up to 1 point, max 5 points
  this.referenceFactor = Math.min(5, this.references.length);
  
  // Final credibility = baseScore + referenceFactor
  // Cap between 0 and 100
  this.credibilityScore = Math.min(100, Math.max(0, Math.round(baseScore + this.referenceFactor)));
  
  return this.credibilityScore;
};

// Method to recalculate and update scores (call after votes change)
publicDataEntrySchema.methods.recalculateCredibility = async function () {
  this.calculateCredibility();
  await this.save();
  return this.credibilityScore;
};

// Method to check if user can vote (one vote per user)
publicDataEntrySchema.methods.canUserVote = function (userId) {
  return !this.votes.some(vote => vote.userId.toString() === userId.toString());
};

// Method to get user's vote
publicDataEntrySchema.methods.getUserVote = function (userId) {
  const vote = this.votes.find(v => v.userId.toString() === userId.toString());
  return vote ? vote.voteType : null;
};

// Indexes for performance
publicDataEntrySchema.index({ politicianSlug: 1, createdAt: -1 });
publicDataEntrySchema.index({ credibilityScore: -1 });
publicDataEntrySchema.index({ 'votes.userId': 1 });

module.exports = mongoose.model('PublicDataEntry', publicDataEntrySchema);

