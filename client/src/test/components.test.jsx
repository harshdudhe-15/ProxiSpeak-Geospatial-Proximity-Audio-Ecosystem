import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeaderBar } from '../components/HeaderBar.jsx';
import { ControlDock } from '../components/ControlDock.jsx';
import { LobbyModal } from '../components/LobbyModal.jsx';

// Mock API service to avoid unhandled network requests in JSDOM tests
vi.mock('../services/apiService.js', () => ({
  fetchOffices: vi.fn().mockResolvedValue([
    { _id: 'office-1', name: 'HQ Office', width: 1400, height: 900 }
  ]),
  createOffice: vi.fn().mockResolvedValue({}),
  createSession: vi.fn().mockResolvedValue({}),
  fetchOfficeLayout: vi.fn().mockResolvedValue({}),
  fetchNearbyUsersPlanar: vi.fn().mockResolvedValue([])
}));

describe('UI Component Unit Tests', () => {
  it('HeaderBar renders brand title and online user count', () => {
    render(
      <HeaderBar
        officeName="Engineering Wing"
        isConnected={true}
        userCount={4}
        currentUser={{ displayName: 'Sarah Connor', avatarColor: '#6366f1' }}
        onToggleRoster={() => {}}
        isRosterOpen={true}
      />
    );

    expect(screen.getByText('ProxiSpeak')).toBeInTheDocument();
    expect(screen.getByText('Engineering Wing')).toBeInTheDocument();
    expect(screen.getByText('4 Online')).toBeInTheDocument();
    expect(screen.getByText('Sarah Connor')).toBeInTheDocument();
  });

  it('ControlDock renders mic mute, deafen, and leave buttons', () => {
    render(
      <ControlDock
        isMicMuted={false}
        onToggleMic={() => {}}
        isMasterMuted={false}
        onToggleMasterMute={() => {}}
        hearingRadius={120}
        onChangeRadius={() => {}}
        onLeaveOffice={() => {}}
      />
    );

    expect(screen.getByText('Mic Active')).toBeInTheDocument();
    expect(screen.getByText('Sound On')).toBeInTheDocument();
    expect(screen.getByText('Leave')).toBeInTheDocument();
  });

  it('LobbyModal renders display name input and enter office button', async () => {
    render(
      <LobbyModal
        onJoinOffice={() => {}}
        isJoining={false}
        errorMessage=""
      />
    );

    expect(screen.getByText('Welcome to ProxiSpeak')).toBeInTheDocument();
    expect(screen.getByLabelText(/Your Name/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enter Office/i })).toBeInTheDocument();
    // Await async offices loading to cleanly resolve state updates
    await screen.findByText(/HQ Office/i);
  });
});
