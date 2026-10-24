import mongoose from "mongoose";

const feedbackSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  email: { type: String, default: "" },
  category: {
    type: String,
    enum: ["general", "bug", "feature", "account"],
    required: true
  },
  message: { type: String, required: true, maxlength: 5000 }
}, { timestamps: true });

const Feedback = mongoose.model("Feedback", feedbackSchema);

export default Feedback;
