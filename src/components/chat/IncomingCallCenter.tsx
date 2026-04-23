import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Loader2,
  Mic,
  MicOff,
  Phone,
  PhoneIncoming,
  PhoneOff,
  PhoneOutgoing,
  Video,
  VideoOff
} from 'lucide-react';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { useAuth } from '../../context/AuthContext';
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

interface CallEndPayload {
  roomId: string;
  reason?: string;
}

const isChatRoute = (pathname: string) => pathname.startsWith('/chat');

export const IncomingCallCenter: React.FC = () => {
  const { user: currentUser } = useAuth();
  const location = useLocation();
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCallSession | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [isStartingCall, setIsStartingCall] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const incomingCallRef = useRef<IncomingCallData | null>(null);
  const activeCallRef = useRef<ActiveCallSession | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  const onChatRoute = isChatRoute(location.pathname);

  const cleanupPeerConnection = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.onconnectionstatechange = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
  }, []);

  const cleanupCall = useCallback((options: { notifyPeer?: boolean; reason?: string } = {}) => {
    const { notifyPeer = true, reason = 'ended' } = options;
    const session = activeCallRef.current;
    const incoming = incomingCallRef.current;

    if (notifyPeer && session) {
      socketService.endCall({
        targetUserId: session.peerId,
        roomId: session.roomId,
        reason
      });
    } else if (notifyPeer && incoming && !session) {
      socketService.declineCall({
        targetUserId: incoming.callerId,
        roomId: incoming.roomId,
        reason
      });
    }

    localStreamRef.current?.getTracks().forEach(track => track.stop());
    remoteStreamRef.current?.getTracks().forEach(track => track.stop());

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    cleanupPeerConnection();

    localStreamRef.current = null;
    remoteStreamRef.current = null;
    pendingIceCandidatesRef.current = [];
    incomingCallRef.current = null;
    activeCallRef.current = null;

    setIncomingCall(null);
    setActiveCall(null);
    setLocalStream(null);
    setRemoteStream(null);
    setIsMuted(false);
    setIsCameraEnabled(true);
    setIsStartingCall(false);
  }, [cleanupPeerConnection]);

  const flushPendingIceCandidates = useCallback(async () => {
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
  }, []);

  const createPeerConnection = useCallback(() => {
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
  }, [cleanupCall]);

  useEffect(() => {
    if (!currentUser || onChatRoute) {
      return;
    }

    const token = localStorage.getItem('business_nexus_access_token');
    if (!token) return;

    socketService.connect(token);

    const handleIncomingCall = (data: IncomingCallData) => {
      if (activeCallRef.current || incomingCallRef.current) {
        socketService.declineCall({
          targetUserId: data.callerId,
          roomId: data.roomId,
          reason: 'busy'
        });
        return;
      }

      incomingCallRef.current = data;
      setIncomingCall(data);
      setCallError(null);
    };

    const handleCallEnd = (data: CallEndPayload) => {
      const session = activeCallRef.current || incomingCallRef.current;
      if (!session || session.roomId !== data.roomId) return;

      if (data.reason === 'disconnect') {
        setCallError('The other user disconnected.');
      }

      cleanupCall({ notifyPeer: false, reason: data.reason || 'ended' });
    };

    const handleCallError = (data: { error: string }) => {
      setCallError(data.error);
      cleanupCall({ notifyPeer: false, reason: data.error || 'call_error' });
    };

    socketService.on('call:incoming', handleIncomingCall);
    socketService.on('call:end', handleCallEnd);
    socketService.on('call:error', handleCallError);

    return () => {
      socketService.off('call:incoming');
      socketService.off('call:end');
      socketService.off('call:error');
    };
  }, [cleanupCall, currentUser, onChatRoute]);

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
      if (!onChatRoute && incomingCallRef.current && !activeCallRef.current) {
        socketService.declineCall({
          targetUserId: incomingCallRef.current.callerId,
          roomId: incomingCallRef.current.roomId,
          reason: 'left_page'
        });
      }
      cleanupCall({ notifyPeer: Boolean(activeCallRef.current), reason: 'left_page' });
    };
  }, [cleanupCall, onChatRoute]);

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
    } catch (err) {
      console.error('Failed to accept incoming call:', err);
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

  const handleEndCall = () => {
    if (!activeCallRef.current) return;
    cleanupCall({ notifyPeer: true, reason: 'ended' });
  };

  if (!currentUser || onChatRoute) {
    return null;
  }

  return (
    <>
      {incomingCall && !activeCall && (
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
                  {incomingCall.callType === 'video'
                    ? 'Wants to start a video conversation.'
                    : 'Wants to start a voice conversation.'}
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
      )}

      {activeCall && (
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
                    <span className="inline-flex items-center gap-2">
                      {activeCall.direction === 'incoming' ? <PhoneIncoming size={12} /> : <PhoneOutgoing size={12} />}
                      {activeCall.direction === 'incoming' ? 'Incoming' : 'Outgoing'} {activeCall.callType} call
                    </span>
                  </p>
                  <h3 className="mt-1 text-xl font-semibold">{activeCall.peerName}</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {activeCall.status === 'connected'
                      ? 'Connected'
                      : activeCall.direction === 'incoming'
                        ? 'Connecting...'
                        : 'Calling...'}
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
                    <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm">
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
      )}
    </>
  );
};
