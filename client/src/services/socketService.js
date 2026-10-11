import { io } from 'socket.io-client';
import { webRtcService } from './webRtcService.js';
import { spatialAudioMixer } from './spatialAudioMixer.js';

/**
 * Socket.IO Client Service for ProxiSpeak
 * Coordinates real-time office room events and bridges WebRTC signaling.
 */
export class SocketService {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.eventListeners = new Map();
  }

  connect(url = import.meta.env.VITE_API_URL || window.location.origin) {
    if (this.socket && this.connected) {
      return this.socket;
    }

    this.socket = io(url, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });

    this.socket.on('connect', () => {
      // console.log(`[SocketService] Connected with socket ID: ${this.socket.id}`);
      this.connected = true;
      this.emitInternal('connection:change', { connected: true, socketId: this.socket.id });
    });

    this.socket.on('disconnect', (reason) => {
      // console.log(`[SocketService] Disconnected: ${reason}`);
      this.connected = false;
      this.emitInternal('connection:change', { connected: false, reason });
    });

    this.socket.on('connect_error', (err) => {
      console.warn(`[SocketService] Connection error:`, err.message);
      this.emitInternal('connection:error', err);
    });

    // Office events
    this.socket.on('office:state', (data) => {
      if (data.iceServers) {
        webRtcService.setIceServers(data.iceServers);
      }
      if (data.hearingRadius) {
        spatialAudioMixer.setHearingRadius(data.hearingRadius);
      }
      this.emitInternal('office:state', data);
    });

    this.socket.on('user:joined', (user) => {
      this.emitInternal('user:joined', user);
    });

    this.socket.on('user:moved', (data) => {
      this.emitInternal('user:moved', data);
    });

    this.socket.on('user:left', (data) => {
      webRtcService.closePeer(data.userId);
      this.emitInternal('user:left', data);
    });

    this.socket.on('audio:state-changed', (data) => {
      spatialAudioMixer.setPeerMuteState(data.userId, data.micMuted);
      this.emitInternal('audio:state-changed', data);
    });

    // Proximity triggers
    this.socket.on('proximity:entered', (data) => {
      const { peerId, shouldInitiateOffer, isObstructed } = data;
      // console.log(`[Proximity] Entered earshot of peer: ${peerId}, initiateOffer: ${shouldInitiateOffer}`);
      this.emitInternal('proximity:entered', data);

      if (shouldInitiateOffer) {
        webRtcService.initiateOffer(peerId, this.socket);
      }
    });

    this.socket.on('proximity:left', (data) => {
      const { peerId } = data;
      // console.log(`[Proximity] Left earshot of peer: ${peerId}`);
      webRtcService.closePeer(peerId);
      this.emitInternal('proximity:left', data);
    });

    // WebRTC Signaling
    this.socket.on('rtc:offer', async (data) => {
      const { senderPeerId, sdp } = data;
      await webRtcService.handleOffer(senderPeerId, sdp, this.socket);
    });

    this.socket.on('rtc:answer', async (data) => {
      const { senderPeerId, sdp } = data;
      await webRtcService.handleAnswer(senderPeerId, sdp);
    });

    this.socket.on('rtc:ice-candidate', async (data) => {
      const { senderPeerId, candidate } = data;
      await webRtcService.handleIceCandidate(senderPeerId, candidate);
    });

    this.socket.on('server:error', (error) => {
      console.error('[SocketService] Server error:', error);
      this.emitInternal('server:error', error);
    });

    return this.socket;
  }

  joinOffice(payload) {
    if (this.socket) {
      this.socket.emit('office:join', payload);
    }
  }

  leaveOffice() {
    if (this.socket) {
      this.socket.emit('office:leave');
    }
  }

  sendMove(officeId, x, y) {
    if (this.socket && this.connected) {
      this.socket.emit('user:move', { officeId, x, y });
    }
  }

  sendAudioState(officeId, micMuted) {
    if (this.socket && this.connected) {
      this.socket.emit('audio:state', { officeId, micMuted });
    }
  }

  // Event dispatcher for UI components
  on(event, handler) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).delete(handler);
    }
  }

  emitInternal(event, data) {
    if (this.eventListeners.has(event)) {
      for (const handler of this.eventListeners.get(event)) {
        handler(data);
      }
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
    this.eventListeners.clear();
  }
}

export const socketService = new SocketService();
