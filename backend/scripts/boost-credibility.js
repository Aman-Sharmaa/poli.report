/**
 * Script to boost user credibility for testing purposes
 * Usage: node scripts/boost-credibility.js <email> <points>
 * Example: node scripts/boost-credibility.js ama@rapydlaunch.com 75
 */

const mongoose = require('mongoose');
const User = require('../models/User');

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/polireport';

async function boostCredibility(email, points) {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      console.error(`User with email ${email} not found.`);
      console.log('Please register first at /api/auth/register');
      process.exit(1);
    }

    const oldScore = user.credibilityScore || 10;
    const targetScore = Math.min(100, Math.max(0, points)); // Cap between 0-100

    // Calculate required proofScore to achieve target score
    // Formula: (Proof × 0.5) + (Validation × 0.3) + (Quality × 0.2)
    // First, calculate what validation and quality scores will be after recalculation
    const contributions = user.contributions || {};
    
    // Calculate validation score from contributions (matches recalculateCredibility logic)
    let validationScore = (contributions.reviewVotesCast || 0) * 2;
    validationScore += (contributions.editsApproved || 0) * 5;
    validationScore += (contributions.sectionsAdded || 0) * 8;
    validationScore = Math.min(100, validationScore);
    
    // Calculate quality score (matches recalculateCredibility logic)
    const totalEdits = (contributions.editsApproved || 0) + (contributions.editsRejected || 0);
    let qualityScore = 50; // Base quality score
    if (totalEdits > 0) {
      const acceptanceRate = (contributions.editsApproved || 0) / totalEdits;
      qualityScore = acceptanceRate * 100;
      qualityScore -= (contributions.editsRejected || 0) * 3;
    }
    qualityScore = Math.max(0, Math.min(100, qualityScore));
    
    // Calculate what proofScore we need to reach target
    // targetScore = (proofScore × 0.5) + (validationScore × 0.3) + (qualityScore × 0.2)
    const validationComponent = validationScore * 0.3;
    const qualityComponent = qualityScore * 0.2;
    const remainingNeeded = targetScore - validationComponent - qualityComponent;
    const requiredProofScore = Math.max(0, Math.ceil(remainingNeeded / 0.5));

    console.log(`\n📊 Current Status:`);
    console.log(`   Current Score: ${oldScore}/100`);
    console.log(`   Validation: ${validationScore} (contributes ${validationComponent.toFixed(1)})`);
    console.log(`   Quality: ${qualityScore} (contributes ${qualityComponent.toFixed(1)})`);
    console.log(`   Target Score: ${targetScore}/100`);
    console.log(`   Required Proof Score: ${requiredProofScore}`);

    // Set proofScore to achieve target (testing override)
    // Note: In production, proofScore is calculated from verifiedProofs
    // But for testing, we set it directly to bypass the normal calculation
    user.proofScore = requiredProofScore;

    // Recalculate credibility (this will use the formula)
    const calculatedScore = user.recalculateCredibility();

    // Add to history
    user.credibilityHistory.push({
      date: new Date(),
      score: calculatedScore,
      reason: 'Testing credits for profile creation',
      change: calculatedScore - oldScore,
      actionType: 'testing_credits',
      entityId: null,
      entityType: 'testing',
      sectionName: null,
      politicianSlug: null,
      approvedBy: [],
      approvalCount: 0,
      requiresApproval: false,
      approved: true,
      proofLink: '',
    });
    
    await user.save();

    console.log(`\n✅ Successfully boosted credibility for ${email}`);
    console.log(`   Old score: ${oldScore}/100`);
    console.log(`   New score: ${user.credibilityScore}/100`);
    console.log(`\n📋 User Capabilities:`);
    console.log(`   Can Create Profile (Big): ${user.canCreateProfile('big_personality') ? '✅ Yes (60+ required)' : '❌ No'}`);
    console.log(`   Can Create Profile (Small): ${user.canCreateProfile('small_personality') ? '✅ Yes (20+ required)' : '❌ No'}`);
    console.log(`   Can Edit Content: ${user.canEdit() ? '✅ Yes (50+ required)' : '❌ No'}`);
    console.log(`   Can Review: ${user.canReview() ? '✅ Yes (30+ required)' : '❌ No'}`);
    console.log(`   Can Add Section: ${user.canAddSection() ? '✅ Yes (40+ required)' : '❌ No'}`);
    console.log(`   Credibility Tier: ${user.credibilityTier}`);
    console.log(`\n🎯 Now you can test profile creation!`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error boosting credibility:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Get command line arguments
const email = process.argv[2];
const points = parseInt(process.argv[3]) || 75; // Default to 75 points (enough to create profiles)

if (!email) {
  console.error('Usage: node scripts/boost-credibility.js <email> [points]');
  console.error('Example: node scripts/boost-credibility.js ama@rapydlaunch.com 75');
  process.exit(1);
}

boostCredibility(email, points);

