const Politician = require('../models/Politician');

const politicianController = {
  // Get all politicians
  getAll: async (req, res) => {
    try {
      const politicians = await Politician.find().select('name slug credibilityScore constituencies');
      res.json(politicians);
    } catch (error) {
      console.error('Get all politicians error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Search politicians with type and location
  search: async (req, res) => {
    try {
      const query = req.params.query;
      
      if (!query) {
        return res.status(400).json({ message: 'Search query is required' });
      }

      const results = await Politician.find({
        $or: [
          { name: { $regex: query, $options: 'i' } },
          { constituencies: { $regex: query, $options: 'i' } },
          { 'location.constituency': { $regex: query, $options: 'i' } },
          { 'location.city': { $regex: query, $options: 'i' } },
          { 'location.state': { $regex: query, $options: 'i' } }
        ]
      }).select('name slug type credibilityScore constituencies location title');
      
      // Group by type
      const grouped = results.reduce((acc, item) => {
        const type = item.type || 'politician';
        if (!acc[type]) {
          acc[type] = [];
        }
        acc[type].push(item);
        return acc;
      }, {});
      
      res.json({
        total: results.length,
        results,
        grouped,
      });
    } catch (error) {
      console.error('Search politicians error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Get statistics
  getStats: async (req, res) => {
    try {
      const totalPoliticians = await Politician.countDocuments();
      const totalPromises = await Politician.aggregate([
        { $group: { _id: null, total: { $sum: '$totalPromises' } } }
      ]);
      const totalFulfilled = await Politician.aggregate([
        { $group: { _id: null, total: { $sum: '$fulfilledPromises' } } }
      ]);
      
      res.json({
        totalPoliticians,
        totalPromises: totalPromises[0]?.total || 0,
        totalFulfilled: totalFulfilled[0]?.total || 0,
      });
    } catch (error) {
      console.error('Get stats error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Helper function to calculate breakdown scores from article votes by section
  calculateBreakdown: async (slug) => {
    try {
      const ArticleVote = require('../models/ArticleVote');
      const Article = require('../models/Article');
      
      // Get all articles for this politician to find unique sections
      const articles = await Article.find({ politicianSlug: slug });
      const uniqueSections = [...new Set(articles.map(a => a.section).filter(Boolean))];
      
      // Get all votes for this politician
      const votes = await ArticleVote.find({ politicianSlug: slug });
      
      // Calculate breakdown per section dynamically
      const breakdown = {};
      const sectionStats = {};
      
      // Process each section
      for (const section of uniqueSections) {
        if (!section) continue;
        
        // Get votes for this section (both section-level and item-level)
        const sectionVotes = votes.filter(v => v.section === section);
        
        if (sectionVotes.length > 0) {
          const likes = sectionVotes.filter(v => v.voteType === 'like').length;
          const neutral = sectionVotes.filter(v => v.voteType === 'neutral').length;
          const dislikes = sectionVotes.filter(v => v.voteType === 'dislike').length;
          const total = likes + neutral + dislikes;
          
          if (total > 0) {
            // Calculate percentage score (0-100) based on like vs dislike (neutral doesn't count)
            const nonNeutralTotal = likes + dislikes;
            const score = nonNeutralTotal > 0 ? Math.round((likes / nonNeutralTotal) * 100) : 50;
            breakdown[section] = score;
            sectionStats[section] = {
              score,
              likes,
              neutral,
              dislikes,
              total,
              likePercentage: score,
              dislikePercentage: 100 - score
            };
          } else {
            breakdown[section] = 50; // Default if no votes
            sectionStats[section] = {
              score: 50,
              likes: 0,
              neutral: 0,
              dislikes: 0,
              total: 0,
              likePercentage: 50,
              dislikePercentage: 50
            };
          }
        } else {
          // No votes yet - default score
          breakdown[section] = 50;
          sectionStats[section] = {
            score: 50,
            likes: 0,
            neutral: 0,
            dislikes: 0,
            total: 0,
            likePercentage: 50,
            dislikePercentage: 50
          };
        }
      }
      
      return {
        breakdown,
        sectionStats,
        sections: uniqueSections
      };
    } catch (error) {
      console.error('Calculate breakdown error:', error);
      // Return empty breakdown on error
      return {
        breakdown: {},
        sectionStats: {},
        sections: []
      };
    }
  },

  // Get politician by slug
  getBySlug: async (req, res) => {
    try {
      const politician = await Politician.findOne({ slug: req.params.slug });
      if (!politician) {
        return res.status(404).json({ message: 'Politician not found' });
      }
      
      // Calculate breakdown scores dynamically by section
      const breakdownData = await politicianController.calculateBreakdown(req.params.slug);
      
      // Format credibility history from actual data
      let credibilityHistory = [];
      if (politician.credibilityHistory && politician.credibilityHistory.length > 0) {
        // Transform to frontend format: { year, credibility }
        credibilityHistory = politician.credibilityHistory
          .map(entry => {
            const date = entry.date || new Date(entry.year, entry.month !== undefined ? entry.month : 0, 1);
            return {
              year: date.getFullYear(),
              month: date.getMonth(),
              credibility: entry.credibility || politician.credibilityScore || 50,
              change: entry.change || 0,
              section: entry.section || '',
              totalVotes: entry.totalVotes || 0,
              date: date
            };
          })
          .sort((a, b) => {
            if (a.year !== b.year) return a.year - b.year;
            return (a.month || 0) - (b.month || 0);
          });
        
        // If no entries, add current score as baseline
        if (credibilityHistory.length === 0) {
          const now = new Date();
          credibilityHistory.push({
            year: now.getFullYear(),
            month: now.getMonth(),
            credibility: politician.credibilityScore || 50,
            change: 0,
            section: '',
            totalVotes: 0,
            date: now
          });
        }
      } else {
        // No history - add current score as single entry
        const now = new Date();
        credibilityHistory.push({
          year: now.getFullYear(),
          month: now.getMonth(),
          credibility: politician.credibilityScore || 50,
          change: 0,
          section: '',
          totalVotes: 0,
          date: now
        });
      }
      
      // Format the response to match frontend expectations
      const formattedData = {
        name: politician.name,
        role: politician.title || 'Political Leader',
        credibility: politician.credibilityScore,
        credibilityScore: politician.credibilityScore,
        credibilityHistory: credibilityHistory,
        breakdown: breakdownData.breakdown || {},
        sectionStats: breakdownData.sectionStats || {},
        sections: breakdownData.sections || [],
        constituencies: politician.constituencies,
        promises: politician.promises || [], // Return actual promises array
        totalPromises: politician.totalPromises,
        fulfilled: politician.fulfilledPromises,
        activity: politician.activity || [],
        articles: politician.articles || [],
        promisesList: politician.promises?.map(p => ({
          id: p._id,
          title: p.title,
          description: p.description,
          status: p.status,
          references: [] // Return empty array - no fake references
        })) || []
      };
      
      res.json(formattedData);
    } catch (error) {
      console.error('Get politician by slug error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Create politician (requires credible user)
  create: async (req, res) => {
    try {
      // Check if user is credible (credibilityScore >= 70) - no admin roles
      const User = require('../models/User');
      const user = await User.findById(req.user.userId);
      
      if (!user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      // Determine if this is a big or small personality profile
      // Check if politician data suggests big personality (has title, party, public office, etc.)
      const isBigPersonality = req.body.type === 'politician' || 
                               req.body.publicOffice || 
                               req.body.party ||
                               (req.body.title && ['Prime Minister', 'Chief Minister', 'Minister', 'MP', 'MLA', 'Mayor'].some(t => req.body.title.includes(t)));
      
      const personalityType = isBigPersonality ? 'big_personality' : 'small_personality';
      const requiredScore = isBigPersonality ? 60 : 20;
      
      // Check if user has enough credibility for this personality type
      if (!user.canCreateProfile(personalityType)) {
        return res.status(403).json({ 
          message: `You need a credibility score of at least ${requiredScore} to create a ${isBigPersonality ? 'public figure' : 'profile'}. Contribute by reviewing edits to increase your score.`,
          currentScore: user.credibilityScore,
          requiredScore: requiredScore
        });
      }
      
      const politician = new Politician(req.body);
      
      // Store personality type on politician profile
      politician.personalityType = personalityType;
      
      // Set credibility score to default (editors can't set it manually)
      politician.credibilityScore = 50;
      
      // Set status to under_review when creating with sections
      const Article = require('../models/Article');
      const hasSections = req.body.sections && Array.isArray(req.body.sections) && req.body.sections.length > 0;
      politician.profileStatus = hasSections ? 'under_review' : 'active';
      
      await politician.save();
      
      // Create articles/sections if provided
      const createdArticles = [];
      if (hasSections) {
        for (const sectionData of req.body.sections) {
          // Filter out empty items and ensure proper format
          const validItems = (sectionData.items || []).filter(item => item && item.text && item.text.trim()).map(item => ({
            text: item.text.trim(),
            ref: item.ref || '',
            refUrl: item.refUrl || '',
            status: 'pending', // New items start as pending until reviewed
            createdBy: req.user.userId,
            approvalCount: 0,
            rejectCount: 0,
            requiresApprovalCount: 10,
            votes: [],
            createdAt: new Date(),
          }));
          
          // Only create article if it has valid items
          if (validItems.length > 0) {
            const article = new Article({
              politicianSlug: politician.slug,
              section: sectionData.section,
              sectionType: sectionData.sectionType || 'bullet-points',
              title: sectionData.title || sectionData.section.charAt(0).toUpperCase() + sectionData.section.slice(1),
              content: sectionData.content || '',
              references: sectionData.references || [],
              items: validItems,
              createdBy: req.user.userId,
              editedBy: req.user.userId,
            });
            await article.save();
            createdArticles.push(article);
          }
        }
      }
      
      // Update user contributions and credibility
      user.contributions.profilesCreated += 1;
      
      // Set user's personality type if not already set
      if (!user.personalityType) {
        user.personalityType = personalityType;
      }
      
      // Award credibility based on personality type
      // Big personalities get more points (profile creation is more significant)
      const profilePoints = isBigPersonality ? 15 : 10;
      
      await user.addCredibility(profilePoints, `Created a ${isBigPersonality ? 'public figure' : 'profile'}`, {
        actionType: 'profile_created',
        entityId: politician._id.toString(),
        entityType: 'profile',
        sectionName: null,
        politicianSlug: politician.slug,
        approvedBy: [], // Profile creation is auto-approved if user has credibility >= threshold
        approvalCount: 0,
        requiresApproval: false,
        approved: true,
        proofLink: '',
      });
      
      // Recalculate credibility with new formula
      user.recalculateCredibility();
      await user.save();
      
      // Return politician with created articles info
      const responseData = politician.toObject();
      responseData.createdArticles = createdArticles.map(a => ({
        id: a._id,
        section: a.section,
        itemsCount: a.items.length,
      }));
      
      res.status(201).json(responseData);
    } catch (error) {
      console.error('Create politician error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Update politician
  update: async (req, res) => {
    try {
      const politician = await Politician.findOneAndUpdate(
        { slug: req.params.slug },
        req.body,
        { new: true, runValidators: true }
      );
      
      if (!politician) {
        return res.status(404).json({ message: 'Politician not found' });
      }
      
      // Recalculate credibility score
      const totalPromises = politician.promises.length;
      const fulfilledPromises = politician.promises.filter(p => p.status === 'fulfilled').length;
      politician.totalPromises = totalPromises;
      politician.fulfilledPromises = fulfilledPromises;
      
      if (totalPromises > 0) {
        politician.credibilityScore = Math.round((fulfilledPromises / totalPromises) * 100);
      }
      
      await politician.save();
      res.json(politician);
    } catch (error) {
      console.error('Update politician error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Delete politician
  delete: async (req, res) => {
    try {
      const politician = await Politician.findOneAndDelete({ slug: req.params.slug });
      if (!politician) {
        return res.status(404).json({ message: 'Politician not found' });
      }
      res.json({ message: 'Politician deleted successfully' });
    } catch (error) {
      console.error('Delete politician error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Bulk create politician profiles (Public API)
  bulkCreate: async (req, res) => {
    try {
      const sampleProfiles = [
        {
          slug: 'narendra-modi',
          name: 'Narendra Modi',
          type: 'politician',
          title: 'Prime Minister of India',
          credibilityScore: 72,
          location: {
            state: 'Gujarat',
            city: 'Gandhinagar',
            district: 'Gandhinagar',
            constituency: 'Varanasi',
            coordinates: {
              latitude: 23.2156,
              longitude: 72.6369
            }
          },
          promises: [
            {
              title: 'Make in India',
              description: 'Promote manufacturing and boost the economy',
              status: 'in_progress',
              constituencies: ['Varanasi'],
              createdAt: new Date('2020-01-01'),
              updatedAt: new Date()
            },
            {
              title: 'Digital India',
              description: 'Transform India into a digitally empowered society',
              status: 'fulfilled',
              constituencies: ['Varanasi'],
              createdAt: new Date('2020-01-01'),
              updatedAt: new Date()
            },
            {
              title: 'Swachh Bharat Abhiyan',
              description: 'Clean India campaign',
              status: 'in_progress',
              constituencies: ['Varanasi'],
              createdAt: new Date('2020-01-01'),
              updatedAt: new Date()
            }
          ],
          constituencies: ['Varanasi'],
          facts: [
            {
              title: 'Economic Growth',
              description: 'GDP growth averaged 7.5% during tenure',
              references: ['https://economictimes.com/reports'],
              date: new Date('2023-12-01')
            }
          ],
          credibilityHistory: [
            { year: 2021, credibility: 68 },
            { year: 2022, credibility: 70 },
            { year: 2023, credibility: 72 },
            { year: 2024, credibility: 72 }
          ],
          articles: [
            {
              section: 'Introduction',
              title: 'Leadership and Vision',
              content: 'Narendra Modi has been serving as the Prime Minister of India since 2014.',
              references: [1]
            }
          ]
        },
        {
          slug: 'rahul-gandhi',
          name: 'Rahul Gandhi',
          type: 'politician',
          title: 'Member of Parliament',
          credibilityScore: 58,
          location: {
            state: 'Kerala',
            city: 'Wayanad',
            district: 'Wayanad',
            constituency: 'Wayanad',
            coordinates: {
              latitude: 11.6854,
              longitude: 76.1320
            }
          },
          promises: [
            {
              title: 'NYAY Scheme',
              description: 'Minimum income guarantee for poor families',
              status: 'pending',
              constituencies: ['Wayanad'],
              createdAt: new Date('2020-01-01'),
              updatedAt: new Date()
            },
            {
              title: 'Youth Employment',
              description: 'Create 2 crore jobs for youth',
              status: 'in_progress',
              constituencies: ['Wayanad'],
              createdAt: new Date('2020-01-01'),
              updatedAt: new Date()
            }
          ],
          constituencies: ['Wayanad', 'Amethi'],
          facts: [
            {
              title: 'Educational Initiatives',
              description: 'Advocated for universal education rights',
              references: ['https://educationpolicy.in'],
              date: new Date('2023-11-01')
            }
          ],
          credibilityHistory: [
            { year: 2021, credibility: 55 },
            { year: 2022, credibility: 56 },
            { year: 2023, credibility: 57 },
            { year: 2024, credibility: 58 }
          ],
          articles: [
            {
              section: 'Political Career',
              title: 'Youth Leadership',
              content: 'Rahul Gandhi represents Wayanad constituency and focuses on youth and employment issues.',
              references: [1]
            }
          ]
        },
        {
          slug: 'arvind-kejriwal',
          name: 'Arvind Kejriwal',
          type: 'politician',
          title: 'Chief Minister of Delhi',
          credibilityScore: 65,
          location: {
            state: 'Delhi',
            city: 'New Delhi',
            district: 'Central Delhi',
            constituency: 'New Delhi',
            coordinates: {
              latitude: 28.6139,
              longitude: 77.2090
            }
          },
          promises: [
            {
              title: 'Free Water Scheme',
              description: '20,000 liters free water per month',
              status: 'fulfilled',
              constituencies: ['New Delhi'],
              createdAt: new Date('2020-01-01'),
              updatedAt: new Date()
            },
            {
              title: 'Mohalla Clinics',
              description: 'Establish healthcare centers in every neighborhood',
              status: 'fulfilled',
              constituencies: ['New Delhi'],
              createdAt: new Date('2020-01-01'),
              updatedAt: new Date()
            },
            {
              title: 'Education Reform',
              description: 'Improve government schools',
              status: 'in_progress',
              constituencies: ['New Delhi'],
              createdAt: new Date('2020-01-01'),
              updatedAt: new Date()
            }
          ],
          constituencies: ['New Delhi'],
          facts: [
            {
              title: 'Anti-Corruption Movement',
              description: 'Led the India Against Corruption movement',
              references: ['https://timesofindia.com/parliament'],
              date: new Date('2023-10-01')
            }
          ],
          credibilityHistory: [
            { year: 2021, credibility: 62 },
            { year: 2022, credibility: 63 },
            { year: 2023, credibility: 64 },
            { year: 2024, credibility: 65 }
          ],
          articles: [
            {
              section: 'Administration',
              title: 'Delhi Model',
              content: 'Arvind Kejriwal has implemented several welfare schemes in Delhi including free water and electricity.',
              references: [1]
            }
          ]
        },
        {
          slug: 'mamata-banerjee',
          name: 'Mamata Banerjee',
          type: 'politician',
          title: 'Chief Minister of West Bengal',
          credibilityScore: 68,
          location: {
            state: 'West Bengal',
            city: 'Kolkata',
            district: 'Kolkata South',
            constituency: 'Bhowanipore',
            coordinates: {
              latitude: 22.5726,
              longitude: 88.3639
            }
          },
          promises: [
            {
              title: 'Kanyashree Scheme',
              description: 'Cash benefit for girl students',
              status: 'fulfilled',
              constituencies: ['Bhowanipore'],
              createdAt: new Date('2020-01-01'),
              updatedAt: new Date()
            },
            {
              title: 'Industrial Development',
              description: 'Attract investments to Bengal',
              status: 'in_progress',
              constituencies: ['Bhowanipore'],
              createdAt: new Date('2020-01-01'),
              updatedAt: new Date()
            }
          ],
          constituencies: ['Bhowanipore'],
          facts: [
            {
              title: 'Women Empowerment',
              description: 'Implemented several schemes for women empowerment',
              references: ['https://westbengal.gov.in/policies'],
              date: new Date('2023-09-01')
            }
          ],
          credibilityHistory: [
            { year: 2021, credibility: 65 },
            { year: 2022, credibility: 66 },
            { year: 2023, credibility: 67 },
            { year: 2024, credibility: 68 }
          ],
          articles: [
            {
              section: 'Leadership',
              title: 'First Woman CM',
              content: 'Mamata Banerjee is the first woman Chief Minister of West Bengal, known for her grassroots politics.',
              references: [1]
            }
          ]
        },
        {
          slug: 'nitish-kumar',
          name: 'Nitish Kumar',
          type: 'politician',
          title: 'Chief Minister of Bihar',
          credibilityScore: 70,
          location: {
            state: 'Bihar',
            city: 'Patna',
            district: 'Patna',
            constituency: 'Hajipur',
            coordinates: {
              latitude: 25.5941,
              longitude: 85.1376
            }
          },
          promises: [
            {
              title: 'Seven Resolves',
              description: 'Seven point development agenda',
              status: 'in_progress',
              constituencies: ['Hajipur'],
              createdAt: new Date('2020-01-01'),
              updatedAt: new Date()
            },
            {
              title: 'Alcohol Ban',
              description: 'Complete prohibition of alcohol',
              status: 'fulfilled',
              constituencies: ['Hajipur'],
              createdAt: new Date('2020-01-01'),
              updatedAt: new Date()
            }
          ],
          constituencies: ['Hajipur'],
          facts: [
            {
              title: 'Law and Order',
              description: 'Improved law and order situation in Bihar',
              references: ['https://bihar.gov.in/reports'],
              date: new Date('2023-08-01')
            }
          ],
          credibilityHistory: [
            { year: 2021, credibility: 68 },
            { year: 2022, credibility: 69 },
            { year: 2023, credibility: 70 },
            { year: 2024, credibility: 70 }
          ],
          articles: [
            {
              section: 'Governance',
              title: 'Development Model',
              content: 'Nitish Kumar has focused on infrastructure development and law enforcement in Bihar.',
              references: [1]
            }
          ]
        }
      ];

      // Check if profiles already exist to avoid duplicates
      const existingSlugs = await Politician.find({
        slug: { $in: sampleProfiles.map(p => p.slug) }
      }).select('slug');

      const existingSlugSet = new Set(existingSlugs.map(p => p.slug));
      const newProfiles = sampleProfiles.filter(p => !existingSlugSet.has(p.slug));

      if (newProfiles.length === 0) {
        return res.json({ 
          message: 'All profiles already exist',
          created: 0,
          total: sampleProfiles.length
        });
      }

      // Calculate totalPromises and fulfilledPromises for each profile
      newProfiles.forEach(profile => {
        profile.totalPromises = profile.promises.length;
        profile.fulfilledPromises = profile.promises.filter(p => p.status === 'fulfilled').length;
      });

      const result = await Politician.insertMany(newProfiles);

      res.status(201).json({
        message: `Successfully created ${result.length} politician profile(s)`,
        created: result.length,
        total: sampleProfiles.length,
        profiles: result.map(p => ({
          name: p.name,
          slug: p.slug,
          type: p.type,
          title: p.title,
          credibilityScore: p.credibilityScore
        }))
      });
    } catch (error) {
      console.error('Bulk create politicians error:', error);
      res.status(500).json({ message: error.message });
    }
  },
};

module.exports = politicianController;

