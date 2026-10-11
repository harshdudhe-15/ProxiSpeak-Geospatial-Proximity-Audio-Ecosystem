import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    displayName: {
      type: String,
      required: [true, 'Display name is required'],
      trim: true,
      minlength: [2, 'Display name must be at least 2 characters'],
      maxlength: [32, 'Display name cannot exceed 32 characters']
    },
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    avatarColor: {
      type: String,
      default: '#6366f1'
    },
    avatarIcon: {
      type: String,
      default: 'user'
    }
  },
  {
    timestamps: true
  }
);

export const User = mongoose.model('User', userSchema);
