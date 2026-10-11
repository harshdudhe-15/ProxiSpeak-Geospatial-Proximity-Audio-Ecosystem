import express from 'express';
import { User } from '../models/User.js';
import crypto from 'crypto';

const router = express.Router();

/**
 * POST /api/users/session
 * Creates or verifies a user session identity (server-controlled, not trusting raw client names as auth).
 */
router.post('/session', async (req, res, next) => {
  try {
    const { displayName, avatarColor, avatarIcon, sessionId: existingSessionId } = req.body;

    if (!displayName || displayName.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: { message: 'Display name must be at least 2 characters long' }
      });
    }

    let user = null;
    if (existingSessionId) {
      user = await User.findOne({ sessionId: existingSessionId });
    }

    if (user) {
      user.displayName = displayName.trim();
      if (avatarColor) user.avatarColor = avatarColor;
      if (avatarIcon) user.avatarIcon = avatarIcon;
      await user.save();
    } else {
      const sessionId = `pxs_${crypto.randomBytes(12).toString('hex')}`;
      user = await User.create({
        displayName: displayName.trim(),
        sessionId,
        avatarColor: avatarColor || '#6366f1',
        avatarIcon: avatarIcon || 'user'
      });
    }

    res.json({
      success: true,
      data: {
        userId: user.sessionId,
        displayName: user.displayName,
        avatarColor: user.avatarColor,
        avatarIcon: user.avatarIcon
      }
    });
  } catch (err) {
    next(err);
  }
});

export default router;
