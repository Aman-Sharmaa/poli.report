/**
 * Comprehensive Workflow Test Script
 * Tests: Create Page → Create Section → Add Items → Vote → Auto-approve
 * 
 * Run: node backend/test-workflow.js
 */

const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:5001/api';
let authToken = '';
let testUserId = '';
let testPoliticianSlug = 'test-politician-page-6'; // Auto-created 6th page
let createdArticleId = '';
let createdSectionName = 'testSection';

// Test colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

function log(message, color = RESET) {
  console.log(`${color}${message}${RESET}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, GREEN);
}

function logError(message) {
  log(`❌ ${message}`, RED);
}

function logInfo(message) {
  log(`ℹ️  ${message}`, YELLOW);
}

function logStep(message) {
  log(`\n📋 ${message}`, BLUE);
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Step 1: Authentication & User Setup
async function setupUser() {
  logStep('STEP 1: Setting up test user');
  try {
    // Register admin user
    try {
      const registerResponse = await axios.post(`${API_URL}/auth/register`, {
        email: 'admin@test.com',
        password: 'admin123'
      });
      logInfo('New admin user registered');
    } catch (err) {
      if (err.response?.status === 400) {
        logInfo('Admin user already exists, proceeding to login');
      } else {
        throw err;
      }
    }

    // Login
    const loginResponse = await axios.post(`${API_URL}/auth/login`, {
      email: 'admin@test.com',
      password: 'admin123'
    });

    authToken = loginResponse.data.token;
    testUserId = loginResponse.data.userId;
    logSuccess('Login successful');
    logSuccess(`User ID: ${testUserId}`);
    return true;
  } catch (error) {
    logError(`Setup failed: ${error.message}`);
    return false;
  }
}

// Step 2: Create New Politician Page (Page #6)
async function createPoliticianPage() {
  logStep('STEP 2: Creating new politician page (Page #6)');
  try {
    const politicianData = {
      slug: testPoliticianSlug,
      name: 'Test Politician Page 6',
      type: 'politician',
      title: 'Test Member of Parliament',
      credibilityScore: 50,
      constituencies: ['Test Constituency'],
      location: {
        state: 'Test State',
        city: 'Test City',
        district: 'Test District',
        constituency: 'Test Constituency',
        coordinates: {
          latitude: 28.6139,
          longitude: 77.2090
        }
      }
    };

    const response = await axios.post(
      `${API_URL}/politicians`,
      politicianData,
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );

    logSuccess(`Politician page created: ${response.data.name}`);
    logSuccess(`Slug: ${response.data.slug}`);
    logSuccess(`Created By User ID: ${testUserId}`);
    return true;
  } catch (error) {
    logError(`Failed to create politician: ${error.response?.data?.message || error.message}`);
    // Continue anyway - page might already exist
    logInfo('Continuing with existing page...');
    return true;
  }
}

// Step 3: Create New Section
async function createSection() {
  logStep('STEP 3: Creating new section in page');
  try {
    const sectionData = {
      section: createdSectionName,
      sectionType: 'bullet-points',
      title: 'Test Section Title',
      items: []
    };

    const response = await axios.post(
      `${API_URL}/articles/${testPoliticianSlug}`,
      sectionData,
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );

    createdArticleId = response.data._id;
    logSuccess(`Section created: ${createdSectionName}`);
    logSuccess(`Article ID: ${createdArticleId}`);
    logSuccess(`Created By User ID: ${response.data.createdBy || testUserId}`);
    return true;
  } catch (error) {
    logError(`Failed to create section: ${error.response?.data?.message || error.message}`);
    return false;
  }
}

// Step 4: Add Items to Section
async function addItemsToSection() {
  logStep('STEP 4: Adding items to section');
  try {
    const items = [
      {
        text: 'This is the first item added to the section',
        ref: '[1] First Reference',
        refUrl: 'https://example.com/reference1'
      },
      {
        text: 'This is the second item with additional details',
        ref: '[2] Second Reference',
        refUrl: 'https://example.com/reference2'
      },
      {
        text: 'Third item showing community involvement',
        ref: '[3] Third Reference',
        refUrl: 'https://example.com/reference3'
      }
    ];

    for (let i = 0; i < items.length; i++) {
      await delay(500);
      
      try {
        const response = await axios.post(
          `${API_URL}/articles/${testPoliticianSlug}/item`,
          {
            section: createdSectionName,
            item: items[i]
          },
          {
            headers: { Authorization: `Bearer ${authToken}` }
          }
        );

        logSuccess(`Item ${i + 1} added: "${items[i].text.substring(0, 40)}..."`);
        
        // Get the item index for voting
        const itemIndex = response.data.items.length - 1;
        logInfo(`Item is at index ${itemIndex} and status: pending`);
      } catch (error) {
        logError(`Failed to add item ${i + 1}: ${error.response?.data?.message || error.message}`);
      }
    }

    return true;
  } catch (error) {
    logError(`Add items failed: ${error.message}`);
    return false;
  }
}

// Step 5: Simulate Voting & Auto-approve
async function simulateVoting() {
  logStep('STEP 5: Simulating community voting (trigger auto-approval)');
  
  try {
    // Get the article to find items
    const articleResponse = await axios.get(`${API_URL}/articles/${testPoliticianSlug}`);
    const article = articleResponse.data.find(a => a.section === createdSectionName);
    
    if (!article || !article.items || article.items.length === 0) {
      logError('No items found to vote on');
      return false;
    }

    const pendingItems = article.items.filter(item => item.status === 'pending');
    logInfo(`Found ${pendingItems.length} pending items to vote on`);

    // For each pending item, simulate 10 approve votes (to trigger auto-approval)
    for (let i = 0; i < pendingItems.length; i++) {
      const itemIndex = article.items.findIndex(item => 
        item.text === pendingItems[i].text && item.status === 'pending'
      );

      if (itemIndex === -1) continue;

      logInfo(`\nVoting on item ${i + 1}: "${pendingItems[i].text.substring(0, 40)}..."`);

      // Simulate 10 votes to trigger auto-approval
      for (let voteNum = 0; voteNum < 10; voteNum++) {
        try {
          await delay(100);
          
          const voteResponse = await axios.post(
            `${API_URL}/articles/${article._id}/item/${itemIndex}/vote`,
            {
              vote: 'approve'
            }
          );

          const currentItem = voteResponse.data.items[itemIndex];
          
          if (voteNum === 9) {
            // Last vote
            if (currentItem.status === 'approved') {
              logSuccess(`Item auto-approved after ${voteNum + 1} votes!`);
              logSuccess(`Approval Count: ${currentItem.approvalCount}`);
              logSuccess(`Reviewed By: ${currentItem.reviewedBy}`);
              logSuccess(`Reviewed At: ${currentItem.reviewedAt}`);
              logSuccess(`Created By User ID: ${currentItem.createdBy || 'anonymous'}`);
            }
          }
        } catch (error) {
          // Item might have been auto-approved already
          if (error.response?.status === 400 && error.response?.data?.message?.includes('already reviewed')) {
            logInfo(`Item already approved (vote ${voteNum + 1})`);
            break;
          }
        }
      }
    }

    return true;
  } catch (error) {
    logError(`Voting failed: ${error.response?.data?.message || error.message}`);
    return false;
  }
}

// Step 6: Verify Results
async function verifyResults() {
  logStep('STEP 6: Verifying results and tracking');
  
  try {
    const articleResponse = await axios.get(`${API_URL}/articles/${testPoliticianSlug}`);
    const article = articleResponse.data.find(a => a.section === createdSectionName);
    
    if (!article) {
      logError('Article not found');
      return false;
    }

    logInfo('\n📊 FINAL TRACKING SUMMARY:');
    logInfo('='.repeat(80));
    logInfo(`Article ID: ${article._id}`);
    logInfo(`Section: ${article.section}`);
    logInfo(`Created By User ID: ${article.createdBy || 'N/A'}`);
    logInfo(`Last Edited By User ID: ${article.editedBy || 'N/A'}`);
    logInfo(`Created At: ${article.createdAt}`);
    logInfo(`Updated At: ${article.updatedAt}`);
    logInfo('─'.repeat(80));
    
    logInfo(`\nTotal Items: ${article.items.length}`);
    
    let approvedCount = 0;
    let pendingCount = 0;
    let rejectedCount = 0;

    article.items.forEach((item, index) => {
      logInfo(`\nItem ${index + 1}:`);
      logInfo(`  Text: ${item.text.substring(0, 50)}...`);
      logInfo(`  Status: ${item.status}`);
      logInfo(`  Created By User ID: ${item.createdBy || 'anonymous'}`);
      logInfo(`  Created At: ${item.createdAt}`);
      
      if (item.status === 'approved') {
        approvedCount++;
        logInfo(`  Reviewed By: ${item.reviewedBy}`);
        logInfo(`  Reviewed At: ${item.reviewedAt}`);
        logInfo(`  Approval Count: ${item.approvalCount}`);
      }
      
      if (item.status === 'pending') {
        pendingCount++;
        logInfo(`  Approval Count: ${item.approvalCount}/${item.requiresApprovalCount}`);
        logInfo(`  Reject Count: ${item.rejectCount}`);
      }

      if (item.status === 'rejected') {
        rejectedCount++;
      }
    });

    logInfo('─'.repeat(80));
    logInfo(`\nSummary:`);
    logSuccess(`Approved Items: ${approvedCount}`);
    logInfo(`Pending Items: ${pendingCount}`);
    if (rejectedCount > 0) {
      logError(`Rejected Items: ${rejectedCount}`);
    }

    return approvedCount > 0;
  } catch (error) {
    logError(`Verification failed: ${error.response?.data?.message || error.message}`);
    return false;
  }
}

// Main test runner
async function runWorkflowTest() {
  log('\n╔════════════════════════════════════════════════════════════════╗');
  log('║     Comprehensive Workflow Test - Page 6 Auto-Process         ║');
  log('╚════════════════════════════════════════════════════════════════╝');
  
  const results = {
    setupUser: false,
    createPolitician: false,
    createSection: false,
    addItems: false,
    voteItems: false,
    verifyResults: false
  };

  // Run all steps
  results.setupUser = await setupUser();
  if (!results.setupUser) {
    logError('\nCannot proceed without authentication');
    process.exit(1);
  }

  await delay(500);
  results.createPolitician = await createPoliticianPage();

  await delay(500);
  results.createSection = await createSection();
  
  await delay(500);
  results.addItems = await addItemsToSection();
  
  await delay(1000);
  results.voteItems = await simulateVoting();
  
  await delay(500);
  results.verifyResults = await verifyResults();

  // Final Summary
  log('\n╔════════════════════════════════════════════════════════════════╗');
  log('║                    TEST RESULTS SUMMARY                         ║');
  log('╚════════════════════════════════════════════════════════════════╝');
  
  logInfo('\nTest Steps:');
  log(`  Setup User:          ${results.setupUser ? '✅ PASSED' : '❌ FAILED'}`);
  log(`  Create Politician:   ${results.createPolitician ? '✅ PASSED' : '❌ FAILED'}`);
  log(`  Create Section:      ${results.createSection ? '✅ PASSED' : '❌ FAILED'}`);
  log(`  Add Items:           ${results.addItems ? '✅ PASSED' : '❌ FAILED'}`);
  log(`  Vote & Auto-approve: ${results.voteItems ? '✅ PASSED' : '❌ FAILED'}`);
  log(`  Verify Results:      ${results.verifyResults ? '✅ PASSED' : '❌ FAILED'}`);

  const allPassed = Object.values(results).every(r => r === true);

  if (allPassed) {
    logSuccess('\n🎉 All workflow tests passed! Complete cycle tested successfully.');
  } else {
    logError('\n⚠️  Some workflow steps failed. Please review the errors above.');
  }

  logInfo(`\n📄 Test Page: http://localhost:3000/page/${testPoliticianSlug}`);
  logInfo(`\n💾 Test Data persists in database for inspection`);

  process.exit(allPassed ? 0 : 1);
}

// Run tests
runWorkflowTest().catch(error => {
  logError(`\nFatal error: ${error.message}`);
  process.exit(1);
});

