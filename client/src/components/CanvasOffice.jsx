import React, { useRef, useEffect } from 'react';
import { calculateDistance, lineIntersectsRect, circleCollidesWithRect } from '../utils/geometry.js';
import { spatialAudioMixer } from '../services/spatialAudioMixer.js';
import { webRtcService } from '../services/webRtcService.js';

const AVATAR_RADIUS = 20;

export function CanvasOffice({
  officeLayout,
  currentUser,
  remoteUsers,
  hearingRadius = 120,
  onLocalMove,
  isMicMuted
}) {
  const canvasRef = useRef(null);

  // Local state references for animation loop
  const localPosRef = useRef({ x: currentUser?.x || 280, y: currentUser?.y || 140 });
  const remotePositionsRef = useRef(new Map()); // userId -> { currentX, currentY, targetX, targetY, displayName, avatarColor, micMuted }
  const activeKeysRef = useRef(new Set());
  const targetClickPosRef = useRef(null);
  const lastEmitTimeRef = useRef(0);

  // Mutable refs to keep animation loop decoupled from React render churn
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

  const officeWidth = officeLayout?.width || 1400;
  const officeHeight = officeLayout?.height || 900;
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
          micMuted: Boolean(u.micMuted)
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

  // Background interval (100ms) for continuous spatial audio parameter sync
  // Ensures audio stays audible and properly panned even when the browser tab is unfocused/backgrounded
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
        // Prevent window scroll
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

  // Pointer / Click-to-move handler on canvas
  const handlePointerDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = officeWidth / rect.width;
    const scaleY = officeHeight / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;
    const clampedX = Math.max(AVATAR_RADIUS, Math.min(officeWidth - AVATAR_RADIUS, clickX));
    const clampedY = Math.max(AVATAR_RADIUS, Math.min(officeHeight - AVATAR_RADIUS, clickY));
    targetClickPosRef.current = { x: clampedX, y: clampedY };
  };

  // Main Canvas Render & Movement Animation Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let animationFrameId;
    let lastFrameTime = performance.now();

    const speed = 240; // Pixels per second

    const renderLoop = (now) => {
      const dt = Math.min(0.1, (now - lastFrameTime) / 1000);
      lastFrameTime = now;

      const keys = activeKeysRef.current;
      const curObstacles = obstaclesRef.current;
      let dx = 0;
      let dy = 0;

      // 1. Calculate local movement from keys
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

      if (dx !== 0 || dy !== 0) {
        const moveDist = speed * dt;
        const currentPos = localPosRef.current;
        const proposedX = currentPos.x + dx * moveDist;
        const proposedY = currentPos.y + dy * moveDist;

        // Clamp to boundaries
        let nextX = Math.max(AVATAR_RADIUS, Math.min(officeWidth - AVATAR_RADIUS, proposedX));
        let nextY = Math.max(AVATAR_RADIUS, Math.min(officeHeight - AVATAR_RADIUS, proposedY));

        // Wall & obstacle collision check
        const collidesFull = curObstacles.some(obs =>
          circleCollidesWithRect({ x: nextX, y: nextY, radius: AVATAR_RADIUS }, obs)
        );

        if (collidesFull) {
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
            // Check if current position itself is already colliding with an obstacle
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

        // Throttle network broadcast to ~20Hz (50ms interval)
        if (now - lastEmitTimeRef.current >= 50) {
          lastEmitTimeRef.current = now;
          if (onLocalMoveRef.current) {
            onLocalMoveRef.current(Math.round(nextX), Math.round(nextY));
          }
        }
      }

      // 2. Interpolate remote avatar positions & update spatial audio nodes
      const localPos = localPosRef.current;
      const remoteMap = remotePositionsRef.current;

      for (const [peerId, remote] of remoteMap.entries()) {
        // Exponential lerp towards network target position
        remote.currentX += (remote.targetX - remote.currentX) * 0.2;
        remote.currentY += (remote.targetY - remote.currentY) * 0.2;

        // Check line-of-sight sound blocking with obstacles
        const remotePos = { x: remote.currentX, y: remote.currentY };
        const isObstructed = curObstacles.some(obs =>
          obs.soundBlocking && lineIntersectsRect(localPos, remotePos, obs)
        );

        // Inform spatial audio mixer
        spatialAudioMixer.updatePeerSpatial(peerId, localPos, remotePos, isObstructed);
      }

      // 3. Clear and draw Canvas
      drawScene(
        ctx,
        canvas,
        localPos,
        remoteMap,
        officeLayoutRef.current,
        hearingRadiusRef.current,
        isMicMutedRef.current,
        currentUserRef.current
      );

      animationFrameId = requestAnimationFrame(renderLoop);
    };

    animationFrameId = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [officeWidth, officeHeight]);

  // Canvas size and retina DPI handling
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = officeWidth * dpr;
    canvas.height = officeHeight * dpr;
    canvas.style.width = `${officeWidth}px`;
    canvas.style.height = `${officeHeight}px`;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
  }, [officeWidth, officeHeight]);

  return (
    <div className="canvas-viewport-container">
      <div className="canvas-hud-overlay">
        <div className="hud-chip">
          <span>Movement:</span>
          <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>, <kbd>Arrow Keys</kbd>, or <kbd>Click Map</kbd>
        </div>
        <div className="hud-chip">
          <span>Hearing Range:</span>
          <strong>{hearingRadius}px</strong>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        className="office-canvas"
        tabIndex={0}
        onPointerDown={handlePointerDown}
      />
    </div>
  );
}

/**
 * High-performance Canvas Rendering Routine
 */
function drawScene(ctx, canvas, localPos, remoteMap, layout, hearingRadius, isLocalMuted, currentUser) {
  const width = layout?.width || 1400;
  const height = layout?.height || 900;

  // 1. Floor background
  ctx.fillStyle = '#0b0f19';
  ctx.fillRect(0, 0, width, height);

  // Subtle floor grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.lineWidth = 1;
  const gridSize = 40;
  ctx.beginPath();
  for (let x = 0; x < width; x += gridSize) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = 0; y < height; y += gridSize) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();

  // 2. Office Zones / Rooms
  if (layout?.zones) {
    for (const zone of layout.zones) {
      ctx.fillStyle = zone.color || '#1e293b';
      ctx.beginPath();
      ctx.roundRect(zone.x, zone.y, zone.width, zone.height, 12);
      ctx.fill();

      // Zone border
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Zone Name Header
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.font = '600 13px Inter, sans-serif';
      ctx.fillText(zone.name, zone.x + 16, zone.y + 24);
    }
  }

  // 3. Furniture
  if (layout?.furniture) {
    for (const item of layout.furniture) {
      ctx.save();
      if (item.type === 'couch') {
        ctx.fillStyle = '#334155';
        ctx.strokeStyle = '#475569';
        ctx.beginPath();
        ctx.roundRect(item.x, item.y, item.width, item.height, 8);
        ctx.fill();
        ctx.stroke();
      } else if (item.type === 'watercooler') {
        ctx.fillStyle = '#0284c7';
        ctx.beginPath();
        ctx.arc(item.x + item.width / 2, item.y + item.height / 2, item.width / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Desks & Tables
        ctx.fillStyle = '#1e293b';
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(item.x, item.y, item.width, item.height, 6);
        ctx.fill();
        ctx.stroke();

        // Subtle desktop surface detail
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.fillRect(item.x + 6, item.y + 6, item.width - 12, item.height - 12);
      }

      if (item.label) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '500 10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(item.label, item.x + item.width / 2, item.y + item.height / 2 + 4);
      }
      ctx.restore();
    }
  }

  // 4. Acoustic Walls & Partitions
  if (layout?.walls) {
    for (const wall of layout.walls) {
      ctx.save();
      if (wall.soundBlocking) {
        // Translucent acoustic glass / sound baffle wall
        ctx.fillStyle = 'rgba(14, 165, 233, 0.15)';
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 2;
        ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
        ctx.strokeRect(wall.x, wall.y, wall.width, wall.height);

        // Sound barrier hatch lines
        ctx.strokeStyle = 'rgba(14, 165, 233, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const step = 12;
        for (let i = 0; i < Math.max(wall.width, wall.height); i += step) {
          ctx.moveTo(wall.x + i, wall.y);
          ctx.lineTo(wall.x + i, wall.y + wall.height);
        }
        ctx.stroke();
      } else {
        ctx.fillStyle = '#334155';
        ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
      }
      ctx.restore();
    }
  }

  // 5. Proximity Connection Rays & Earshot Indicators
  for (const [peerId, remote] of remoteMap.entries()) {
    const dist = calculateDistance(localPos, { x: remote.currentX, y: remote.currentY });
    if (dist <= hearingRadius) {
      // Draw delicate dynamic earshot ray
      const alpha = Math.max(0.15, 1 - (dist / hearingRadius));
      ctx.save();
      ctx.strokeStyle = `rgba(56, 189, 248, ${alpha.toFixed(2)})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(localPos.x, localPos.y);
      ctx.lineTo(remote.currentX, remote.currentY);
      ctx.stroke();
      ctx.restore();
    }
  }

  // 6. Draw Local User Hearing Radius Aura
  ctx.save();
  // Radial gradient aura
  const grad = ctx.createRadialGradient(
    localPos.x, localPos.y, 10,
    localPos.x, localPos.y, hearingRadius
  );
  grad.addColorStop(0, 'rgba(99, 102, 241, 0.18)');
  grad.addColorStop(0.7, 'rgba(99, 102, 241, 0.06)');
  grad.addColorStop(1, 'rgba(99, 102, 241, 0)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(localPos.x, localPos.y, hearingRadius, 0, Math.PI * 2);
  ctx.fill();

  // Dashed boundary ring
  ctx.strokeStyle = 'rgba(99, 102, 241, 0.45)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 6]);
  ctx.stroke();
  ctx.restore();

  // 7. Draw Remote Avatars
  for (const [peerId, remote] of remoteMap.entries()) {
    const audioLevel = spatialAudioMixer.getPeerAudioLevel(peerId);
    drawAvatar(ctx, {
      x: remote.currentX,
      y: remote.currentY,
      displayName: remote.displayName,
      color: remote.avatarColor,
      isSpeaking: audioLevel > 8,
      isMuted: remote.micMuted,
      isSelf: false
    });
  }

  // 8. Draw Local Avatar
  const localAudioLevel = webRtcService.getLocalAudioLevel ? webRtcService.getLocalAudioLevel() : 0;
  drawAvatar(ctx, {
    x: localPos.x,
    y: localPos.y,
    displayName: currentUser?.displayName ? `${currentUser.displayName} (You)` : 'You',
    color: currentUser?.avatarColor || '#6366f1',
    isSpeaking: localAudioLevel > 8 && !isLocalMuted,
    isMuted: isLocalMuted,
    isSelf: true
  });
}

/**
 * Avatar Drawing Helper with speaking waves and badges
 */
function drawAvatar(ctx, { x, y, displayName, color, isSpeaking, isMuted, isSelf }) {
  ctx.save();

  // Speaking Pulse Wave Rings
  if (isSpeaking) {
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, AVATAR_RADIUS + 7, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Avatar Body Circle
  ctx.fillStyle = color || '#6366f1';
  ctx.beginPath();
  ctx.arc(x, y, AVATAR_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  // Border (Glowing border if self)
  ctx.strokeStyle = isSelf ? '#38bdf8' : 'rgba(255, 255, 255, 0.8)';
  ctx.lineWidth = isSelf ? 3 : 2;
  ctx.stroke();

  // Initial letter
  ctx.fillStyle = 'white';
  ctx.font = 'bold 13px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const initial = displayName ? displayName[0].toUpperCase() : 'U';
  ctx.fillText(initial, x, y);

  // Mute badge in bottom right corner
  if (isMuted) {
    ctx.fillStyle = '#f43f5e';
    ctx.beginPath();
    ctx.arc(x + 14, y + 14, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = 'white';
    ctx.font = 'bold 9px Inter, sans-serif';
    ctx.fillText('✕', x + 14, y + 14);
  }

  // Name pill label above avatar
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  const tagWidth = Math.max(50, displayName.length * 7.5 + 16);
  ctx.beginPath();
  ctx.roundRect(x - tagWidth / 2, y - AVATAR_RADIUS - 22, tagWidth, 18, 9);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = isSelf ? '#38bdf8' : '#f1f5f9';
  ctx.font = `${isSelf ? '600' : '500'} 11px Inter, sans-serif`;
  ctx.fillText(displayName, x, y - AVATAR_RADIUS - 12);

  ctx.restore();
}
