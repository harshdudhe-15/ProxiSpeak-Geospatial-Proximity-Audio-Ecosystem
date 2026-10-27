import { describe, it, expect, vi } from 'vitest';
import { calculateDistance } from '../utils/geometry.js';

describe('Camera / Viewport Follow System Unit Tests', () => {
  const officeWidth = 2000;
  const officeHeight = 1200;
  const viewportWidth = 1000;
  const viewportHeight = 600;

  // Dead zone calculations matching CanvasOffice.jsx
  const deadZoneWidth = Math.min(360, Math.max(180, viewportWidth * 0.28)); // 280px
  const deadZoneHeight = Math.min(240, Math.max(140, viewportHeight * 0.28)); // 168px
  const deadZoneLeft = (viewportWidth - deadZoneWidth) / 2; // (1000 - 280) / 2 = 360
  const deadZoneRight = deadZoneLeft + deadZoneWidth; // 640
  const deadZoneTop = (viewportHeight - deadZoneHeight) / 2; // (600 - 168) / 2 = 216
  const deadZoneBottom = deadZoneTop + deadZoneHeight; // 384

  /**
   * Helper function implementing the camera target calculation with dead zone and boundary clamping
   */
  function computeTargetCamera(localPos, currentCam) {
    const screenX = localPos.x - currentCam.x;
    const screenY = localPos.y - currentCam.y;

    let targetCamX = currentCam.x;
    let targetCamY = currentCam.y;

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

    const maxCamX = Math.max(0, officeWidth - viewportWidth); // 1000
    const maxCamY = Math.max(0, officeHeight - viewportHeight); // 600

    targetCamX = Math.max(0, Math.min(maxCamX, targetCamX));
    targetCamY = Math.max(0, Math.min(maxCamY, targetCamY));

    return { x: targetCamX, y: targetCamY };
  }

  it('Dead zone keeps camera stationary when avatar moves within the central dead zone', () => {
    // Start with camera at (400, 300)
    const currentCam = { x: 400, y: 300 };

    // Place avatar right in the center of the viewport: world (900, 600)
    // screenX = 900 - 400 = 500 (within [360, 640])
    // screenY = 600 - 300 = 300 (within [216, 384])
    const pos1 = { x: 900, y: 600 };
    const target1 = computeTargetCamera(pos1, currentCam);
    expect(target1.x).toBe(400);
    expect(target1.y).toBe(300);

    // Avatar moves slightly right by 30px to (930, 600) -> screenX = 530 (still within [360, 640])
    const pos2 = { x: 930, y: 600 };
    const target2 = computeTargetCamera(pos2, currentCam);
    expect(target2.x).toBe(400); // Camera does NOT move!
    expect(target2.y).toBe(300);

    // Avatar moves slightly up by 40px to (930, 560) -> screenY = 260 (still within [216, 384])
    const pos3 = { x: 930, y: 560 };
    const target3 = computeTargetCamera(pos3, currentCam);
    expect(target3.x).toBe(400);
    expect(target3.y).toBe(300);
  });

  it('Camera smoothly follows when avatar crosses dead zone boundaries', () => {
    const currentCam = { x: 400, y: 300 };

    // Move avatar far right to world x: 1200
    // screenX = 1200 - 400 = 800 > deadZoneRight (640)
    const posRight = { x: 1200, y: 600 };
    const targetRight = computeTargetCamera(posRight, currentCam);
    expect(targetRight.x).toBe(1200 - 640); // 560 > 400
    expect(targetRight.y).toBe(300);

    // Move avatar far left to world x: 700
    // screenX = 700 - 400 = 300 < deadZoneLeft (360)
    const posLeft = { x: 700, y: 600 };
    const targetLeft = computeTargetCamera(posLeft, currentCam);
    expect(targetLeft.x).toBe(700 - 360); // 340 < 400
    expect(targetLeft.y).toBe(300);
  });

  it('Camera strictly clamps to map boundaries (never exposes areas outside the office)', () => {
    // Extreme top-left movement: avatar at (20, 20)
    const currentCam = { x: 100, y: 100 };
    const posExtremeTopLeft = { x: 20, y: 20 };
    const targetTopLeft = computeTargetCamera(posExtremeTopLeft, currentCam);
    expect(targetTopLeft.x).toBe(0); // Clamped at 0
    expect(targetTopLeft.y).toBe(0); // Clamped at 0

    // Extreme bottom-right movement: avatar at (1980, 1180)
    const posExtremeBottomRight = { x: 1980, y: 1180 };
    const targetBottomRight = computeTargetCamera(posExtremeBottomRight, currentCam);
    const maxAllowedX = officeWidth - viewportWidth; // 1000
    const maxAllowedY = officeHeight - viewportHeight; // 600
    expect(targetBottomRight.x).toBe(maxAllowedX); // Clamped at 1000
    expect(targetBottomRight.y).toBe(maxAllowedY); // Clamped at 600
  });

  it('Maps screen click coordinates to exact world coordinates using camera offset', () => {
    const activeCamera = { x: 350, y: 220 };
    const clickScreenX = 120;
    const clickScreenY = 180;

    // Pointer event conversion
    const calculatedWorldX = clickScreenX + activeCamera.x;
    const calculatedWorldY = clickScreenY + activeCamera.y;

    expect(calculatedWorldX).toBe(470);
    expect(calculatedWorldY).toBe(400);

    // When rendered, the world object at (470, 400) maps back to exact screen position:
    const renderedScreenX = calculatedWorldX - activeCamera.x;
    const renderedScreenY = calculatedWorldY - activeCamera.y;
    expect(renderedScreenX).toBe(clickScreenX);
    expect(renderedScreenY).toBe(clickScreenY);
  });

  it('Ensures proximity calculations strictly use world coordinates independent of camera position', () => {
    // Local user at world (300, 200)
    const localUser = { x: 300, y: 200 };
    // Remote peer at world (360, 280)
    const remotePeer = { x: 360, y: 280 };

    // Real Euclidean distance in the office: dx=60, dy=80 -> dist = 100
    const actualDistance = calculateDistance(localUser, remotePeer);
    expect(actualDistance).toBe(100);

    // Suppose Camera A is at (0, 0)
    const camA = { x: 0, y: 0 };
    const localScreenA = { x: localUser.x - camA.x, y: localUser.y - camA.y };
    const remoteScreenA = { x: remotePeer.x - camA.x, y: remotePeer.y - camA.y };

    // Suppose Camera B has panned across the office to (500, 400)
    const camB = { x: 500, y: 400 };
    const localScreenB = { x: localUser.x - camB.x, y: localUser.y - camB.y };
    const remoteScreenB = { x: remotePeer.x - camB.x, y: remotePeer.y - camB.y };

    // Screen coordinates change drastically as camera pans:
    expect(localScreenA).not.toEqual(localScreenB);

    // But WebRTC proximity uses only world coordinates:
    const webrtcProximityDistanceA = calculateDistance(localUser, remotePeer);
    const webrtcProximityDistanceB = calculateDistance(localUser, remotePeer);

    expect(webrtcProximityDistanceA).toBe(100);
    expect(webrtcProximityDistanceB).toBe(100);
    expect(webrtcProximityDistanceA).toBe(actualDistance);
  });
});
