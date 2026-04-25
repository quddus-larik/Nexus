import io, { Socket } from 'socket.io-client';

class SocketService {
  private socket: Socket | null = null;
  private apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';

  connect(token: string): void {
    if (this.socket?.connected) return;

    this.socket = io(this.apiUrl, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5
    });

    this.socket.on('connect', () => {
      console.log('Socket connected successfully');
    });

    this.socket.on('connect_error', (error: any) => {
      console.error('Socket connection error:', error);
    });

    this.socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  sendMessage(receiverId: string, content: string, clientId?: string): void {
    if (!this.socket?.connected) {
      console.error('Socket not connected');
      return;
    }
    this.socket.emit('message:send', { receiverId, content, clientId });
  }

  loadMessages(otherUserId: string, limit: number = 50): void {
    if (!this.socket?.connected) {
      console.error('Socket not connected');
      return;
    }
    this.socket.emit('messages:load', { otherUserId, limit });
  }

  loadConversations(): void {
    if (!this.socket?.connected) {
      console.error('Socket not connected');
      return;
    }
    this.socket.emit('conversations:get', {});
  }

  markAsRead(messageId: string): void {
    if (!this.socket?.connected) return;
    this.socket.emit('message:read', { messageId });
  }

  typingStart(receiverId: string): void {
    if (!this.socket?.connected) return;
    this.socket.emit('typing:start', { receiverId });
  }

  typingStop(receiverId: string): void {
    if (!this.socket?.connected) return;
    this.socket.emit('typing:stop', { receiverId });
  }

  on(event: string, callback: (data: any) => void): void {
    if (!this.socket) return;
    this.socket.on(event, callback);
  }

  off(event: string): void {
    if (!this.socket) return;
    this.socket.off(event);
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

export default new SocketService();
