import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { useAuth } from '../../context/AuthContext';
import socketService from '../../services/socketService';

type ConversationId = string | { toString(): string } | null | undefined;

interface ChatConversationItem {
  senderId?: ConversationId;
  receiverId?: ConversationId;
  content?: string;
  createdAt?: string;
  timestamp?: string;
  isRead?: boolean;
  senderName?: string;
  senderAvatar?: string;
  receiverName?: string;
  receiverAvatar?: string;
}

interface OnlineUser {
  userId: string;
}

interface ChatUserListProps {
  conversations: ChatConversationItem[];
}

export const ChatUserList: React.FC<ChatUserListProps> = ({ conversations }) => {
  const navigate = useNavigate();
  const { userId: activeUserId } = useParams<{ userId: string }>();
  const { user: currentUser } = useAuth();
  const currentUserId = currentUser?.id;
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [userProfiles, setUserProfiles] = useState<Record<string, { id: string; name: string; avatarUrl: string }>>({});
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';

  useEffect(() => {
    socketService.on('users:online', (users: OnlineUser[]) => {
      const userIds = users.map(u => u.userId);
      setOnlineUsers(userIds);
    });

    return () => {
      socketService.off('users:online');
    };
  }, []);

  useEffect(() => {
    if (!currentUserId) return;

    const fetchProfile = async (id: string) => {
      try {
        let response = await fetch(`${apiUrl}/entrepreneur/${id}`);
        if (!response.ok) {
          response = await fetch(`${apiUrl}/investor/${id}`);
        }

        if (response.ok) {
          const profile = await response.json();
          setUserProfiles(prev => ({
            ...prev,
            [id]: {
              id,
              name: profile.name || 'User',
              avatarUrl: profile.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name || 'User')}&background=random`
            }
          }));
        }
      } catch (error) {
        console.error('Failed to load user profile:', error);
      }
    };

    const uniqueOtherUserIds = Array.from(
      new Set(
        conversations
          .map(conv => (conv.senderId?.toString() === currentUserId ? conv.receiverId?.toString() : conv.senderId?.toString()))
          .filter(Boolean)
      )
    ) as string[];

    uniqueOtherUserIds
      .filter(id => !userProfiles[id])
      .forEach(id => {
        void fetchProfile(id);
      });
  }, [conversations, currentUserId, apiUrl, userProfiles]);

  if (!currentUser) return null;

  const handleSelectUser = (userId: string) => {
    navigate(`/chat/${userId}`);
  };

  const getUniqueConversations = () => {
    const uniqueMap = new Map();
    conversations.forEach(conv => {
      const otherUserId = conv.senderId?.toString() === currentUserId 
        ? conv.receiverId?.toString() 
        : conv.senderId?.toString();
      
      if (otherUserId && !uniqueMap.has(otherUserId)) {
        uniqueMap.set(otherUserId, conv);
      }
    });
    return Array.from(uniqueMap.values());
  };

  return (
    <div className="bg-white border-r border-gray-200 w-full md:w-64 overflow-y-auto h-full">
      <div className="py-4">
        <h2 className="px-4 text-lg font-semibold text-gray-800 mb-4">Messages</h2>
        
        <div className="space-y-1">
          {getUniqueConversations().length > 0 ? (
            getUniqueConversations().map((conversation) => {
              const otherUserId = conversation.senderId?.toString() === currentUserId 
                ? conversation.receiverId?.toString() 
                : conversation.senderId?.toString();
              
              if (!otherUserId) return null;

              const profileFromConversation = conversation.senderId?.toString() === currentUserId
                ? {
                    name: conversation.receiverName,
                    avatarUrl: conversation.receiverAvatar
                  }
                : {
                    name: conversation.senderName,
                    avatarUrl: conversation.senderAvatar
                  };

              const otherUser = userProfiles[otherUserId] || {
                id: otherUserId,
                name: profileFromConversation?.name || 'User',
                avatarUrl: profileFromConversation?.avatarUrl || `https://ui-avatars.com/api/?name=User&background=random`
              };

              const isActive = activeUserId === otherUserId;
              const isOnline = onlineUsers.includes(otherUserId);
              const messageTime = conversation.createdAt || conversation.timestamp;

              return (
                <div
                  key={otherUserId}
                  className={`px-4 py-3 flex cursor-pointer transition-colors duration-200 ${
                    isActive
                      ? 'bg-gray-50 border-l-4 border-gray-300'
                      : 'hover:bg-gray-50 border-l-4 border-transparent'
                  }`}
                  onClick={() => handleSelectUser(otherUserId)}
                >
                  <Avatar
                    src={otherUser.avatarUrl}
                    alt={otherUser.name}
                    size="md"
                    status={isOnline ? 'online' : 'offline'}
                    className="mr-3 flex-shrink-0"
                  />
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline">
                      <h3 className="text-sm font-medium text-gray-900 truncate">
                        {otherUser.name}
                      </h3>
                      
                      {messageTime && (
                        <span className="text-xs text-gray-500">
                          {formatDistanceToNow(new Date(messageTime), { addSuffix: false })}
                        </span>
                      )}
                    </div>
                    
                    <div className="flex justify-between items-center mt-1">
                      {conversation.content && (
                        <p className="text-xs text-gray-600 truncate">
                          {conversation.senderId?.toString() === currentUserId ? 'You: ' : ''}
                          {conversation.content}
                        </p>
                      )}
                      
                      {conversation.isRead === false && conversation.senderId?.toString() !== currentUserId && (
                        <Badge variant="gray" size="sm" rounded>New</Badge>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-gray-500">No conversations yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
