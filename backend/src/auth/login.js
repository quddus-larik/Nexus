const express = require('express');
const router = express.Router();

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const User = require('../models/user.model');

const normalizeRole = (role) => {
    const normalized = String(role || '').toLowerCase();
    return normalized === 'investor' ? 'investor' : 'entrepreneur';
};

const buildUserPayload = (user) => {
    const displayName = user.username || user.email?.split('@')[0] || 'User';
    const role = normalizeRole(user.type);
    return {
        id: user._id,
        name: displayName,
        email: user.email,
        role,
        avatarUrl: user.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`,
        bio: user.about || '',
        location: user.address || '',
        createdAt: user.createdAt
    };
};

router.post('/login', async (req, res) => {
    try {

        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const passwordMatches = await bcrypt.compare(password, user.password);
        if (!passwordMatches) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '1h' });
        return res.json({ accessToken: token, user: buildUserPayload(user) });
        
    } catch (err) {
        return res.status(500).json({ message: 'Internal Server Error' });
    }
});

router.get('/me', async (req, res) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded?.id);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        return res.status(200).json(buildUserPayload(user));
    } catch (err) {
        return res.status(401).json({ error: 'Token expired or invalid' });
    }
});

module.exports = router;
