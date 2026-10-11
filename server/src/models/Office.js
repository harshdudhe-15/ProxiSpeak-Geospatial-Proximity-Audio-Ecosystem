import mongoose from 'mongoose';

const zoneSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    color: { type: String, default: '#1e293b' }
  },
  { _id: false }
);

const furnitureSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    type: { type: String, required: true },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    label: { type: String, default: '' },
    soundBlocking: { type: Boolean, default: false }
  },
  { _id: false }
);

const wallSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    soundBlocking: { type: Boolean, default: true },
    label: { type: String, default: 'Wall' }
  },
  { _id: false }
);

const officeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Office name is required'],
      trim: true,
      minlength: [2, 'Office name must be at least 2 characters'],
      maxlength: [64, 'Office name cannot exceed 64 characters']
    },
    code: {
      type: String,
      unique: true,
      index: true,
      sparse: true
    },
    width: {
      type: Number,
      required: true,
      default: 1400,
      min: 400,
      max: 4000
    },
    height: {
      type: Number,
      required: true,
      default: 900,
      min: 400,
      max: 4000
    },
    zones: [zoneSchema],
    furniture: [furnitureSchema],
    walls: [wallSchema]
  },
  {
    timestamps: true
  }
);

export const Office = mongoose.model('Office', officeSchema);
