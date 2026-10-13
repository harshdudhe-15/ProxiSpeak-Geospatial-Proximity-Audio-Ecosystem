import React, { useState, useEffect } from 'react';
import { Users, Volume2, MicOff, Signal, Radio } from 'lucide-react';
import { calculateDistance } from '../utils/geometry.js';
import { spatialAudioMixer } from '../services/spatialAudioMixer.js';
import { webRtcService } from '../services/webRtcService.js';

export function ParticipantRoster({
  currentUser,
  remoteUsers,
  hearingRadius,
  isOpen,
  onClose
}) {
  const [audioLevels, setAudioLevels] = useState({});
  const [localAudioLevel, setLocalAudioLevel] = useState(0);

  // Poll audio analyzer levels for talking visualizer animation
  useEffect(() => {
    const interval = setInterval(() => {
      const levels = {};
      remoteUsers.forEach(u => {
        levels[u.userId] = spatialAudioMixer.getPeerAudioLevel(u.userId);
      });
      setAudioLevels(levels);

      if (webRtcService.getLocalAudioLevel) {
        setLocalAudioLevel(webRtcService.getLocalAudioLevel());
      }
    }, 100);

    return () => clearInterval(interval);
  }, [remoteUsers]);

  if (!isOpen) return null;

  const localPos = { x: currentUser?.x || 150, y: currentUser?.y || 150 };

  return (
    <aside className="participant-roster" aria-label="Participant Roster">
      <div className="roster-header">
        <h3 className="roster-title">
          <Users size={18} color="#6366f1" />
          <span>Office Colleagues</span>
        </h3>
        <span className="roster-count">{remoteUsers.length + 1} Total</span>
      </div>

      <div className="roster-list">
        {/* Local User */}
        {currentUser && (
          <div className="roster-item in-proximity">
            <div className="roster-user-info">
              <div
                className="avatar-disc"
                style={{ backgroundColor: currentUser.avatarColor || '#6366f1' }}
              >
                {currentUser.displayName ? currentUser.displayName[0].toUpperCase() : 'U'}
              </div>
              <div className="roster-name-group">
                <span className="roster-user-name">
                  {currentUser.displayName} <span style={{ color: '#38bdf8', fontSize: '11px' }}>(You)</span>
                </span>
                <span className="roster-proximity-tag active">
                  <Radio size={10} /> Local Avatar
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {currentUser.micMuted ? (
                <MicOff size={16} color="#f43f5e" title="You are muted" />
              ) : (
                <div className="audio-level-bars" title={`Your voice amplitude: ${localAudioLevel}%`}>
                  <div className="audio-bar" style={{ height: `${Math.max(4, localAudioLevel * 0.16)}px` }} />
                  <div className="audio-bar" style={{ height: `${Math.max(6, localAudioLevel * 0.22)}px` }} />
                  <div className="audio-bar" style={{ height: `${Math.max(4, localAudioLevel * 0.14)}px` }} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Remote Users */}
        {remoteUsers.length === 0 ? (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
            <p>You're the only one here right now.</p>
            <p style={{ marginTop: '6px', fontSize: '12px' }}>
              Open another browser window to join and test real-time spatial audio!
            </p>
          </div>
        ) : (
          remoteUsers.map(user => {
            const distance = Math.round(
              calculateDistance(localPos, { x: user.x, y: user.y })
            );
            const inRange = distance <= hearingRadius;
            const level = audioLevels[user.userId] || 0;

            let proximityLabel;
            const connState = webRtcService.getConnectionState(user.userId);
            const milestone = webRtcService.getPeerMilestone ? webRtcService.getPeerMilestone(user.userId) : 'idle';
            const lifecycle = webRtcService.getLifecycleState ? webRtcService.getLifecycleState(user.userId) : 'idle';
            const isAudible = spatialAudioMixer.isPeerAudible(user.userId);

            if (inRange) {
              if (isAudible || milestone === 'audio-audible') {
                proximityLabel = `${distance}px • Audio Live`;
              } else if (milestone === 'playback-ready') {
                proximityLabel = `${distance}px • Playback Enabled`;
              } else if (milestone === 'track-received') {
                proximityLabel = `${distance}px • Track Received`;
              } else if (connState === 'connected' || milestone === 'peer-connected') {
                proximityLabel = `${distance}px • Peer Connected`;
              } else if (connState === 'connecting' || lifecycle === 'connecting') {
                proximityLabel = `${distance}px • Connecting...`;
              } else if (connState === 'failed' || connState === 'disconnected') {
                proximityLabel = `${distance}px • Reconnecting...`;
              } else {
                proximityLabel = `${distance}px • In Earshot`;
              }
            } else {
              if (lifecycle === 'dormant') {
                proximityLabel = `${distance}px • Dormant (Cached)`;
              } else {
                proximityLabel = `${distance}px • Out of range`;
              }
            }

            return (
              <div
                key={user.userId}
                className={`roster-item ${inRange ? 'in-proximity' : ''}`}
              >
                <div className="roster-user-info">
                  <div
                    className="avatar-disc"
                    style={{ backgroundColor: user.avatarColor || '#6366f1' }}
                  >
                    {user.displayName ? user.displayName[0].toUpperCase() : 'U'}
                  </div>
                  <div className="roster-name-group">
                    <span className="roster-user-name">{user.displayName}</span>
                    <span className={`roster-proximity-tag ${inRange ? 'active' : ''}`}>
                      <Signal size={10} />
                      {proximityLabel}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {user.micMuted ? (
                    <MicOff size={16} color="#f43f5e" title="User is muted" />
                  ) : inRange ? (
                    <div className="audio-level-bars" title={`Voice amplitude: ${level}%`}>
                      <div className="audio-bar" style={{ height: `${Math.max(4, level * 0.16)}px` }} />
                      <div className="audio-bar" style={{ height: `${Math.max(6, level * 0.22)}px` }} />
                      <div className="audio-bar" style={{ height: `${Math.max(4, level * 0.14)}px` }} />
                    </div>
                  ) : (
                    <Volume2 size={16} color="#64748b" title="Out of hearing range" />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
