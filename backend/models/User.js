const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    default: '',
  },
  username: {
    type: String,
    unique: true,
    sparse: true, // Allows multiple null values
    lowercase: true,
    trim: true,
    match: [/^[a-z0-9_]+$/, 'Username can only contain lowercase letters, numbers, and underscores'],
  },
  displayAsAnonymous: {
    type: Boolean,
    default: false, // Simple toggle: false = Public, true = Anonymous
  },
  anonymousIdentifier: {
    type: String,
    unique: true,
    sparse: true, // Allows multiple null values
    lowercase: true,
    trim: true,
    default: null, // Generated when user enables anonymous mode
  },
  area: {
    type: String,
    default: '',
  },
  credibilityScore: {
    type: Number,
    default: 10, // Start with 10 for new users (will be 20 for small personalities, 60+ for big personalities)
    min: 0,
    max: 100,
  },
  credibilityTier: {
    type: String,
    enum: ['new_unverified', 'emerging_observer', 'contributor_verified', 'trusted_influencer', 'highly_credible'],
    default: 'new_unverified',
  },
  personalityType: {
    type: String,
    enum: ['big_personality', 'small_personality', null],
    default: null, // Determined based on initial credibility and profile creation
  },
  proofScore: {
    type: Number,
    default: 0, // Sum of verified proof points
  },
  communityValidation: {
    type: Number,
    default: 0, // Calculated from votes and reviews
  },
  contributionQuality: {
    type: Number,
    default: 0, // Quality rating based on acceptance/rejection rate
  },
  verifiedProofs: [{
    url: String,
    verified: Boolean,
    verifiedAt: Date,
    verifiedBy: String, // System or community
    points: Number, // Usually +10 for verified, -20 for fake
    type: String, // 'government', 'news', 'document', 'video', etc.
  }],
  profileStatus: {
    type: String,
    enum: ['active', 'under_review', 'locked'],
    default: 'active',
  },
  lastValidatedAt: Date,
  contributions: {
    editsCreated: { type: Number, default: 0 },
    editsApproved: { type: Number, default: 0 },
    editsRejected: { type: Number, default: 0 },
    reviewVotesCast: { type: Number, default: 0 }, // Number of edit reviews voted on
    profilesCreated: { type: Number, default: 0 },
    feedbacksGiven: { type: Number, default: 0 },
    sectionsAdded: { type: Number, default: 0 }, // Number of sections added
  },
  credibilityHistory: [{
    date: Date,
    score: Number,
    reason: String, // What action caused the change
    change: Number, // Positive or negative change
    // Additional metadata for transparency
    actionType: String, // 'section_added', 'edit_approved', 'review_vote', 'profile_created', 'proof_verified', 'feedback_helpful'
    entityId: String, // Article ID, Edit ID, Profile slug, etc.
    entityType: String, // 'article', 'edit', 'profile', 'poll', 'feedback'
    sectionName: String, // Which section was added/edited
    politicianSlug: String, // Which politician's profile
    approvedBy: [String], // Array of user IDs who approved (for transparency)
    approvalCount: Number, // Number of approvals received
    requiresApproval: Boolean, // Whether this action required approval
    approved: Boolean, // Whether this has been approved (only award points if true)
    proofLink: String, // Reference/proof link if applicable
  }],
  ipAddress: String,
  location: {
    latitude: Number,
    longitude: Number,
    constituency: String,
    state: String,
    city: String,
    district: String,
  },
  // Anti-spam tracking
  spamAttempts: {
    type: Number,
    default: 0,
  },
  isBlocked: {
    type: Boolean,
    default: false,
  },
  blockedReason: String,
  blockedAt: Date,
  deviceInfo: {
    userAgent: String,
    platform: String,
    language: String,
  },
  lastLoginAt: Date,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Add credibility score with history tracking (enhanced with metadata)
userSchema.methods.addCredibility = async function (points, reason, metadata = {}) {
  const oldScore = this.credibilityScore;
  const newScore = Math.min(100, Math.max(0, oldScore + points));
  
  this.credibilityScore = newScore;
  this.credibilityHistory.push({
    date: new Date(),
    score: newScore,
    reason: reason,
    change: points,
    actionType: metadata.actionType || null,
    entityId: metadata.entityId || null,
    entityType: metadata.entityType || null,
    sectionName: metadata.sectionName || null,
    politicianSlug: metadata.politicianSlug || null,
    approvedBy: metadata.approvedBy || [],
    approvalCount: metadata.approvalCount || 0,
    requiresApproval: metadata.requiresApproval || false,
    approved: metadata.approved || true, // Default true for backward compatibility
    proofLink: metadata.proofLink || null,
  });
  
  await this.save();
  return { oldScore, newScore, reason };
};

// Calculate credibility based on new formula: (Proof × 0.5) + (Validation × 0.3) + (Quality × 0.2)
userSchema.methods.recalculateCredibility = function () {
  const contributions = this.contributions;
  
  // 1. Proof Score (from verifiedProofs)
  const proofScore = this.proofScore || 0;
  
  // 2. Community Validation Score (from votes and reviews)
  // Base validation from review votes
  let validationScore = contributions.reviewVotesCast * 2; // Each review vote contributes
  // Add validation from accepted edits (community approved them)
  validationScore += contributions.editsApproved * 5;
  // Add validation from accepted sections
  validationScore += contributions.sectionsAdded * 8;
  // Normalize to 0-100 scale (assuming typical max contributions)
  validationScore = Math.min(100, validationScore);
  
  // 3. Contribution Quality Score
  const totalEdits = contributions.editsApproved + contributions.editsRejected;
  let qualityScore = 50; // Base quality score
  if (totalEdits > 0) {
    const acceptanceRate = contributions.editsApproved / totalEdits;
    qualityScore = acceptanceRate * 100; // Quality based on acceptance rate
    // Penalty for rejected edits
    qualityScore -= contributions.editsRejected * 3;
  }
  qualityScore = Math.max(0, Math.min(100, qualityScore));
  
  // Calculate final score using formula: (Proof × 0.5) + (Validation × 0.3) + (Quality × 0.2)
  const calculatedScore = (proofScore * 0.5) + (validationScore * 0.3) + (qualityScore * 0.2);
  
  // Cap at 100, minimum 0
  const finalScore = Math.min(100, Math.max(0, Math.round(calculatedScore)));
  
  this.credibilityScore = finalScore;
  this.communityValidation = validationScore;
  this.contributionQuality = qualityScore;
  
  // Update credibility tier
  this.updateCredibilityTier();
  
  return finalScore;
};

// Update credibility tier based on score
userSchema.methods.updateCredibilityTier = function () {
  const score = this.credibilityScore;
  if (score >= 81) {
    this.credibilityTier = 'highly_credible';
  } else if (score >= 61) {
    this.credibilityTier = 'trusted_influencer';
  } else if (score >= 41) {
    this.credibilityTier = 'contributor_verified';
  } else if (score >= 21) {
    this.credibilityTier = 'emerging_observer';
  } else {
    this.credibilityTier = 'new_unverified';
  }
};

// Get credibility tier title and emoji
userSchema.methods.getCredibilityTierInfo = function () {
  const tiers = {
    'new_unverified': { title: 'New / Unverified', description: 'Just joined or has little/no references.' },
    'emerging_observer': { title: 'Emerging / Observer', description: 'Some activity, few verified proofs.' },
    'contributor_verified': { title: 'Contributor / Verified Member', description: 'Regular, credible participant with proven references.' },
    'trusted_influencer': { title: 'Trusted / Influencer', description: 'Public figure or expert with consistent credibility.' },
    'highly_credible': { title: 'Highly Credible / Public Authority', description: 'Verified figure with long-term proof-backed reliability.' },
  };
  return tiers[this.credibilityTier] || tiers['new_unverified'];
};

// Check if profile should be locked (auto-lock rule)
userSchema.methods.checkAutoLock = function () {
  // Big personalities: lock if credibility < 50
  // Small personalities: lock if credibility < 10 (very low threshold)
  if (this.personalityType === 'big_personality') {
    if (this.credibilityScore < 50) {
      this.profileStatus = 'under_review';
      return true;
    }
  } else if (this.personalityType === 'small_personality') {
    if (this.credibilityScore < 10) {
      this.profileStatus = 'under_review';
      return true;
    }
  }
  
  // Unlock if score is back above threshold
  if (this.profileStatus === 'under_review') {
    const threshold = this.personalityType === 'big_personality' ? 50 : 10;
    if (this.credibilityScore >= threshold) {
      this.profileStatus = 'active';
    }
  }
  
  return this.profileStatus === 'under_review' || this.profileStatus === 'locked';
};

// Check if user can create profiles (different thresholds for big vs small personalities)
userSchema.methods.canCreateProfile = function (personalityType = 'small_personality') {
  // Big personalities need 60+ credibility
  // Small personalities need 20+ credibility
  const requiredScore = personalityType === 'big_personality' ? 60 : 20;
  return this.credibilityScore >= requiredScore;
};

// Determine personality type based on initial credibility and proof count
userSchema.methods.determinePersonalityType = function () {
  // If user has high credibility (60+) and multiple proofs (3+), they're a big personality
  // Otherwise, they're a small personality
  const verifiedProofCount = this.verifiedProofs?.filter(p => p.verified === true).length || 0;
  
  if (this.credibilityScore >= 60 && verifiedProofCount >= 3) {
    this.personalityType = 'big_personality';
  } else {
    this.personalityType = 'small_personality';
  }
  
  return this.personalityType;
};

// Check if user can edit content
userSchema.methods.canEdit = function () {
  return this.credibilityScore >= 50;
};

// Check if user can review edits
userSchema.methods.canReview = function () {
  return this.credibilityScore >= 30;
};

// Check if user can add sections
userSchema.methods.canAddSection = function () {
  return this.credibilityScore >= 40;
};

module.exports = mongoose.model('User', userSchema);

