import mongoose from "mongoose";

const commerceOfferingSchema = new mongoose.Schema({
  channel: { type: mongoose.Schema.Types.ObjectId, ref: "Channel", required: true, index: true },
  type: { type: String, enum: ["membership", "video", "course"], required: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, default: "", maxlength: 2000 },
  amount: { type: Number, required: true, min: 1 },
  currency: { type: String, required: true, uppercase: true },
  interval: { type: String, enum: ["monthly", "yearly"] },
  targetId: { type: mongoose.Schema.Types.ObjectId },
  targetType: { type: String, enum: ["Video", "Playlist"] },
  providerPlanId: { type: String, default: "" },
  active: { type: Boolean, default: true, index: true },
}, { timestamps: true });

export default mongoose.model("CommerceOffering", commerceOfferingSchema);
