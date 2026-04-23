import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Send,
  Phone,
  Video,
  Smile,
  ArrowLeft,
  MoreVertical,
  AlertCircle,
  MessageCircle,
  Mic,
  MicOff,
  VideoOff,
  PhoneOff,
  Loader2,
  PhoneIncoming,
  PhoneOutgoing
} from 'lucide-react';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ChatMessage } from '../../components/chat/ChatMessage';
import { ChatUserList } from '../../components/chat/ChatUserList';
import { useAuth } from '../../context/AuthContext';
import { Message } from '../../types';
import socketService from '../../services/socketService';

type CallType = 'audio' | 'video';
type CallDirection = 'incoming' | 'outgoing';
type CallStatus = 'calling' | 'connecting' | 'connected';

interface IncomingCallData {
  roomId: string;
  callerId: string;
  callerName: string;
  callerAvatar: string;
  callType: CallType;
  offer: RTCSessionDescriptionInit;
  startedAt?: string;
  receiverId?: string;
}

interface ActiveCallSession {
  roomId: string;
  peerId: string;
  peerName: string;
  peerAvatar: string;
  callType: CallType;
  status: CallStatus;
  direction: CallDirection;
}

interface ChatPartnerProfile {
  id?: string;
  name: string;
  avatarUrl: string;
  isOnline: boolean;
}

interface ChatConversationItem {
  senderId?: string | { toString(): string };
  receiverId?: string | { toString(): string };
  content?: string;
  createdAt?: string;
  timestamp?: string;
  isRead?: boolean;
  senderName?: string;
  senderAvatar?: string;
  receiverName?: string;
  receiverAvatar?: string;
}

interface SocketUserPresence {
  userId?: string;
  id?: string;
}

interface SocketMessagePayload {
  id?: string | number;
  senderId?: string | number;
  receiverId?: string | number;
  content?: string;
  timestamp?: string;
  isRead?: boolean;
  senderName?: string;
  senderAvatar?: string;
  receiverName?: string;
  receiverAvatar?: string;
}

interface SocketTypingPayload {
  userId: string;
  isTyping: boolean;
  username?: string;
}

interface SocketErrorPayload {
  error: string;
}

interface CallAnswerPayload {
  roomId: string;
  answer: RTCSessionDescriptionInit;
  responderId: string;
}

interface CallDeclinedPayload {
  roomId: string;
  reason?: string;
  declinedBy?: string;
  callType?: CallType;
}

interface CallIceCandidatePayload {
  roomId: string;
  candidate: RTCIceCandidateInit;
  senderId: string;
}

interface CallEndPayload {
  roomId: string;
  reason?: string;
  endedBy?: string;
  callType?: CallType;
}

export const ChatPage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [conversations, setConversations] = useState<ChatConversationItem[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [showMobileMenu] = useState(true);
  const [chatPartner, setChatPartner] = useState<ChatPartnerProfile | null>(null);
  const [loadingChatPartner, setLoadingChatPartner] = useState(false);
  const [activeCall, setActiveCall] = useState<ActiveCallSession | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [isStartingCall, setIsStartingCall] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const activeCallRef = useRef<ActiveCallSession | null>(null);
  const incomingCallRef = useRef<IncomingCallData | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  const getCallRoomId = (otherUserId: string) =>
    [String(currentUser?.id || ''), String(otherUserId || '')].sort().join('-');

  const flushPendingIceCandidates = async () => {
    const pc = peerConnectionRef.current;
    if (!pc || pendingIceCandidatesRef.current.length === 0) return;

    const pendingCandidates = [...pendingIceCandidatesRef.current];
    pendingIceCandidatesRef.current = [];

    for (const candidateData of pendingCandidates) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidateData));
      } catch (err) {
        console.error('Failed to apply queued ICE candidate:', err);
      }
    }
  };

  const cleanupCall = useCallback(({
    notifyPeer = true,
    reason = 'ended'
  }: {
    notifyPeer?: boolean;
    reason?: string;
  } = {}) => {
    const session = activeCallRef.current;
    const invite = incomingCallRef.current;

    if (notifyPeer && session) {
      socketService.endCall({
        targetUserId: session.peerId,
        roomId: session.roomId,
        reason
      });
    } else if (notifyPeer && invite && !session) {
      socketService.declineCall({
        targetUserId: invite.callerId,
        roomId: invite.roomId,
        reason
      });
    }

    localStreamRef.current?.getTracks().forEach(track => track.stop());
    remoteStreamRef.current?.getTracks().forEach(track => track.stop());

    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;

    if (peerConnectionRef.current) {
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.onconnectionstatechange = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    localStreamRef.current = null;
    remoteStreamRef.current = null;
    pendingIceCandidatesRef.current = [];
    activeCallRef.current = null;
    incomingCallRef.current = null;

    setLocalStream(null);
    setRemoteStream(null);
    setActiveCall(null);
    setIncomingCall(null);
    setIsMuted(false);
    setIsCameraEnabled(true);
    setIsStartingCall(false);
  }, []);

  const createPeerConnection = () => {
    const peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    peerConnection.onicecandidate = (event) => {
      if (!event.candidate) return;

      const session = activeCallRef.current || incomingCallRef.current;
      if (!session) return;

      socketService.sendIceCandidate({
        targetUserId: session.peerId,
        roomId: session.roomId,
        candidate: event.candidate.toJSON()
      });
    };

    peerConnection.ontrack = (event) => {
      const nextStream = event.streams[0] || remoteStreamRef.current || new MediaStream();
      if (!nextStream.getTracks().some(track => track.id === event.track.id)) {
        nextStream.addTrack(event.track);
      }

      remoteStreamRef.current = nextStream;
      setRemoteStream(new MediaStream(nextStream.getTracks()));
    };

    peerConnection.onconnectionstatechange = () => {
      if (peerConnection.connectionState === 'connected') {
        setActiveCall(prev => (prev ? { ...prev, status: 'connected' } : prev));
      }

      if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected') {
        cleanupCall({ notifyPeer: false, reason: 'connection_lost' });
      }
    };

    return peerConnection;
  };

  // Keep refs aligned with state for async socket callbacks.
  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  useEffect(() => {
    incomingCallRef.current = incomingCall;
  }, [incomingCall]);

  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    if (!callError) return;
    const timeout = setTimeout(() => setCallError(null), 4500);
    return () => clearTimeout(timeout);
  }, [callError]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      if (incomingCallRef.current && !activeCallRef.current) {
        socketService.declineCall({
          targetUserId: incomingCallRef.current.callerId,
          roomId: incomingCallRef.current.roomId,
          reason: 'left_page'
        });
      }

      cleanupCall({
        notifyPeer: Boolean(activeCallRef.current),
        reason: 'left_page'
      });
    };
    // Clean up the current call when the conversation target changes or the page unmounts.
  }, [userId, cleanupCall]);

  // Fetch chat partner from API
  useEffect(() => {
    if (!userId) {
      setChatPartner(null);
      return;
    }

    const fetchChatPartner = async () => {
      try {
        setLoadingChatPartner(true);
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';

        let response = await fetch(`${apiUrl}/entrepreneur/${userId}`);
        if (!response.ok) {
          response = await fetch(`${apiUrl}/investor/${userId}`);
        }

        if (response.ok) {
          const data = await response.json();
          setChatPartner({
            ...data,
            isOnline: false
          });
        } else {
          setChatPartner(null);
        }
      } catch (err) {
        console.error('Error fetching chat partner:', err);
        setChatPartner(null);
      } finally {
        setLoadingChatPartner(false);
      }
    };

    fetchChatPartner();
  }, [userId]);

  // Initialize Socket Connection
  useEffect(() => {
    if (!currentUser) return;

    const token = localStorage.getItem('business_nexus_access_token');
    if (!token) return;

    socketService.connect(token);
    setIsConnected(socketService.isConnected());

    const handleConnect = () => {
      setIsConnected(true);
      console.log('Connected to socket server');
    };

    const handleDisconnect = () => {
      setIsConnected(false);
      console.log('Disconnected from socket server');
    };

    const handleUsersOnline = (users: SocketUserPresence[]) => {
      if (!userId) return;
      const partnerOnline = users.some(user =>
        String(user.userId || user.id) === String(userId)
      );

      setChatPartner(prev => (prev ? { ...prev, isOnline: partnerOnline } : prev));
    };

    const handleMessageReceived = (message: SocketMessagePayload) => {
      if (String(message.senderId) === String(userId) || String(message.receiverId) === String(userId)) {
        const formattedMessage: Message = {
          id: message.id?.toString(),
          senderId: message.senderId?.toString(),
          receiverId: message.receiverId?.toString(),
          content: message.content,
          timestamp: message.timestamp,
          isRead: message.isRead,
          senderName: message.senderName,
          senderAvatar: message.senderAvatar,
          receiverName: message.receiverName,
          receiverAvatar: message.receiverAvatar
        };
        setMessages(prev => [...prev, formattedMessage]);
      }
    };

    const handleMessageSent = (message: SocketMessagePayload) => {
      setSendingMessage(false);
      const formattedMessage: Message = {
        id: message.id?.toString(),
        senderId: message.senderId?.toString(),
        receiverId: message.receiverId?.toString(),
        content: message.content,
        timestamp: message.timestamp,
        isRead: message.isRead,
        senderName: message.senderName,
        senderAvatar: message.senderAvatar,
        receiverName: message.receiverName,
        receiverAvatar: message.receiverAvatar
      };
      setMessages(prev => [...prev, formattedMessage]);
    };

    const handleMessagesLoaded = (msgs: SocketMessagePayload[]) => {
      setIsLoadingMessages(false);
      const formattedMessages: Message[] = msgs.map(msg => ({
        id: msg.id?.toString(),
        senderId: msg.senderId?.toString(),
        receiverId: msg.receiverId?.toString(),
        content: msg.content,
        timestamp: msg.timestamp,
        isRead: msg.isRead,
        senderName: msg.senderName,
        senderAvatar: msg.senderAvatar,
        receiverName: msg.receiverName,
        receiverAvatar: msg.receiverAvatar
      }));
      setMessages(formattedMessages);
    };

    const handleConversationsLoaded = (convs: ChatConversationItem[]) => {
      setConversations(convs);
    };

    const handleTypingIndicator = (data: SocketTypingPayload) => {
      if (data.isTyping) {
        setTypingUsers(prev => new Set([...prev, data.userId]));
      } else {
        setTypingUsers(prev => {
          const updated = new Set(prev);
          updated.delete(data.userId);
          return updated;
        });
      }
    };

    const handleMessageError = (data: SocketErrorPayload) => {
      console.error('Socket error:', data.error);
      setSendingMessage(false);
    };

    const handleCallIncoming = (data: IncomingCallData) => {
      if (activeCallRef.current || incomingCallRef.current) {
        socketService.declineCall({
          targetUserId: data.callerId,
          roomId: data.roomId,
          reason: 'busy'
        });
        return;
      }

      setCallError(null);
      incomingCallRef.current = data;
      setIncomingCall(data);
    };

    const handleCallAnswer = async (data: CallAnswerPayload) => {
      const session = activeCallRef.current;
      if (!session || session.roomId !== data.roomId) return;

      try {
        const pc = peerConnectionRef.current;
        if (!pc) return;

        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        await flushPendingIceCandidates();
        setActiveCall(prev => (prev ? { ...prev, status: 'connected' } : prev));
      } catch (err) {
        console.error('Failed to apply call answer:', err);
        cleanupCall({ notifyPeer: false, reason: 'answer_failed' });
      }
    };

    const handleCallDeclined = (data: CallDeclinedPayload) => {
      const session = activeCallRef.current;
      if (!session || session.roomId !== data.roomId) return;

      setCallError(data.reason === 'busy' ? 'The other user is already on another call.' : 'Call declined.');
      cleanupCall({ notifyPeer: false, reason: data.reason || 'declined' });
    };

    const handleCallIceCandidate = async (data: CallIceCandidatePayload) => {
      const session = activeCallRef.current || incomingCallRef.current;
      if (!session || session.roomId !== data.roomId) return;

      const pc = peerConnectionRef.current;
      if (!pc) {
        pendingIceCandidatesRef.current.push(data.candidate);
        return;
      }

      try {
        if (pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } else {
          pendingIceCandidatesRef.current.push(data.candidate);
        }
      } catch (err) {
        console.error('Failed to add ICE candidate:', err);
      }
    };

    const handleCallEnd = (data: CallEndPayload) => {
      const session = activeCallRef.current || incomingCallRef.current;
      if (!session || session.roomId !== data.roomId) return;

      if (data.reason === 'disconnect') {
        setCallError('The other user disconnected.');
      }

      cleanupCall({ notifyPeer: false, reason: data.reason || 'ended' });
    };

    const handleCallError = (data: SocketErrorPayload) => {
      setCallError(data.error);
      cleanupCall({ notifyPeer: false, reason: data.error || 'call_error' });
    };

    socketService.on('connect', handleConnect);
    socketService.on('disconnect', handleDisconnect);
    socketService.on('users:online', handleUsersOnline);
    socketService.on('message:received', handleMessageReceived);
    socketService.on('message:sent', handleMessageSent);
    socketService.on('messages:loaded', handleMessagesLoaded);
    socketService.on('conversations:loaded', handleConversationsLoaded);
    socketService.on('typing:indicator', handleTypingIndicator);
    socketService.on('message:error', handleMessageError);
    socketService.on('call:incoming', handleCallIncoming);
    socketService.on('call:answer', handleCallAnswer);
    socketService.on('call:declined', handleCallDeclined);
    socketService.on('call:ice-candidate', handleCallIceCandidate);
    socketService.on('call:end', handleCallEnd);
    socketService.on('call:error', handleCallError);

    return () => {
      socketService.off('connect');
      socketService.off('disconnect');
      socketService.off('users:online');
      socketService.off('message:received');
      socketService.off('message:sent');
      socketService.off('messages:loaded');
      socketService.off('conversations:loaded');
      socketService.off('typing:indicator');
      socketService.off('message:error');
      socketService.off('call:incoming');
      socketService.off('call:answer');
      socketService.off('call:declined');
      socketService.off('call:ice-candidate');
      socketService.off('call:end');
      socketService.off('call:error');
    };
  }, [currentUser, userId, cleanupCall]);

  // Load conversations
  useEffect(() => {
    if (isConnected) {
      socketService.loadConversations();
    }
  }, [isConnected]);

  // Load messages when chat partner changes
  useEffect(() => {
    if (isConnected && userId) {
      setIsLoadingMessages(true);
      setMessages([]);
      socketService.loadMessages(userId);
    }
  }, [isConnected, userId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();

    if (!newMessage.trim() || !currentUser || !userId || !isConnected) return;

    setSendingMessage(true);
    socketService.sendMessage(userId, newMessage.trim());
    setNewMessage('');
    setIsTyping(false);
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);

    if (!isTyping && userId) {
      setIsTyping(true);
      socketService.typingStart(userId);
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      if (userId) {
        socketService.typingStop(userId);
        setIsTyping(false);
      }
    }, 2000);
  };

  const handleStartCall = async (callType: CallType, targetUserId = userId) => {
    if (!currentUser || !targetUserId || !isConnected) return;
    if (isStartingCall || activeCallRef.current || incomingCallRef.current) {
      setCallError('Finish the current call first.');
      return;
    }

    if (chatPartner?.isOnline === false) {
      setCallError(`${chatPartner?.name || 'This user'} is offline right now.`);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCallError('This browser does not support audio/video calling.');
      return;
    }

    try {
      setIsStartingCall(true);
      setCallError(null);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'video'
      });

      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsMuted(false);
      setIsCameraEnabled(callType === 'video');

      const roomId = getCallRoomId(targetUserId);
      const session: ActiveCallSession = {
        roomId,
        peerId: targetUserId,
        peerName: chatPartner?.name || 'User',
        peerAvatar: chatPartner?.avatarUrl || '',
        callType,
        status: 'calling',
        direction: 'outgoing'
      };

      activeCallRef.current = session;
      setActiveCall(session);

      const peerConnection = createPeerConnection();
      peerConnectionRef.current = peerConnection;

      stream.getTracks().forEach(track => {
        peerConnection.addTrack(track, stream);
      });

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      socketService.startCall({
        targetUserId,
        roomId,
        callType,
        offer
      });
    } catch (err: unknown) {
      console.error('Failed to start call:', err);
      cleanupCall({ notifyPeer: false, reason: 'start_failed' });
      setCallError(err instanceof Error ? err.message : 'Unable to start the call.');
    } finally {
      setIsStartingCall(false);
    }
  };

  const handleAcceptCall = async () => {
    const invite = incomingCallRef.current;
    if (!currentUser || !invite || activeCallRef.current) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setCallError('This browser does not support audio/video calling.');
      return;
    }

    try {
      setIsStartingCall(true);
      setCallError(null);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: invite.callType === 'video'
      });

      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsMuted(false);
      setIsCameraEnabled(invite.callType === 'video');

      const session: ActiveCallSession = {
        roomId: invite.roomId,
        peerId: invite.callerId,
        peerName: invite.callerName,
        peerAvatar: invite.callerAvatar,
        callType: invite.callType,
        status: 'connecting',
        direction: 'incoming'
      };

      activeCallRef.current = session;
      setActiveCall(session);

      const peerConnection = createPeerConnection();
      peerConnectionRef.current = peerConnection;

      stream.getTracks().forEach(track => {
        peerConnection.addTrack(track, stream);
      });

      await peerConnection.setRemoteDescription(invite.offer);
      await flushPendingIceCandidates();

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      socketService.answerCall({
        targetUserId: invite.callerId,
        roomId: invite.roomId,
        answer
      });

      incomingCallRef.current = null;
      setIncomingCall(null);
    } catch (err: unknown) {
      console.error('Failed to accept call:', err);
      cleanupCall({ notifyPeer: false, reason: 'accept_failed' });
      setCallError(err instanceof Error ? err.message : 'Unable to accept the call.');
    } finally {
      setIsStartingCall(false);
    }
  };

  const handleDeclineCall = () => {
    const invite = incomingCallRef.current;
    if (!invite) return;

    socketService.declineCall({
      targetUserId: invite.callerId,
      roomId: invite.roomId,
      reason: 'declined'
    });

    cleanupCall({ notifyPeer: false, reason: 'declined' });
    setCallError('Call declined.');
  };

  const handleEndCall = () => {
    if (!activeCallRef.current) return;
    cleanupCall({ notifyPeer: true, reason: 'ended' });
  };

  const handleToggleMute = () => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) return;

    const nextMuted = !isMuted;
    audioTracks.forEach(track => {
      track.enabled = !nextMuted;
    });
    setIsMuted(nextMuted);
  };

  const handleToggleCamera = () => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const videoTracks = stream.getVideoTracks();
    if (!videoTracks.length) return;

    const nextEnabled = !isCameraEnabled;
    videoTracks.forEach(track => {
      track.enabled = nextEnabled;
    });
    setIsCameraEnabled(nextEnabled);
  };

  const handleBackToList = () => {
    if (incomingCallRef.current && !activeCallRef.current) {
      handleDeclineCall();
    } else {
      cleanupCall({ notifyPeer: Boolean(activeCallRef.current), reason: 'navigate_away' });
    }

    navigate('/messages');
  };

  const callPanel = incomingCall ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/75 backdrop-blur-md p-4">
      <div className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-4">
          <div className="relative">
            <Avatar
              src={incomingCall.callerAvatar}
              alt={incomingCall.callerName}
              size="xl"
            />
            <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-gray-700 shadow-lg">
              <PhoneIncoming size={14} />
            </span>
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-600">
              Incoming {incomingCall.callType} call
            </p>
            <h3 className="mt-1 text-2xl font-semibold text-gray-900">{incomingCall.callerName}</h3>
            <p className="mt-1 text-sm text-gray-500">
              {incomingCall.callType === 'video' ? 'Wants to start a video conversation.' : 'Wants to start a voice conversation.'}
            </p>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <Button
            variant="outline"
            size="lg"
            fullWidth
            disabled={isStartingCall}
            className="border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
            onClick={handleDeclineCall}
          >
            <PhoneOff size={16} className="mr-2" />
            Decline
          </Button>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            isLoading={isStartingCall}
            onClick={handleAcceptCall}
          >
            <Phone size={16} className="mr-2" />
            Accept
          </Button>
        </div>
      </div>
    </div>
  ) : activeCall ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-md p-4">
      <div className="w-full max-w-6xl overflow-hidden rounded-[2rem] border border-gray-200 bg-white shadow-2xl">
        <div className="flex flex-col gap-4 border-b border-gray-200 p-4 text-gray-900 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-center gap-4">
            <Avatar
              src={activeCall.peerAvatar}
              alt={activeCall.peerName}
              size="lg"
              status={activeCall.status === 'connected' ? 'online' : 'busy'}
            />
            <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gray-500">
                {activeCall.direction === 'outgoing' ? (
                  <span className="inline-flex items-center gap-2">
                    <PhoneOutgoing size={12} />
                    Outgoing {activeCall.callType} call
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <PhoneIncoming size={12} />
                    Incoming {activeCall.callType} call
                  </span>
                )}
              </p>
              <h3 className="mt-1 text-xl font-semibold">{activeCall.peerName}</h3>
              <p className="mt-1 text-sm text-gray-500">
                {activeCall.status === 'connected'
                  ? 'Connected'
                  : activeCall.direction === 'outgoing'
                    ? 'Calling...'
                    : 'Connecting...'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 hover:text-gray-900"
              onClick={handleToggleMute}
              disabled={!localStream}
              aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
            </Button>
            {activeCall.callType === 'video' && (
              <Button
                variant="outline"
                size="sm"
                className="rounded-full border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                onClick={handleToggleCamera}
                disabled={!localStream}
                aria-label={isCameraEnabled ? 'Disable camera' : 'Enable camera'}
              >
                {isCameraEnabled ? <Video size={16} /> : <VideoOff size={16} />}
              </Button>
            )}
            <Button
              variant="error"
              size="sm"
              className="rounded-full"
              onClick={handleEndCall}
              aria-label="End call"
            >
              <PhoneOff size={16} />
            </Button>
          </div>
        </div>

        <div className="relative min-h-[65vh] bg-white">
          {activeCall.callType === 'video' ? (
            remoteStream ? (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="h-[65vh] w-full object-cover"
              />
            ) : (
              <div className="flex h-[65vh] flex-col items-center justify-center bg-gray-50 text-gray-900">
                <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-white shadow-sm border border-gray-200">
                  <Loader2 size={28} className="animate-spin text-gray-500" />
                </div>
                <p className="text-lg font-medium">{activeCall.peerName}</p>
                <p className="mt-1 text-sm text-gray-500">Waiting for the camera stream...</p>
              </div>
            )
          ) : (
            <div className="flex h-[65vh] items-center justify-center bg-gray-50 p-8 text-gray-900">
              <div className="max-w-md text-center">
                <Avatar
                  src={activeCall.peerAvatar}
                  alt={activeCall.peerName}
                  size="xl"
                  className="mx-auto"
                />
                <h4 className="mt-6 text-3xl font-semibold">{activeCall.peerName}</h4>
                <p className="mt-2 text-sm text-gray-500">
                  {activeCall.status === 'connected'
                    ? 'Voice call in progress'
                    : 'Connecting voice call...'}
                </p>
                <div className="mt-8 flex items-center justify-center gap-2 text-gray-400">
                  <span className="h-3 w-3 animate-pulse rounded-full bg-gray-400" />
                  <span className="h-3 w-3 animate-pulse rounded-full bg-gray-300" style={{ animationDelay: '0.15s' }} />
                  <span className="h-3 w-3 animate-pulse rounded-full bg-gray-200" style={{ animationDelay: '0.3s' }} />
                </div>
              </div>

              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="absolute h-px w-px opacity-0 pointer-events-none"
              />
            </div>
          )}

          {activeCall.callType === 'video' && localStream && (
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="absolute bottom-4 right-4 h-40 w-28 rounded-2xl border border-gray-200 object-cover shadow-2xl sm:h-48 sm:w-36"
            />
          )}

          {activeCall.callType === 'audio' && (
            <>
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="absolute h-px w-px opacity-0 pointer-events-none"
              />
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="absolute h-px w-px opacity-0 pointer-events-none"
              />
            </>
          )}
        </div>

        {callError && (
          <div className="border-t border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {callError}
          </div>
        )}
      </div>
    </div>
  ) : null;

  if (!currentUser) return null;

  return (
    <>
      {callPanel}
      <div className="flex h-[calc(100vh-4rem)] bg-white border border-gray-200 rounded-lg overflow-hidden animate-fade-in">
        {/* Conversations sidebar */}
        <div className={`${showMobileMenu ? 'block' : 'hidden'} md:block w-full md:w-1/3 lg:w-1/4 border-r border-gray-200 flex flex-col`}>
          <ChatUserList conversations={conversations} />
        </div>

        {/* Main chat area */}
        <div className="flex-1 flex flex-col bg-white">
          {loadingChatPartner ? (
            <div className="h-full flex flex-col items-center justify-center p-4 bg-gray-50">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mb-4"></div>
              <p className="text-gray-600">Loading chat...</p>
            </div>
          ) : chatPartner ? (
            <>
              <div className="border-b border-gray-200 p-4 flex justify-between items-center bg-white">
                <div className="flex items-center flex-1">
                  <button
                    onClick={handleBackToList}
                    className="md:hidden mr-3 p-1 hover:bg-gray-100 rounded-full"
                    aria-label="Back to list"
                  >
                    <ArrowLeft size={20} className="text-gray-600" />
                  </button>

                  <Avatar
                    src={chatPartner.avatarUrl}
                    alt={chatPartner.name}
                    size="md"
                    status={chatPartner.isOnline ? 'online' : 'offline'}
                    className="mr-3"
                  />

                  <div className="flex-1">
                    <h2 className="text-lg font-medium text-gray-900">{chatPartner.name}</h2>
                    <div className="flex items-center space-x-2">
                      <p className={`text-sm ${chatPartner.isOnline ? 'text-green-600' : 'text-gray-500'}`}>
                        {chatPartner.isOnline ? '● Online' : '● Offline'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex space-x-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-full p-2 hover:bg-gray-100"
                    aria-label="Voice call"
                    onClick={() => handleStartCall('audio')}
                    disabled={isStartingCall || !chatPartner.isOnline || Boolean(activeCall) || Boolean(incomingCall)}
                    title={chatPartner.isOnline ? 'Start a voice call' : 'User is offline'}
                  >
                    {isStartingCall ? <Loader2 size={18} className="animate-spin text-gray-600" /> : <Phone size={18} className="text-gray-600" />}
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-full p-2 hover:bg-gray-100"
                    aria-label="Video call"
                    onClick={() => handleStartCall('video')}
                    disabled={isStartingCall || !chatPartner.isOnline || Boolean(activeCall) || Boolean(incomingCall)}
                    title={chatPartner.isOnline ? 'Start a video call' : 'User is offline'}
                  >
                    {isStartingCall ? <Loader2 size={18} className="animate-spin text-gray-600" /> : <Video size={18} className="text-gray-600" />}
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-full p-2 hover:bg-gray-100"
                    aria-label="More options"
                  >
                    <MoreVertical size={18} className="text-gray-600" />
                  </Button>
                </div>
              </div>

              {callError && !callPanel && (
                <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-3">
                  <div className="flex items-center gap-2 text-red-700">
                    <AlertCircle size={16} />
                    <p className="text-sm">{callError}</p>
                  </div>
                </div>
              )}

              {/* Messages container */}
              <div className="flex-1 p-4 overflow-y-auto bg-gray-50 space-y-4">
                {isLoadingMessages ? (
                  <div className="h-full flex flex-col items-center justify-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mb-4"></div>
                    <p className="text-sm text-gray-500">Loading messages...</p>
                  </div>
                ) : messages.length > 0 ? (
                  <>
                    {messages.map(message => (
                      <ChatMessage
                        key={message.id}
                        message={message}
                        isCurrentUser={String(message.senderId) === String(currentUser.id)}
                        onStartAudioCall={() => handleStartCall('audio', message.senderId)}
                        onStartVideoCall={() => handleStartCall('video', message.senderId)}
                      />
                    ))}
                    {typingUsers.has(userId || '') && (
                      <div className="flex items-center space-x-2 text-gray-500 animate-pulse">
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        </div>
                        <span className="text-xs">{chatPartner.name} is typing...</span>
                      </div>
                    )}
                    {sendingMessage && (
                      <div className="flex items-center space-x-2 text-gray-500">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
                        <span className="text-xs">Sending...</span>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center">
                    <div className="bg-white p-4 rounded-full mb-4 border-2 border-gray-200">
                      <MessageCircle size={32} className="text-gray-400" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-700">No messages yet</h3>
                    <p className="text-gray-500 mt-1 text-center">
                      Send a message to start the conversation with {chatPartner.name}
                    </p>
                  </div>
                )}
              </div>

              {/* Message input */}
              <div className="border-t border-gray-200 p-4 bg-white">
                {!isConnected && (
                  <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center space-x-2">
                    <AlertCircle size={16} className="text-yellow-600" />
                    <p className="text-xs text-yellow-700">Connecting to server...</p>
                  </div>
                )}
                <form onSubmit={handleSendMessage} className="flex space-x-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="rounded-full p-2 hover:bg-gray-100"
                    aria-label="Add emoji"
                    title="Coming soon"
                  >
                    <Smile size={20} className="text-gray-600" />
                  </Button>

                  <Input
                    type="text"
                    placeholder={isConnected ? 'Type a message...' : 'Connecting...'}
                    value={newMessage}
                    onChange={handleTyping}
                    fullWidth
                    className="flex-1"
                    disabled={!isConnected || sendingMessage}
                  />

                  <Button
                    type="submit"
                    size="sm"
                    disabled={!newMessage.trim() || !isConnected || sendingMessage}
                    className="rounded-full p-2 w-10 h-10 flex items-center justify-center"
                    aria-label="Send message"
                    title={!isConnected ? 'Waiting for connection...' : 'Send message'}
                  >
                    {sendingMessage ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    ) : (
                      <Send size={18} />
                    )}
                  </Button>
                </form>
              </div>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-4 bg-gray-50">
              <div className="bg-white p-6 rounded-full mb-4 border-2 border-gray-200">
                <MessageCircle size={48} className="text-gray-400" />
              </div>
              <h2 className="text-xl font-medium text-gray-700">Select a conversation</h2>
              <p className="text-gray-500 mt-2 text-center max-w-xs">
                Choose a contact from the list to start chatting or find new investors to connect with
              </p>
              <Link to="/investors" className="mt-4">
                <Button variant="primary">Find Investors</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
