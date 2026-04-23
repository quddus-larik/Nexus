const express = require('express');

const Deal = require('../../models/deal.model');
const Message = require('../../models/message.model');
const Notification = require('../../models/notifications.model');
const User = require('../../models/user.model');

const router = express.Router();
const DEAL_STATUSES = ['Proposed', 'Due Diligence', 'Term Sheet', 'Negotiation', 'Closed', 'Passed'];

const buildAvatarUrl = (displayName) =>
    `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName || 'User')}&background=random`;

const buildDisplayName = (user) => user?.username || user?.email?.split('@')[0] || 'User';

const buildNotificationActor = (user) => {
    if (!user) {
        return null;
    }

    const displayName = buildDisplayName(user);

    return {
        id: user._id?.toString?.() || user.id?.toString?.() || String(user._id || user.id || ''),
        name: displayName,
        avatarUrl: user.avatarUrl || buildAvatarUrl(displayName)
    };
};

const buildNotificationPayload = (notification, actor) => ({
    id: notification._id?.toString?.() || String(notification._id),
    userId: notification.user?.toString?.() || String(notification.user),
    actor: buildNotificationActor(actor),
    title: notification.title,
    message: notification.message,
    link: notification.link,
    type: notification.type,
    read: Boolean(notification.read),
    meta: notification.meta || {},
    createdAt: notification.createdAt,
    updatedAt: notification.updatedAt
});

const emitNotification = (req, notification, actor, recipientId) => {
    const io = req.app.get('io');

    if (!io || !recipientId) {
        return;
    }

    io.to(`user:${recipientId}`).emit('notification:received', buildNotificationPayload(notification, actor));
};

const buildPartyPayload = (user) => {
    if (!user) {
        return null;
    }

    const displayName = buildDisplayName(user);

    return {
        id: user._id?.toString?.() || String(user._id),
        name: displayName,
        email: user.email || '',
        role: String(user.type || '').toLowerCase() === 'investor' ? 'investor' : 'entrepreneur',
        avatarUrl: user.avatarUrl || buildAvatarUrl(displayName),
        bio: user.about || '',
        location: user.address || '',
        startupName: user.position || 'Startup',
        industry: Array.isArray(user.industries) ? user.industries[0] || '' : '',
        createdAt: user.createdAt
    };
};

const formatDeal = (deal) => ({
    id: deal._id?.toString?.() || String(deal._id),
    investor: buildPartyPayload(deal.investor),
    startup: buildPartyPayload(deal.startup),
    roomId: deal.roomId,
    title: deal.title,
    amount: deal.amount,
    currency: deal.currency,
    equity: deal.equity,
    round: deal.round,
    note: deal.note,
    status: deal.status,
    isMock: Boolean(deal.isMock),
    source: deal.source,
    metadata: deal.metadata || {},
    lastActivityAt: deal.lastActivityAt || deal.updatedAt,
    createdAt: deal.createdAt,
    updatedAt: deal.updatedAt
});

const parseAmount = (value) => {
    const parsed = Number(String(value).replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : null;
};

const parseEquity = (value) => {
    const parsed = Number(String(value).replace('%', '').trim());
    return Number.isFinite(parsed) ? parsed : null;
};

const getValidatedStatus = (status) => {
    return DEAL_STATUSES.includes(status) ? status : 'Proposed';
};

const getSafeCurrencyCode = (currency) => {
    const code = String(currency || 'USD').trim().toUpperCase();
    return /^[A-Z]{3}$/.test(code) ? code : 'USD';
};

const hasSharedConversation = async (userId, otherUserId) => {
    const roomId = [String(userId), String(otherUserId)].sort().join('-');

    return Message.exists({ roomId });
};

router.get('/', async (req, res) => {
    try {
        const deals = await Deal.find({
            $or: [
                { investor: req.user._id },
                { startup: req.user._id }
            ]
        })
            .sort({ updatedAt: -1 })
            .populate('investor', 'username email avatarUrl type about address position industries createdAt')
            .populate('startup', 'username email avatarUrl type about address position industries createdAt')
            .lean();

        return res.status(200).json({
            deals: deals.map(formatDeal)
        });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch deals' });
    }
});

router.get('/eligible', async (req, res) => {
    try {
        const messages = await Message.find({
            $or: [
                { senderId: req.user._id },
                { receiverId: req.user._id }
            ]
        })
            .sort({ createdAt: -1 })
            .populate('senderId', 'username email avatarUrl type about address position industries createdAt')
            .populate('receiverId', 'username email avatarUrl type about address position industries createdAt')
            .lean();

        const eligibleRole = String(req.user.type || '').toLowerCase() === 'investor' ? 'entrepreneur' : 'investor';
        const contactMap = new Map();

        messages.forEach((message) => {
            const sender = buildPartyPayload(message.senderId);
            const receiver = buildPartyPayload(message.receiverId);
            const senderId = sender?.id;
            const receiverId = receiver?.id;
            const otherParty = senderId === String(req.user._id) ? receiver : sender;

            if (!otherParty || otherParty.id === String(req.user._id)) {
                return;
            }

            if (otherParty.role !== eligibleRole) {
                return;
            }

            if (!contactMap.has(otherParty.id)) {
                contactMap.set(otherParty.id, {
                    ...otherParty,
                    lastMessage: message.content,
                    lastMessageAt: message.createdAt,
                    messageCount: 1,
                    roomId: [String(req.user._id), otherParty.id].sort().join('-')
                });
                return;
            }

            const existing = contactMap.get(otherParty.id);
            existing.messageCount += 1;
        });

        return res.status(200).json({
            contacts: Array.from(contactMap.values())
        });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch eligible deal contacts' });
    }
});

router.post('/', async (req, res) => {
    try {
        const {
            counterpartyId,
            title,
            amount,
            equity,
            round,
            note,
            currency,
            status
        } = req.body || {};

        if (!counterpartyId) {
            return res.status(400).json({ error: 'Counterparty is required' });
        }

        const parsedAmount = parseAmount(amount);
        if (parsedAmount === null || parsedAmount <= 0) {
            return res.status(400).json({ error: 'Valid investment amount is required' });
        }

        const parsedEquity = parseEquity(equity);
        if (parsedEquity === null || parsedEquity <= 0 || parsedEquity > 100) {
            return res.status(400).json({ error: 'Valid equity percentage is required' });
        }

        const counterparty = await User.findById(counterpartyId).lean();
        if (!counterparty) {
            return res.status(404).json({ error: 'Counterparty not found' });
        }

        const currentUserRole = String(req.user.type || '').toLowerCase();
        const counterpartyRole = String(counterparty.type || '').toLowerCase();
        const roomId = [String(req.user._id), String(counterparty._id)].sort().join('-');

        const conversationExists = await hasSharedConversation(req.user._id, counterparty._id);
        if (!conversationExists) {
            return res.status(403).json({ error: 'Message the member before creating a deal' });
        }

        if (currentUserRole === counterpartyRole) {
            return res.status(400).json({ error: 'Deals require a startup and an investor' });
        }

        const investorId = currentUserRole === 'investor' ? req.user._id : counterparty._id;
        const startupId = currentUserRole === 'investor' ? counterparty._id : req.user._id;
        const currentUserName = buildDisplayName(req.user);
        const counterpartyName = buildDisplayName(counterparty);
        const dealTitle = String(title || '').trim() || `Mock investment for ${counterpartyName}`;
        const dealStatus = getValidatedStatus(status || 'Proposed');
        const safeCurrencyCode = getSafeCurrencyCode(currency);

        const deal = await Deal.create({
            investor: investorId,
            startup: startupId,
            roomId,
            title: dealTitle,
            amount: parsedAmount,
            currency: safeCurrencyCode,
            equity: parsedEquity,
            round: String(round || 'Seed').trim() || 'Seed',
            note: String(note || '').trim(),
            status: dealStatus,
            isMock: true,
            source: 'message',
            metadata: {
                createdFrom: 'mock-investment-ui',
                createdBy: req.user._id.toString(),
                counterpartyId: String(counterparty._id)
            },
            lastActivityAt: new Date()
        });

        try {
            const notification = await Notification.create({
                user: counterparty._id,
                actor: req.user._id,
                title: `${currentUserName} sent a mock investment proposal`,
                message: `${currentUserName} sent ${parsedAmount.toLocaleString('en-US', { style: 'currency', currency: safeCurrencyCode })} at ${parsedEquity}% equity for ${counterpartyName}.`,
                link: '/deals',
                type: 'invests',
                read: false,
                meta: {
                    dealId: deal._id.toString(),
                    roomId
                }
            });

            emitNotification(req, notification, req.user, counterparty._id.toString());
        } catch (notificationError) {
            console.error('Deal notification create error:', notificationError);
        }

        const populatedDeal = await Deal.findById(deal._id)
            .populate('investor', 'username email avatarUrl type about address position industries createdAt')
            .populate('startup', 'username email avatarUrl type about address position industries createdAt')
            .lean();

        return res.status(201).json({
            deal: formatDeal(populatedDeal)
        });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to create deal' });
    }
});

router.patch('/:dealId/status', async (req, res) => {
    try {
        const { dealId } = req.params;
        const { status } = req.body || {};

        if (!DEAL_STATUSES.includes(status)) {
            return res.status(400).json({ error: 'Valid deal status is required' });
        }

        const deal = await Deal.findById(dealId);
        if (!deal) {
            return res.status(404).json({ error: 'Deal not found' });
        }

        const isInvestor = String(deal.investor) === String(req.user._id);
        const isStartup = String(deal.startup) === String(req.user._id);

        if (!isInvestor && !isStartup) {
            return res.status(403).json({ error: 'You can only update your own deals' });
        }

        const counterpartyId = isInvestor ? deal.startup : deal.investor;
        const counterparty = await User.findById(counterpartyId).lean();
        const currentUserName = buildDisplayName(req.user);
        const counterpartyName = buildDisplayName(counterparty);
        const updatedAt = new Date();

        deal.status = status;
        deal.lastActivityAt = updatedAt;
        deal.metadata = {
            ...(deal.metadata && typeof deal.metadata === 'object' ? deal.metadata : {}),
            statusUpdatedBy: req.user._id.toString(),
            statusUpdatedAt: updatedAt.toISOString()
        };

        await deal.save();

        try {
            const notification = await Notification.create({
                user: counterpartyId,
                actor: req.user._id,
                title: `${currentUserName} moved a deal to ${status}`,
                message: `${currentUserName} updated the deal with ${counterpartyName} to ${status}.`,
                link: '/deals',
                type: 'invests',
                read: false,
                meta: {
                    dealId: deal._id.toString(),
                    status
                }
            });

            emitNotification(req, notification, req.user, counterpartyId.toString());
        } catch (notificationError) {
            console.error('Deal status notification create error:', notificationError);
        }

        const populatedDeal = await Deal.findById(deal._id)
            .populate('investor', 'username email avatarUrl type about address position industries createdAt')
            .populate('startup', 'username email avatarUrl type about address position industries createdAt')
            .lean();

        return res.status(200).json({
            deal: formatDeal(populatedDeal)
        });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to update deal status' });
    }
});

module.exports = router;
