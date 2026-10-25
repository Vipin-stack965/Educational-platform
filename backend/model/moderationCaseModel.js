import mongoose from "mongoose";

const moderationCaseSchema = new mongoose.Schema({
  channel: { type: mongoose.Schema.Types.ObjectId, ref: "Channel", required: true, index: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  contentType: { type: String, enum: ["video", "short", "post"], required: true },
  title: { type: String, default: "" },
  description: { type: String, default: "" },
  tags: [{ type: String }],
  text: { type: String, default: "" },
  mediaUrl: { type: String, default: "" },
  thumbnailUrl: { type: String, default: "" },
  fileSizeBytes: { type: Number, min: 0 },
  mimeType: { type: String, default: "" },
  aiReason: { type: String, default: "" },
  agentTaskCreated: { type: Boolean, default: false, index: true },
  status: {
    type: String,
    enum: ["pending", "reviewing", "approved", "rejected"],
    default: "pending",
    index: true
  },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  reviewedAt: { type: Date },
  reviewReason: { type: String, default: "" }
}, { timestamps: true });

const ModerationCase = mongoose.model("ModerationCase", moderationCaseSchema);
export default ModerationCase;
