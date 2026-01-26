const axios = require('axios');

const API_URL = 'http://localhost:5000/api';
let authToken = '';
let testPoliticianSlug = 'narendra-modi';
let createdArticleId = '';
let createdPollId = '';

// Test colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
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

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Test Authentication
async function testLogin() {
  logInfo('\n=== Testing Authentication ===');
  try {
    // First, try to register
    try {
      await axios.post(`${API_URL}/auth/register`, {
        email: 'test@example.com',
        password: 'password123'
      });
      logSuccess('User registered successfully');
    } catch (err) {
      if (err.response?.status === 400 && err.response?.data?.message?.includes('already exists')) {
        logInfo('User already exists, continuing with login');
      } else {
        throw err;
      }
    }

    // Login
    const response = await axios.post(`${API_URL}/auth/login`, {
      email: 'test@example.com',
      password: 'password123'
    });

    authToken = response.data.token;
    logSuccess('Login successful');
    logSuccess(`Token received: ${authToken.substring(0, 20)}...`);
    return true;
  } catch (error) {
    logError(`Authentication failed: ${error.message}`);
    return false;
  }
}

// Article CRUD Tests
async function testArticlesCRUD() {
  logInfo('\n=== Testing Articles CRUD ===');

  // CREATE
  logInfo('\n1. Testing CREATE Article');
  try {
    const createResponse = await axios.post(
      `${API_URL}/articles/${testPoliticianSlug}`,
      {
        section: 'testSection',
        sectionType: 'bullet-points',
        items: [
          {
            text: 'Test article item',
            refUrl: 'https://example.com/test'
          }
        ]
      },
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );
    createdArticleId = createResponse.data._id;
    logSuccess(`Article created with ID: ${createdArticleId}`);
  } catch (error) {
    logError(`CREATE failed: ${error.response?.data?.message || error.message}`);
    return false;
  }

  // READ
  logInfo('\n2. Testing READ Articles');
  try {
    const readResponse = await axios.get(`${API_URL}/articles/${testPoliticianSlug}`);
    logSuccess(`Articles fetched: ${readResponse.data.length} articles found`);
    const ourArticle = readResponse.data.find(a => a._id === createdArticleId);
    if (ourArticle) {
      logSuccess('Created article found in read response');
    } else {
      logError('Created article not found in read response');
    }
  } catch (error) {
    logError(`READ failed: ${error.response?.data?.message || error.message}`);
    return false;
  }

  // UPDATE
  logInfo('\n3. Testing UPDATE Article');
  try {
    const updateResponse = await axios.put(
      `${API_URL}/articles/${createdArticleId}`,
      {
        sectionType: 'bullet-points',
        items: [
          {
            text: 'Updated test article item',
            refUrl: 'https://example.com/updated'
          },
          {
            text: 'Second item',
            refUrl: 'https://example.com/second'
          }
        ]
      },
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );
    logSuccess('Article updated successfully');
    logSuccess(`Updated items count: ${updateResponse.data.items.length}`);
  } catch (error) {
    logError(`UPDATE failed: ${error.response?.data?.message || error.message}`);
    return false;
  }

  // DELETE
  logInfo('\n4. Testing DELETE Article');
  try {
    const deleteResponse = await axios.delete(
      `${API_URL}/articles/${createdArticleId}`,
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );
    logSuccess('Article deleted successfully');
    
    // Verify deletion
    const verifyResponse = await axios.get(`${API_URL}/articles/${testPoliticianSlug}`);
    const deletedArticle = verifyResponse.data.find(a => a._id === createdArticleId);
    if (!deletedArticle) {
      logSuccess('Verified: Article is no longer in database');
    } else {
      logError('Failed: Article still exists after deletion');
    }
  } catch (error) {
    logError(`DELETE failed: ${error.response?.data?.message || error.message}`);
    return false;
  }

  return true;
}

// Poll CRUD Tests
async function testPollsCRUD() {
  logInfo('\n=== Testing Polls CRUD ===');

  // CREATE
  logInfo('\n1. Testing CREATE Poll');
  try {
    const createResponse = await axios.post(
      `${API_URL}/polls`,
      {
        politicianSlug: testPoliticianSlug,
        question: 'Do you support the new policy?',
        options: ['Yes', 'No', 'Maybe'],
        constituencies: ['Varanasi']
      },
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );
    createdPollId = createResponse.data._id;
    logSuccess(`Poll created with ID: ${createdPollId}`);
  } catch (error) {
    logError(`CREATE failed: ${error.response?.data?.message || error.message}`);
    return false;
  }

  // READ
  logInfo('\n2. Testing READ Polls');
  try {
    const readResponse = await axios.get(`${API_URL}/polls/${testPoliticianSlug}`);
    logSuccess(`Polls fetched: ${readResponse.data.length} polls found`);
    const ourPoll = readResponse.data.find(p => p._id === createdPollId);
    if (ourPoll) {
      logSuccess('Created poll found in read response');
      logSuccess(`Poll question: ${ourPoll.question}`);
    } else {
      logError('Created poll not found in read response');
    }
  } catch (error) {
    logError(`READ failed: ${error.response?.data?.message || error.message}`);
    return false;
  }

  // READ STATS
  logInfo('\n3. Testing READ Poll Stats');
  try {
    const statsResponse = await axios.get(`${API_URL}/polls/${testPoliticianSlug}/stats`);
    logSuccess('Poll stats fetched successfully');
    const ourPollStats = statsResponse.data.find(p => p._id === createdPollId);
    if (ourPollStats) {
      logSuccess(`Poll has ${ourPollStats.totalResponses} responses`);
    }
  } catch (error) {
    logError(`READ STATS failed: ${error.response?.data?.message || error.message}`);
    return false;
  }

  // VOTE (UPDATE)
  logInfo('\n4. Testing VOTE on Poll');
  try {
    const voteResponse = await axios.post(
      `${API_URL}/polls/${createdPollId}/response`,
      {
        constituency: 'Varanasi',
        option: 'Yes',
        latitude: 28.7041,
        longitude: 77.1025
      }
    );
    logSuccess('Vote submitted successfully');
    
    // Try to vote twice (should fail)
    try {
      await axios.post(
        `${API_URL}/polls/${createdPollId}/response`,
        {
          constituency: 'Varanasi',
          option: 'No'
        }
      );
      logError('Failed: Duplicate vote was accepted (should be rejected)');
    } catch (duplicateError) {
      if (duplicateError.response?.status === 400) {
        logSuccess('Duplicate vote prevention working correctly');
      } else {
        throw duplicateError;
      }
    }
  } catch (error) {
    logError(`VOTE failed: ${error.response?.data?.message || error.message}`);
    return false;
  }

  // DELETE
  logInfo('\n5. Testing DELETE Poll');
  try {
    const deleteResponse = await axios.delete(
      `${API_URL}/polls/${createdPollId}`,
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );
    logSuccess('Poll deleted successfully');
    
    // Verify deletion
    const verifyResponse = await axios.get(`${API_URL}/polls/${testPoliticianSlug}`);
    const deletedPoll = verifyResponse.data.find(p => p._id === createdPollId);
    if (!deletedPoll) {
      logSuccess('Verified: Poll is no longer in database');
    } else {
      logError('Failed: Poll still exists after deletion');
    }
  } catch (error) {
    logError(`DELETE failed: ${error.response?.data?.message || error.message}`);
    return false;
  }

  return true;
}

// Main test runner
async function runAllTests() {
  logInfo('╔════════════════════════════════════════╗');
  logInfo('║   CRUD Operations Test Suite           ║');
  logInfo('╚════════════════════════════════════════╝');
  
  // Test 1: Authentication
  const authSuccess = await testLogin();
  if (!authSuccess) {
    logError('\n❌ Authentication failed. Cannot proceed with tests.');
    process.exit(1);
  }

  await delay(500);

  // Test 2: Articles CRUD
  const articlesSuccess = await testArticlesCRUD();

  await delay(500);

  // Test 3: Polls CRUD
  const pollsSuccess = await testPollsCRUD();

  // Final Summary
  logInfo('\n╔════════════════════════════════════════╗');
  logInfo('║         TEST RESULTS SUMMARY            ║');
  logInfo('╚════════════════════════════════════════╝');
  
  logInfo('\nAuthentication: ' + (authSuccess ? '✅ PASSED' : '❌ FAILED'));
  logInfo('Articles CRUD:  ' + (articlesSuccess ? '✅ PASSED' : '❌ FAILED'));
  logInfo('Polls CRUD:     ' + (pollsSuccess ? '✅ PASSED' : '❌ FAILED'));

  const allPassed = authSuccess && articlesSuccess && pollsSuccess;

  if (allPassed) {
    logSuccess('\n🎉 All tests passed! CRUD operations working 100%.');
  } else {
    logError('\n⚠️  Some tests failed. Please check the errors above.');
  }

  process.exit(allPassed ? 0 : 1);
}

// Run tests
runAllTests().catch(error => {
  logError(`\nFatal error: ${error.message}`);
  process.exit(1);
});

