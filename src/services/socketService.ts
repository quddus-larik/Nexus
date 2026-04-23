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

    this.socket.on('connect_error', (error: Error) => {
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

  emit(event: string, data?: unknown): void {
    if (!this.socket?.connected) {
      console.error('Socket not connected');
      return;
    }
    this.socket.emit(event, data);
  }

  sendMessage(receiverId: string, content: string): void {
    if (!this.socket?.connected) {
      console.error('Socket not connected');
      return;
    }
    this.socket.emit('message:send', { receiverId, content });
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

  startCall(data: {
    targetUserId: string;
    roomId: string;
    callType: 'audio' | 'video';
    offer: RTCSessionDescriptionInit;
  }): void {
    this.emit('call:initiate', data);
  }

  answerCall(data: {
    targetUserId: string;
    roomId: string;
    answer: RTCSessionDescriptionInit;
  }): void {
    this.emit('call:answer', data);
  }

  declineCall(data: {
    targetUserId: string;
    roomId: string;
    reason?: string;
  }): void {
    this.emit('call:decline', data);
  }

  sendIceCandidate(data: {
    targetUserId: string;
    roomId: string;
    candidate: RTCIceCandidateInit;
  }): void {
    this.emit('call:ice-candidate', data);
  }

  endCall(data: {
    targetUserId: string;
    roomId: string;
    reason?: string;
  }): void {
    this.emit('call:end', data);
  }

  on(event: string, callback: (data: unknown) => void): void {
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
