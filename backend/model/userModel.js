import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String },
  countryCode: { type: String, uppercase: true, match: /^[A-Z]{2}$/ },
  lastSeenAt: { type: Date, index: true },
  photoUrl: { type: String, default: "" },
  channel: { type: mongoose.Schema.Types.ObjectId, ref: "Channel" },
  isGuest: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  educationBlockStatus: { type: String, enum: ["active", "temporary", "permanent"], default: "active" },
  educationBlockedUntil: { type: Date },
  educationBlockReason: { type: String, default: "" },
  guestDailyUsageDate: { type: String, default: "" },
  guestDailyUsageCount: { type: Number, default: 0 },
  preferences: {
    theme: { type: String, enum: ["light", "dark"], default: "dark" },
    profileVisibility: { type: String, enum: ["public", "private"], default: "public" },
    saveWatchHistory: { type: Boolean, default: true },
    emailNotifications: { type: Boolean, default: true },
    autoplay: { type: Boolean, default: true },
    language: { type: String, match: /^[a-z]{2,3}$/i, default: "en" },
    locationMode: { type: String, enum: ["auto", "manual"], default: "auto" },
    country: { type: String, default: "US" },
    timeZone: { type: String, default: "UTC" }
  },

  // 🔐 OTP reset system
  resetOtp: { type: String },
  otpExpires: { type: Date },
  isOtpVerifed: { type: Boolean, default: false },

  // 📌 History Field
  history: [
    {
      contentId: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: "history.contentType" // dynamically decide karega Video ya Short
      },
      contentType: {
        type: String,
        enum: ["Video", "Short"],
        required: true
      },
      watchedAt: {
        type: Date,
        default: Date.now
      }
    }
  ]
}, { timestamps: true });

const User = mongoose.model("User", userSchema);

export default User;
