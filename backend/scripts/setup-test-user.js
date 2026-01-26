/**
 * Script to create or boost user credibility for testing purposes
 * Usage: node scripts/setup-test-user.js <email> [password] [points]
 * Example: node scripts/setup-test-user.js ama@rapydlaunch.com password123 75
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/polireport';

async function setupTestUser(email, password = 'test123456', points = 75) {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    let user = await User.findOne({ email: email.toLowerCase() });
    const isNewUser = !user;

    if (isNewUser) {
      // Create new user
      console.log(`📝 Creating new user: ${email}`);
      const hashedPassword = await bcrypt.hash(password, 10);
      user = new User({
        email: email.toLowerCase(),
        password: hashedPassword,
        name: email.split('@')[0],
        credibilityScore: 10, // Default starting score
      });
      await user.save();
      console.log(`✅ User created successfully!\n`);
    } else {
      console.log(`👤 User already exists: ${email}`);
      console.log(`   Current credibility: ${user.credibilityScore}/100\n`);
    }

    // Boost credibility
    const oldScore = user.credibilityScore || 10;
    const targetScore = Math.min(100, Math.max(0, points)); // Cap between 0-100
    const pointsToAdd = targetScore - oldScore;

    if (pointsToAdd > 0) {
      console.log(`⬆️  Boosting credibility...`);
      console.log(`   Current: ${oldScore}/100`);
      console.log(`   Target: ${targetScore}/100`);
      console.log(`   Adding: ${pointsToAdd} points\n`);

      // Directly set credibility score for testing (bypassing recalculation)
      user.credibilityScore = targetScore;
      
      // Add to history
      user.credibilityHistory.push({
        date: new Date(),
        score: targetScore,
        reason: 'Testing credits for profile creation',
        change: pointsToAdd,
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

      // Update tier based on new score
      if (targetScore >= 80) {
        user.credibilityTier = 'highly_credible';
      } else if (targetScore >= 60) {
        user.credibilityTier = 'trusted_influencer';
      } else if (targetScore >= 40) {
        user.credibilityTier = 'contributor_verified';
      } else if (targetScore >= 20) {
        user.credibilityTier = 'emerging_observer';
      }

      await user.save();

      console.log(`✅ Credibility updated successfully!\n`);
    } else {
      console.log(`ℹ️  User already has ${oldScore} points (target: ${targetScore})\n`);
    }

    // Display final status
    console.log(`📊 User Status:`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Credibility Score: ${user.credibilityScore}/100`);
    console.log(`   Credibility Tier: ${user.credibilityTier || 'new_unverified'}\n`);

    console.log(`🔐 Login Credentials:`);
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}\n`);

    console.log(`📋 Capabilities:`);
    console.log(`   ✅ Can Create Profile: ${user.canCreateProfile() ? 'YES (70+ required)' : '❌ NO'}`);
    console.log(`   ${user.canEdit() ? '✅' : '❌'} Can Edit Content: ${user.canEdit() ? 'YES (50+ required)' : 'NO'}`);
    console.log(`   ${user.canReview() ? '✅' : '❌'} Can Review: ${user.canReview() ? 'YES (30+ required)' : 'NO'}`);
    console.log(`   ${user.canAddSection() ? '✅' : '❌'} Can Add Section: ${user.canAddSection() ? 'YES (40+ required)' : 'NO'}\n`);

    if (user.canCreateProfile()) {
      console.log(`🎯 You can now test profile creation!`);
      console.log(`   Visit: http://localhost:3000 (or your frontend URL)`);
      console.log(`   Login with: ${email} / ${password}`);
      console.log(`   Then try creating a new politician profile.\n`);
    } else {
      console.log(`⚠️  Note: Profile creation requires 70+ credibility`);
      console.log(`   Current score: ${user.credibilityScore}/100\n`);
    }

    await mongoose.disconnect();
    console.log(`✅ Setup complete!`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code === 11000) {
      console.error('   User with this email already exists');
    }
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Get command line arguments
const email = process.argv[2];
const password = process.argv[3] || 'test123456';
const points = parseInt(process.argv[4]) || 75; // Default to 75 points

if (!email) {
  console.error('Usage: node scripts/setup-test-user.js <email> [password] [points]');
  console.error('Example: node scripts/setup-test-user.js ama@rapydlaunch.com test123456 75');
  process.exit(1);
}

setupTestUser(email, password, points);

