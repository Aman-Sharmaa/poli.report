const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Trust proxy for accurate IP addresses
app.set('trust proxy', true);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/politicians', require('./routes/politicians'));
app.use('/api/articles', require('./routes/articles'));
app.use('/api/polls', require('./routes/polls'));
app.use('/api/feedback', require('./routes/feedback'));
app.use('/api/edits', require('./routes/edits'));
app.use('/api/likes', require('./routes/likes'));
app.use('/api/article-votes', require('./routes/articleVotes'));
app.use('/api/promise-votes', require('./routes/promiseVotes'));
app.use('/api/voting', require('./routes/votingDashboard'));
app.use('/api/public-data-entries', require('./routes/publicDataEntries'));

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/polireport', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

