import mongoose from "mongoose";

const platformOrderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  offer: { type: mongoose.Schema.Types.ObjectId, ref: "PlatformOffer", required: true },
  title: { type: String, required: true },
  scope: { type: String, enum: ["account", "channel"], required: true },
  channel: { type: mongoose.Schema.Types.ObjectId, ref: "Channel", default: null, index: true },
  billingType: { type: String, enum: ["one-time", "subscription"], required: true },
  durationDays: { type: Number },
  status: { type: String, enum: ["pending", "paid"], default: "pending", index: true },
  amount: { type: Number, required: true },
  currency: { type: String, required: true, uppercase: true },
  orderId: { type: String, unique: true, sparse: true },
  subscriptionId: { type: String, index: true },
  providerPaymentId: { type: String, unique: true, sparse: true },
  paidAt: { type: Date },
  validUntil: { type: Date },
}, { timestamps: true });

platformOrderSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model("PlatformOrder", platformOrderSchema);
