import mongoose from "mongoose";

const channelMembershipSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  channel: { type: mongoose.Schema.Types.ObjectId, ref: "Channel", required: true, index: true },
  offering: { type: mongoose.Schema.Types.ObjectId, ref: "CommerceOffering", required: true },
  subscriptionId: { type: String, unique: true, sparse: true },
  status: { type: String, enum: ["pending", "active", "cancelled", "expired"], default: "pending", index: true },
  currentPeriodEnd: { type: Date },
  cancelAtPeriodEnd: { type: Boolean, default: false },
}, { timestamps: true });

channelMembershipSchema.index({ user: 1, channel: 1, status: 1 });

export default mongoose.model("ChannelMembership", channelMembershipSchema);
