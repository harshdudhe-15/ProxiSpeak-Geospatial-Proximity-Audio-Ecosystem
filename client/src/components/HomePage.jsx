import React, { useState } from 'react';
import {
  Radio,
  ArrowRight,
  Menu,
  X,
  Users,
  Compass,
  Zap,
  Volume2,
  Activity,
  Layers,
  Server,
  Database,
  Cpu,
  ShieldCheck,
  Building,
  Sparkles
} from 'lucide-react';
import { HeroOfficeMap } from './HeroOfficeMap.jsx';
import '../styles/homepage.css';

export function HomePage({ onEnterOffice, isJoined = false }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const scrollToSection = (id) => {
    setMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="homepage-root">
      {/* Active Session Notification Bar */}
      {isJoined && (
        <div
          style={{
            backgroundColor: 'rgba(16, 185, 129, 0.2)',
            borderBottom: '1px solid rgba(16, 185, 129, 0.4)',
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            fontSize: '13px',
            color: '#a7f3d0',
            fontWeight: 500,
            position: 'relative',
            zIndex: 101
          }}
        >
          <span>You have an active session in ProxiSpeak Headquarters.</span>
          <button
            type="button"
            onClick={onEnterOffice}
            style={{
              background: '#10b981',
              border: 'none',
              color: '#064e3b',
              padding: '4px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '12px'
            }}
          >
            Return to Office &rarr;
          </button>
        </div>
      )}

      {/* 1. Header Navigation */}
      <header className="hp-header" role="banner">
        <div className="hp-header-inner">
          {/* Left Brand Identity */}
          <div
            className="hp-brand"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            role="button"
            tabIndex={0}
            aria-label="ProxiSpeak Home"
          >
            <div className="hp-brand-icon" aria-hidden="true">
              <Radio size={22} />
            </div>
            <div className="hp-brand-text">
              <span className="hp-brand-title">ProxiSpeak</span>
              <span className="hp-brand-tagline">Spatial Audio • Virtual Collaboration</span>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav aria-label="Main Navigation">
            <ul className="hp-nav-links">
              <li>
                <button
                  type="button"
                  className="hp-nav-link"
                  onClick={() => scrollToSection('about')}
                  style={{ background: 'none', border: 'none' }}
                >
                  About
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="hp-nav-link"
                  onClick={() => scrollToSection('how-it-works')}
                  style={{ background: 'none', border: 'none' }}
                >
                  How It Works
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="hp-nav-link"
                  onClick={() => scrollToSection('features')}
                  style={{ background: 'none', border: 'none' }}
                >
                  Features
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="hp-nav-link"
                  onClick={() => scrollToSection('technology')}
                  style={{ background: 'none', border: 'none' }}
                >
                  Technology
                </button>
              </li>
            </ul>
          </nav>

          {/* Right Header Action */}
          <div className="hp-nav-actions">
            <button
              id="header-enter-office-btn"
              type="button"
              className="hp-btn-primary"
              onClick={onEnterOffice}
              aria-label={isJoined ? "Return to Virtual Office" : "Enter the Virtual Office"}
            >
              <span>{isJoined ? "Return to Office" : "Enter Virtual Office"}</span>
              <ArrowRight size={16} />
            </button>

            {/* Mobile Hamburger Button */}
            <button
              type="button"
              className="hp-mobile-toggle"
              onClick={() => setMobileMenuOpen(prev => !prev)}
              aria-label={mobileMenuOpen ? 'Close Navigation Menu' : 'Open Navigation Menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Responsive Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="hp-mobile-drawer" role="navigation">
            <button
              type="button"
              className="hp-nav-link"
              onClick={() => scrollToSection('about')}
              style={{ background: 'none', border: 'none', textAlign: 'left' }}
            >
              About
            </button>
            <button
              type="button"
              className="hp-nav-link"
              onClick={() => scrollToSection('how-it-works')}
              style={{ background: 'none', border: 'none', textAlign: 'left' }}
            >
              How It Works
            </button>
            <button
              type="button"
              className="hp-nav-link"
              onClick={() => scrollToSection('features')}
              style={{ background: 'none', border: 'none', textAlign: 'left' }}
            >
              Features
            </button>
            <button
              type="button"
              className="hp-nav-link"
              onClick={() => scrollToSection('technology')}
              style={{ background: 'none', border: 'none', textAlign: 'left' }}
            >
              Technology
            </button>
            <button
              type="button"
              className="hp-btn-primary"
              style={{ width: '100%', marginTop: '10px' }}
              onClick={onEnterOffice}
            >
              <span>Enter Virtual Office</span>
              <ArrowRight size={16} />
            </button>
          </div>
        )}
      </header>

      {/* 2. Hero Section */}
      <section className="hp-hero-section" aria-labelledby="hero-heading">
        <div className="hp-hero-content">
          <div className="hp-hero-badge">
            <Sparkles size={14} color="#818cf8" />
            <span>Geospatial Proximity Audio Ecosystem</span>
          </div>

          <h1 id="hero-heading" className="hp-hero-title">
            Step Into the <br />
            <span className="gradient-text">Future of Virtual Collaboration.</span>
          </h1>

          <p className="hp-hero-subtitle">
            ProxiSpeak transforms the virtual office into a spatial workspace where conversations
            naturally happen around you. Move, connect, and collaborate with your team without the friction of endless scheduled calls.
          </p>

          <div className="hp-hero-cta-group">
            <button
              id="hero-enter-office-btn"
              type="button"
              className="hp-btn-primary hp-hero-cta-main"
              onClick={onEnterOffice}
              aria-label={isJoined ? "Return to the Virtual Office" : "Enter the Virtual Office"}
            >
              <span>{isJoined ? "Return to Virtual Office" : "Enter the Virtual Office"}</span>
              <ArrowRight size={18} />
            </button>

            <button
              type="button"
              className="hp-btn-secondary"
              onClick={() => scrollToSection('how-it-works')}
            >
              <span>See How It Works</span>
            </button>
          </div>

          <div className="hp-hero-metrics">
            <div className="hp-metric-card">
              <span className="hp-metric-value">360°</span>
              <span className="hp-metric-label">Spatial Audio Panning</span>
            </div>
            <div className="hp-metric-card">
              <span className="hp-metric-value">&lt; 50ms</span>
              <span className="hp-metric-label">WebRTC Peer Audio</span>
            </div>
            <div className="hp-metric-card">
              <span className="hp-metric-value">60 FPS</span>
              <span className="hp-metric-label">Canvas Office Engine</span>
            </div>
          </div>
        </div>

        {/* 3. Hero Visual Blueprint */}
        <div className="hp-hero-visual-wrapper">
          <HeroOfficeMap />
        </div>
      </section>

      {/* 4. Information Section ("What is ProxiSpeak?") */}
      <section id="about" className="hp-section" aria-labelledby="about-heading">
        <div className="hp-section-header">
          <span className="hp-section-tag">Spatial Communication</span>
          <h2 id="about-heading" className="hp-section-title">
            What is ProxiSpeak?
          </h2>
          <p className="hp-section-desc">
            ProxiSpeak is a real-time virtual office designed to make online collaboration feel more natural.
            Instead of joining separate voice calls for every conversation, employees move through a shared
            2D workspace and communicate based on proximity. As users move closer to colleagues, their conversations
            become more audible, creating a more organic virtual-office experience.
          </p>
        </div>

        <div className="hp-about-grid">
          <div className="hp-about-card">
            <div className="hp-card-icon-wrap">
              <Volume2 size={24} />
            </div>
            <h3 className="hp-card-title">Natural Distance Falloff</h3>
            <p className="hp-card-desc">
              Voice volume dynamically scales according to true 2D Euclidean distance. You hear nearby conversations clearly while background chatter stays at a comfortable distance.
            </p>
          </div>

          <div className="hp-about-card">
            <div className="hp-card-icon-wrap" style={{ background: 'rgba(6, 182, 212, 0.15)', borderColor: 'rgba(6, 182, 212, 0.3)', color: '#06b6d4' }}>
              <Users size={24} />
            </div>
            <h3 className="hp-card-title">Organic Spontaneity</h3>
            <p className="hp-card-desc">
              Eliminate meeting fatigue. Stroll up to a team member's desk for a rapid 30-second question, gather around the watercooler, or enter a meeting room naturally.
            </p>
          </div>

          <div className="hp-about-card">
            <div className="hp-card-icon-wrap" style={{ background: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.3)', color: '#10b981' }}>
              <Radio size={24} />
            </div>
            <h3 className="hp-card-title">Peer-to-Peer Audio</h3>
            <p className="hp-card-desc">
              Powered by WebRTC mesh voice streaming, audio flows directly between browsers with crystal clarity and minimal latency, keeping conversations fast and responsive.
            </p>
          </div>
        </div>
      </section>

      {/* 5. How It Works Section */}
      <section id="how-it-works" className="hp-section" aria-labelledby="how-heading">
        <div className="hp-section-header">
          <span className="hp-section-tag">Workflow</span>
          <h2 id="how-heading" className="hp-section-title">
            How ProxiSpeak Works
          </h2>
          <p className="hp-section-desc">
            Get started in seconds. No complex installs, no calendar invites—just step into the office and start collaborating.
          </p>
        </div>

        <div className="hp-steps-grid">
          {/* Step 1 */}
          <div className="hp-step-card">
            <span className="hp-step-badge">01</span>
            <h3 className="hp-step-title">Enter the Office</h3>
            <p className="hp-step-desc">
              Sign in and enter the shared ProxiSpeak Headquarters workspace. Choose your avatar color and instantly join your team.
            </p>
          </div>

          {/* Step 2 */}
          <div className="hp-step-card">
            <span className="hp-step-badge" style={{ background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              02
            </span>
            <h3 className="hp-step-title">Move Around</h3>
            <p className="hp-step-desc">
              Navigate your avatar through the 2D virtual office with arrow keys or WASD, and discover where your colleagues are gathering.
            </p>
          </div>

          {/* Step 3 */}
          <div className="hp-step-card">
            <span className="hp-step-badge" style={{ background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              03
            </span>
            <h3 className="hp-step-title">Talk Naturally</h3>
            <p className="hp-step-desc">
              As you move closer to another employee, spatial audio allows the conversation to become more audible with realistic stereo panning.
            </p>
          </div>
        </div>
      </section>

      {/* 6. Key Features Section */}
      <section id="features" className="hp-section" aria-labelledby="features-heading">
        <div className="hp-section-header">
          <span className="hp-section-tag">Capabilities</span>
          <h2 id="features-heading" className="hp-section-title">
            Engineered for Natural Collaboration
          </h2>
          <p className="hp-section-desc">
            Everything you need for an immersive remote workspace, built directly into modern browser standards.
          </p>
        </div>

        <div className="hp-features-grid">
          <div className="hp-feature-card">
            <div className="hp-feature-icon">
              <Users size={22} />
            </div>
            <h3 className="hp-feature-title">Real-Time Presence</h3>
            <p className="hp-feature-desc">
              See colleagues as live avatars inside the shared workspace with real-time movement and online status indicators.
            </p>
          </div>

          <div className="hp-feature-card">
            <div className="hp-feature-icon">
              <Volume2 size={22} />
            </div>
            <h3 className="hp-feature-title">Spatial Audio</h3>
            <p className="hp-feature-desc">
              Voice communication changes based on proximity. Audio attenuates smoothly and pans left-to-right based on coordinate positions.
            </p>
          </div>

          <div className="hp-feature-card">
            <div className="hp-feature-icon">
              <Radio size={22} />
            </div>
            <h3 className="hp-feature-title">WebRTC Communication</h3>
            <p className="hp-feature-desc">
              Real-time peer-to-peer audio communication delivers low-latency, high-fidelity sound directly between connected teammates.
            </p>
          </div>

          <div className="hp-feature-card">
            <div className="hp-feature-icon">
              <Compass size={22} />
            </div>
            <h3 className="hp-feature-title">Interactive Virtual Office</h3>
            <p className="hp-feature-desc">
              Move naturally through a 2D office environment with distinct collaboration zones, conference tables, and lounge areas.
            </p>
          </div>

          <div className="hp-feature-card">
            <div className="hp-feature-icon">
              <Zap size={22} />
            </div>
            <h3 className="hp-feature-title">Multi-User Collaboration</h3>
            <p className="hp-feature-desc">
              Multiple employees can interact simultaneously within the same virtual space, creating dynamic spontaneous discussions.
            </p>
          </div>

          <div className="hp-feature-card">
            <div className="hp-feature-icon">
              <Activity size={22} />
            </div>
            <h3 className="hp-feature-title">Real-Time Synchronization</h3>
            <p className="hp-feature-desc">
              Movement and presence are synchronized seamlessly between connected users through optimized WebSocket signaling.
            </p>
          </div>
        </div>
      </section>

      {/* 7. Technology / Trust Section */}
      <section id="technology" className="hp-section" aria-labelledby="tech-heading">
        <div className="hp-section-header">
          <span className="hp-section-tag">Architecture</span>
          <h2 id="tech-heading" className="hp-section-title">
            Technologies Powering ProxiSpeak
          </h2>
          <p className="hp-section-desc">
            Built on a modern, high-performance stack for reliable real-time voice and graphics.
          </p>
        </div>

        <div className="hp-tech-grid">
          <div className="hp-tech-card">
            <div className="hp-tech-icon">
              <Layers size={20} />
            </div>
            <span className="hp-tech-name">React 19</span>
            <span className="hp-tech-role">Frontend UI</span>
          </div>

          <div className="hp-tech-card">
            <div className="hp-tech-icon">
              <Server size={20} />
            </div>
            <span className="hp-tech-name">Node.js</span>
            <span className="hp-tech-role">Backend Engine</span>
          </div>

          <div className="hp-tech-card">
            <div className="hp-tech-icon">
              <Activity size={20} />
            </div>
            <span className="hp-tech-name">Socket.IO</span>
            <span className="hp-tech-role">Real-Time Sync</span>
          </div>

          <div className="hp-tech-card">
            <div className="hp-tech-icon">
              <Radio size={20} />
            </div>
            <span className="hp-tech-name">WebRTC</span>
            <span className="hp-tech-role">P2P Voice Mesh</span>
          </div>

          <div className="hp-tech-card">
            <div className="hp-tech-icon">
              <Database size={20} />
            </div>
            <span className="hp-tech-name">MongoDB</span>
            <span className="hp-tech-role">Floorplan Store</span>
          </div>

          <div className="hp-tech-card">
            <div className="hp-tech-icon">
              <Cpu size={20} />
            </div>
            <span className="hp-tech-name">Canvas</span>
            <span className="hp-tech-role">2D Office Engine</span>
          </div>
        </div>
      </section>

      {/* 8. Final Call to Action */}
      <section className="hp-section" aria-label="Join Virtual Office Action">
        <div className="hp-cta-banner">
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'rgba(99, 102, 241, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '20px',
              color: '#a5b4fc'
            }}
          >
            <Building size={24} />
          </div>

          <h2 className="hp-cta-title">
            Ready to step into the office?
          </h2>

          <p className="hp-cta-desc">
            Enter ProxiSpeak Headquarters and experience collaboration through proximity.
            No downloads required—run directly inside your web browser.
          </p>

          <button
            id="cta-enter-office-btn"
            type="button"
            className="hp-btn-primary hp-hero-cta-main"
            onClick={onEnterOffice}
            aria-label={isJoined ? "Return to the Virtual Office" : "Enter the Virtual Office"}
          >
            <span>{isJoined ? "Return to Virtual Office" : "Enter the Virtual Office"}</span>
            <ArrowRight size={18} />
          </button>
        </div>
      </section>

      {/* 9. Footer */}
      <footer className="hp-footer" role="contentinfo">
        <div className="hp-footer-inner">
          <div className="hp-footer-top">
            <div className="hp-brand">
              <div className="hp-brand-icon" style={{ width: '32px', height: '32px', borderRadius: '8px' }}>
                <Radio size={16} />
              </div>
              <div className="hp-brand-text">
                <span className="hp-brand-title" style={{ fontSize: '18px' }}>ProxiSpeak</span>
                <span className="hp-brand-tagline">Geospatial Proximity Audio Ecosystem</span>
              </div>
            </div>

            <ul className="hp-footer-links">
              <li>
                <button
                  type="button"
                  className="hp-footer-link"
                  onClick={() => scrollToSection('about')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  About
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="hp-footer-link"
                  onClick={() => scrollToSection('how-it-works')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  How It Works
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="hp-footer-link"
                  onClick={() => scrollToSection('features')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Features
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="hp-footer-link"
                  onClick={() => scrollToSection('technology')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Technology
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="hp-footer-link"
                  onClick={onEnterOffice}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#818cf8', fontWeight: 600 }}
                >
                  Virtual Office &rarr;
                </button>
              </li>
            </ul>
          </div>

          <div className="hp-footer-bottom">
            <span>&copy; {new Date().getFullYear()} ProxiSpeak. All rights reserved.</span>
            <div className="hp-footer-status">
              <span className="hp-pulse-dot" style={{ width: '6px', height: '6px' }} />
              <span>Headquarters Operational • Spatial Audio Active</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
export default HomePage;
