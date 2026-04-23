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
  const teamMembers = Array.isArray(user.teamMembers) ? user.teamMembers : [];
  const role = normalizeRole(user.type);

  const base = {
    id: user._id,
    name: displayName,
    email: user.email,
    role,
    avatarUrl: user.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`,
    bio: user.about || '',
    location: user.address || '',
    createdAt: user.createdAt
  };

  if (role === 'investor') {
    const portfolioCompanies = Array.isArray(user.portfolioCompanies) ? user.portfolioCompanies : [];
    return {
      ...base,
      investmentInterests: industries,
      investmentStage: investmentStages,
      portfolioCompanies,
      totalInvestments: collaborations.length || portfolioCompanies.length,
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
    teamSize: user.teamSize || teamMembers.length || 1,
    teamMembers
  };
};

const normalizeStringArray = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry || '').trim())
      .filter((entry) => entry.length > 0);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  return undefined;
};

const buildProfileUpdates = (body) => {
  const updates = {};

  if (typeof body.username === 'string') {
    updates.username = body.username.trim();
  }

  if (typeof body.about === 'string') {
    updates.about = body.about.trim();
  }

  if (typeof body.position === 'string') {
    updates.position = body.position.trim();
  }

  if (typeof body.address === 'string') {
    updates.address = body.address.trim();
  }

  const portfolioCompanies = normalizeStringArray(body.portfolioCompanies);
  if (portfolioCompanies !== undefined) {
    updates.portfolioCompanies = portfolioCompanies;
  }

  const industries = normalizeStringArray(body.industries);
  if (industries !== undefined) {
    updates.industries = industries;
  }

  const investmentStages = normalizeStringArray(body.investmantStages);
  if (investmentStages !== undefined) {
    updates.investmantStages = investmentStages;
  }

  if (Array.isArray(body.teamMembers)) {
    updates.teamMembers = body.teamMembers.filter(member => 
      member && typeof member === 'object' && member.name && member.role && typeof member.type === 'number'
    );
  }

  if (typeof body.teamSize === 'number' && body.teamSize >= 1) {
    updates.teamSize = body.teamSize;
  }

  return updates;
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

router.patch('/update/:id', async (req, res) => {
  try {
    if (!req.user || String(req.user._id) !== String(req.params.id)) {
      return res.status(403).json({ message: 'Not authorized to update this profile' });
    }

    const updates = buildProfileUpdates(req.body || {});

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No valid fields provided for update' });
    }

    const user = await User.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.status(200).json(buildUserPayload(user));
  } catch (err) {
    return res.status(400).json({ message: 'Unable to update profile' });
  }
});

module.exports = router;
