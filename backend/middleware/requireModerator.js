import User from "../model/userModel.js";

const getModeratorEmails = () => new Set(
  (process.env.MODERATOR_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);

const requireModerator = async (req, res, next) => {
  const moderatorEmails = getModeratorEmails();
  if (req.isGuest || moderatorEmails.size === 0) {
    return res.status(403).json({ message: "Moderator access is not configured for this account." });
  }
  try {
    const user = await User.findById(req.userId).select("email").lean();
    if (!user || !moderatorEmails.has(user.email.toLowerCase())) {
      return res.status(403).json({ message: "Moderator access is required." });
    }
    return next();
  } catch (error) {
    console.error("Unable to verify moderation permissions:", error);
    return res.status(500).json({ message: "Unable to verify moderator access." });
  }
};

export default requireModerator;
