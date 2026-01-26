/**
 * Test script for bulk profile creation API
 * Run: node backend/test-bulk-create.js
 */

const axios = require('axios');

const API_URL = 'http://localhost:5000/api/politicians/bulk-create';

async function testBulkCreate() {
  try {
    console.log('Testing bulk profile creation...\n');
    
    const response = await axios.post(API_URL);
    
    console.log('✅ Success!');
    console.log('\nResponse:', JSON.stringify(response.data, null, 2));
    
    console.log('\n📋 Created Profiles:');
    if (response.data.profiles) {
      response.data.profiles.forEach((profile, index) => {
        console.log(`${index + 1}. ${profile.name} (${profile.slug})`);
        console.log(`   Type: ${profile.type} | Credibility: ${profile.credibilityScore}`);
      });
    }
    
    console.log(`\n✅ Total created: ${response.data.created} out of ${response.data.total}`);
    
  } catch (error) {
    if (error.response) {
      console.error('❌ Error:', error.response.data);
    } else if (error.request) {
      console.error('❌ No response from server. Make sure the server is running on port 5000');
    } else {
      console.error('❌ Error:', error.message);
    }
  }
}

testBulkCreate();

