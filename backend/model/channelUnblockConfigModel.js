import mongoose from "mongoose";

const channelUnblockConfigSchema = new mongoose.Schema({
  key: { type: String, unique: true, required: true },
  baseAmount: { type: Number, min: 1, required: true },
  currency: { type: String, enum: ["INR"], default: "INR" },
}, { timestamps: true });

export default mongoose.model("ChannelUnblockConfig", channelUnblockConfigSchema);
