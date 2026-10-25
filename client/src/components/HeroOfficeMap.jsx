import React, { useState } from 'react';
import { Volume2, VolumeX, Radio, Users, Sparkles } from 'lucide-react';

export function HeroOfficeMap() {
  const [activeAvatar, setActiveAvatar] = useState('elena');

  // Interactive avatar definitions
  const avatars = [
    {
      id: 'local',
      name: 'Alex (You)',
      role: 'Frontend Lead',
      x: 38,
      y: 45,
      color: '#6366f1',
      initials: 'AL',
      isSelf: true
    },
    {
      id: 'elena',
      name: 'Elena Rostova',
      role: 'Audio Systems',
      x: 52,
      y: 48,
      color: '#06b6d4',
      initials: 'ER',
      inRange: true,
      distance: 54,
      volume: 92
    },
    {
      id: 'marcus',
      name: 'Marcus Vance',
      role: 'Product Designer',
      x: 22,
      y: 75,
      color: '#f59e0b',
      initials: 'MV',
      inRange: false,
      distance: 142,
      volume: 0
    },
    {
      id: 'sophia',
      name: 'Sophia Wu',
      role: 'Staff Architect',
      x: 82,
      y: 30,
      color: '#10b981',
      initials: 'SW',
      inRange: false,
      distance: 178,
      volume: 0
    }
  ];

  const selectedTarget = avatars.find(a => a.id === activeAvatar) || avatars[1];

  return (
    <div className="hp-hero-visual-card" aria-label="Interactive Virtual Office Blueprint">
      {/* Visual Window Header */}
      <div className="hp-visual-header">
        <div className="hp-visual-status-pill">
          <span className="hp-pulse-dot" />
          <span>ProxiSpeak Headquarters • Live Simulation</span>
        </div>
        <div className="hp-visual-badge-tech">
          <span>WebRTC Spatial Panning</span>
        </div>
      </div>

      {/* Blueprint Visual Map Canvas */}
      <div className="hp-blueprint-stage">
        {/* Office Zones */}
        <div
          className="hp-office-zone"
          style={{ top: '15%', left: '10%', width: '38%', height: '45%' }}
        >
          <span className="hp-zone-label">Engineering Hub</span>
        </div>

        <div
          className="hp-office-zone"
          style={{ top: '15%', right: '10%', width: '35%', height: '40%' }}
        >
          <span className="hp-zone-label">Meeting Room Alpha</span>
        </div>

        <div
          className="hp-office-zone"
          style={{ bottom: '10%', left: '10%', width: '30%', height: '28%' }}
        >
          <span className="hp-zone-label">Open Lounge</span>
        </div>

        {/* Furniture Desks */}
        <div
          className="hp-furniture-desk"
          style={{ top: '35%', left: '18%', width: '45px', height: '22px' }}
        />
        <div
          className="hp-furniture-desk"
          style={{ top: '35%', left: '32%', width: '45px', height: '22px' }}
        />
        <div
          className="hp-furniture-desk"
          style={{ top: '25%', right: '18%', width: '60px', height: '30px', borderRadius: '12px' }}
        />

        {/* Local User Hearing Radius */}
        <div
          className="hp-proximity-field"
          style={{
            top: '45%',
            left: '38%',
            width: '210px',
            height: '210px'
          }}
          title="120px Geospatial Hearing Radius"
        />

        {/* Connection Arc & Audio Waves between You and Elena */}
        <svg
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: 8
          }}
        >
          {/* Proximity line to Elena */}
          <line
            x1="38%"
            y1="45%"
            x2="52%"
            y2="48%"
            stroke="url(#hpConnGradient)"
            strokeWidth="2.5"
            strokeDasharray="4 4"
            opacity="0.8"
          />
          <defs>
            <linearGradient id="hpConnGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>
          </defs>
        </svg>

        {/* Live Audio Wave Badge over active peer connection */}
        <div
          className="hp-audio-wave-box"
          style={{
            top: '41%',
            left: '42%'
          }}
          title="Spatial audio stream active: Volume 92%"
        >
          <div className="hp-wave-bar" />
          <div className="hp-wave-bar" />
          <div className="hp-wave-bar" />
          <div className="hp-wave-bar" />
          <div className="hp-wave-bar" />
        </div>

        {/* Avatars */}
        {avatars.map(avatar => {
          const isSelected = activeAvatar === avatar.id;
          return (
            <div
              key={avatar.id}
              className={`hp-avatar-node ${isSelected ? 'active-target' : ''}`}
              style={{
                top: `${avatar.y}%`,
                left: `${avatar.x}%`
              }}
              onClick={() => !avatar.isSelf && setActiveAvatar(avatar.id)}
              title={`${avatar.name} (${avatar.role}) - ${avatar.isSelf ? 'You' : avatar.inRange ? 'In Proximity' : 'Out of Range'}`}
            >
              <div
                className="hp-avatar-circle"
                style={{
                  backgroundColor: avatar.color,
                  boxShadow: isSelected
                    ? `0 0 16px ${avatar.color}`
                    : '0 4px 12px rgba(0, 0, 0, 0.4)'
                }}
              >
                {avatar.initials}
              </div>
              <div className="hp-avatar-tag">
                {avatar.name.split(' ')[0]}
              </div>
            </div>
          );
        })}
      </div>

      {/* Live Telemetry Info Bar */}
      <div className="hp-visual-footer-bar">
        <div className="hp-visual-footer-tag">
          <Users size={14} color="#818cf8" />
          <span>Target: <strong>{selectedTarget.name}</strong></span>
        </div>

        <div className="hp-visual-footer-tag">
          {selectedTarget.inRange ? (
            <>
              <Volume2 size={14} color="#10b981" />
              <span style={{ color: '#34d399' }}>
                Distance: {selectedTarget.distance}px • Volume {selectedTarget.volume}%
              </span>
            </>
          ) : (
            <>
              <VolumeX size={14} color="#64748b" />
              <span style={{ color: '#94a3b8' }}>
                Distance: {selectedTarget.distance}px • Out of Range
              </span>
            </>
          )}
        </div>

        <div className="hp-visual-footer-tag" style={{ display: 'none' }}>
          <Radio size={14} color="#06b6d4" />
          <span>WebRTC P2P</span>
        </div>
      </div>
    </div>
  );
}
