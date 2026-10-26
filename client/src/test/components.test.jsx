import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HeaderBar } from '../components/HeaderBar.jsx';
import { ControlDock } from '../components/ControlDock.jsx';
import { LobbyModal } from '../components/LobbyModal.jsx';
import { HomePage } from '../components/HomePage.jsx';
import { HeroOfficeMap } from '../components/HeroOfficeMap.jsx';

// Mock API service to avoid unhandled network requests in JSDOM tests
vi.mock('../services/apiService.js', () => ({
  fetchOffices: vi.fn().mockResolvedValue([
    { _id: 'office-1', name: 'HQ Office', width: 1400, height: 900 }
  ]),
  createOffice: vi.fn().mockResolvedValue({}),
  createSession: vi.fn().mockResolvedValue({}),
  fetchOfficeLayout: vi.fn().mockResolvedValue({}),
  fetchNearbyUsersPlanar: vi.fn().mockResolvedValue([]),
  warmupBackend: vi.fn().mockResolvedValue({ success: true, ready: true })
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

  it('LobbyModal renders display name input, enter headquarters button, and optional back button', () => {
    const mockBack = vi.fn();
    render(
      <LobbyModal
        onJoinOffice={() => {}}
        isJoining={false}
        errorMessage=""
        onBackToHome={mockBack}
      />
    );

    expect(screen.getByText('Welcome to ProxiSpeak')).toBeInTheDocument();
    expect(screen.getByLabelText(/Your Name/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enter ProxiSpeak Headquarters/i })).toBeInTheDocument();
    expect(screen.getAllByText(/ProxiSpeak Headquarters/i).length).toBeGreaterThanOrEqual(1);

    const backBtn = screen.getByRole('button', { name: /Back to Homepage/i });
    expect(backBtn).toBeInTheDocument();
    fireEvent.click(backBtn);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('HomePage renders header branding, hero headline, all sections, and triggers onEnterOffice', () => {
    const mockEnter = vi.fn();
    render(
      <HomePage
        onEnterOffice={mockEnter}
        isJoined={false}
      />
    );

    // Header branding & tagline
    expect(screen.getAllByText('ProxiSpeak').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Spatial Audio • Virtual Collaboration/i).length).toBeGreaterThanOrEqual(1);

    // Hero Section
    expect(screen.getByText(/Future of Virtual Collaboration/i)).toBeInTheDocument();
    expect(screen.getByText(/ProxiSpeak transforms the virtual office/i)).toBeInTheDocument();

    // Section headings
    expect(screen.getByText('What is ProxiSpeak?')).toBeInTheDocument();
    expect(screen.getByText('How ProxiSpeak Works')).toBeInTheDocument();
    expect(screen.getByText(/Engineered for Natural Collaboration/i)).toBeInTheDocument();
    expect(screen.getByText(/Technologies Powering ProxiSpeak/i)).toBeInTheDocument();
    expect(screen.getByText(/Ready to step into the office\?/i)).toBeInTheDocument();

    // Key Features
    expect(screen.getByText('Real-Time Presence')).toBeInTheDocument();
    expect(screen.getByText('Spatial Audio')).toBeInTheDocument();
    expect(screen.getByText('WebRTC Communication')).toBeInTheDocument();

    // CTA interaction
    const enterButtons = screen.getAllByRole('button', { name: /Enter.*Virtual Office/i });
    expect(enterButtons.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(enterButtons[1]); // Hero CTA
    expect(mockEnter).toHaveBeenCalledTimes(1);
  });

  it('HeroOfficeMap renders interactive virtual office blueprint and avatars', () => {
    render(<HeroOfficeMap />);

    expect(screen.getByText(/ProxiSpeak Headquarters • Live Simulation/i)).toBeInTheDocument();
    expect(screen.getByText(/WebRTC Spatial Panning/i)).toBeInTheDocument();
    expect(screen.getByText('Engineering Hub')).toBeInTheDocument();
    expect(screen.getByText('Meeting Room Alpha')).toBeInTheDocument();
    expect(screen.getByText('Open Lounge')).toBeInTheDocument();
  });
});
