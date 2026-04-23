const express = require('express');
const router = express.Router();

const User = require('../../models/user.model');

const normalizeRole = (role) => {
  const normalized = String(role || '').toLowerCase();
  return normalized === 'investor' ? 'investor' : 'entrepreneur';
};

const buildInvestorPayload = (user) => {
  const displayName = user.username || user.email?.split('@')[0] || 'User';
  const industries = Array.isArray(user.industries) ? user.industries : [];
  const investmentStages = Array.isArray(user.investmantStages) ? user.investmantStages : [];
  const portfolioCompanies = Array.isArray(user.portfolioCompanies) ? user.portfolioCompanies : [];

  return {
    id: user._id,
    name: displayName,
    email: user.email,
    role: 'investor',
    avatarUrl: user.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`,
    bio: user.about || '',
    location: user.address || '',
    investmentStage: investmentStages,
    investmentInterests: industries,
    portfolioCompanies: portfolioCompanies,
    position: user.position || 'Investor',
    createdAt: user.createdAt
  };
};

// GET /investor/list/all - Public endpoint to get all investors
router.get('/list/all', async (req, res) => {
  try {
    const investors = await User.find({ type: { $regex: '^investor$', $options: 'i' } });
    
    const investorsList = investors.map(user => buildInvestorPayload(user));
    return res.status(200).json(investorsList);
  } catch (err) {
    return res.status(400).json({ error: 'Failed to fetch investors' });
  }
});

// GET /investor/:id - Public endpoint to get investor profile
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ error: 'Investor not found' });
    }

    // Only return investor profiles
    const role = normalizeRole(user.type);
    if (role !== 'investor') {
      return res.status(404).json({ error: 'Profile not found' });
    }

    return res.status(200).json(buildInvestorPayload(user));
  } catch (err) {
    return res.status(400).json({ error: 'Invalid investor id' });
  }
});

module.exports = router;
