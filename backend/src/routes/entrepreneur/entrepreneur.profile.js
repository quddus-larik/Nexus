const express = require('express');
const router = express.Router();

const User = require('../../models/user.model');

const normalizeRole = (role) => {
  const normalized = String(role || '').toLowerCase();
  return normalized === 'investor' ? 'investor' : 'entrepreneur';
};

const buildEntrepreneurPayload = (user) => {
  const displayName = user.username || user.email?.split('@')[0] || 'User';
  const industries = Array.isArray(user.industries) ? user.industries : [];
  const role = normalizeRole(user.type);
  const teamMembers = Array.isArray(user.teamMembers) ? user.teamMembers : [];

  return {
    id: user._id,
    name: displayName,
    email: user.email,
    role,
    avatarUrl: user.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`,
    startupName: user.position || 'Startup',
    pitchSummary: user.about || '',
    bio: user.about || '',
    industry: industries[0] || '',
    location: user.address || '',
    fundingNeeded: 'Not specified',
    foundedYear: user.createdAt ? new Date(user.createdAt).getFullYear() : new Date().getFullYear(),
    teamSize: user.teamSize || teamMembers.length || 1,
    teamMembers,
    createdAt: user.createdAt
  };
};

// GET /entrepreneur/list/all - Public endpoint to get all entrepreneurs
router.get('/list/all', async (req, res) => {
  try {
    const entrepreneurs = await User.find({ type: { $regex: '^entrepreneur$', $options: 'i' } });
    
    const entrepreneursList = entrepreneurs.map(user => buildEntrepreneurPayload(user));
    return res.status(200).json(entrepreneursList);
  } catch (err) {
    return res.status(400).json({ error: 'Failed to fetch entrepreneurs' });
  }
});

// GET /entrepreneur/:id - Public endpoint to get entrepreneur profile
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ error: 'Entrepreneur not found' });
    }

    // Only return entrepreneur profiles
    const role = normalizeRole(user.type);
    if (role !== 'entrepreneur') {
      return res.status(404).json({ error: 'Profile not found' });
    }

    return res.status(200).json(buildEntrepreneurPayload(user));
  } catch (err) {
    return res.status(400).json({ error: 'Invalid entrepreneur id' });
  }
});

module.exports = router;
