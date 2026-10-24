import Feedback from "../model/feedbackModel.js";
import Channel from "../model/channelModel.js";
import User from "../model/userModel.js";
import sendFeedbackMail from "../config/sendFeedbackMail.js";

const preferenceOptions = {
  theme: ["system", "light", "dark"],
  profileVisibility: ["public", "private"],
  language: ["en", "hi"]
};

const booleanPreferences = [
  "saveWatchHistory",
  "emailNotifications",
  "autoplay"
];

const getConfiguredSupportEmail = () => {
  const email = process.env.USER_EMAIL?.trim() || "";
  return /example|placeholder|your_/i.test(email) ? "" : email;
};

export const getSettings = async (req, res) => {
  try {
    const [user, channel] = await Promise.all([
      User.findById(req.userId).select("preferences"),
      Channel.findOne({ owner: req.userId }).select("isPublic")
    ]);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({
      preferences: {
        ...user.preferences?.toObject(),
        profileVisibility: channel
          ? (channel.isPublic === false ? "private" : "public")
          : (user.preferences?.profileVisibility || "public")
      },
      supportEmail: getConfiguredSupportEmail()
    });
  } catch (error) {
    console.error("Get settings error:", error);
    return res.status(500).json({ message: "Unable to load settings" });
  }
};

export const updateSettings = async (req, res) => {
  try {
    const updates = {};

    for (const [key, values] of Object.entries(preferenceOptions)) {
      if (Object.hasOwn(req.body, key)) {
        if (!values.includes(req.body[key])) {
          return res.status(400).json({ message: `Invalid ${key} setting` });
        }
        updates[`preferences.${key}`] = req.body[key];
      }
    }

    for (const key of booleanPreferences) {
      if (Object.hasOwn(req.body, key)) {
        if (typeof req.body[key] !== "boolean") {
          return res.status(400).json({ message: `${key} must be true or false` });
        }
        updates[`preferences.${key}`] = req.body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No valid settings were provided" });
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { $set: updates },
      { new: true, runValidators: true, select: "preferences" }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (Object.hasOwn(req.body, "profileVisibility")) {
      await Channel.updateOne(
        { owner: req.userId },
        { $set: { isPublic: req.body.profileVisibility === "public" } }
      );
    }

    const channel = await Channel.findOne({ owner: req.userId }).select("isPublic");
    return res.status(200).json({
      preferences: {
        ...user.preferences?.toObject(),
        profileVisibility: channel
          ? (channel.isPublic === false ? "private" : "public")
          : (user.preferences?.profileVisibility || "public")
      }
    });
  } catch (error) {
    console.error("Update settings error:", error);
    return res.status(500).json({ message: "Unable to save settings" });
  }
};

export const getHelpInfo = (req, res) => {
  return res.status(200).json({
    supportEmail: getConfiguredSupportEmail()
  });
};

export const submitFeedback = async (req, res) => {
  try {
    const { category, message } = req.body;
    const cleanMessage = typeof message === "string" ? message.trim() : "";

    if (!["general", "bug", "feature", "account"].includes(category)) {
      return res.status(400).json({ message: "Choose a valid feedback category" });
    }
    if (!cleanMessage || cleanMessage.length > 5000) {
      return res.status(400).json({ message: "Feedback must be between 1 and 5000 characters" });
    }

    const user = await User.findById(req.userId).select("email username");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const feedback = await Feedback.create({
      user: user._id,
      email: user.email,
      category,
      message: cleanMessage
    });

    try {
      await sendFeedbackMail({
        feedbackId: feedback._id.toString(),
        category,
        message: cleanMessage,
        username: user.username,
        email: user.email
      });
      return res.status(201).json({
        message: "Feedback saved and sent to support. Thank you!",
        emailSent: true
      });
    } catch (emailError) {
      console.error("Feedback email delivery failed:", emailError.message || emailError);
      return res.status(202).json({
        message: "Feedback was saved, but the support email could not be sent. Please configure USER_EMAIL and USER_PASSWORD.",
        emailSent: false,
        feedbackId: feedback._id
      });
    }
  } catch (error) {
    console.error("Submit feedback error:", error);
    return res.status(500).json({ message: "Unable to save feedback" });
  }
};
