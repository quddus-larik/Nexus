const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const { createServer } = require('http');
const { Server } = require("socket.io"); 

const signUpRouter = require('./src/auth/signup');
const logInRouter = require('./src/auth/login');
const userRoleRouter = require('./src/routes/user/user.role');
const userProfileRouter = require('./src/routes/user/user.profile');
const entrepreneurProfileRouter = require('./src/routes/entrepreneur/entrepreneur.profile');
const investorProfileRouter = require('./src/routes/investor/investor.profile');
const dealRouter = require('./src/routes/deals');
const dashboardRouter = require('./src/routes/dashboard');
const authenticateTokenMiddleware = require('./src/middlewares/auth.proxy');
const connectDB = require('./database/mongodb.connection');
const User = require('./src/models/user.model');
const Message = require('./src/models/message.model');
const Notification = require('./src/models/notifications.model');
const notificationRouter = require('./src/routes/notification');

const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});
app.set('io', io);

app.use(express.json());
app.use(cors({ origin: "*" }));

/**
 * Authenticate JWT token for HTTP or Socket.IO
 * @param {string} token - JWT token
 * @returns {Promise<Object>} - Decoded token and user object
 */
const authenticateToken = async (token) => {
    try {
        if (!token) {
            throw new Error('No token provided');
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secretjwt');
        const user = await User.findById(decoded?.id);

        if (!user) {
            throw new Error('User not found');
        }

        return { decoded, user };
    } catch (err) {
        throw new Error(`Authentication failed: ${err.message}`);
    }
};

const PORT = 8080;

connectDB();

// routes
app.use('/auth', signUpRouter); // /auth/signup
app.use('/auth', logInRouter); // /auth/login
app.use('/user', userRoleRouter); // /user/role
app.use('/entrepreneur', entrepreneurProfileRouter); // /entrepreneur/:id (public profile)
app.use('/investor', investorProfileRouter); // /investor/:id (public profile)
app.use('/users', authenticateTokenMiddleware, userProfileRouter); // /users/:id
app.use('/dashboard', authenticateTokenMiddleware, dashboardRouter); // /dashboard
app.use('/notifications', authenticateTokenMiddleware, notificationRouter); // /notifications
app.use('/deals', authenticateTokenMiddleware, dealRouter); // /deals

app.get('/',(req,res)=> res.send('Server is running!'));

// ==================== SOCKET.IO SETUP ====================

// Track active users
const activeUsers = new Map();
const activeCalls = new Map();
const buildAvatarUrl = (displayName) =>
    `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName || 'User')}&background=random`;
const buildDisplayName = (user) => user?.username || user?.email?.split('@')[0] || 'User';
const buildCallRoomId = (userA, userB) => [String(userA), String(userB)].sort().join('-');

const isUserInActiveCall = (userId) =>
    Array.from(activeCalls.values()).some((call) =>
        call.callerId === String(userId) || call.receiverId === String(userId)
    );

const getPeerIdFromCall = (call, userId) =>
    call.callerId === String(userId) ? call.receiverId : call.callerId;

const endCallSession = (roomId, { endedBy = null, reason = 'ended', notifyPeer = true } = {}) => {
    const call = activeCalls.get(roomId);
    if (!call) {
        return null;
    }

    activeCalls.delete(roomId);

    if (notifyPeer) {
        const peerId = call.callerId === String(endedBy) ? call.receiverId : call.callerId;
        if (peerId) {
            io.to(`user:${peerId}`).emit('call:end', {
                roomId,
                endedBy,
                reason,
                callType: call.callType
            });
        }
    }

    return call;
};

io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;

    try {
        const { decoded, user } = await authenticateToken(token);
        socket.userId = decoded.id;
        socket.user = user;
        next();
    } catch (err) {
        next(new Error(`Authentication error: ${err.message}`));
    }
});

io.on('connection', (socket) => {
    console.log(`User Connected: ${socket.userId} (Socket ID: ${socket.id})`);

    const displayName = buildDisplayName(socket.user);
    
    // Track active user
    activeUsers.set(socket.userId, {
        socketId: socket.id,
        userId: socket.userId,
        username: socket.user.username,
        name: displayName,
        avatarUrl: buildAvatarUrl(displayName)
    });

    // Broadcast active users to all connected clients
    io.emit('users:online', Array.from(activeUsers.values()));
    
    // Join personal room for direct messages
    socket.join(`user:${socket.userId}`);

    // ============= MESSAGE EVENTS =============
    const toMessagePayload = (messageDoc, senderUser, receiverUser) => ({
        id: messageDoc._id.toString(),
        senderId: messageDoc.senderId.toString(),
        senderName: senderUser?.username || senderUser?.email?.split('@')[0] || 'User',
        senderAvatar: senderUser?.avatarUrl || buildAvatarUrl(senderUser?.username || senderUser?.email?.split('@')[0] || 'User'),
        receiverId: messageDoc.receiverId.toString(),
        receiverName: receiverUser?.username || receiverUser?.email?.split('@')[0] || 'User',
        receiverAvatar: receiverUser?.avatarUrl || buildAvatarUrl(receiverUser?.username || receiverUser?.email?.split('@')[0] || 'User'),
        content: messageDoc.content,
        timestamp: messageDoc.createdAt,
        createdAt: messageDoc.createdAt,
        isRead: Boolean(messageDoc.isRead)
    });

    /**
     * Send a message to another user
     * Event: message:send
     * Data: { receiverId, content }
     */
    socket.on('message:send', async (data) => {
        try {
            const { receiverId, content } = data;
            
            if (!receiverId || !content.trim()) {
                socket.emit('message:error', { error: 'Invalid message data' });
                return;
            }

            // Create room ID for conversation
            const roomId = [socket.userId, receiverId].sort().join('-');

            // Create and save message to database
            const message = new Message({
                senderId: socket.userId,
                receiverId: receiverId,
                content: content.trim(),
                roomId: roomId,
                isRead: false
            });

            await message.save();
            const receiverUser = await User.findById(receiverId).lean();
            const messagePayload = toMessagePayload(
                message,
                socket.user,
                receiverUser
            );

            try {
                const notification = await Notification.create({
                    user: receiverId,
                    actor: socket.userId,
                    title: `${socket.user.username || socket.user.email?.split('@')[0] || 'Someone'} sent you a message`,
                    message: content.trim().length > 120
                        ? `${content.trim().slice(0, 120)}...`
                        : content.trim(),
                    link: `/chat/${socket.userId}`,
                    type: 'message',
                    read: false,
                    meta: {
                        messageId: message._id.toString(),
                        roomId
                    }
                });

                const notificationPayload = {
                    id: notification._id.toString(),
                    userId: notification.user.toString(),
                    actor: {
                        id: socket.userId.toString(),
                        name: socket.user.username || socket.user.email?.split('@')[0] || 'User',
                        avatarUrl: buildAvatarUrl(socket.user.username || socket.user.email?.split('@')[0] || 'User')
                    },
                    title: notification.title,
                    message: notification.message,
                    link: notification.link,
                    type: notification.type,
                    read: notification.read,
                    meta: notification.meta,
                    createdAt: notification.createdAt,
                    updatedAt: notification.updatedAt
                };

                io.to(`user:${receiverId}`).emit('notification:received', notificationPayload);
            } catch (notificationError) {
                console.error('Notification create error:', notificationError);
            }

            // Send to receiver
            io.to(`user:${receiverId}`).emit('message:received', messagePayload);
            
            // Confirm to sender
            socket.emit('message:sent', messagePayload);

            // Update conversation list for both users
            io.to(`user:${receiverId}`).emit('conversation:update', messagePayload);
            socket.emit('conversation:update', messagePayload);

            console.log(`Message sent from ${socket.userId} to ${receiverId}`);

        } catch (err) {
            console.error('Message send error:', err);
            socket.emit('message:error', { error: err.message });
        }
    });

    /**
     * Load message history between two users
     * Event: messages:load
     * Data: { otherUserId, limit }
     */
    socket.on('messages:load', async (data) => {
        try {
            const { otherUserId, limit = 50 } = data;
            const roomId = [socket.userId, otherUserId].sort().join('-');

            const messages = await Message.find({ roomId })
                .sort({ createdAt: -1 })
                .limit(limit)
                .populate('senderId', 'username email avatarUrl')
                .populate('receiverId', 'username email avatarUrl')
                .lean();

            const formattedMessages = messages.reverse().map(msg => ({
                id: msg._id.toString(),
                senderId: msg.senderId?._id?.toString() || msg.senderId?.toString(),
                senderName: msg.senderId?.username || msg.senderId?.email?.split('@')[0] || 'User',
                senderAvatar: msg.senderId?.avatarUrl || '',
                receiverId: msg.receiverId?._id?.toString() || msg.receiverId?.toString(),
                receiverName: msg.receiverId?.username || msg.receiverId?.email?.split('@')[0] || 'User',
                receiverAvatar: msg.receiverId?.avatarUrl || '',
                content: msg.content,
                timestamp: msg.createdAt,
                createdAt: msg.createdAt,
                isRead: msg.isRead
            }));

            socket.emit('messages:loaded', formattedMessages);
            console.log(`Loaded ${formattedMessages.length} messages for user ${socket.userId}`);

        } catch (err) {
            console.error('Load messages error:', err);
            socket.emit('message:error', { error: err.message });
        }
    });

    /**
     * Mark a message as read
     * Event: message:read
     * Data: { messageId }
     */
    socket.on('message:read', async (data) => {
        try {
            const { messageId } = data;
            await Message.findByIdAndUpdate(messageId, { isRead: true });
            
            socket.emit('message:read:confirmed', { messageId });
        } catch (err) {
            console.error('Mark read error:', err);
            socket.emit('message:error', { error: err.message });
        }
    });

    /**
     * Get all conversations for current user
     * Event: conversations:get
     */
    socket.on('conversations:get', async (data) => {
        try {
            const messages = await Message.find({
                $or: [
                    { senderId: socket.userId },
                    { receiverId: socket.userId }
                ]
            })
            .sort({ createdAt: -1 })
            .populate('senderId', 'username email avatarUrl')
            .populate('receiverId', 'username email avatarUrl')
            .lean();

            // Group by conversation
            const conversationMap = new Map();
            messages.forEach(msg => {
                const senderId = msg.senderId?._id?.toString() || msg.senderId?.toString();
                const receiverId = msg.receiverId?._id?.toString() || msg.receiverId?.toString();
                const otherUserId = senderId === socket.userId ? receiverId : senderId;
                const key = String(otherUserId);
                
                if (!conversationMap.has(key)) {
                    conversationMap.set(key, {
                        id: msg._id.toString(),
                        senderId,
                        senderName: msg.senderId?.username || msg.senderId?.email?.split('@')[0] || 'User',
                        senderAvatar: msg.senderId?.avatarUrl || '',
                        receiverId,
                        receiverName: msg.receiverId?.username || msg.receiverId?.email?.split('@')[0] || 'User',
                        receiverAvatar: msg.receiverId?.avatarUrl || '',
                        content: msg.content,
                        timestamp: msg.createdAt,
                        createdAt: msg.createdAt,
                        isRead: msg.isRead
                    });
                }
            });

            const conversations = Array.from(conversationMap.values());
            socket.emit('conversations:loaded', conversations);
            console.log(`Loaded ${conversations.length} conversations for user ${socket.userId}`);

        } catch (err) {
            console.error('Load conversations error:', err);
            socket.emit('message:error', { error: err.message });
        }
    });

    /**
     * Typing indicator
     * Event: typing:start
     * Data: { receiverId }
     */
    socket.on('typing:start', (data) => {
        const { receiverId } = data;
        io.to(`user:${receiverId}`).emit('typing:indicator', {
            userId: socket.userId,
            username: socket.user.username,
            isTyping: true
        });
    });

    /**
     * Stop typing indicator
     * Event: typing:stop
     * Data: { receiverId }
     */
    socket.on('typing:stop', (data) => {
        const { receiverId } = data;
        io.to(`user:${receiverId}`).emit('typing:indicator', {
            userId: socket.userId,
            username: socket.user.username,
            isTyping: false
        });
    });

    // ============= CALL SIGNALING =============

    socket.on('call:initiate', async (data) => {
        try {
            const { targetUserId, roomId, callType, offer } = data || {};
            const receiverId = String(targetUserId || '');
            const callRoomId = roomId || buildCallRoomId(socket.userId, receiverId);

            if (!receiverId || !offer || !callType) {
                socket.emit('call:error', { error: 'Invalid call payload' });
                return;
            }

            if (receiverId === String(socket.userId)) {
                socket.emit('call:error', { error: 'You cannot call yourself' });
                return;
            }

            if (!activeUsers.has(receiverId)) {
                socket.emit('call:error', { error: 'The other user is offline' });
                return;
            }

            if (isUserInActiveCall(socket.userId) || isUserInActiveCall(receiverId)) {
                socket.emit('call:error', { error: 'One of the users is already on another call' });
                return;
            }

            activeCalls.set(callRoomId, {
                roomId: callRoomId,
                callerId: String(socket.userId),
                receiverId,
                callType,
                offer,
                status: 'ringing',
                startedAt: new Date().toISOString()
            });

            io.to(`user:${receiverId}`).emit('call:incoming', {
                roomId: callRoomId,
                callerId: String(socket.userId),
                callerName: buildDisplayName(socket.user),
                callerAvatar: socket.user.avatarUrl || buildAvatarUrl(buildDisplayName(socket.user)),
                receiverId,
                callType,
                offer,
                startedAt: new Date().toISOString()
            });
        } catch (err) {
            console.error('Call initiate error:', err);
            socket.emit('call:error', { error: err.message });
        }
    });

    socket.on('call:answer', async (data) => {
        try {
            const { targetUserId, roomId, answer } = data || {};
            const callRoomId = roomId || buildCallRoomId(socket.userId, targetUserId);
            const call = activeCalls.get(callRoomId);

            if (!call || !answer) {
                socket.emit('call:error', { error: 'Call session not found' });
                return;
            }

            if (String(socket.userId) !== String(call.receiverId)) {
                socket.emit('call:error', { error: 'Only the receiving user can answer this call' });
                return;
            }

            call.answer = answer;
            call.status = 'connected';
            activeCalls.set(callRoomId, call);

            io.to(`user:${call.callerId}`).emit('call:answer', {
                roomId: callRoomId,
                answer,
                responderId: String(socket.userId)
            });
        } catch (err) {
            console.error('Call answer error:', err);
            socket.emit('call:error', { error: err.message });
        }
    });

    socket.on('call:decline', (data) => {
        try {
            const { targetUserId, roomId, reason = 'declined' } = data || {};
            const callRoomId = roomId || buildCallRoomId(socket.userId, targetUserId);
            const call = activeCalls.get(callRoomId);

            if (!call) {
                return;
            }

            if (String(socket.userId) !== String(call.receiverId)) {
                return;
            }

            activeCalls.delete(callRoomId);
            io.to(`user:${call.callerId}`).emit('call:declined', {
                roomId: callRoomId,
                declinedBy: String(socket.userId),
                reason,
                callType: call.callType
            });
        } catch (err) {
            console.error('Call decline error:', err);
        }
    });

    socket.on('call:ice-candidate', (data) => {
        try {
            const { targetUserId, roomId, candidate } = data || {};
            const callRoomId = roomId || buildCallRoomId(socket.userId, targetUserId);
            const call = activeCalls.get(callRoomId);

            if (!call || !candidate) {
                return;
            }

            const peerId = getPeerIdFromCall(call, socket.userId);
            io.to(`user:${peerId}`).emit('call:ice-candidate', {
                roomId: callRoomId,
                candidate,
                senderId: String(socket.userId)
            });
        } catch (err) {
            console.error('Call ICE candidate error:', err);
        }
    });

    socket.on('call:end', (data) => {
        try {
            const { targetUserId, roomId, reason = 'ended' } = data || {};
            const callRoomId = roomId || buildCallRoomId(socket.userId, targetUserId);
            const call = activeCalls.get(callRoomId);

            if (!call) {
                return;
            }

            const peerId = getPeerIdFromCall(call, socket.userId);
            endCallSession(callRoomId, {
                endedBy: String(socket.userId),
                reason,
                notifyPeer: false
            });

            io.to(`user:${peerId}`).emit('call:end', {
                roomId: callRoomId,
                endedBy: String(socket.userId),
                reason,
                callType: call.callType
            });
        } catch (err) {
            console.error('Call end error:', err);
        }
    });

    // ============= DISCONNECT =============

    socket.on('disconnect', () => {
        console.log(`User Disconnected: ${socket.userId}`);

        for (const [roomId, call] of activeCalls.entries()) {
            if (call.callerId === String(socket.userId) || call.receiverId === String(socket.userId)) {
                const peerId = getPeerIdFromCall(call, socket.userId);
                endCallSession(roomId, {
                    endedBy: String(socket.userId),
                    reason: 'disconnect',
                    notifyPeer: false
                });

                io.to(`user:${peerId}`).emit('call:end', {
                    roomId,
                    endedBy: String(socket.userId),
                    reason: 'disconnect',
                    callType: call.callType
                });
            }
        }

        activeUsers.delete(socket.userId);
        
        // Broadcast updated online users
        io.emit('users:online', Array.from(activeUsers.values()));
    });

});

server.listen(PORT, () => console.log(`Server is listening on http://localhost:${PORT}`));
