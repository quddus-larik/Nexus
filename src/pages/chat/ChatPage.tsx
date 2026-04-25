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

export const ChatPage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [conversations, setConversations] = useState<any[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(true);
  const [chatPartner, setChatPartner] = useState<any>(null);
  const [loadingChatPartner, setLoadingChatPartner] = useState(false);
  const messagesEndRef = useRef<null | HTMLDivElement>(null);
  const typingTimeoutRef = useRef();

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
  }, [userId]);

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
      if (message.senderId === userId || message.receiverId === userId) {
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
    });

    socketService.on('message:sent', (message: any) => {
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
    });

    socketService.on('messages:loaded', (msgs: any[]) => {
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
    });

    socketService.on('conversations:loaded', (convs: any[]) => {
      setConversations(convs);
    });

    socketService.on('typing:indicator', (data: any) => {
      if (data.isTyping) {
        setTypingUsers(prev => new Set([...prev, data.userId]));
      } else {
        setTypingUsers(prev => {
          const updated = new Set(prev);
          updated.delete(data.userId);
          return updated;
        });
      }
    });

    socketService.on('message:error', (data: any) => {
      console.error('Socket error:', data.error);
      setSendingMessage(false);
    });

    return () => {
      socketService.off('message:received');
      socketService.off('message:sent');
      socketService.off('messages:loaded');
      socketService.off('conversations:loaded');
      socketService.off('typing:indicator');
      socketService.off('message:error');
    };
  }, [currentUser, userId]);

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

    // Send typing indicator
    if (!isTyping && userId) {
      setIsTyping(true);
      socketService.typingStart(userId);
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
                      isCurrentUser={message.senderId === currentUser.id}
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
                  disabled={!isConnected || sendingMessage}
                />
                
                <Button
                  type="submit"
                  size="sm"
                  disabled={!newMessage.trim() || !isConnected || sendingMessage}
                  className="rounded-full p-2 w-10 h-10 flex items-center justify-center"
                  aria-label="Send message"
                  title={!isConnected ? "Waiting for connection..." : "Send message"}
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
  );
};
