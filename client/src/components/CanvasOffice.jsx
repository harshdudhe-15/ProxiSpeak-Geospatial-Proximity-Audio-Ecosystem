import React, { useRef, useEffect, useState, useCallback } from 'react';
import { calculateDistance, lineIntersectsRect, circleCollidesWithRect } from '../utils/geometry.js';
import { spatialAudioMixer } from '../services/spatialAudioMixer.js';
import { webRtcService } from '../services/webRtcService.js';
import { drawScene, AVATAR_RADIUS } from '../utils/officeSceneRenderer.js';
import { MapPin, Navigation, Eye, Maximize2 } from 'lucide-react';

export function CanvasOffice({
  officeLayout,
  currentUser,
  remoteUsers,
  hearingRadius = 120,
  onLocalMove,
  isMicMuted
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);

  // Local state references for animation loop
  const localPosRef = useRef({ x: currentUser?.x || 280, y: currentUser?.y || 140 });
  const remotePositionsRef = useRef(new Map()); // userId -> { currentX, currentY, targetX, targetY, displayName, avatarColor, micMuted, isSpeaking, isObstructed }
  const activeKeysRef = useRef(new Set());
  const targetClickPosRef = useRef(null);
  const lastEmitTimeRef = useRef(0);

  // Camera & Viewport Management
  const cameraRef = useRef({ x: 0, y: 0 }); // World coordinates at top-left of viewport
  const targetCameraRef = useRef({ x: 0, y: 0 });
  const cameraInitializedRef = useRef(false);
  const viewportRef = useRef({ width: 1400, height: 900 });

  // HUD State
  const [showMinimap, setShowMinimap] = useState(true);
  const [coordsDisplay, setCoordsDisplay] = useState({ x: 280, y: 140 });

  // Mutable refs to decouple animation loop from React render cycle
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;
  const onLocalMoveRef = useRef(onLocalMove);
  onLocalMoveRef.current = onLocalMove;
  const officeLayoutRef = useRef(officeLayout);
  officeLayoutRef.current = officeLayout;
  const isMicMutedRef = useRef(isMicMuted);
  isMicMutedRef.current = isMicMuted;
  const hearingRadiusRef = useRef(hearingRadius);
  hearingRadiusRef.current = hearingRadius;

  const officeWidth = officeLayout?.width || 2000;
  const officeHeight = officeLayout?.height || 1200;

  const obstacles = [
    ...(officeLayout?.walls || []),
    ...(officeLayout?.furniture || [])
  ];
  const obstaclesRef = useRef(obstacles);
  obstaclesRef.current = obstacles;

  // Sync initial position if currentUser coordinates become available
  useEffect(() => {
    if (currentUser?.x != null && currentUser?.y != null) {
      if (localPosRef.current.x === 280 && localPosRef.current.y === 140) {
        localPosRef.current = { x: currentUser.x, y: currentUser.y };
        setCoordsDisplay({ x: Math.round(currentUser.x), y: Math.round(currentUser.y) });
      }
    }
  }, [currentUser?.userId]);

  // Sync remote user targets
  useEffect(() => {
    const currentMap = remotePositionsRef.current;
    const newIds = new Set();

    remoteUsers.forEach(u => {
      newIds.add(u.userId);
      if (!currentMap.has(u.userId)) {
        currentMap.set(u.userId, {
          currentX: u.x,
          currentY: u.y,
          targetX: u.x,
          targetY: u.y,
          displayName: u.displayName,
          avatarColor: u.avatarColor || '#6366f1',
          micMuted: Boolean(u.micMuted),
          isSpeaking: false,
          isObstructed: false
        });
      } else {
        const existing = currentMap.get(u.userId);
        existing.targetX = u.x;
        existing.targetY = u.y;
        existing.displayName = u.displayName;
        existing.avatarColor = u.avatarColor || existing.avatarColor;
        existing.micMuted = Boolean(u.micMuted);
      }
    });

    // Remove users who departed
    for (const id of Array.from(currentMap.keys())) {
      if (!newIds.has(id)) {
        currentMap.delete(id);
      }
    }
  }, [remoteUsers]);

  // Responsive Viewport Resize Handling
  useEffect(() => {
    const handleResize = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;

      const rect = container.getBoundingClientRect();
      const width = Math.max(300, Math.round(rect.width || container.clientWidth || window.innerWidth));
      const height = Math.max(300, Math.round(rect.height || container.clientHeight || (window.innerHeight - 120)));
      const dpr = window.devicePixelRatio || 1;

      viewportRef.current = { width, height };

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = '100%';
      canvas.style.height = '100%';
    };

    handleResize();

    let resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(containerRef.current);
    }
    window.addEventListener('resize', handleResize);

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Background interval (100ms) for continuous spatial audio parameter sync
  useEffect(() => {
    const interval = setInterval(() => {
      const localPos = localPosRef.current;
      const remoteMap = remotePositionsRef.current;
      const curObstacles = obstaclesRef.current;
      for (const [peerId, remote] of remoteMap.entries()) {
        const remotePos = { x: remote.currentX, y: remote.currentY };
        const isObstructed = curObstacles.some(obs =>
          obs.soundBlocking && lineIntersectsRect(localPos, remotePos, obs)
        );
        remote.isObstructed = isObstructed;
        spatialAudioMixer.updatePeerSpatial(peerId, localPos, remotePos, isObstructed);
      }
    }, 100);

    return () => clearInterval(interval);
  }, []);

  // Keyboard Event Listeners for WASD and Arrow Keys
  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright'].includes(key)) {
        activeKeysRef.current.add(key);
        targetClickPosRef.current = null; // Keyboard cancels click target
        e.preventDefault();
      }
    };

    const handleKeyUp = (e) => {
      const key = e.key.toLowerCase();
      activeKeysRef.current.delete(key);
    };

    window.addEventListener('keydown', handleKeyDown, { passive: false });
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      activeKeysRef.current.clear();
    };
  }, []);

  // Pointer / Click-to-move handler on canvas (converts SCREEN coordinates to WORLD coordinates)
  const handlePointerDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const vW = viewportRef.current.width;
    const vH = viewportRef.current.height;

    // Viewport CSS pixel coordinates
    const screenX = (e.clientX - rect.left) * (vW / (rect.width || vW));
    const screenY = (e.clientY - rect.top) * (vH / (rect.height || vH));

    // Convert Screen coordinates to World coordinates using camera position!
    const worldX = screenX + cameraRef.current.x;
    const worldY = screenY + cameraRef.current.y;

    const clampedX = Math.max(AVATAR_RADIUS, Math.min(officeWidth - AVATAR_RADIUS, worldX));
    const clampedY = Math.max(AVATAR_RADIUS, Math.min(officeHeight - AVATAR_RADIUS, worldY));
    targetClickPosRef.current = { x: clampedX, y: clampedY };
  };

  // Minimap Navigation Click Handler
  const handleMinimapClick = (targetWorldX, targetWorldY) => {
    const clampedX = Math.max(AVATAR_RADIUS, Math.min(officeWidth - AVATAR_RADIUS, targetWorldX));
    const clampedY = Math.max(AVATAR_RADIUS, Math.min(officeHeight - AVATAR_RADIUS, targetWorldY));
    targetClickPosRef.current = { x: clampedX, y: clampedY };
  };

  // Main Canvas Render & Movement Animation Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let animationFrameId;
    let lastFrameTime = performance.now();
    let hudUpdateCounter = 0;

    const speed = 250; // Pixels per second

    const renderLoop = (now) => {
      const dt = Math.min(0.1, (now - lastFrameTime) / 1000);
      lastFrameTime = now;

      const keys = activeKeysRef.current;
      const curObstacles = obstaclesRef.current;
      let dx = 0;
      let dy = 0;

      // 1. Calculate local avatar movement from keys
      if (keys.has('w') || keys.has('arrowup')) dy -= 1;
      if (keys.has('s') || keys.has('arrowdown')) dy += 1;
      if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
      if (keys.has('d') || keys.has('arrowright')) dx += 1;

      if (dx !== 0 && dy !== 0) {
        // Normalize diagonal speed
        dx *= 0.7071;
        dy *= 0.7071;
      } else if (dx === 0 && dy === 0 && targetClickPosRef.current) {
        // 1b. Fallback to click-to-move target
        const target = targetClickPosRef.current;
        const currentPos = localPosRef.current;
        const dist = Math.hypot(target.x - currentPos.x, target.y - currentPos.y);
        if (dist > 4) {
          dx = (target.x - currentPos.x) / dist;
          dy = (target.y - currentPos.y) / dist;
        } else {
          targetClickPosRef.current = null;
        }
      }

      // Update avatar world position if moving
      if (dx !== 0 || dy !== 0) {
        const moveDist = speed * dt;
        const currentPos = localPosRef.current;
        const proposedX = currentPos.x + dx * moveDist;
        const proposedY = currentPos.y + dy * moveDist;

        // Clamp to map boundaries
        let nextX = Math.max(AVATAR_RADIUS, Math.min(officeWidth - AVATAR_RADIUS, proposedX));
        let nextY = Math.max(AVATAR_RADIUS, Math.min(officeHeight - AVATAR_RADIUS, proposedY));

        // Wall & furniture collision check
        const collidesFull = curObstacles.some(obs =>
          circleCollidesWithRect({ x: nextX, y: nextY, radius: AVATAR_RADIUS }, obs)
        );

        if (collidesFull) {
          // Attempt wall sliding along free axis
          const collidesXOnly = curObstacles.some(obs =>
            circleCollidesWithRect({ x: nextX, y: currentPos.y, radius: AVATAR_RADIUS }, obs)
          );
          const collidesYOnly = curObstacles.some(obs =>
            circleCollidesWithRect({ x: currentPos.x, y: nextY, radius: AVATAR_RADIUS }, obs)
          );

          if (!collidesXOnly) {
            nextY = currentPos.y;
          } else if (!collidesYOnly) {
            nextX = currentPos.x;
          } else {
            // Check if current position itself is already colliding
            const currentColliding = curObstacles.some(obs =>
              circleCollidesWithRect({ x: currentPos.x, y: currentPos.y, radius: AVATAR_RADIUS }, obs)
            );
            if (currentColliding) {
              // Allow escape movement so avatar is never trapped
              nextX = proposedX;
              nextY = proposedY;
            } else {
              nextX = currentPos.x;
              nextY = currentPos.y;
              targetClickPosRef.current = null;
            }
          }
        }

        localPosRef.current = { x: nextX, y: nextY };

        // Throttle HUD coordinate update to ~10Hz
        hudUpdateCounter++;
        if (hudUpdateCounter % 6 === 0) {
          setCoordsDisplay({ x: Math.round(nextX), y: Math.round(nextY) });
        }

        // Throttle network broadcast to ~20Hz (50ms interval)
        if (now - lastEmitTimeRef.current >= 50) {
          lastEmitTimeRef.current = now;
          if (onLocalMoveRef.current) {
            onLocalMoveRef.current(Math.round(nextX), Math.round(nextY));
          }
        }
      }

      // 2. Camera Follow System with Dead Zone and Smooth Easing
      const localPos = localPosRef.current;
      const vW = viewportRef.current.width;
      const vH = viewportRef.current.height;

      // Define comfortable camera dead zone centered around viewport
      // The avatar can roam freely within this zone without moving the camera
      const deadZoneWidth = Math.min(360, Math.max(180, vW * 0.28));
      const deadZoneHeight = Math.min(240, Math.max(140, vH * 0.28));
      const deadZoneLeft = (vW - deadZoneWidth) / 2;
      const deadZoneRight = deadZoneLeft + deadZoneWidth;
      const deadZoneTop = (vH - deadZoneHeight) / 2;
      const deadZoneBottom = deadZoneTop + deadZoneHeight;

      // Current avatar position in screen space
      const screenX = localPos.x - cameraRef.current.x;
      const screenY = localPos.y - cameraRef.current.y;

      let targetCamX = targetCameraRef.current.x;
      let targetCamY = targetCameraRef.current.y;

      // When avatar exits dead zone, shift camera target
      if (screenX < deadZoneLeft) {
        targetCamX = localPos.x - deadZoneLeft;
      } else if (screenX > deadZoneRight) {
        targetCamX = localPos.x - deadZoneRight;
      }

      if (screenY < deadZoneTop) {
        targetCamY = localPos.y - deadZoneTop;
      } else if (screenY > deadZoneBottom) {
        targetCamY = localPos.y - deadZoneBottom;
      }

      // Map boundary clamping: Camera must NEVER reveal space outside the office
      const maxCamX = Math.max(0, officeWidth - vW);
      const maxCamY = Math.max(0, officeHeight - vH);

      if (vW < officeWidth) {
        targetCamX = Math.max(0, Math.min(maxCamX, targetCamX));
      } else {
        targetCamX = (officeWidth - vW) / 2; // Center office if viewport is wider
      }

      if (vH < officeHeight) {
        targetCamY = Math.max(0, Math.min(maxCamY, targetCamY));
      } else {
        targetCamY = (officeHeight - vH) / 2; // Center office if viewport is taller
      }

      targetCameraRef.current = { x: targetCamX, y: targetCamY };

      // Smooth camera interpolation (Easing)
      if (!cameraInitializedRef.current) {
        // On initial spawn, instantly frame avatar at center without jarring pan
        cameraRef.current = { x: targetCamX, y: targetCamY };
        cameraInitializedRef.current = true;
      } else {
        // Frame-rate independent exponential lerp
        const smoothing = 1 - Math.exp(-8 * dt);
        cameraRef.current.x += (targetCamX - cameraRef.current.x) * smoothing;
        cameraRef.current.y += (targetCamY - cameraRef.current.y) * smoothing;

        // Strict boundary enforcement during easing
        if (vW < officeWidth) {
          cameraRef.current.x = Math.max(0, Math.min(maxCamX, cameraRef.current.x));
        } else {
          cameraRef.current.x = (officeWidth - vW) / 2;
        }

        if (vH < officeHeight) {
          cameraRef.current.y = Math.max(0, Math.min(maxCamY, cameraRef.current.y));
        } else {
          cameraRef.current.y = (officeHeight - vH) / 2;
        }
      }

      // 3. Interpolate remote avatar positions & update spatial audio nodes
      const remoteMap = remotePositionsRef.current;
      for (const [peerId, remote] of remoteMap.entries()) {
        remote.currentX += (remote.targetX - remote.currentX) * 0.2;
        remote.currentY += (remote.targetY - remote.currentY) * 0.2;

        const remotePos = { x: remote.currentX, y: remote.currentY };
        const isObstructed = curObstacles.some(obs =>
          obs.soundBlocking && lineIntersectsRect(localPos, remotePos, obs)
        );
        remote.isObstructed = isObstructed;

        const audioLevel = spatialAudioMixer.getPeerAudioLevel(peerId);
        remote.isSpeaking = audioLevel > 8 && !remote.micMuted;

        spatialAudioMixer.updatePeerSpatial(peerId, localPos, remotePos, isObstructed);
      }

      // 4. Render Scene with Camera Transformation
      const dpr = window.devicePixelRatio || 1;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.scale(dpr, dpr);
      // Translate scene by camera world offset
      ctx.translate(-Math.round(cameraRef.current.x), -Math.round(cameraRef.current.y));

      drawScene(ctx, {
        localPos,
        remoteMap,
        layout: officeLayoutRef.current,
        hearingRadius: hearingRadiusRef.current,
        isLocalMuted: isMicMutedRef.current,
        currentUser: currentUserRef.current,
        localAudioLevel: webRtcService.getLocalAudioLevel ? webRtcService.getLocalAudioLevel() : 0,
        cameraX: cameraRef.current.x,
        cameraY: cameraRef.current.y,
        viewportWidth: vW,
        viewportHeight: vH
      });

      ctx.restore();

      animationFrameId = requestAnimationFrame(renderLoop);
    };

    animationFrameId = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [officeWidth, officeHeight]);

  return (
    <div ref={containerRef} className="canvas-viewport-container">
      {/* Top HUD Overlay Chips */}
      <div className="canvas-hud-overlay">
        <div className="hud-chip">
          <span>Movement:</span>
          <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>, <kbd>Arrow Keys</kbd>, or <kbd>Click Floor</kbd>
        </div>
        <div className="hud-chip">
          <Navigation size={13} className="text-cyan-400" />
          <span>Position:</span>
          <strong>({coordsDisplay.x}, {coordsDisplay.y})</strong>
        </div>
        <div className="hud-chip">
          <span>Hearing Range:</span>
          <strong>{hearingRadius}px</strong>
        </div>
      </div>

      {/* Main Canvas Viewport */}
      <canvas
        ref={canvasRef}
        className="office-canvas"
        tabIndex={0}
        onPointerDown={handlePointerDown}
      />

      {/* Sleek Minimap Radar HUD */}
      {showMinimap && (
        <MinimapRadar
          officeWidth={officeWidth}
          officeHeight={officeHeight}
          localPos={localPosRef.current}
          remoteUsers={remoteUsers}
          cameraX={cameraRef.current.x}
          cameraY={cameraRef.current.y}
          viewportWidth={viewportRef.current.width}
          viewportHeight={viewportRef.current.height}
          layout={officeLayoutRef.current}
          onMinimapClick={handleMinimapClick}
          onToggle={() => setShowMinimap(false)}
        />
      )}

      {!showMinimap && (
        <button
          className="minimap-toggle-btn"
          onClick={() => setShowMinimap(true)}
          title="Open Minimap Radar"
        >
          <MapPin size={16} />
          <span>Minimap</span>
        </button>
      )}
    </div>
  );
}

/**
 * Interactive Minimap Radar HUD Component
 */
function MinimapRadar({
  officeWidth,
  officeHeight,
  localPos,
  remoteUsers,
  cameraX,
  cameraY,
  viewportWidth,
  viewportHeight,
  layout,
  onMinimapClick,
  onToggle
}) {
  const radarWidth = 190;
  const radarHeight = Math.round((radarWidth / officeWidth) * officeHeight);
  const scale = radarWidth / officeWidth;

  const handleClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const worldX = clickX / scale;
    const worldY = clickY / scale;
    onMinimapClick(worldX, worldY);
  };

  const vpX = Math.max(0, cameraX * scale);
  const vpY = Math.max(0, cameraY * scale);
  const vpW = Math.min(radarWidth - vpX, (viewportWidth * scale));
  const vpH = Math.min(radarHeight - vpY, (viewportHeight * scale));

  return (
    <div className="minimap-radar-container">
      <div className="minimap-header">
        <div className="flex items-center gap-1.5">
          <span className="minimap-dot-live" />
          <span className="minimap-title">HQ Radar</span>
        </div>
        <button
          onClick={onToggle}
          className="minimap-close-btn"
          title="Hide Minimap"
        >
          ✕
        </button>
      </div>

      <div
        className="minimap-stage"
        style={{ width: `${radarWidth}px`, height: `${radarHeight}px` }}
        onClick={handleClick}
        title="Click to navigate"
      >
        {/* Zones representation */}
        {layout?.zones?.map(zone => (
          <div
            key={zone.id}
            className="minimap-zone"
            style={{
              left: `${zone.x * scale}px`,
              top: `${zone.y * scale}px`,
              width: `${zone.width * scale}px`,
              height: `${zone.height * scale}px`,
              backgroundColor: zone.color || '#1e293b'
            }}
          />
        ))}

        {/* Walls */}
        {layout?.walls?.map((wall, idx) => (
          <div
            key={wall.id || idx}
            className={`minimap-wall ${wall.soundBlocking ? 'glass-wall' : ''}`}
            style={{
              left: `${wall.x * scale}px`,
              top: `${wall.y * scale}px`,
              width: `${Math.max(1.5, wall.width * scale)}px`,
              height: `${Math.max(1.5, wall.height * scale)}px`
            }}
          />
        ))}

        {/* Camera Viewport Bounds Indicator Box */}
        <div
          className="minimap-viewport-box"
          style={{
            left: `${vpX}px`,
            top: `${vpY}px`,
            width: `${vpW}px`,
            height: `${vpH}px`
          }}
        />

        {/* Remote Users */}
        {remoteUsers.map(user => (
          <div
            key={user.userId}
            className="minimap-avatar remote"
            style={{
              left: `${user.x * scale}px`,
              top: `${user.y * scale}px`,
              backgroundColor: user.avatarColor || '#6366f1'
            }}
            title={user.displayName}
          />
        ))}

        {/* Local User */}
        <div
          className="minimap-avatar local"
          style={{
            left: `${localPos.x * scale}px`,
            top: `${localPos.y * scale}px`
          }}
          title="You"
        >
          <div className="minimap-avatar-pulse" />
        </div>
      </div>
    </div>
  );
}
