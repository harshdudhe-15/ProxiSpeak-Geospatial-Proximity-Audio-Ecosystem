import { SOCKET_EVENTS } from '../config/constants.js';
import { proximityEngine } from '../services/proximityEngine.js';
import { CollisionService } from '../services/collisionService.js';
import { GeospatialService } from '../services/geospatialService.js';
import { validateCoordinates, validateSignalingPayload } from '../middleware/validation.js';
import { getIceServers } from '../config/rtcConfig.js';
import { Office } from '../models/Office.js';

/**
 * Socket.IO Manager: Handles real-time signaling, office rooms,
 * motion synchronization, and proximity events.
 */
export function initializeSocketManager(io) {
  // userId -> socketId mapping for direct WebRTC signaling routing
  const userSocketMap = new Map();

  // Rate limiting / snapshot throttling: userId -> lastSnapshotTimestamp
  const lastSnapshotMap = new Map();

  // officeId -> { width, height }
  const officeDimensionsMap = new Map();

  io.on('connection', (socket) => {
    // console.log(`[Socket] New connection: ${socket.id}`);

    /**
     * office:join
     */
    socket.on(SOCKET_EVENTS.OFFICE_JOIN, async (data) => {
      try {
        const { officeId, userId, displayName, avatarColor, avatarIcon, x, y } = data || {};

        if (!officeId || !userId || !displayName) {
          return socket.emit(SOCKET_EVENTS.SERVER_ERROR, {
            code: 'INVALID_JOIN_PAYLOAD',
            message: 'officeId, userId, and displayName are required.'
          });
        }

        // Attach verified identity to socket session
        socket.data.userId = String(userId);
        socket.data.officeId = String(officeId);
        socket.data.displayName = String(displayName).trim();
        socket.data.avatarColor = avatarColor || '#6366f1';
        socket.data.avatarIcon = avatarIcon || 'user';
        socket.data.micMuted = false;

        userSocketMap.set(socket.data.userId, socket.id);

        const roomName = `office:${socket.data.officeId}`;
        await socket.join(roomName);

        // Fetch office layout from DB or use fallback
        let office = null;
        try {
          office = await Office.findById(officeId).lean();
        } catch {
          // In case officeId is custom or non-ObjectId
          office = await Office.findOne({ code: officeId }).lean();
        }

        const officeWidth = office?.width || 1400;
        const officeHeight = office?.height || 900;
        const obstacles = [
          ...(office?.walls || []),
          ...(office?.furniture || [])
        ];

        // Store obstacles in proximity engine for sound blocking checks
        proximityEngine.setOfficeObstacles(socket.data.officeId, obstacles);
        officeDimensionsMap.set(socket.data.officeId, { width: officeWidth, height: officeHeight });

        // Clamped initial coordinates
        const initialPos = CollisionService.clampToBounds(
          { x: Number(x) || 120, y: Number(y) || 120 },
          officeWidth,
          officeHeight
        );

        // Add user to proximity engine
        const proximityResult = proximityEngine.addUser(socket.data.officeId, {
          userId: socket.data.userId,
          socketId: socket.id,
          displayName: socket.data.displayName,
          avatarColor: socket.data.avatarColor,
          avatarIcon: socket.data.avatarIcon,
          x: initialPos.x,
          y: initialPos.y,
          micMuted: false
        });

        // Current office state for newcomer
        const officeUsers = proximityEngine.getOfficeUsers(socket.data.officeId);

        socket.emit(SOCKET_EVENTS.OFFICE_STATE, {
          officeId: socket.data.officeId,
          currentUser: {
            userId: socket.data.userId,
            displayName: socket.data.displayName,
            avatarColor: socket.data.avatarColor,
            avatarIcon: socket.data.avatarIcon,
            x: initialPos.x,
            y: initialPos.y,
            micMuted: false
          },
          office: office || { width: officeWidth, height: officeHeight, walls: [], furniture: [], zones: [] },
          users: officeUsers,
          iceServers: getIceServers(),
          hearingRadius: proximityEngine.hearingRadius,
          exitGrace: proximityEngine.exitGrace
        });

        // Notify other participants in the room
        socket.to(roomName).emit(SOCKET_EVENTS.USER_JOINED, {
          userId: socket.data.userId,
          displayName: socket.data.displayName,
          avatarColor: socket.data.avatarColor,
          avatarIcon: socket.data.avatarIcon,
          x: initialPos.x,
          y: initialPos.y,
          micMuted: false
        });

        // Dispatch immediate proximity triggers if already near someone
        if (proximityResult.enteredPairs.length > 0) {
          for (const pair of proximityResult.enteredPairs) {
            const socketAId = userSocketMap.get(pair.peerA);
            const socketBId = userSocketMap.get(pair.peerB);

            if (socketAId) {
              io.to(socketAId).emit(SOCKET_EVENTS.PROXIMITY_ENTERED, {
                peerId: pair.peerB,
                distance: pair.distance,
                isObstructed: pair.isObstructed,
                shouldInitiateOffer: pair.initiatorId === pair.peerA
              });
            }
            if (socketBId) {
              io.to(socketBId).emit(SOCKET_EVENTS.PROXIMITY_ENTERED, {
                peerId: pair.peerA,
                distance: pair.distance,
                isObstructed: pair.isObstructed,
                shouldInitiateOffer: pair.initiatorId === pair.peerB
              });
            }
          }
        }

        // Record initial position snapshot asynchronously
        GeospatialService.recordSnapshot(
          socket.data.officeId,
          socket.data.userId,
          socket.data.displayName,
          initialPos.x,
          initialPos.y
        );
      } catch (err) {
        console.error('[Socket] Error in office:join:', err);
        socket.emit(SOCKET_EVENTS.SERVER_ERROR, {
          code: 'JOIN_ERROR',
          message: err.message
        });
      }
    });

    /**
     * user:move
     */
    socket.on(SOCKET_EVENTS.USER_MOVE, (data) => {
      try {
        const { officeId, x, y } = data || {};
        const userId = socket.data.userId;

        if (!userId || !socket.data.officeId || socket.data.officeId !== officeId) {
          return;
        }

        if (!validateCoordinates(x, y)) {
          return;
        }

        const currentUser = proximityEngine.getUser(officeId, userId);
        if (!currentUser) return;

        // Fetch office obstacles
        const obstacles = proximityEngine.officeObstacles.get(officeId) || [];

        // Validate and resolve collision
        const dims = officeDimensionsMap.get(officeId) || { width: 1400, height: 900 };
        const resolvedPos = CollisionService.resolveMovement(
          { x, y },
          { x: currentUser.x, y: currentUser.y },
          obstacles,
          dims.width,
          dims.height
        );

        // Update in-memory proximity engine
        const { enteredPairs, leftPairs } = proximityEngine.updatePosition(
          officeId,
          userId,
          resolvedPos.x,
          resolvedPos.y
        );

        // Broadcast movement to all clients in office
        const roomName = `office:${officeId}`;
        socket.to(roomName).emit(SOCKET_EVENTS.USER_MOVED, {
          userId,
          x: resolvedPos.x,
          y: resolvedPos.y
        });

        // Handle newly entered pairs (Trigger WebRTC negotiation)
        for (const pair of enteredPairs) {
          const socketAId = userSocketMap.get(pair.peerA);
          const socketBId = userSocketMap.get(pair.peerB);

          if (socketAId) {
            io.to(socketAId).emit(SOCKET_EVENTS.PROXIMITY_ENTERED, {
              peerId: pair.peerB,
              distance: pair.distance,
              isObstructed: pair.isObstructed,
              shouldInitiateOffer: pair.initiatorId === pair.peerA
            });
          }
          if (socketBId) {
            io.to(socketBId).emit(SOCKET_EVENTS.PROXIMITY_ENTERED, {
              peerId: pair.peerA,
              distance: pair.distance,
              isObstructed: pair.isObstructed,
              shouldInitiateOffer: pair.initiatorId === pair.peerB
            });
          }
        }

        // Handle left pairs (Teardown peer connection or mute audio)
        for (const pair of leftPairs) {
          const socketAId = userSocketMap.get(pair.peerA);
          const socketBId = userSocketMap.get(pair.peerB);

          if (socketAId) {
            io.to(socketAId).emit(SOCKET_EVENTS.PROXIMITY_LEFT, {
              peerId: pair.peerB,
              distance: pair.distance
            });
          }
          if (socketBId) {
            io.to(socketBId).emit(SOCKET_EVENTS.PROXIMITY_LEFT, {
              peerId: pair.peerA,
              distance: pair.distance
            });
          }
        }

        // Throttle snapshot persistence to DB (every 10s per user)
        const now = Date.now();
        const lastSnap = lastSnapshotMap.get(userId) || 0;
        if (now - lastSnap > 10000) {
          lastSnapshotMap.set(userId, now);
          GeospatialService.recordSnapshot(
            officeId,
            userId,
            socket.data.displayName,
            resolvedPos.x,
            resolvedPos.y
          );
        }
      } catch (err) {
        console.error('[Socket] Error in user:move:', err);
      }
    });

    /**
     * audio:state
     */
    socket.on(SOCKET_EVENTS.AUDIO_STATE, (data) => {
      try {
        const { officeId, micMuted } = data || {};
        const userId = socket.data.userId;
        if (!userId || !officeId) return;

        socket.data.micMuted = Boolean(micMuted);
        proximityEngine.updateAudioState(officeId, userId, micMuted);

        const roomName = `office:${officeId}`;
        io.to(roomName).emit(SOCKET_EVENTS.AUDIO_STATE_CHANGED, {
          userId,
          micMuted: socket.data.micMuted
        });
      } catch (err) {
        console.error('[Socket] Error in audio:state:', err);
      }
    });

    /**
     * WebRTC Signaling: rtc:offer
     */
    socket.on(SOCKET_EVENTS.RTC_OFFER, (data) => {
      try {
        if (!validateSignalingPayload(data)) return;
        const { targetPeerId, sdp } = data;
        const targetSocketId = userSocketMap.get(targetPeerId);

        if (targetSocketId) {
          io.to(targetSocketId).emit(SOCKET_EVENTS.RTC_OFFER, {
            senderPeerId: socket.data.userId,
            sdp
          });
        }
      } catch (err) {
        console.error('[Socket] Error in rtc:offer:', err);
      }
    });

    /**
     * WebRTC Signaling: rtc:answer
     */
    socket.on(SOCKET_EVENTS.RTC_ANSWER, (data) => {
      try {
        if (!validateSignalingPayload(data)) return;
        const { targetPeerId, sdp } = data;
        const targetSocketId = userSocketMap.get(targetPeerId);

        if (targetSocketId) {
          io.to(targetSocketId).emit(SOCKET_EVENTS.RTC_ANSWER, {
            senderPeerId: socket.data.userId,
            sdp
          });
        }
      } catch (err) {
        console.error('[Socket] Error in rtc:answer:', err);
      }
    });

    /**
     * WebRTC Signaling: rtc:ice-candidate
     */
    socket.on(SOCKET_EVENTS.RTC_ICE_CANDIDATE, (data) => {
      try {
        if (!validateSignalingPayload(data)) return;
        const { targetPeerId, candidate } = data;
        const targetSocketId = userSocketMap.get(targetPeerId);

        if (targetSocketId) {
          io.to(targetSocketId).emit(SOCKET_EVENTS.RTC_ICE_CANDIDATE, {
            senderPeerId: socket.data.userId,
            candidate
          });
        }
      } catch (err) {
        console.error('[Socket] Error in rtc:ice-candidate:', err);
      }
    });

    /**
     * office:leave
     */
    socket.on(SOCKET_EVENTS.OFFICE_LEAVE, () => {
      handleUserDeparture(socket);
    });

    /**
     * disconnect
     */
    socket.on('disconnect', () => {
      handleUserDeparture(socket);
    });
  });

  function handleUserDeparture(socket) {
    const userId = socket.data.userId;
    const officeId = socket.data.officeId;

    if (!userId || !officeId) return;

    userSocketMap.delete(userId);
    lastSnapshotMap.delete(userId);

    // Remove user and clean up pairs
    const affectedPeers = proximityEngine.removeUser(officeId, userId);
    if (proximityEngine.getOfficeUsers(officeId).length === 0) {
      officeDimensionsMap.delete(officeId);
    }

    const roomName = `office:${officeId}`;
    socket.to(roomName).emit(SOCKET_EVENTS.USER_LEFT, {
      userId
    });

    // Notify affected peers that proximity was lost
    for (const peerId of affectedPeers) {
      const peerSocketId = userSocketMap.get(peerId);
      if (peerSocketId) {
        io.to(peerSocketId).emit(SOCKET_EVENTS.PROXIMITY_LEFT, {
          peerId: userId
        });
      }
    }

    socket.leave(roomName);
    socket.data.userId = null;
    socket.data.officeId = null;
  }
}
