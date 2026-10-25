import React, { useState } from 'react';
import { Mic, ArrowRight, ArrowLeft, Building, Check, Sparkles } from 'lucide-react';

const AVATAR_COLORS = [
  '#6366f1', // Indigo
  '#06b6d4', // Cyan
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#f43f5e', // Rose
  '#8b5cf6', // Violet
  '#ec4899', // Pink
];

export function LobbyModal({ onJoinOffice, isJoining, errorMessage, onBackToHome }) {
  const [displayName, setDisplayName] = useState(
    localStorage.getItem('proxispeak_display_name') || ''
  );
  const [selectedColor, setSelectedColor] = useState(
    localStorage.getItem('proxispeak_avatar_color') || AVATAR_COLORS[0]
  );
  const [formError, setFormError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError('');

    const trimmedName = displayName.trim();
    if (!trimmedName || trimmedName.length < 2) {
      setFormError('Please enter a display name (at least 2 characters)');
      return;
    }

    if (trimmedName.length > 32) {
      setFormError('Display name must not exceed 32 characters');
      return;
    }

    // Persist preferences in localStorage for seamless return
    localStorage.setItem('proxispeak_display_name', trimmedName);
    localStorage.setItem('proxispeak_avatar_color', selectedColor);

    onJoinOffice({
      displayName: trimmedName,
      avatarColor: selectedColor
    });
  };

  return (
    <div className="modal-backdrop">
      <div className="lobby-card">
        {onBackToHome && (
          <button
            type="button"
            onClick={onBackToHome}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              fontSize: '13px',
              cursor: 'pointer',
              padding: '2px 0 14px 0',
              fontWeight: 500,
              transition: 'color 150ms ease'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#ffffff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8'; }}
          >
            <ArrowLeft size={16} />
            <span>&larr; Back to Homepage</span>
          </button>
        )}
        <div className="lobby-header">
          <div className="lobby-brand-icon">
            <Mic size={28} color="white" />
          </div>
          <h2 className="lobby-title">Welcome to ProxiSpeak</h2>
          <p className="lobby-subtitle">
            Walk up to colleagues in the virtual office to speak. Natural spatial voice audio powered by WebRTC.
          </p>
        </div>

        {/* Canonical Office Destination Banner */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            marginBottom: '20px',
            background: 'rgba(99, 102, 241, 0.12)',
            border: '1px solid rgba(99, 102, 241, 0.28)',
            borderRadius: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(99, 102, 241, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Building size={18} color="#818cf8" />
            </div>
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#818cf8', fontWeight: 600 }}>
                Destination Office
              </div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>
                ProxiSpeak Headquarters
              </div>
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              color: '#34d399',
              background: 'rgba(16, 185, 129, 0.15)',
              padding: '4px 10px',
              borderRadius: '999px',
              fontWeight: 600
            }}
          >
            <Sparkles size={12} />
            <span>Shared HQ</span>
          </div>
        </div>

        {(formError || errorMessage) && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              background: 'rgba(244, 63, 94, 0.15)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              color: '#fca5a5',
              fontSize: '13px',
              marginBottom: '18px'
            }}
          >
            {formError || errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="user-display-name">
              Your Name / Handle
            </label>
            <input
              id="user-display-name"
              type="text"
              className="form-input"
              placeholder="e.g. Alex Chen"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoFocus
              maxLength={32}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Avatar Color Theme</label>
            <div className="color-picker-row">
              {AVATAR_COLORS.map(color => (
                <button
                  key={color}
                  type="button"
                  className={`color-option ${selectedColor === color ? 'selected' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setSelectedColor(color)}
                  aria-label={`Select avatar color ${color}`}
                >
                  {selectedColor === color && <Check size={14} color="white" />}
                </button>
              ))}
            </div>
          </div>

          <button
            id="join-office-button"
            type="submit"
            className="submit-btn"
            disabled={isJoining}
          >
            {isJoining ? (
              <span>Connecting to Headquarters...</span>
            ) : (
              <>
                <span>Enter ProxiSpeak Headquarters</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
