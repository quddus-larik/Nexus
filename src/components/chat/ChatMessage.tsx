import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Message } from '../../types';
import { Avatar } from '../ui/Avatar';
import { useAuth } from '../../context/AuthContext';

interface ChatMessageProps {
  message: Message;
  isCurrentUser: boolean;
  status?: 'sending' | 'sent' | 'read' | 'failed';
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, isCurrentUser, status }) => {
  const { user: currentUser } = useAuth();
  const displayName = isCurrentUser
    ? currentUser?.name || 'You'
    : message.senderName || 'User';
  const avatarUrl = isCurrentUser
    ? currentUser?.avatarUrl || ''
    : message.senderAvatar || '';
  const messageTime = message.timestamp ? new Date(message.timestamp) : null;
  const hasValidMessageTime = messageTime !== null && !Number.isNaN(messageTime.getTime());

  const deliveryStatusLabel = (() => {
    if (!isCurrentUser || !status) return null;
    if (status === 'sending') return 'Sending...';
    if (status === 'sent') return 'Sent';
    if (status === 'read') return 'Seen';
    if (status === 'failed') return 'Failed to send';
    return null;
  })();

  return (
    <div
      className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'} mb-4 animate-fade-in`}
    >
      {!isCurrentUser && (
        <Avatar
          src={avatarUrl}
          alt={displayName}
          size="sm"
          className="mr-2 self-end"
        />
      )}
      
      <div className={`flex flex-col ${isCurrentUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`max-w-xs sm:max-w-md px-4 py-2 rounded-lg break-words ${
            isCurrentUser
              ? 'bg-primary-600 text-white rounded-br-none'
              : 'bg-gray-100 text-gray-800 rounded-bl-none'
          }`}
        >
          <p className="text-sm">{message.content}</p>
        </div>
        
        <div className="mt-1 flex items-center space-x-2">
          {hasValidMessageTime && (
            <span className="text-xs text-gray-500">
              {formatDistanceToNow(messageTime, { addSuffix: true })}
            </span>
          )}
          {deliveryStatusLabel && (
            <span
              className={`text-xs ${
                status === 'failed'
                  ? 'text-red-500'
                  : status === 'read'
                    ? 'text-green-600'
                    : 'text-gray-400'
              }`}
            >
              {deliveryStatusLabel}
            </span>
          )}
        </div>
      </div>
      
      {isCurrentUser && (
        <Avatar
          src={avatarUrl}
          alt={displayName}
          size="sm"
          className="ml-2 self-end"
        />
      )}
    </div>
  );
};
