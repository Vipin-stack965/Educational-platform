import mongoose from "mongoose";

const videoDownloadSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  video: { type: mongoose.Schema.Types.ObjectId, ref: "Video", required: true },
  downloadedAt: { type: Date, default: Date.now, required: true },
}, { timestamps: true });

videoDownloadSchema.index({ user: 1, video: 1 }, { unique: true });
videoDownloadSchema.index({ user: 1, downloadedAt: -1 });

const VideoDownload = mongoose.model("VideoDownload", videoDownloadSchema);
export default VideoDownload;
