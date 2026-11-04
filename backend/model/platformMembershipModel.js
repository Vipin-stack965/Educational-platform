import mongoose from "mongoose";

const platformMembershipSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  offer: { type: mongoose.Schema.Types.ObjectId, ref: "PlatformOffer", required: true },
  scope: { type: String, enum: ["account", "channel"], required: true },
  channel: { type: mongoose.Schema.Types.ObjectId, ref: "Channel", default: null, index: true },
  subscriptionId: { type: String, required: true, unique: true },
  status: { type: String, enum: ["pending", "active", "cancelled", "expired"], default: "pending", index: true },
  currentPeriodEnd: { type: Date },
  cancelAtPeriodEnd: { type: Boolean, default: false },
}, { timestamps: true });

platformMembershipSchema.index({ user: 1, scope: 1, channel: 1, status: 1 });

export default mongoose.model("PlatformMembership", platformMembershipSchema);
