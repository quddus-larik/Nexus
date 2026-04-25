import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Send, Phone, Video, Smile, ArrowLeft, MoreVertical, AlertCircle, Mic, MicOff, VideoOff, PhoneOff } from 'lucide-react';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ChatMessage } from '../../components/chat/ChatMessage';
import { ChatUserList } from '../../components/chat/ChatUserList';
import { useAuth } from '../../context/AuthContext';
import { Message } from '../../types';
import socketService from '../../services/socketService';
import { MessageCircle } from 'lucide-react';

type MessageStatus = 'sending' | 'sent' | 'read' | 'failed';
type ChatMessageItem = Message & { clientId?: string; status?: MessageStatus };
type CallStatus = 'idle' | 'calling' | 'ringing' | 'in-call';
type IncomingCall = {
  fromUserId: string;
  fromName?: string;
  offer: RTCSessionDescriptionInit;
};

export const ChatPage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const { user: currentUser } = useAuth();
  const currentUserId = (currentUser as any)?.id?.toString?.() || (currentUser as any)?._id?.toString?.() || '';
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [conversations, setConversations] = useState<any[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(true);
  const [chatPartner, setChatPartner] = useState<any>(null);
  const [loadingChatPartner, setLoadingChatPartner] = useState(false);
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [callError, setCallError] = useState('');
  const messagesEndRef = useRef<null | HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const activeCallUserIdRef = useRef<string | null>(null);
  const callStatusRef = useRef<CallStatus>('idle');

  const toFormattedMessage = (message: any, status?: MessageStatus): ChatMessageItem => ({
    id: message.id?.toString(),
    senderId: message.senderId?.toString(),
    receiverId: message.receiverId?.toString(),
    content: message.content,
    timestamp: message.timestamp,
    isRead: Boolean(message.isRead),
    senderName: message.senderName,
    senderAvatar: message.senderAvatar,
    receiverName: message.receiverName,
    receiverAvatar: message.receiverAvatar,
    clientId: message.clientId?.toString(),
    status
  });

  const upsertConversation = (conversationList: any[], message: any) => {
    if (!currentUser) return conversationList;

    const updated = [...conversationList];
    const index = updated.findIndex(
      c => (c.senderId === message.senderId && c.receiverId === message.receiverId) ||
           (c.receiverId === message.senderId && c.senderId === message.receiverId)
    );

    if (index >= 0) {
      updated[index] = message;
      const [item] = updated.splice(index, 1);
      updated.unshift(item);
    } else {
      updated.unshift(message);
    }

    return updated;
  };

  const isMessageForCurrentChat = (message: any) => {
    const senderId = message?.senderId?.toString?.();
    const receiverId = message?.receiverId?.toString?.();
    const selectedUserId = userId?.toString?.();
    if (!selectedUserId || !senderId || !receiverId) return false;

    if (!currentUserId) {
      return senderId === selectedUserId || receiverId === selectedUserId;
    }

    return (
      (senderId === selectedUserId && receiverId === currentUserId) ||
      (senderId === currentUserId && receiverId === selectedUserId)
    );
  };

  const stopLocalTracks = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
  };

  const cleanupCall = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.onconnectionstatechange = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    stopLocalTracks();

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    remoteStreamRef.current = null;
    activeCallUserIdRef.current = null;
    setCallStatus('idle');
    setIncomingCall(null);
    setCallError('');
    setIsMicMuted(false);
    setIsCameraOff(false);
  };

  const ensureLocalMedia = async () => {
    if (localStreamRef.current) return localStreamRef.current;

    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    localStreamRef.current = stream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }
    return stream;
  };

  const createPeerConnection = (targetUserId: string) => {
    if (peerConnectionRef.current) return peerConnectionRef.current;

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketService.sendIceCandidate(targetUserId, event.candidate.toJSON());
      }
    };

    pc.ontrack = (event) => {
      if (!remoteStreamRef.current) {
        remoteStreamRef.current = new MediaStream();
      }

      event.streams[0]?.getTracks().forEach(track => {
        remoteStreamRef.current?.addTrack(track);
      });

      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStreamRef.current;
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'failed' || state === 'disconnected' || state === 'closed') {
        cleanupCall();
      }
    };

    peerConnectionRef.current = pc;
    activeCallUserIdRef.current = targetUserId;
    return pc;
  };

  const startVideoCall = async () => {
    if (!userId || !currentUserId || userId === currentUserId) return;

    try {
      setCallError('');
      setCallStatus('calling');
      const stream = await ensureLocalMedia();
      const pc = createPeerConnection(userId);

      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketService.sendCallOffer(userId, offer, 'video');
    } catch (error) {
      console.error('Start video call error:', error);
      setCallError('Unable to start camera/microphone.');
      cleanupCall();
    }
  };

  const acceptIncomingCall = async () => {
    if (!incomingCall) return;

    try {
      setCallError('');
      const stream = await ensureLocalMedia();
      const pc = createPeerConnection(incomingCall.fromUserId);

      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socketService.sendCallAnswer(incomingCall.fromUserId, answer);
      setCallStatus('in-call');
      setIncomingCall(null);
    } catch (error) {
      console.error('Accept call error:', error);
      setCallError('Unable to accept call.');
      cleanupCall();
    }
  };

  const rejectIncomingCall = () => {
    if (!incomingCall) return;
    socketService.endCall(incomingCall.fromUserId, 'rejected');
    setIncomingCall(null);
    setCallStatus('idle');
  };

  const endCurrentCall = () => {
    const targetId = activeCallUserIdRef.current || userId || incomingCall?.fromUserId;
    if (targetId) {
      socketService.endCall(targetId, 'ended');
    }
    cleanupCall();
  };

  const toggleMic = () => {
    if (!localStreamRef.current) return;
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (!audioTrack) return;
    audioTrack.enabled = !audioTrack.enabled;
    setIsMicMuted(!audioTrack.enabled);
  };

  const toggleCamera = () => {
    if (!localStreamRef.current) return;
    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (!videoTrack) return;
    videoTrack.enabled = !videoTrack.enabled;
    setIsCameraOff(!videoTrack.enabled);
  };

  useEffect(() => {
    callStatusRef.current = callStatus;
  }, [callStatus]);

  // Fetch chat partner from API
  useEffect(() => {
    if (userId && currentUserId && userId === currentUserId) {
      navigate('/messages');
      return;
    }

    if (!userId) {
      setChatPartner(null);
      return;
    }

    const fetchChatPartner = async () => {
      try {
        setLoadingChatPartner(true);
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';
        
        // Try to fetch as entrepreneur first
        let response = await fetch(`${apiUrl}/entrepreneur/${userId}`);
        if (!response.ok) {
          // If not entrepreneur, try as investor
          response = await fetch(`${apiUrl}/investor/${userId}`);
        }
        
        if (response.ok) {
          const data = await response.json();
          setChatPartner({
            ...data,
            isOnline: true, // Will be updated by socket if available
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
  }, [userId, currentUserId, navigate]);

  // Initialize Socket Connection
  useEffect(() => {
    if (!currentUser) return;

    const token = localStorage.getItem('business_nexus_access_token');
    if (!token) return;

    socketService.connect(token);
    setIsConnected(socketService.isConnected());

    // Listen for connection events
    socketService.on('connect', () => {
      setIsConnected(true);
      console.log('Connected to socket server');
    });

    socketService.on('disconnect', () => {
      setIsConnected(false);
      console.log('Disconnected from socket server');
    });

    // Listen for messages
    socketService.on('message:received', (message: any) => {
      const senderId = message.senderId?.toString();
      const receiverId = message.receiverId?.toString();
      const isCurrentConversation = isMessageForCurrentChat(message);

      if (isCurrentConversation) {
        const formattedMessage = toFormattedMessage(
          message,
          message.isRead ? 'read' : (senderId === currentUserId ? 'sent' : undefined)
        );

        setMessages(prev => {
          if (prev.some(item => item.id === formattedMessage.id)) {
            return prev;
          }
          return [...prev, formattedMessage];
        });

        if (senderId === userId && receiverId === currentUserId && formattedMessage.id) {
          socketService.markAsRead(formattedMessage.id);
        }
      }

      setConversations(prev => upsertConversation(prev, message));
    });

    socketService.on('message:sent', (message: any) => {
      if (!isMessageForCurrentChat(message)) {
        setConversations(prev => upsertConversation(prev, message));
        return;
      }

      const formattedMessage = toFormattedMessage(message, message.isRead ? 'read' : 'sent');

      setMessages(prev => {
        const ackIndex = message.clientId
          ? prev.findIndex(item => item.clientId === message.clientId || item.id === message.clientId)
          : -1;

        if (ackIndex >= 0) {
          const updated = [...prev];
          updated[ackIndex] = formattedMessage;
          return updated;
        }

        if (prev.some(item => item.id === formattedMessage.id)) {
          return prev;
        }

        return [...prev, formattedMessage];
      });

      setConversations(prev => upsertConversation(prev, message));
    });

    socketService.on('messages:loaded', (msgs: any[]) => {
      setIsLoadingMessages(false);
      const formattedMessages: ChatMessageItem[] = msgs.map(msg => {
        const senderId = msg.senderId?.toString();
        const status: MessageStatus | undefined =
          senderId === currentUserId ? (msg.isRead ? 'read' : 'sent') : undefined;

        return toFormattedMessage(msg, status);
      });
      setMessages(formattedMessages);
    });

    socketService.on('conversations:loaded', (convs: any[]) => {
      setConversations(convs);
    });

    socketService.on('conversation:update', (message: any) => {
      setConversations(prev => upsertConversation(prev, message));
    });

    socketService.on('typing:indicator', (data: any) => {
      const typingUserId = data.userId?.toString();
      if (!typingUserId || typingUserId !== userId) return;

      if (data.isTyping) {
        setTypingUsers(prev => new Set([...prev, typingUserId]));
      } else {
        setTypingUsers(prev => {
          const updated = new Set(prev);
          updated.delete(typingUserId);
          return updated;
        });
      }
    });

    socketService.on('message:read:update', (data: any) => {
      const readIds = Array.isArray(data.messageIds) ? data.messageIds.map((id: any) => id?.toString()) : [];
      if (readIds.length === 0) return;

      setMessages(prev =>
        prev.map(msg =>
          readIds.includes(msg.id)
            ? { ...msg, isRead: true, status: 'read' }
            : msg
        )
      );
    });

    socketService.on('message:error', (data: any) => {
      console.error('Socket error:', data.error);
      setIsLoadingMessages(false);
      if (data?.clientId) {
        setMessages(prev =>
          prev.map(msg =>
            msg.clientId === data.clientId || msg.id === data.clientId
              ? { ...msg, status: 'failed' }
              : msg
          )
        );
      }
    });

    socketService.on('call:offer', async (data: any) => {
      const fromUserId = data?.fromUserId?.toString?.();
      const offer = data?.offer;
      if (!fromUserId || !offer) return;
      if (callStatusRef.current !== 'idle') {
        socketService.endCall(fromUserId, 'busy');
        return;
      }

      setIncomingCall({
        fromUserId,
        fromName: data?.fromName || 'User',
        offer
      });
      setCallStatus('ringing');
    });

    socketService.on('call:answer', async (data: any) => {
      try {
        const answer = data?.answer;
        if (!answer || !peerConnectionRef.current) return;
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        setCallStatus('in-call');
      } catch (error) {
        console.error('Call answer error:', error);
        setCallError('Call connection failed.');
        cleanupCall();
      }
    });

    socketService.on('call:ice-candidate', async (data: any) => {
      try {
        const candidate = data?.candidate;
        if (!candidate || !peerConnectionRef.current) return;
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error('ICE candidate error:', error);
      }
    });

    socketService.on('call:end', () => {
      cleanupCall();
    });

    return () => {
      socketService.off('message:received');
      socketService.off('message:sent');
      socketService.off('messages:loaded');
      socketService.off('conversations:loaded');
      socketService.off('conversation:update');
      socketService.off('typing:indicator');
      socketService.off('message:read:update');
      socketService.off('message:error');
      socketService.off('call:offer');
      socketService.off('call:answer');
      socketService.off('call:ice-candidate');
      socketService.off('call:end');
    };
  }, [currentUser, currentUserId, userId]);

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
      socketService.loadMessages(userId);
    }
  }, [isConnected, userId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => () => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    if (isTyping && userId) {
      socketService.typingStop(userId);
    }
  }, [isTyping, userId]);

  useEffect(() => {
    return () => {
      const targetId = activeCallUserIdRef.current;
      if (targetId) {
        socketService.endCall(targetId, 'left');
      }
      cleanupCall();
    };
  }, []);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();

    if (!newMessage.trim() || !currentUser || !currentUserId || !userId || !isConnected) return;
    if (userId === currentUserId) return;

    const trimmedMessage = newMessage.trim();
    const clientId = `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const optimisticMessage: ChatMessageItem = {
      id: clientId,
      clientId,
      senderId: currentUserId,
      receiverId: userId,
      content: trimmedMessage,
      timestamp: new Date().toISOString(),
      isRead: false,
      senderName: currentUser.name,
      senderAvatar: currentUser.avatarUrl,
      receiverName: chatPartner?.name,
      receiverAvatar: chatPartner?.avatarUrl,
      status: 'sending'
    };

    setMessages(prev => [...prev, optimisticMessage]);
    setConversations(prev => upsertConversation(prev, optimisticMessage));
    socketService.sendMessage(userId, trimmedMessage, clientId);
    setNewMessage('');
    if (isTyping) {
      socketService.typingStop(userId);
      setIsTyping(false);
    }
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNewMessage(value);

    // Send typing indicator
    if (value.trim().length > 0 && !isTyping && userId) {
      setIsTyping(true);
      socketService.typingStart(userId);
    }

    if (value.trim().length === 0 && isTyping && userId) {
      socketService.typingStop(userId);
      setIsTyping(false);
    }

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set new timeout to stop typing indicator
    typingTimeoutRef.current = setTimeout(() => {
      if (userId) {
        socketService.typingStop(userId);
        setIsTyping(false);
      }
    }, 2000);
  };

  const handleBackToList = () => {
    navigate('/messages');
  };

  if (!currentUser) return null;

  return (
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
                  title="Coming soon"
                  disabled
                >
                  <Phone size={18} className="text-gray-600" />
                </Button>
                
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full p-2 hover:bg-gray-100"
                  aria-label="Video call"
                  title="Start video call"
                  onClick={startVideoCall}
                  disabled={!isConnected || !userId || userId === currentUserId || callStatus !== 'idle'}
                >
                  <Video size={18} className="text-gray-600" />
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

            {(callStatus !== 'idle' || incomingCall || callError) && (
              <div className="m-4 rounded-2xl border border-gray-200 bg-white shadow-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Private Video Call</p>
                    <p className="text-xs text-gray-500">
                      {callStatus === 'calling' && `Calling ${chatPartner?.name || 'user'}...`}
                      {callStatus === 'ringing' && `${incomingCall?.fromName || 'User'} is calling you`}
                      {callStatus === 'in-call' && `Connected with ${chatPartner?.name || incomingCall?.fromName || 'user'}`}
                    </p>
                  </div>
                  {(callStatus === 'calling' || callStatus === 'in-call') && (
                    <button
                      onClick={endCurrentCall}
                      className="inline-flex items-center px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs hover:bg-red-700"
                    >
                      End
                    </button>
                  )}
                </div>

                {callError && (
                  <div className="px-4 py-2 bg-red-50 text-red-600 text-xs">{callError}</div>
                )}

                {callStatus === 'ringing' && incomingCall && (
                  <div className="px-4 py-4 flex items-center justify-between bg-gray-50">
                    <p className="text-sm text-gray-700">{incomingCall.fromName || 'User'} wants to start a video call.</p>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={rejectIncomingCall}
                        className="inline-flex items-center px-3 py-2 rounded-lg border border-gray-300 text-gray-700 text-xs hover:bg-gray-100"
                      >
                        Decline
                      </button>
                      <button
                        onClick={acceptIncomingCall}
                        className="inline-flex items-center px-3 py-2 rounded-lg bg-green-600 text-white text-xs hover:bg-green-700"
                      >
                        Accept
                      </button>
                    </div>
                  </div>
                )}

                {(callStatus === 'calling' || callStatus === 'in-call') && (
                  <div className="p-3 bg-white">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="rounded-xl bg-gray-100 border border-gray-200 overflow-hidden">
                        <p className="px-3 py-1.5 text-xs text-gray-600 bg-white border-b border-gray-200">You</p>
                        <video
                          ref={localVideoRef}
                          autoPlay
                          muted
                          playsInline
                          className="w-full h-44 object-cover bg-gray-200"
                        />
                      </div>
                      <div className="rounded-xl bg-gray-100 border border-gray-200 overflow-hidden">
                        <p className="px-3 py-1.5 text-xs text-gray-600 bg-white border-b border-gray-200">{chatPartner?.name || 'Remote user'}</p>
                        <video
                          ref={remoteVideoRef}
                          autoPlay
                          playsInline
                          className="w-full h-44 object-cover bg-gray-200"
                        />
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-center space-x-2">
                      <button
                        onClick={toggleMic}
                        className="inline-flex items-center px-3 py-2 rounded-lg border border-gray-300 text-gray-700 text-xs hover:bg-gray-100"
                      >
                        {isMicMuted ? <MicOff size={14} className="mr-1" /> : <Mic size={14} className="mr-1" />}
                        {isMicMuted ? 'Unmute' : 'Mute'}
                      </button>
                      <button
                        onClick={toggleCamera}
                        className="inline-flex items-center px-3 py-2 rounded-lg border border-gray-300 text-gray-700 text-xs hover:bg-gray-100"
                      >
                        {isCameraOff ? <VideoOff size={14} className="mr-1" /> : <Video size={14} className="mr-1" />}
                        {isCameraOff ? 'Camera On' : 'Camera Off'}
                      </button>
                      <button
                        onClick={endCurrentCall}
                        className="inline-flex items-center px-3 py-2 rounded-lg bg-red-600 text-white text-xs hover:bg-red-700"
                      >
                        <PhoneOff size={14} className="mr-1" />
                        Hang Up
                      </button>
                    </div>
                  </div>
                )}
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
                      isCurrentUser={message.senderId === currentUserId}
                      status={message.status}
                    />
                  ))}
                  {typingUsers.has(userId) && (
                    <div className="flex items-center space-x-2 text-gray-500 animate-pulse">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      </div>
                      <span className="text-xs">{chatPartner.name} is typing...</span>
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
                  <p className="text-gray-500 mt-1 text-center">Send a message to start the conversation with {chatPartner.name}</p>
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
                  placeholder={isConnected ? "Type a message..." : "Connecting..."}
                  value={newMessage}
                  onChange={handleTyping}
                  fullWidth
                  className="flex-1"
                  disabled={!isConnected}
                />
                
                <Button
                  type="submit"
                  size="sm"
                  disabled={!newMessage.trim() || !isConnected}
                  className="rounded-full p-2 w-10 h-10 flex items-center justify-center"
                  aria-label="Send message"
                  title={!isConnected ? "Waiting for connection..." : "Send message"}
                >
                  <Send size={18} />
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
  );
};
