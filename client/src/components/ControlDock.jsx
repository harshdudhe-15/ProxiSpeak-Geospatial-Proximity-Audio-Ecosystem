import React from 'react';
import { Mic, MicOff, Volume2, VolumeX, LogOut, Sliders } from 'lucide-react';

export function ControlDock({
  isMicMuted,
  onToggleMic,
  isMasterMuted,
  onToggleMasterMute,
  hearingRadius,
  onChangeRadius,
  onLeaveOffice
}) {
  return (
    <nav className="control-dock" aria-label="Audio and Session Controls">
      {/* Microphone Mute / Unmute */}
      <button
        id="toggle-mic-button"
        className={`dock-btn ${isMicMuted ? 'muted' : 'primary'}`}
        onClick={onToggleMic}
        title={isMicMuted ? 'Unmute Microphone' : 'Mute Microphone'}
      >
        {isMicMuted ? <MicOff size={18} /> : <Mic size={18} />}
        <span>{isMicMuted ? 'Mic Muted' : 'Mic Active'}</span>
      </button>

      {/* Speaker / Master Mute Toggle */}
      <button
        id="toggle-deafen-button"
        className={`dock-btn ${isMasterMuted ? 'muted' : ''}`}
        onClick={onToggleMasterMute}
        title={isMasterMuted ? 'Unmute Incoming Audio' : 'Mute Incoming Audio (Deafen)'}
      >
        {isMasterMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        <span>{isMasterMuted ? 'Deafened' : 'Sound On'}</span>
      </button>

      <div className="dock-divider" />

      {/* Hearing Radius Controller */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 8px' }}>
        <Sliders size={16} color="#94a3b8" />
        <span style={{ fontSize: '12px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
          Radius: {hearingRadius}px
        </span>
        <input
          type="range"
          min="60"
          max="240"
          step="10"
          value={hearingRadius}
          onChange={(e) => onChangeRadius(Number(e.target.value))}
          style={{ width: '80px', cursor: 'pointer', accentColor: '#6366f1' }}
          title={`Adjust Hearing Radius (${hearingRadius}px)`}
        />
      </div>

      <div className="dock-divider" />

      {/* Leave Office Button */}
      <button
        id="leave-office-button"
        className="dock-btn danger"
        onClick={onLeaveOffice}
        title="Leave Virtual Office"
      >
        <LogOut size={16} />
        <span>Leave</span>
      </button>
    </nav>
  );
}
