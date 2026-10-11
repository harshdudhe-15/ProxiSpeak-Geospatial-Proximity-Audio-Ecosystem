import React, { useState, useEffect, useCallback } from 'react';
import { HeaderBar } from './components/HeaderBar.jsx';
import { LobbyModal } from './components/LobbyModal.jsx';
import { CanvasOffice } from './components/CanvasOffice.jsx';
import { ControlDock } from './components/ControlDock.jsx';
import { ParticipantRoster } from './components/ParticipantRoster.jsx';
import { AudioStatusToast } from './components/AudioStatusToast.jsx';

import { socketService } from './services/socketService.js';
import { webRtcService } from './services/webRtcService.js';
import { spatialAudioMixer } from './services/spatialAudioMixer.js';
import { createSession } from './services/apiService.js';

export function App() {
  const [joined, setJoined] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentOffice, setCurrentOffice] = useState(null);
  const [remoteUsers, setRemoteUsers] = useState([]);
  const [isConnected, setIsConnected] = useState(false);

  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isMasterMuted, setIsMasterMuted] = useState(false);
  const [hearingRadius, setHearingRadius] = useState(120);
  const [isRosterOpen, setIsRosterOpen] = useState(true);
  const [statusToast, setStatusToast] = useState(null);

  // Setup WebRTC and Socket listeners
  useEffect(() => {
    const unsubRtc = webRtcService.onStateChange((state) => {
      setIsMicMuted(state.micMuted);
      if (state.micError) {
        setStatusToast({ message: state.micError, type: 'warning' });
      }
    });

    const unsubConn = socketService.on('connection:change', ({ connected }) => {
      setIsConnected(connected);
    });

    const unsubOfficeState = socketService.on('office:state', (data) => {
      setCurrentOffice(data.office);
      setCurrentUser(data.currentUser);
      // Filter out self from remote users list
      setRemoteUsers(data.users.filter(u => u.userId !== data.currentUser.userId));
      if (data.hearingRadius) {
        setHearingRadius(data.hearingRadius);
      }
      setIsJoining(false);
      setJoined(true);
    });

    const unsubUserJoined = socketService.on('user:joined', (user) => {
      setRemoteUsers(prev => {
        if (prev.some(u => u.userId === user.userId)) return prev;
        return [...prev, user];
      });
    });

    const unsubUserMoved = socketService.on('user:moved', ({ userId, x, y }) => {
      setRemoteUsers(prev =>
        prev.map(u => (u.userId === userId ? { ...u, x, y } : u))
      );
    });

    const unsubUserLeft = socketService.on('user:left', ({ userId }) => {
      setRemoteUsers(prev => prev.filter(u => u.userId !== userId));
    });

    const unsubAudioChanged = socketService.on('audio:state-changed', ({ userId, micMuted }) => {
      setRemoteUsers(prev =>
        prev.map(u => (u.userId === userId ? { ...u, micMuted } : u))
      );
    });

    const unsubError = socketService.on('server:error', (err) => {
      setStatusToast({ message: err.message || 'Server error occurred', type: 'error' });
      setIsJoining(false);
    });

    return () => {
      unsubRtc();
      unsubConn();
      unsubOfficeState();
      unsubUserJoined();
      unsubUserMoved();
      unsubUserLeft();
      unsubAudioChanged();
      unsubError();
    };
  }, []);

  // Join Office Action
  const handleJoinOffice = async ({ displayName, avatarColor, officeId }) => {
    setIsJoining(true);
    setStatusToast(null);

    try {
      // 1. Obtain server-controlled unique guest session identity
      const session = await createSession({
        displayName,
        avatarColor,
        avatarIcon: 'user'
      });

      // 2. Request microphone access (gracefully continues even if denied)
      await webRtcService.initLocalMicrophone();

      // 3. Ensure AudioContext is ready upon user interaction gesture
      await spatialAudioMixer.ensureAudioContext();

      // 4. Connect to Socket.IO signaling server
      socketService.connect();

      // 5. Join specified office room
      socketService.joinOffice({
        officeId,
        userId: session.userId,
        displayName: session.displayName,
        avatarColor: session.avatarColor,
        avatarIcon: session.avatarIcon,
        x: 140,
        y: 140
      });
    } catch (err) {
      console.error('Failed to join office:', err);
      setStatusToast({ message: err.message || 'Failed to join office', type: 'error' });
      setIsJoining(false);
    }
  };

  // Leave Office Action
  const handleLeaveOffice = () => {
    socketService.leaveOffice();
    webRtcService.destroy();
    setJoined(false);
    setCurrentUser(null);
    setCurrentOffice(null);
    setRemoteUsers([]);
  };

  // Microphone Mute Toggle
  const handleToggleMic = () => {
    const nextState = !isMicMuted;
    webRtcService.setMicMuted(nextState);
    if (currentOffice && currentUser) {
      socketService.sendAudioState(currentOffice._id || currentOffice.code, nextState);
    }
  };

  // Speaker Deafen Toggle
  const handleToggleMasterMute = () => {
    const nextMute = !isMasterMuted;
    setIsMasterMuted(nextMute);
    spatialAudioMixer.setMasterMute(nextMute);
  };

  // Hearing Radius Slider
  const handleChangeRadius = (radius) => {
    setHearingRadius(radius);
    spatialAudioMixer.setHearingRadius(radius);
  };

  // Local movement throttle broadcast
  const handleLocalMove = useCallback((x, y) => {
    setCurrentUser(prev => (prev ? { ...prev, x, y } : prev));
    if (currentOffice) {
      const officeId = currentOffice._id || currentOffice.code;
      socketService.sendMove(officeId, x, y);
    }
  }, [currentOffice]);

  return (
    <div className="app-container">
      {statusToast && (
        <AudioStatusToast
          message={statusToast.message}
          type={statusToast.type}
          onDismiss={() => setStatusToast(null)}
        />
      )}

      {!joined && (
        <LobbyModal
          onJoinOffice={handleJoinOffice}
          isJoining={isJoining}
          errorMessage={statusToast?.message}
        />
      )}

      {joined && (
        <>
          <HeaderBar
            officeName={currentOffice?.name}
            isConnected={isConnected}
            userCount={remoteUsers.length + 1}
            currentUser={currentUser}
            onToggleRoster={() => setIsRosterOpen(prev => !prev)}
            isRosterOpen={isRosterOpen}
          />

          <main className="main-content-layout">
            <CanvasOffice
              officeLayout={currentOffice}
              currentUser={currentUser}
              remoteUsers={remoteUsers}
              hearingRadius={hearingRadius}
              onLocalMove={handleLocalMove}
              isMicMuted={isMicMuted}
            />

            <ParticipantRoster
              currentUser={currentUser}
              remoteUsers={remoteUsers}
              hearingRadius={hearingRadius}
              isOpen={isRosterOpen}
              onClose={() => setIsRosterOpen(false)}
            />
          </main>

          <ControlDock
            isMicMuted={isMicMuted}
            onToggleMic={handleToggleMic}
            isMasterMuted={isMasterMuted}
            onToggleMasterMute={handleToggleMasterMute}
            hearingRadius={hearingRadius}
            onChangeRadius={handleChangeRadius}
            onLeaveOffice={handleLeaveOffice}
          />
        </>
      )}
    </div>
  );
}

export default App;
