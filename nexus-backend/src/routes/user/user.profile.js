const express = require('express');
const router = express.Router();

const User = require('../../models/user.model');

const normalizeRole = (role) => {
  const normalized = String(role || '').toLowerCase();
  return normalized === 'investor' ? 'investor' : 'entrepreneur';
};

const buildUserPayload = (user) => {
  const displayName = user.username || user.email?.split('@')[0] || 'User';
  const industries = Array.isArray(user.industries) ? user.industries : [];
  const investmentStages = Array.isArray(user.investmantStages) ? user.investmantStages : [];
  const collaborations = Array.isArray(user.collaborations) ? user.collaborations : [];
  const role = normalizeRole(user.type);

  const base = {
    id: user._id,
    name: displayName,
    email: user.email,
    role,
    avatarUrl: user.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`,
    bio: user.about || '',
    createdAt: user.createdAt
  };

  if (role === 'investor') {
    return {
      ...base,
      investmentInterests: industries,
      investmentStage: investmentStages,
      portfolioCompanies: [],
      totalInvestments: collaborations.length,
      minimumInvestment: 'Not specified',
      maximumInvestment: 'Not specified'
    };
  }

  return {
    ...base,
    startupName: user.position || 'Startup',
    pitchSummary: user.about || '',
    fundingNeeded: 'Not specified',
    industry: industries[0] || '',
    location: user.address || '',
    foundedYear: user.createdAt ? new Date(user.createdAt).getFullYear() : new Date().getFullYear(),
    teamSize: 1
  };
};

router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.status(200).json(buildUserPayload(user));
  } catch (err) {
    return res.status(400).json({ message: 'Invalid user id' });
  }
});

module.exports = router;
