import mongoose from "mongoose";

const razorpayWebhookEventSchema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true },
  event: { type: String, required: true },
  processedAt: { type: Date },
  processingError: { type: String, default: "" },
}, { timestamps: true });

export default mongoose.model("RazorpayWebhookEvent", razorpayWebhookEventSchema);
