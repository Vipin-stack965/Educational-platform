import mongoose from "mongoose";

const platformOfferSchema = new mongoose.Schema({
  planType: {
    type: String,
    enum: ["individual", "family", "two-person", "student"],
    default: undefined,
    index: true,
  },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, default: "", maxlength: 2000 },
  scope: { type: String, enum: ["account", "channel"], required: true, index: true },
  channel: { type: mongoose.Schema.Types.ObjectId, ref: "Channel", default: null, index: true },
  billingType: { type: String, enum: ["one-time", "subscription"], required: true },
  durationDays: { type: Number, min: 1, max: 3650 },
  interval: { type: String, enum: ["monthly", "yearly"] },
  amount: { type: Number, required: true, min: 1 },
  currency: { type: String, required: true, uppercase: true },
  providerPlanId: { type: String, default: "" },
  active: { type: Boolean, default: true, index: true },
}, { timestamps: true });

platformOfferSchema.index({ active: 1, createdAt: -1 });

export default mongoose.model("PlatformOffer", platformOfferSchema);
