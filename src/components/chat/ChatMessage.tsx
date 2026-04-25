import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Message } from '../../types';
import { Avatar } from '../ui/Avatar';
import { useAuth } from '../../context/AuthContext';
import { Phone, Video } from 'lucide-react';

interface ChatMessageProps {
  message: Message;
  isCurrentUser: boolean;
  onStartAudioCall?: (userId: string) => void;
  onStartVideoCall?: (userId: string) => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  isCurrentUser,
  onStartAudioCall,
  onStartVideoCall
}) => {
  const { user: currentUser } = useAuth();
  const displayName = isCurrentUser
    ? currentUser?.name || 'You'
    : message.senderName || 'User';
  const avatarUrl = isCurrentUser
    ? currentUser?.avatarUrl || ''
    : message.senderAvatar || '';

  return (
    <div className={`group flex ${isCurrentUser ? 'justify-end' : 'justify-start'} mb-4 animate-fade-in`}>
      {!isCurrentUser && (
        <Avatar
          src={avatarUrl}
          alt={displayName}
          size="sm"
          className="mr-2 self-end"
        />
      )}

      <div className={`relative flex flex-col ${isCurrentUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`max-w-xs sm:max-w-md px-4 py-2 rounded-lg break-words ${
            isCurrentUser
              ? 'bg-primary-600 text-white rounded-br-none'
              : 'bg-gray-100 text-gray-800 rounded-bl-none'
          }`}
        >
          <p className="text-sm">{message.content}</p>
        </div>

        {!isCurrentUser && (onStartAudioCall || onStartVideoCall) && (
          <div className="absolute -top-3 right-2 flex items-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            {onStartAudioCall && (
              <button
                type="button"
                onClick={() => onStartAudioCall(message.senderId)}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-sm hover:border-primary-200 hover:text-primary-600"
                aria-label={`Call ${displayName}`}
                title={`Call ${displayName}`}
              >
                <Phone size={12} />
              </button>
            )}
            {onStartVideoCall && (
              <button
                type="button"
                onClick={() => onStartVideoCall(message.senderId)}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-sm hover:border-primary-200 hover:text-primary-600"
                aria-label={`Video call ${displayName}`}
                title={`Video call ${displayName}`}
              >
                <Video size={12} />
              </button>
            )}
          </div>
        )}

        <span className="text-xs text-gray-500 mt-1">
          {formatDistanceToNow(new Date(message.timestamp), { addSuffix: true })}
        </span>
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
