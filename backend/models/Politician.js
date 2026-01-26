const mongoose = require('mongoose');

const politicianSchema = new mongoose.Schema({
  slug: {
    type: String,
    required: true,
    unique: true,
  },
  name: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ['politician', 'contractor', 'business', 'other'],
    default: 'politician',
  },
  title: String,
  credibilityScore: {
    type: Number,
    default: 50,
    min: 0,
    max: 100,
  },
  profileStatus: {
    type: String,
    enum: ['active', 'under_review', 'locked'],
    default: 'active',
  },
  location: {
    state: String,
    city: String,
    district: String,
    constituency: String,
    coordinates: {
      latitude: Number,
      longitude: Number,
    },
  },
  promises: [{
    title: String,
    description: String,
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'fulfilled', 'broken'],
      default: 'pending',
    },
    constituencies: [String],
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  }],
  constituencies: [String],
  totalPromises: {
    type: Number,
    default: 0,
  },
  fulfilledPromises: {
    type: Number,
    default: 0,
  },
  facts: [{
    title: String,
    description: String,
    references: [String],
    date: Date,
  }],
  credibilityHistory: [{
    year: Number,
    month: Number, // 0-11 for better granularity
    credibility: Number,
    change: Number, // Net change for this period
    section: String, // Which section contributed
    totalVotes: Number, // Total votes in this period
    date: Date, // Exact timestamp
  }],
  activity: [{
    day: Number,
    active: Boolean,
  }],
  articles: [{
    section: String,
    title: String,
    content: String,
    references: [Number],
  }],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Politician', politicianSchema);

