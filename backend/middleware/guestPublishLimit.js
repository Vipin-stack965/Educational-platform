import User from "../model/userModel.js";

const DAILY_GUEST_PUBLISH_LIMIT = 3;

const guestPublishLimit = async (req, res, next) => {
  if (!req.isGuest) return next();

  const today = new Date().toISOString().slice(0, 10);
  try {
    const guest = await User.findOneAndUpdate(
      {
        _id: req.userId,
        isGuest: true,
        $or: [
          { guestDailyUsageDate: { $ne: today } },
          { guestDailyUsageCount: { $lt: DAILY_GUEST_PUBLISH_LIMIT } }
        ]
      },
      [
        {
          $set: {
            guestDailyUsageCount: {
              $cond: [
                { $ne: ["$guestDailyUsageDate", today] },
                1,
                { $add: [{ $ifNull: ["$guestDailyUsageCount", 0] }, 1] }
              ]
            },
            guestDailyUsageDate: today
          }
        }
      ],
      { new: true }
    );

    if (!guest) {
      return res.status(429).json({
        message: "Guest publishing limit reached. Create an account to publish more, or try again tomorrow.",
        dailyLimit: DAILY_GUEST_PUBLISH_LIMIT
      });
    }

    res.once("finish", () => {
      if (res.statusCode < 400) return;
      User.findOneAndUpdate(
        {
          _id: req.userId,
          isGuest: true,
          guestDailyUsageDate: today,
          guestDailyUsageCount: { $gt: 0 }
        },
        { $inc: { guestDailyUsageCount: -1 } }
      ).catch(error => console.error("Guest publishing quota rollback failed:", error));
    });

    return next();
  } catch (error) {
    console.error("Guest publishing quota check failed:", error);
    return res.status(500).json({ message: "Unable to verify guest publishing limit" });
  }
};

export default guestPublishLimit;
