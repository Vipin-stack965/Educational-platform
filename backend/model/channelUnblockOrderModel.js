import mongoose from "mongoose";

const channelUnblockOrderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  channel: { type: mongoose.Schema.Types.ObjectId, ref: "Channel", required: true, index: true },
  orderId: { type: String, unique: true, sparse: true },
  providerPaymentId: { type: String, unique: true, sparse: true },
  amount: { type: Number, required: true },
  currency: { type: String, required: true, uppercase: true },
  acceptedTerms: { type: Boolean, required: true },
  expiresAt: { type: Date },
  status: { type: String, enum: ["pending", "paid", "expired"], default: "pending", index: true },
  paidAt: { type: Date },
}, { timestamps: true });

export default mongoose.model("ChannelUnblockOrder", channelUnblockOrderSchema);
