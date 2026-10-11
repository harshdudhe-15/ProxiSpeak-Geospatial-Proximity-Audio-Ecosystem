import React from 'react';
import { Radio, Users, Wifi, WifiOff } from 'lucide-react';

export function HeaderBar({ officeName, isConnected, userCount, currentUser, onToggleRoster, isRosterOpen }) {
  return (
    <header className="header-bar" role="banner">
      <div className="brand-section">
        <div className="brand-logo-icon" aria-hidden="true">
          <Radio size={20} />
        </div>
        <div>
          <h1 className="brand-title">ProxiSpeak</h1>
        </div>
        <span className="brand-badge">Virtual Office</span>
      </div>

      <div className="header-meta">
        <div className="status-pill" title={isConnected ? 'Connected to Signaling Server' : 'Disconnected'}>
          <span className={`status-indicator-dot ${isConnected ? '' : 'disconnected'}`} />
          {isConnected ? (
            <>
              <Wifi size={14} />
              <span>{officeName || 'HQ Office'}</span>
            </>
          ) : (
            <>
              <WifiOff size={14} />
              <span>Reconnecting...</span>
            </>
          )}
        </div>

        <button
          className="dock-btn"
          style={{ padding: '6px 14px', fontSize: '13px' }}
          onClick={onToggleRoster}
          title="Toggle Participant Roster"
        >
          <Users size={16} />
          <span>{userCount} Online</span>
        </button>

        {currentUser && (
          <div className="header-user-tag" title={`Logged in as ${currentUser.displayName}`}>
            <div
              className="avatar-disc"
              style={{ backgroundColor: currentUser.avatarColor || '#6366f1' }}
            >
              {currentUser.displayName ? currentUser.displayName[0].toUpperCase() : 'U'}
            </div>
            <span>{currentUser.displayName}</span>
          </div>
        )}
      </div>
    </header>
  );
}
