import React, { useState, useEffect } from 'react';
import { Mic, ArrowRight, Building, Plus, Check } from 'lucide-react';
import { fetchOffices, createOffice } from '../services/apiService.js';

const AVATAR_COLORS = [
  '#6366f1', // Indigo
  '#06b6d4', // Cyan
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#f43f5e', // Rose
  '#8b5cf6', // Violet
  '#ec4899', // Pink
];

export function LobbyModal({ onJoinOffice, isJoining, errorMessage }) {
  const [displayName, setDisplayName] = useState(
    localStorage.getItem('proxispeak_display_name') || ''
  );
  const [selectedColor, setSelectedColor] = useState(
    localStorage.getItem('proxispeak_avatar_color') || AVATAR_COLORS[0]
  );
  const [offices, setOffices] = useState([]);
  const [selectedOfficeId, setSelectedOfficeId] = useState('');
  const [isCreatingOffice, setIsCreatingOffice] = useState(false);
  const [newOfficeName, setNewOfficeName] = useState('');
  const [loadingOffices, setLoadingOffices] = useState(true);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    async function loadOffices() {
      try {
        setLoadingOffices(true);
        const list = await fetchOffices();
        setOffices(list);
        if (list.length > 0) {
          setSelectedOfficeId(list[0]._id);
        }
      } catch (err) {
        console.error('Error fetching offices:', err);
      } finally {
        setLoadingOffices(false);
      }
    }
    loadOffices();
  }, []);

  const handleCreateNewOffice = async () => {
    if (!newOfficeName.trim() || newOfficeName.trim().length < 2) {
      setFormError('Office name must be at least 2 characters');
      return;
    }
    try {
      setFormError('');
      const created = await createOffice({ name: newOfficeName.trim() });
      setOffices(prev => [created, ...prev]);
      setSelectedOfficeId(created._id);
      setIsCreatingOffice(false);
      setNewOfficeName('');
    } catch (err) {
      setFormError(err.message || 'Failed to create office');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    const trimmedName = displayName.trim();
    if (!trimmedName || trimmedName.length < 2) {
      setFormError('Please enter a display name (at least 2 characters)');
      return;
    }

    let officeIdToJoin = selectedOfficeId;

    if (isCreatingOffice && newOfficeName.trim()) {
      if (newOfficeName.trim().length < 2) {
        setFormError('Office name must be at least 2 characters');
        return;
      }
      try {
        const created = await createOffice({ name: newOfficeName.trim() });
        setOffices(prev => [created, ...prev]);
        officeIdToJoin = created._id;
        setSelectedOfficeId(created._id);
        setIsCreatingOffice(false);
        setNewOfficeName('');
      } catch (err) {
        setFormError(err.message || 'Failed to create office');
        return;
      }
    }

    if (!officeIdToJoin) {
      setFormError('Please select or create an office to join');
      return;
    }

    // Persist preferences in localStorage for seamless return
    localStorage.setItem('proxispeak_display_name', trimmedName);
    localStorage.setItem('proxispeak_avatar_color', selectedColor);

    onJoinOffice({
      displayName: trimmedName,
      avatarColor: selectedColor,
      officeId: officeIdToJoin
    });
  };

  return (
    <div className="modal-backdrop">
      <div className="lobby-card">
        <div className="lobby-header">
          <div className="lobby-brand-icon">
            <Mic size={28} color="white" />
          </div>
          <h2 className="lobby-title">Welcome to ProxiSpeak</h2>
          <p className="lobby-subtitle">
            Walk up to colleagues in the virtual office to speak. Natural spatial voice audio powered by WebRTC.
          </p>
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

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label className="form-label" style={{ marginBottom: 0 }}>
                Select Virtual Office
              </label>
              <button
                type="button"
                onClick={() => setIsCreatingOffice(!isCreatingOffice)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#818cf8',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                {isCreatingOffice ? 'Select existing' : <><Plus size={14} /> New office</>}
              </button>
            </div>

            {isCreatingOffice ? (
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="New Office Name (e.g. Design Studio)"
                  value={newOfficeName}
                  onChange={(e) => setNewOfficeName(e.target.value)}
                />
                <button
                  type="button"
                  onClick={handleCreateNewOffice}
                  className="dock-btn primary"
                  style={{ borderRadius: '8px', padding: '0 16px', whiteSpace: 'nowrap' }}
                >
                  Create
                </button>
              </div>
            ) : (
              <select
                id="office-select"
                className="form-input"
                value={selectedOfficeId}
                onChange={(e) => setSelectedOfficeId(e.target.value)}
                disabled={loadingOffices || offices.length === 0}
                style={{ cursor: 'pointer' }}
              >
                {loadingOffices ? (
                  <option value="">Loading offices...</option>
                ) : offices.length === 0 ? (
                  <option value="">No offices found</option>
                ) : (
                  offices.map(o => (
                    <option key={o._id} value={o._id}>
                      {o.name} ({o.width}x{o.height}px)
                    </option>
                  ))
                )}
              </select>
            )}
          </div>

          <button
            id="join-office-button"
            type="submit"
            className="submit-btn"
            disabled={isJoining}
          >
            {isJoining ? (
              <span>Connecting to Office...</span>
            ) : (
              <>
                <span>Enter Office</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
