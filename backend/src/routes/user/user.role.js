const express = require('express');
const router = express.Router();

const User = require('../../models/user.model');

router.post('/role', async (req, res) => {
    const { id } = req.body || {};

    if (!id) {
        return res.status(400).json({ message: 'ID is required' });
    }

    const user = await User.findOne({ _id: id }, "_id type");

    if (!user) {
        return res.status(404).json({ message: 'User has no role' });
    }

    return res.status(200).json({ id: user._id, role: user.type });
});

module.exports = router;
