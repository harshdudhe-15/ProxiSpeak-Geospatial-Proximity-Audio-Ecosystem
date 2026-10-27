/**
 * ProxiSpeak High-Performance Virtual Office Canvas Renderer
 * Renders realistic, detailed, colorful, and lightweight 2D architectural office maps.
 */

import { calculateDistance } from './geometry.js';

export const AVATAR_RADIUS = 20;

/**
 * Checks if a bounding box overlaps with the visible viewport
 */
function isInViewport(x, y, width, height, cameraX, cameraY, viewportW, viewportH, padding = 80) {
  return (
    x + width >= cameraX - padding &&
    x <= cameraX + viewportW + padding &&
    y + height >= cameraY - padding &&
    y <= cameraY + viewportH + padding
  );
}

/**
 * Main Scene Drawing Routine
 */
export function drawScene(
  ctx,
  {
    localPos,
    remoteMap,
    layout,
    hearingRadius,
    isLocalMuted,
    currentUser,
    localAudioLevel = 0,
    cameraX = 0,
    cameraY = 0,
    viewportWidth = 1400,
    viewportHeight = 900
  }
) {
  const width = layout?.width || 2000;
  const height = layout?.height || 1200;

  // 1. Foundation Base Floor
  ctx.fillStyle = '#0a0e17';
  ctx.fillRect(0, 0, width, height);

  // 2. Zone Floors & Architectural Flooring Patterns
  const zones = layout?.zones || [];
  for (const zone of zones) {
    if (!isInViewport(zone.x, zone.y, zone.width, zone.height, cameraX, cameraY, viewportWidth, viewportHeight)) {
      continue;
    }
    drawZoneFloor(ctx, zone);
  }

  // 3. Central Galleria Walkways & Floor Medallion
  drawCorridorsAndFloorAccents(ctx, width, height, cameraX, cameraY, viewportWidth, viewportHeight);

  // 4. Room Boundary Walls & Partitions (Drawn before furniture for proper occlusion)
  const walls = layout?.walls || [];
  for (const wall of walls) {
    if (!isInViewport(wall.x, wall.y, wall.width, wall.height, cameraX, cameraY, viewportWidth, viewportHeight)) {
      continue;
    }
    drawWall(ctx, wall);
  }

  // 5. Furniture & Realistic Office Objects
  const furniture = layout?.furniture || [];
  for (const item of furniture) {
    if (!isInViewport(item.x, item.y, item.width, item.height, cameraX, cameraY, viewportWidth, viewportHeight)) {
      continue;
    }
    drawFurniture(ctx, item);
  }

  // 6. Proximity Audio Connection Rays between users within earshot
  for (const [peerId, remote] of remoteMap.entries()) {
    const dist = calculateDistance(localPos, { x: remote.currentX, y: remote.currentY });
    if (dist <= hearingRadius) {
      drawProximityRay(ctx, localPos, { x: remote.currentX, y: remote.currentY }, dist, hearingRadius, remote.isObstructed);
    }
  }

  // 7. Local User Hearing Radius Aura
  drawHearingRadiusAura(ctx, localPos, hearingRadius);

  // 8. Remote Avatars
  for (const [peerId, remote] of remoteMap.entries()) {
    drawAvatar(ctx, {
      x: remote.currentX,
      y: remote.currentY,
      displayName: remote.displayName,
      color: remote.avatarColor,
      isSpeaking: Boolean(remote.isSpeaking),
      isMuted: Boolean(remote.micMuted),
      isSelf: false
    });
  }

  // 9. Local Avatar ("YOU")
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
 * Draws zone-specific floor textures (parquet, carpet, tiles, terrazzo)
 */
function drawZoneFloor(ctx, zone) {
  ctx.save();
  const radius = 14;

  // Soft ambient drop shadow around zone perimeter
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 4;

  // Zone floor fill
  ctx.fillStyle = zone.color || '#111827';
  ctx.beginPath();
  ctx.roundRect(zone.x, zone.y, zone.width, zone.height, radius);
  ctx.fill();

  ctx.shadowColor = 'transparent';

  // Zone floor pattern details
  if (zone.id.includes('conf') || zone.id.includes('boardroom')) {
    // Executive Boardroom: Warm mahogany wood parquet pattern
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
    ctx.lineWidth = 1;
    const plankHeight = 32;
    for (let y = zone.y + 10; y < zone.y + zone.height - 10; y += plankHeight) {
      ctx.beginPath();
      ctx.moveTo(zone.x + 8, y);
      ctx.lineTo(zone.x + zone.width - 8, y);
      ctx.stroke();
    }
    // Brass perimeter accent trim
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(zone.x + 8, zone.y + 8, zone.width - 16, zone.height - 16, 10);
    ctx.stroke();
  } else if (zone.id.includes('break') || zone.id.includes('cafe')) {
    // Cafeteria / Kitchen: Sleek ceramic tile grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
    ctx.lineWidth = 1;
    const tileSize = 36;
    ctx.beginPath();
    for (let x = zone.x; x < zone.x + zone.width; x += tileSize) {
      ctx.moveTo(x, zone.y);
      ctx.lineTo(x, zone.y + zone.height);
    }
    for (let y = zone.y; y < zone.y + zone.height; y += tileSize) {
      ctx.moveTo(zone.x, y);
      ctx.lineTo(zone.x + zone.width, y);
    }
    ctx.stroke();
  } else if (zone.id.includes('engineering') || zone.id.includes('office')) {
    // Engineering Pods: Contemporary acoustic woven carpet tile texture
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.03)';
    ctx.lineWidth = 1;
    const carpetTile = 48;
    ctx.beginPath();
    for (let x = zone.x; x < zone.x + zone.width; x += carpetTile) {
      ctx.moveTo(x, zone.y);
      ctx.lineTo(x, zone.y + zone.height);
    }
    for (let y = zone.y; y < zone.y + zone.height; y += carpetTile) {
      ctx.moveTo(zone.x, y);
      ctx.lineTo(zone.x + zone.width, y);
    }
    ctx.stroke();
  } else {
    // Welcome Reception / Lounge: Subtle modern terrazzo
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.lineWidth = 1;
    const step = 40;
    ctx.beginPath();
    for (let x = zone.x; x < zone.x + zone.width; x += step) {
      ctx.moveTo(x, zone.y);
      ctx.lineTo(x, zone.y + zone.height);
    }
    ctx.stroke();
  }

  // Zone border stroke
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(zone.x, zone.y, zone.width, zone.height, radius);
  ctx.stroke();

  // Zone Header Pill Tag
  const headerText = zone.name.toUpperCase();
  ctx.font = '600 11px Inter, system-ui, sans-serif';
  const textWidth = ctx.measureText(headerText).width;
  const pillW = textWidth + 24;
  const pillH = 22;

  // Header background badge
  ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(zone.x + 16, zone.y + 14, pillW, pillH, 6);
  ctx.fill();
  ctx.stroke();

  // Header dot indicator
  ctx.fillStyle = zone.id.includes('conf') ? '#f59e0b' : zone.id.includes('break') ? '#10b981' : '#38bdf8';
  ctx.beginPath();
  ctx.arc(zone.x + 26, zone.y + 25, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // Header text
  ctx.fillStyle = 'rgba(241, 245, 249, 0.85)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(headerText, zone.x + 35, zone.y + 25);

  ctx.restore();
}

/**
 * Draws connecting corridors, directional walkway guidelines, and central branding emblem
 */
function drawCorridorsAndFloorAccents(ctx, width, height, cameraX, cameraY, viewportW, viewportH) {
  ctx.save();

  // Subtle global floor grid dots
  ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
  const gridSpacing = 60;
  const startX = Math.floor(Math.max(0, cameraX - 80) / gridSpacing) * gridSpacing;
  const endX = Math.min(width, cameraX + viewportW + 80);
  const startY = Math.floor(Math.max(0, cameraY - 80) / gridSpacing) * gridSpacing;
  const endY = Math.min(height, cameraY + viewportH + 80);

  for (let x = startX; x <= endX; x += gridSpacing) {
    for (let y = startY; y <= endY; y += gridSpacing) {
      ctx.beginPath();
      ctx.arc(x, y, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Central Atrium Compass Medallion
  const emblemX = 610;
  const emblemY = 320;
  if (isInViewport(emblemX - 100, emblemY - 100, 200, 200, cameraX, cameraY, viewportW, viewportH)) {
    // Outer compass ring
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(emblemX, emblemY, 64, 0, Math.PI * 2);
    ctx.stroke();

    // Inner ring
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.15)';
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.arc(emblemX, emblemY, 48, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // ProxiSpeak Compass Star / Brand Monogram
    ctx.fillStyle = 'rgba(56, 189, 248, 0.18)';
    ctx.beginPath();
    ctx.arc(emblemX, emblemY, 20, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PXS', emblemX, emblemY);

    // Micro lettering
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.font = '600 8px Inter, sans-serif';
    ctx.fillText('PROXISPEAK HEADQUARTERS', emblemX, emblemY + 80);
  }

  ctx.restore();
}

/**
 * Draws solid perimeter walls and acoustic glass partitions with reflections
 */
function drawWall(ctx, wall) {
  ctx.save();

  if (wall.soundBlocking) {
    // Acoustic Glass Partition
    // Drop shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(wall.x + 2, wall.y + 2, wall.width, wall.height);

    // Translucent glass fill
    ctx.fillStyle = 'rgba(14, 165, 233, 0.14)';
    ctx.fillRect(wall.x, wall.y, wall.width, wall.height);

    // Glass aluminum border frame
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 2;
    ctx.strokeRect(wall.x, wall.y, wall.width, wall.height);

    // Acoustic soundproof hatch pattern
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const isHorizontal = wall.width > wall.height;
    if (isHorizontal) {
      for (let i = 8; i < wall.width - 4; i += 16) {
        ctx.moveTo(wall.x + i, wall.y);
        ctx.lineTo(wall.x + i, wall.y + wall.height);
      }
    } else {
      for (let i = 8; i < wall.height - 4; i += 16) {
        ctx.moveTo(wall.x, wall.y + i);
        ctx.lineTo(wall.x + wall.width, wall.y + i);
      }
    }
    ctx.stroke();

    // Soundproofing badge
    if (wall.width >= 120 || wall.height >= 120) {
      const midX = wall.x + wall.width / 2;
      const midY = wall.y + wall.height / 2;
      ctx.fillStyle = 'rgba(14, 165, 233, 0.8)';
      ctx.beginPath();
      ctx.arc(midX, midY, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Solid Architectural Wall
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(wall.x + 3, wall.y + 3, wall.width, wall.height);

    // Core wall
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(wall.x, wall.y, wall.width, wall.height);

    // Highlight top edge for 3D architectural depth
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(wall.x, wall.y, wall.width, wall.height);
  }

  ctx.restore();
}

/**
 * Draws rich office furniture: workstations with dual monitors & chairs,
 * conference tables, reception desk, coffee bar, plants, sofas.
 */
function drawFurniture(ctx, item) {
  ctx.save();

  // Contact drop shadow beneath furniture
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.roundRect(item.x + 3, item.y + 4, item.width, item.height, 6);
  ctx.fill();

  switch (item.type) {
    case 'reception-desk':
      drawReceptionDesk(ctx, item);
      break;

    case 'desk':
    case 'workstation':
      drawWorkstationPod(ctx, item);
      break;

    case 'conf-table':
      drawBoardroomTable(ctx, item);
      break;

    case 'couch':
      drawModernCouch(ctx, item);
      break;

    case 'dining-table':
      drawDiningTable(ctx, item);
      break;

    case 'bar':
      drawEspressoBar(ctx, item);
      break;

    case 'watercooler':
      drawWaterCooler(ctx, item);
      break;

    case 'plant':
      drawPottedPlant(ctx, item);
      break;

    case 'screen':
      drawWallDisplay(ctx, item);
      break;

    case 'whiteboard':
      drawWhiteboard(ctx, item);
      break;

    case 'pingpong':
      drawPingPongTable(ctx, item);
      break;

    case 'bookshelf':
      drawBookshelf(ctx, item);
      break;

    default:
      // Generic sleek table
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(item.x, item.y, item.width, item.height, 6);
      ctx.fill();
      ctx.stroke();

      if (item.label) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = '500 10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.label, item.x + item.width / 2, item.y + item.height / 2);
      }
      break;
  }

  ctx.restore();
}

/**
 * Modern Curved Reception Desk with Warm Oak Panel & Illuminated LED Trim
 */
function drawReceptionDesk(ctx, item) {
  const { x, y, width, height } = item;

  // Base desk body with warm timber tone
  ctx.fillStyle = '#1e2433';
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 8);
  ctx.fill();
  ctx.stroke();

  // Illuminated front LED accent strip
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x + 12, y + height - 4);
  ctx.lineTo(x + width - 12, y + height - 4);
  ctx.stroke();

  // Reception terminal monitor
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(x + width / 2 - 20, y + 10, 40, 14);
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(x + width / 2 - 18, y + 12, 36, 10);

  // Label
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 11px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PROXISPEAK CONCIERGE', x + width / 2, y + height / 2 + 6);
}

/**
 * Engineering Workstation with Dual Glowing Monitors, Keyboard & Ergonomic Chair
 */
function drawWorkstationPod(ctx, item) {
  const { x, y, width, height, label } = item;

  // Main Desk Top
  ctx.fillStyle = '#1e293b';
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 6);
  ctx.fill();
  ctx.stroke();

  // Desk Mat
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.roundRect(x + 12, y + 10, width - 24, height - 20, 4);
  ctx.fill();

  // Dual Monitors
  const monW = Math.min(48, (width - 40) / 2);
  const monH = 10;
  const monY = y + 14;

  // Left Monitor (IDE Code Lines)
  const leftMonX = x + width / 2 - monW - 6;
  ctx.fillStyle = '#020617';
  ctx.fillRect(leftMonX, monY, monW, monH);
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1;
  ctx.strokeRect(leftMonX, monY, monW, monH);

  // Syntax highlighted code lines
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(leftMonX + 4, monY + 3, 14, 1.5);
  ctx.fillStyle = '#f43f5e';
  ctx.fillRect(leftMonX + 20, monY + 3, 10, 1.5);
  ctx.fillStyle = '#10b981';
  ctx.fillRect(leftMonX + 4, monY + 6, 22, 1.5);

  // Right Monitor (Telemetry / Analytics Chart)
  const rightMonX = x + width / 2 + 6;
  ctx.fillStyle = '#020617';
  ctx.fillRect(rightMonX, monY, monW, monH);
  ctx.strokeRect(rightMonX, monY, monW, monH);

  // Chart line
  ctx.strokeStyle = '#a855f7';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(rightMonX + 4, monY + 7);
  ctx.lineTo(rightMonX + 14, monY + 4);
  ctx.lineTo(rightMonX + 24, monY + 7);
  ctx.lineTo(rightMonX + 34, monY + 3);
  ctx.stroke();

  // Keyboard & Mouse
  const kbX = x + width / 2 - 20;
  const kbY = y + height - 26;
  ctx.fillStyle = '#334155';
  ctx.fillRect(kbX, kbY, 32, 9);
  // Mouse
  ctx.fillStyle = '#475569';
  ctx.beginPath();
  ctx.roundRect(kbX + 36, kbY + 1, 6, 8, 2);
  ctx.fill();

  // Coffee Mug on desk corner
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.arc(x + width - 18, y + height - 20, 4, 0, Math.PI * 2);
  ctx.fill();

  // Ergonomic Mesh Office Chair (tucked at desk)
  const chairX = x + width / 2;
  const chairY = y + height + 10;
  ctx.fillStyle = '#0f172a';
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(chairX - 16, chairY - 8, 32, 16, 6);
  ctx.fill();
  ctx.stroke();

  // Chair Backrest Curve
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(chairX, chairY + 4, 14, Math.PI * 0.2, Math.PI * 0.8);
  ctx.stroke();

  // Pod Label
  if (label) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.font = '600 10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + width / 2, y + height / 2 + 1);
  }
}

/**
 * Executive Boardroom Conference Table with Inlay & Leather Boardroom Chairs
 */
function drawBoardroomTable(ctx, item) {
  const { x, y, width, height, label } = item;

  // Solid Walnut Boardroom Table Top
  ctx.fillStyle = '#261b17';
  ctx.strokeStyle = '#52382e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 16);
  ctx.fill();
  ctx.stroke();

  // Frosted Glass Center Connectivity Trough
  ctx.fillStyle = 'rgba(14, 165, 233, 0.15)';
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x + 24, y + 30, width - 48, height - 60, 8);
  ctx.fill();
  ctx.stroke();

  // Conference Speakerphone Pod (Polycom in table center)
  const midX = x + width / 2;
  const midY = y + height / 2;
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(midX, midY, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(midX, midY, 14, 0, Math.PI * 2);
  ctx.stroke();

  // Surrounding Executive Chairs (Left & Right sides)
  const chairSpacing = 48;
  const chairCount = Math.floor((height - 40) / chairSpacing);
  for (let i = 0; i < chairCount; i++) {
    const chairY = y + 36 + i * chairSpacing;
    // Left chair
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x - 14, chairY - 10, 10, 20);
    // Right chair
    ctx.fillRect(x + width + 4, chairY - 10, 10, 20);
  }

  // Label
  if (label) {
    ctx.fillStyle = '#f59e0b';
    ctx.font = '600 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, midX, y + 20);
  }
}

/**
 * Modern Plush Sofa with Cushions
 */
function drawModernCouch(ctx, item) {
  const { x, y, width, height, label } = item;

  // Main sofa seat
  ctx.fillStyle = '#293548';
  ctx.strokeStyle = '#3b4a63';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 8);
  ctx.fill();
  ctx.stroke();

  // Cushion division lines
  const isHorizontal = width > height;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.lineWidth = 1.5;
  if (isHorizontal) {
    const cushionW = width / 3;
    ctx.beginPath();
    ctx.moveTo(x + cushionW, y + 4);
    ctx.lineTo(x + cushionW, y + height - 4);
    ctx.moveTo(x + cushionW * 2, y + 4);
    ctx.lineTo(x + cushionW * 2, y + height - 4);
    ctx.stroke();
  }

  // Accent throw pillows
  ctx.fillStyle = '#6366f1';
  ctx.beginPath();
  ctx.roundRect(x + 6, y + 6, 14, 12, 3);
  ctx.fill();

  ctx.fillStyle = '#06b6d4';
  ctx.beginPath();
  ctx.roundRect(x + width - 20, y + 6, 14, 12, 3);
  ctx.fill();

  if (label) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '500 10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + width / 2, y + height / 2);
  }
}

/**
 * Dining / Cafeteria Table
 */
function drawDiningTable(ctx, item) {
  const { x, y, width, height, label } = item;

  ctx.fillStyle = '#1e293b';
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 8);
  ctx.fill();
  ctx.stroke();

  // 4 Chairs around dining table
  ctx.fillStyle = '#334155';
  ctx.fillRect(x + 16, y - 8, 24, 6);
  ctx.fillRect(x + width - 40, y - 8, 24, 6);
  ctx.fillRect(x + 16, y + height + 2, 24, 6);
  ctx.fillRect(x + width - 40, y + height + 2, 24, 6);

  if (label) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + width / 2, y + height / 2);
  }
}

/**
 * Barista Espresso Bar & Counter
 */
function drawEspressoBar(ctx, item) {
  const { x, y, width, height, label } = item;

  // Granite bar counter
  ctx.fillStyle = '#111827';
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 6);
  ctx.fill();
  ctx.stroke();

  // Chrome Espresso Machine
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(x + 20, y + 10, 36, 24);
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(x + 24, y + 14, 28, 8);

  // Tiny Coffee Cups
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x + 70, y + 20, 3.5, 0, Math.PI * 2);
  ctx.arc(x + 82, y + 20, 3.5, 0, Math.PI * 2);
  ctx.fill();

  if (label) {
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + width / 2 + 20, y + height / 2);
  }
}

/**
 * Water Cooler with Bubbling Blue Tank
 */
function drawWaterCooler(ctx, item) {
  const { x, y, width, height } = item;
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const radius = width / 2;

  // White base dispenser
  ctx.fillStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();

  // Blue water bottle top
  ctx.fillStyle = '#0284c7';
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius - 6, 0, Math.PI * 2);
  ctx.fill();

  // Bubble highlight
  ctx.fillStyle = '#38bdf8';
  ctx.beginPath();
  ctx.arc(centerX - 3, centerY - 3, 3, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Potted Fiddle Leaf Fig / Monstera Plant
 */
function drawPottedPlant(ctx, item) {
  const { x, y, width, height } = item;
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const potRadius = Math.min(width, height) / 2.6;

  // Ceramic white pot
  ctx.fillStyle = '#f1f5f9';
  ctx.beginPath();
  ctx.arc(centerX, centerY, potRadius, 0, Math.PI * 2);
  ctx.fill();

  // Soil
  ctx.fillStyle = '#3f2e21';
  ctx.beginPath();
  ctx.arc(centerX, centerY, potRadius - 3, 0, Math.PI * 2);
  ctx.fill();

  // Lush green leaves radiating outward
  ctx.fillStyle = '#10b981';
  const leafCount = 6;
  for (let i = 0; i < leafCount; i++) {
    const angle = (i * Math.PI * 2) / leafCount;
    const leafX = centerX + Math.cos(angle) * (potRadius + 5);
    const leafY = centerY + Math.sin(angle) * (potRadius + 5);
    ctx.beginPath();
    ctx.arc(leafX, leafY, potRadius * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Inner leaf highlights
  ctx.fillStyle = '#34d399';
  ctx.beginPath();
  ctx.arc(centerX, centerY, 5, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Wall-Mounted 4K Presentation Display
 */
function drawWallDisplay(ctx, item) {
  const { x, y, width, height, label } = item;

  // Screen frame
  ctx.fillStyle = '#020617';
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 4);
  ctx.fill();
  ctx.stroke();

  // Slide content simulation
  ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
  ctx.fillRect(x + 4, y + 4, width - 8, height - 8);

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 9px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label || 'PROXISPEAK PRESENTATION', x + width / 2, y + height / 2);
}

/**
 * Glass Collaboration Whiteboard with Diagrams
 */
function drawWhiteboard(ctx, item) {
  const { x, y, width, height } = item;

  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 4);
  ctx.fill();
  ctx.stroke();

  // Colored sticky notes simulation
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(x + 4, y + 10, 8, 8);
  ctx.fillStyle = '#10b981';
  ctx.fillRect(x + 4, y + 26, 8, 8);
  ctx.fillStyle = '#ec4899';
  ctx.fillRect(x + 4, y + 42, 8, 8);
}

/**
 * Recreation Game Table (Ping Pong / Foosball)
 */
function drawPingPongTable(ctx, item) {
  const { x, y, width, height, label } = item;

  // Green table surface
  ctx.fillStyle = '#065f46';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 4);
  ctx.fill();
  ctx.stroke();

  // Center net line
  const midX = x + width / 2;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(midX, y);
  ctx.lineTo(midX, y + height);
  ctx.stroke();

  if (label) {
    ctx.fillStyle = '#a7f3d0';
    ctx.font = '600 10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + width / 4, y + height / 2);
  }
}

/**
 * Design Library Bookshelf
 */
function drawBookshelf(ctx, item) {
  const { x, y, width, height } = item;

  ctx.fillStyle = '#3e2723';
  ctx.fillRect(x, y, width, height);

  // Books row
  const colors = ['#f43f5e', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];
  const count = Math.floor(height / 14);
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(x + 4, y + 6 + i * 14, width - 8, 10);
  }
}

/**
 * Draws the proximity ray between two users in earshot
 */
function drawProximityRay(ctx, localPos, remotePos, dist, hearingRadius, isObstructed) {
  const alpha = Math.max(0.18, 1 - dist / hearingRadius);

  ctx.save();
  if (isObstructed) {
    // Acoustic barrier obstruction: dashed amber line
    ctx.strokeStyle = `rgba(245, 158, 11, ${alpha.toFixed(2)})`;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 6]);
  } else {
    // Clear audio connection: cyan pulse line
    ctx.strokeStyle = `rgba(56, 189, 248, ${alpha.toFixed(2)})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
  }

  ctx.beginPath();
  ctx.moveTo(localPos.x, localPos.y);
  ctx.lineTo(remotePos.x, remotePos.y);
  ctx.stroke();

  // Midpoint audio connection icon / blip
  const midX = (localPos.x + remotePos.x) / 2;
  const midY = (localPos.y + remotePos.y) / 2;
  ctx.fillStyle = isObstructed ? 'rgba(245, 158, 11, 0.7)' : 'rgba(56, 189, 248, 0.7)';
  ctx.beginPath();
  ctx.arc(midX, midY, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Draws the local user's hearing radius aura with soft gradient and dashed ring
 */
function drawHearingRadiusAura(ctx, localPos, hearingRadius) {
  ctx.save();

  // Radial gradient aura
  const grad = ctx.createRadialGradient(
    localPos.x,
    localPos.y,
    15,
    localPos.x,
    localPos.y,
    hearingRadius
  );
  grad.addColorStop(0, 'rgba(99, 102, 241, 0.16)');
  grad.addColorStop(0.7, 'rgba(99, 102, 241, 0.05)');
  grad.addColorStop(1, 'rgba(99, 102, 241, 0)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(localPos.x, localPos.y, hearingRadius, 0, Math.PI * 2);
  ctx.fill();

  // Dashed outer boundary ring
  ctx.strokeStyle = 'rgba(99, 102, 241, 0.45)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 6]);
  ctx.stroke();

  ctx.restore();
}

/**
 * Avatar Drawing with contact shadows, speaking pulse waves, and name tags
 */
export function drawAvatar(ctx, { x, y, displayName, color, isSpeaking, isMuted, isSelf }) {
  ctx.save();

  // 1. Soft contact shadow beneath avatar
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.arc(x, y + 4, AVATAR_RADIUS + 2, 0, Math.PI * 2);
  ctx.fill();

  // 2. Speaking Pulse Waves (Animated concentric green ripple)
  if (isSpeaking) {
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.85)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, AVATAR_RADIUS + 6, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(16, 185, 129, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, AVATAR_RADIUS + 11, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 3. Avatar Body Circle
  ctx.fillStyle = color || '#6366f1';
  ctx.beginPath();
  ctx.arc(x, y, AVATAR_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  // 4. Border (Glowing cyan border if self, crisp border if others)
  ctx.strokeStyle = isSelf ? '#38bdf8' : 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = isSelf ? 3 : 2;
  ctx.stroke();

  // 5. User Initial
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const initial = displayName ? displayName[0].toUpperCase() : 'U';
  ctx.fillText(initial, x, y);

  // 6. Microphone Muted Badge in lower corner
  if (isMuted) {
    ctx.fillStyle = '#f43f5e';
    ctx.beginPath();
    ctx.arc(x + 14, y + 14, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px Inter, sans-serif';
    ctx.fillText('✕', x + 14, y + 14);
  }

  // 7. Glassmorphic Name Pill Label
  const nameText = displayName || 'User';
  ctx.font = `${isSelf ? '600' : '500'} 11px Inter, system-ui, sans-serif`;
  const textW = ctx.measureText(nameText).width;
  const tagWidth = Math.max(54, textW + 18);
  const tagHeight = 20;
  const tagY = y - AVATAR_RADIUS - 24;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.strokeStyle = isSelf ? 'rgba(56, 189, 248, 0.5)' : 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x - tagWidth / 2, tagY, tagWidth, tagHeight, 10);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = isSelf ? '#38bdf8' : '#f1f5f9';
  ctx.fillText(nameText, x, tagY + tagHeight / 2);

  // 8. "YOU" Indicator Arrow on top if self
  if (isSelf) {
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(x, tagY - 2);
    ctx.lineTo(x - 5, tagY - 7);
    ctx.lineTo(x + 5, tagY - 7);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}
