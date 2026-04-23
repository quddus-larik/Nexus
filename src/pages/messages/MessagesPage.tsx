import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ChatUserList } from '../../components/chat/ChatUserList';
import socketService from '../../services/socketService';

export const MessagesPage: React.FC = () => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<any[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!user) return;

    const token = localStorage.getItem('business_nexus_access_token');
    if (!token) return;

    socketService.connect(token);
    setIsConnected(socketService.isConnected());

    // Listen for connections
    socketService.on('connect', () => {
      setIsConnected(true);
      socketService.loadConversations();
    });

    socketService.on('disconnect', () => {
      setIsConnected(false);
    });

    // Load conversations
    socketService.on('conversations:loaded', (convs: any[]) => {
      setConversations(convs);
    });

    // Update conversations on new messages
    socketService.on('conversation:update', (message: any) => {
      setConversations(prev => {
        const updated = [...prev];
        const index = updated.findIndex(
          c => (c.senderId === message.senderId && c.receiverId === message.receiverId) ||
               (c.receiverId === message.senderId && c.senderId === message.receiverId)
        );
        if (index >= 0) {
          updated[index] = message;
        } else {
          updated.unshift(message);
        }
        return updated;
      });
    });

    // Initial load when socket is already connected
    if (socketService.isConnected()) {
      setIsConnected(true);
      socketService.loadConversations();
    }

    return () => {
      socketService.off('connect');
      socketService.off('disconnect');
      socketService.off('conversations:loaded');
      socketService.off('conversation:update');
    };
  }, [user]);

  if (!user) return null;

  return (
    <div className="h-[calc(100vh-8rem)] bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden animate-fade-in">
      {conversations.length > 0 ? (
        <ChatUserList conversations={conversations} />
      ) : (
        <div className="h-full flex flex-col items-center justify-center p-8">
          <div className="bg-gray-100 p-6 rounded-full mb-4">
            <div className="text-gray-400 text-4xl">💬</div>
          </div>
          <h2 className="text-xl font-medium text-gray-900">No messages yet</h2>
          <p className="text-gray-600 text-center mt-2">
            Start connecting with entrepreneurs and investors to begin conversations
          </p>
          {!isConnected && (
            <p className="text-xs text-orange-500 mt-4">Connecting to server...</p>
          )}
        </div>
      )}
    </div>
  );
};
