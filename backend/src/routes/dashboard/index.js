const express = require('express');

const Deal = require('../../models/deal.model');
const Message = require('../../models/message.model');
const Notification = require('../../models/notifications.model');
const User = require('../../models/user.model');

const router = express.Router();

const USER_SELECT_FIELDS = 'username email avatarUrl type about address position industries investmantStages portfolioCompanies collaborations teamMembers teamSize createdAt';

const buildAvatarUrl = (displayName) =>
    `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName || 'User')}&background=random`;

const buildDisplayName = (user) => user?.username || user?.email?.split('@')[0] || 'User';

const normalizeRole = (role) => {
    const normalized = String(role || '').toLowerCase();
    return normalized === 'investor' ? 'investor' : 'entrepreneur';
};

const buildPublicUserPayload = (user) => {
    if (!user) {
        return null;
    }

    const displayName = buildDisplayName(user);
    const role = normalizeRole(user.type);
    const industries = Array.isArray(user.industries) ? user.industries : [];
    const investmentStages = Array.isArray(user.investmantStages) ? user.investmantStages : [];
    const teamMembers = Array.isArray(user.teamMembers) ? user.teamMembers : [];
    const portfolioCompanies = Array.isArray(user.portfolioCompanies) ? user.portfolioCompanies : [];
    const collaborations = Array.isArray(user.collaborations) ? user.collaborations : [];

    const base = {
        id: user._id?.toString?.() || String(user._id),
        name: displayName,
        email: user.email || '',
        role,
        avatarUrl: user.avatarUrl || buildAvatarUrl(displayName),
        bio: user.about || '',
        location: user.address || '',
        createdAt: user.createdAt
    };

    if (role === 'investor') {
        return {
            ...base,
            investmentInterests: industries,
            investmentStage: investmentStages,
            portfolioCompanies,
            position: user.position || 'Investor',
            totalInvestments: collaborations.length || portfolioCompanies.length || 0,
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
        foundedYear: user.createdAt ? new Date(user.createdAt).getFullYear() : new Date().getFullYear(),
        teamSize: user.teamSize || teamMembers.length || 1,
        teamMembers
    };
};

const buildDealPayload = (deal) => ({
    id: deal._id?.toString?.() || String(deal._id),
    investor: buildPublicUserPayload(deal.investor),
    startup: buildPublicUserPayload(deal.startup),
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

const buildWarmContactPayload = (contact, deal) => ({
    ...contact,
    dealId: deal?.id || '',
    dealStatus: deal?.status || '',
    dealAmount: deal?.amount || 0,
    dealCurrency: deal?.currency || 'USD',
    dealTitle: deal?.title || ''
});

router.get('/', async (req, res) => {
    try {
        const currentUserId = String(req.user._id);
        const currentRole = normalizeRole(req.user.type);
        const oppositeRole = currentRole === 'investor' ? 'entrepreneur' : 'investor';

        const [messages, deals, unreadMessagesCount, unreadNotificationsCount, recommendedUsersRaw] = await Promise.all([
            Message.find({
                $or: [
                    { senderId: req.user._id },
                    { receiverId: req.user._id }
                ]
            })
                .sort({ createdAt: -1 })
                .populate('senderId', USER_SELECT_FIELDS)
                .populate('receiverId', USER_SELECT_FIELDS)
                .lean(),
            Deal.find({
                $or: [
                    { investor: req.user._id },
                    { startup: req.user._id }
                ]
            })
                .sort({ updatedAt: -1 })
                .populate('investor', USER_SELECT_FIELDS)
                .populate('startup', USER_SELECT_FIELDS)
                .lean(),
            Message.countDocuments({
                receiverId: req.user._id,
                isRead: false
            }),
            Notification.countDocuments({
                user: req.user._id,
                read: false
            }),
            User.find({
                type: { $regex: `^${oppositeRole}$`, $options: 'i' },
                _id: { $ne: req.user._id }
            })
                .sort({ createdAt: -1 })
                .limit(6)
                .lean()
        ]);

        const dealSummaries = deals.map(buildDealPayload);
        const activeDeals = dealSummaries.filter((deal) => !['Closed', 'Passed'].includes(deal.status));
        const closedDeals = dealSummaries.filter((deal) => deal.status === 'Closed');

        const dealByCounterpartyId = new Map();
        dealSummaries.forEach((deal) => {
            const counterparty = currentRole === 'investor' ? deal.startup : deal.investor;
            if (counterparty && !dealByCounterpartyId.has(counterparty.id)) {
                dealByCounterpartyId.set(counterparty.id, deal);
            }
        });

        const warmContactMap = new Map();
        messages.forEach((message) => {
            const sender = buildPublicUserPayload(message.senderId);
            const receiver = buildPublicUserPayload(message.receiverId);
            const senderId = sender?.id;
            const receiverId = receiver?.id;
            const otherParty = senderId === currentUserId ? receiver : sender;

            if (!otherParty || otherParty.id === currentUserId || otherParty.role !== oppositeRole) {
                return;
            }

            const existing = warmContactMap.get(otherParty.id);
            const nextContact = existing
                ? {
                    ...existing,
                    lastMessage: message.content,
                    lastMessageAt: message.createdAt,
                    messageCount: existing.messageCount + 1
                }
                : {
                    ...otherParty,
                    lastMessage: message.content,
                    lastMessageAt: message.createdAt,
                    messageCount: 1,
                    roomId: [currentUserId, otherParty.id].sort().join('-')
                };

            warmContactMap.set(otherParty.id, nextContact);
        });

        const warmContacts = Array.from(warmContactMap.values())
            .map((contact) => buildWarmContactPayload(contact, dealByCounterpartyId.get(contact.id)))
            .sort((left, right) => new Date(right.lastMessageAt).getTime() - new Date(left.lastMessageAt).getTime());

        const recommendedUsers = recommendedUsersRaw
            .map(buildPublicUserPayload)
            .filter(Boolean)
            .filter((user) => !warmContactMap.has(user.id))
            .slice(0, 4);

        return res.status(200).json({
            role: currentRole,
            stats: {
                warmContactsCount: warmContacts.length,
                activeDealsCount: activeDeals.length,
                closedDealsCount: closedDeals.length,
                unreadMessagesCount,
                unreadNotificationsCount
            },
            warmContacts,
            recommendedUsers,
            recentDeals: dealSummaries.slice(0, 4)
        });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to load dashboard data' });
    }
});

module.exports = router;
