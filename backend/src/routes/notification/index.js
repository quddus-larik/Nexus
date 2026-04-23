const express = require('express');

const Notification = require('../../models/notifications.model');

const router = express.Router();

const buildAvatarUrl = (displayName) =>
    `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName || 'User')}&background=random`;

const formatNotification = (notification) => {
    const actorId = notification.actor?._id?.toString?.() || notification.actor?.toString?.() || null;
    const actorName = notification.actor?.username || notification.actor?.email?.split('@')[0] || 'User';

    return {
        id: notification._id.toString(),
        userId: notification.user?._id?.toString?.() || notification.user?.toString?.(),
        actor: actorId
            ? {
                id: actorId,
                name: actorName,
                avatarUrl: notification.actor?.avatarUrl || buildAvatarUrl(actorName),
                email: notification.actor?.email || ''
            }
            : null,
        title: notification.title,
        message: notification.message,
        link: notification.link || '',
        read: Boolean(notification.read),
        type: notification.type || 'system',
        meta: notification.meta || {},
        createdAt: notification.createdAt,
        updatedAt: notification.updatedAt
    };
};

router.get('/', async (req, res) => {
    try {
        const notifications = await Notification.find({ user: req.user._id })
            .sort({ createdAt: -1 })
            .populate('actor', 'username email avatarUrl')
            .lean();

        const formattedNotifications = notifications.map(formatNotification);
        const unreadCount = formattedNotifications.filter((notification) => !notification.read).length;

        return res.status(200).json({
            notifications: formattedNotifications,
            unreadCount
        });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

router.patch('/read-all', async (req, res) => {
    try {
        const result = await Notification.updateMany(
            { user: req.user._id, read: false },
            { $set: { read: true } }
        );

        return res.status(200).json({
            updatedCount: result.modifiedCount ?? result.nModified ?? 0
        });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to mark notifications as read' });
    }
});

router.patch('/:id/read', async (req, res) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, user: req.user._id },
            { $set: { read: true } },
            { new: true }
        )
            .populate('actor', 'username email avatarUrl')
            .lean();

        if (!notification) {
            return res.status(404).json({ error: 'Notification not found' });
        }

        return res.status(200).json({
            notification: formatNotification(notification)
        });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to mark notification as read' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const notification = await Notification.findOneAndDelete({
            _id: req.params.id,
            user: req.user._id
        });

        if (!notification) {
            return res.status(404).json({ error: 'Notification not found' });
        }

        return res.status(200).json({ message: 'Notification deleted' });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to delete notification' });
    }
});

module.exports = router;
