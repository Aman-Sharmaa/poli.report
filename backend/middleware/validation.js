const validator = {
  // Validate email
  isValidEmail: (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  // Validate required fields
  checkRequired: (data, requiredFields) => {
    const missing = requiredFields.filter(field => !data[field]);
    if (missing.length > 0) {
      return { isValid: false, message: `Missing required fields: ${missing.join(', ')}` };
    }
    return { isValid: true };
  },

  // Validate rating (1-10)
  isValidRating: (rating) => {
    const num = Number(rating);
    return !isNaN(num) && num >= 1 && num <= 10;
  },

  // Validate credibility score (0-100)
  isValidCredibilityScore: (score) => {
    const num = Number(score);
    return !isNaN(num) && num >= 0 && num <= 100;
  },

  // Validate URL
  isValidURL: (url) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  },
};

// Middleware for validating register data
const validateRegister = (req, res, next) => {
  const { email, password } = req.body;

  if (!validator.isValidEmail(email)) {
    return res.status(400).json({ message: 'Invalid email format' });
  }

  if (!password || password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }

  next();
};

// Middleware for validating politician data
const validatePolitician = (req, res, next) => {
  const { name, slug, credibilityScore } = req.body;

  if (!name || !slug) {
    return res.status(400).json({ message: 'Name and slug are required' });
  }

  if (credibilityScore && !validator.isValidCredibilityScore(credibilityScore)) {
    return res.status(400).json({ message: 'Credibility score must be between 0 and 100' });
  }

  next();
};

// Middleware for validating feedback
const validateFeedback = (req, res, next) => {
  const { rating } = req.body;

  if (rating && !validator.isValidRating(rating)) {
    return res.status(400).json({ message: 'Rating must be between 1 and 10' });
  }

  next();
};

module.exports = {
  validator,
  validateRegister,
  validatePolitician,
  validateFeedback,
};

