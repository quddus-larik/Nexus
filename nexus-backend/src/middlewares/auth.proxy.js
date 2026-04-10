const jwt = require('jsonwebtoken');
const User = require('../models/user.model');

const authenticateToken = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded?.id);
        if (!user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        req.user = user;
        req.token = token;

        return next();
    } catch (err) {
        return res.status(401).json({ error: 'Token expired or invalid' });
    }
};

module.exports = authenticateToken;
