import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Send, Phone, Video, Info, Smile, ArrowLeft, MoreVertical, AlertCircle } from 'lucide-react';
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
  const messagesEndRef = useRef<null | HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    return () => {
      socketService.off('message:received');
      socketService.off('message:sent');
      socketService.off('messages:loaded');
      socketService.off('conversations:loaded');
      socketService.off('conversation:update');
      socketService.off('typing:indicator');
      socketService.off('message:read:update');
      socketService.off('message:error');
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
                >
                  <Phone size={18} className="text-gray-600" />
                </Button>
                
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full p-2 hover:bg-gray-100"
                  aria-label="Video call"
                  title="Coming soon"
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
