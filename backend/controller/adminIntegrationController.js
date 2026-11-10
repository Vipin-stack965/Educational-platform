import mongoose from "mongoose";
import Channel from "../model/channelModel.js";
import CommerceTransaction from "../model/commerceTransactionModel.js";
import PlatformOffer from "../model/platformOfferModel.js";
import PlatformOrder from "../model/platformOrderModel.js";
import User from "../model/userModel.js";
import Video from "../model/videoModel.js";
import ChannelUnblockConfig from "../model/channelUnblockConfigModel.js";

const currencyDigits = (currency) => ({
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  JPY: 0, KRW: 0, VND: 0,
}[currency] ?? 2);
const unavailablePlanTypes = ["family", "two-person"];
const prepaidPlanMonths = new Map([[365, 12], [90, 3], [30, 1]]);

const minorAmountFromInput = (input, currency) => {
  const digits = currencyDigits(currency);
  const value = typeof input === "string" ? input.trim() : String(input ?? "");
  const match = value.match(digits === 0 ? /^(\d+)$/ : new RegExp(`^(\\d+)(?:\\.(\\d{1,${digits}}))?$`));
  if (!match) return null;
  const amount = Number(`${match[1]}${(match[2] || "").padEnd(digits, "0")}`);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
};

const asOffer = (offer) => ({
  id: offer._id,
  planType: offer.planType || null,
  title: offer.title,
  description: offer.description,
  scope: offer.scope,
  channel: offer.channel?._id || offer.channel || null,
  channelName: offer.channel?.name || "",
  billingType: offer.billingType,
  durationDays: offer.durationDays || null,
  interval: offer.interval || null,
  amount: offer.amount,
  currency: offer.currency,
  active: offer.active,
  createdAt: offer.createdAt,
});

const aggregateRevenue = async (model, match, dateMatch) => model.aggregate([
  { $match: { status: "paid", ...match, ...dateMatch } },
  { $group: { _id: { channel: "$channel", currency: "$currency" }, amount: { $sum: "$amount" }, transactions: { $sum: 1 } } },
]);

export const getAgentPanelAnalytics = async (req, res) => {
  try {
    const requestedDays = req.query.days || "30";
    if (requestedDays !== "all" && !["7", "30", "90", "365"].includes(requestedDays)) {
      return res.status(400).json({ message: "Choose a 7, 30, 90, 365-day, or all-time range." });
    }
    const rangeStart = requestedDays === "all"
      ? null
      : new Date(Date.now() - Number(requestedDays) * 24 * 60 * 60 * 1000);
    const dateMatch = rangeStart ? { paidAt: { $gte: rangeStart } } : {};
    const registrationMatch = rangeStart ? { createdAt: { $gte: rangeStart } } : {};
    const activeSince = new Date(Date.now() - 5 * 60 * 1000);
    const [totalUsers, newUsers, activeUsers, channels, videos, channelTransactions, channelPlatformOrders, allTransactions, allPlatformOrders, countries] = await Promise.all([
      User.countDocuments({ isGuest: { $ne: true } }),
      User.countDocuments({ isGuest: { $ne: true }, ...registrationMatch }),
      User.countDocuments({ deletedAt: null, lastSeenAt: { $gte: activeSince } }),
      Channel.find().select("_id name createdAt deletedAt educationBlockStatus educationBlockedUntil educationBlockedAt owner").populate("owner", "countryCode username email").sort({ name: 1 }).lean(),
      Video.aggregate([{ $group: { _id: "$channel", count: { $sum: 1 } } }]),
      aggregateRevenue(CommerceTransaction, {}, dateMatch),
      aggregateRevenue(PlatformOrder, { channel: { $ne: null } }, dateMatch),
      CommerceTransaction.aggregate([
        { $match: { status: "paid", ...dateMatch } },
        { $group: { _id: "$currency", amount: { $sum: "$amount" }, transactions: { $sum: 1 } } },
      ]),
      PlatformOrder.aggregate([
        { $match: { status: "paid", ...dateMatch } },
        { $group: { _id: "$currency", amount: { $sum: "$amount" }, transactions: { $sum: 1 } } },
      ]),
      User.aggregate([
        { $match: { isGuest: { $ne: true }, ...registrationMatch } },
        { $group: { _id: { $cond: [{ $in: ["$countryCode", ["", null]] }, "Unknown", "$countryCode"] }, users: { $sum: 1 } } },
        { $sort: { users: -1, _id: 1 } },
      ]),
    ]);

    const videoCounts = new Map(videos.map((item) => [String(item._id), item.count]));
    const channelRevenue = new Map();
    for (const row of [...channelTransactions, ...channelPlatformOrders]) {
      if (!row._id.channel) continue;
      const channelId = String(row._id.channel);
      if (!channelRevenue.has(channelId)) channelRevenue.set(channelId, new Map());
      const currencies = channelRevenue.get(channelId);
      const current = currencies.get(row._id.currency) || { amount: 0, transactions: 0 };
      currencies.set(row._id.currency, {
        amount: current.amount + row.amount,
        transactions: current.transactions + row.transactions,
      });
    }

    const totalByCurrency = new Map();
    for (const row of [...allTransactions, ...allPlatformOrders]) {
      const currency = row._id;
      const current = totalByCurrency.get(currency) || { amount: 0, transactions: 0 };
      totalByCurrency.set(currency, {
        amount: current.amount + row.amount,
        transactions: current.transactions + row.transactions,
      });
    }
    const globalOfferRevenue = await PlatformOrder.aggregate([
      { $match: { status: "paid", scope: "account", ...dateMatch } },
      { $group: { _id: "$currency", amount: { $sum: "$amount" }, transactions: { $sum: 1 } } },
    ]);

    return res.json({
      generatedAt: new Date().toISOString(),
      rangeDays: requestedDays,
      activeWindowMinutes: 5,
      totalUsers,
      newUsers,
      activeUsers,
      totalChannels: channels.filter((channel) => (
        !channel.deletedAt &&
        channel.educationBlockStatus !== "permanent" &&
        !(channel.educationBlockStatus === "temporary" && channel.educationBlockedUntil > new Date())
      )).length,
      totalVideos: videos.reduce((sum, item) => sum + item.count, 0),
      totalRevenue: [...totalByCurrency].map(([currency, value]) => ({ currency, ...value })),
      accountWideOfferRevenue: globalOfferRevenue.map((row) => ({
        currency: row._id, amount: row.amount, transactions: row.transactions,
      })),
      countries: countries.map((row) => ({ countryCode: row._id, users: row.users })),
      channels: channels.map((channel) => ({
        id: channel._id,
        name: channel.name,
        ownerCountryCode: channel.owner?.countryCode || "Unknown",
        ownerName: channel.owner?.username || "",
        ownerEmail: channel.owner?.email || "",
        blockedAt: channel.deletedAt || (
          channel.educationBlockStatus === "permanent" ||
          (channel.educationBlockStatus === "temporary" && channel.educationBlockedUntil > new Date())
            ? channel.educationBlockedAt
            : null
        ),
        blockedReason: channel.deletedAt
          ? "Admin blocked"
          : channel.educationBlockStatus === "permanent"
            ? "Permanent education-policy block"
            : channel.educationBlockStatus === "temporary" && channel.educationBlockedUntil > new Date()
              ? "Temporary education-policy block"
              : "",
        createdAt: channel.createdAt,
        videos: videoCounts.get(String(channel._id)) || 0,
        revenue: [...(channelRevenue.get(String(channel._id)) || new Map())]
          .map(([currency, value]) => ({ currency, ...value })),
      })),
    });
  } catch (error) {
    console.error("Unable to load EduTube admin analytics:", error);
    return res.status(500).json({ message: "Unable to load EduTube analytics." });
  }
};

export const listAgentPanelOffers = async (_req, res) => {
  try {
    const offers = await PlatformOffer.find().populate("channel", "name").sort({ createdAt: -1 }).lean();
    return res.json({
      offers: offers.map((offer) => {
        const retired = unavailablePlanTypes.includes(offer.planType) ||
          (["individual", "student"].includes(offer.planType) &&
            offer.billingType === "one-time" &&
            !prepaidPlanMonths.has(offer.durationDays));
        return {
          ...asOffer(offer),
          retired,
          active: retired ? false : offer.active,
        };
      }),
    });
  } catch (error) {
    console.error("Unable to load platform offers:", error);
    return res.status(500).json({ message: "Unable to load platform offers." });
  }
};

export const listAgentPanelChannels = async (_req, res) => {
  try {
    const channels = await Channel.find({ deletedAt: null }).select("_id name").sort({ name: 1 }).lean();
    return res.json({ channels });
  } catch (error) {
    console.error("Unable to load channels for offers:", error);
    return res.status(500).json({ message: "Unable to load channels." });
  }
};

export const listAgentPanelManagedUsers = async (_req, res) => {
  try {
    const users = await User.find({ isGuest: { $ne: true } })
      .select("_id username email countryCode lastSeenAt photoUrl channel createdAt deletedAt educationBlockStatus educationBlockedUntil educationBlockReason")
      .sort({ createdAt: -1 })
      .lean();
    return res.json({
      users: users.map((user) => ({
        id: user._id,
        username: user.username,
        email: user.email,
        countryCode: user.countryCode || "",
        lastSeenAt: user.lastSeenAt || null,
        photoUrl: user.photoUrl || "",
        channelId: user.channel ? String(user.channel) : "",
        createdAt: user.createdAt,
        deletedAt: user.deletedAt,
        educationBlockStatus: user.educationBlockStatus || "active",
        educationBlockedUntil: user.educationBlockedUntil || null,
        educationBlockReason: user.educationBlockReason || "",
      })),
    });
  } catch (error) {
    console.error("Unable to load users for Agent Panel:", error);
    return res.status(500).json({ message: "Unable to load EduTube users." });
  }
};

export const listAgentPanelManagedChannels = async (_req, res) => {
  try {
    const [channels, videoCounts] = await Promise.all([
      Channel.find()
        .select("_id name description category isPublic avatar bannerImage owner subscribers videos shorts playlists communityPosts createdAt deletedAt educationViolationCount educationBlockStatus educationBlockedUntil educationBlockedAt")
        .populate("owner", "username email countryCode lastSeenAt photoUrl createdAt")
        .sort({ createdAt: -1 })
        .lean(),
      Video.aggregate([{ $group: { _id: "$channel", count: { $sum: 1 } } }]),
    ]);
    const countsByChannel = new Map(videoCounts.map((entry) => [String(entry._id), entry.count]));
    return res.json({
      channels: channels.map((channel) => ({
        id: channel._id,
        name: channel.name,
        description: channel.description || "",
        category: channel.category || "",
        isPublic: channel.isPublic !== false,
        avatar: channel.avatar || "",
        bannerImage: channel.bannerImage || "",
        ownerName: channel.owner?.username || "",
        ownerEmail: channel.owner?.email || "",
        ownerId: channel.owner?._id ? String(channel.owner._id) : "",
        ownerCountryCode: channel.owner?.countryCode || "",
        ownerLastSeenAt: channel.owner?.lastSeenAt || null,
        ownerPhotoUrl: channel.owner?.photoUrl || "",
        ownerCreatedAt: channel.owner?.createdAt || null,
        videoCount: countsByChannel.get(String(channel._id)) || 0,
        shortCount: channel.shorts?.length || 0,
        subscriberCount: channel.subscribers?.length || 0,
        playlistCount: channel.playlists?.length || 0,
        communityPostCount: channel.communityPosts?.length || 0,
        createdAt: channel.createdAt,
        deletedAt: channel.deletedAt || null,
        educationViolationCount: channel.educationViolationCount || 0,
        educationBlockStatus: channel.educationBlockStatus || "active",
        educationBlockedUntil: channel.educationBlockedUntil || null,
        educationBlockedAt: channel.educationBlockedAt || null,
        blockedAt: channel.deletedAt || (
          channel.educationBlockStatus === "permanent" ||
          (channel.educationBlockStatus === "temporary" && channel.educationBlockedUntil > new Date())
            ? channel.educationBlockedAt
            : null
        ),
      })),
    });
  } catch (error) {
    console.error("Unable to load channels for Agent Panel management:", error);
    return res.status(500).json({ message: "Unable to load EduTube channels." });
  }
};

export const setAgentPanelUserDeleted = async (req, res) => {
  const { userId } = req.params;
  if (!mongoose.isValidObjectId(userId) || typeof req.body?.deleted !== "boolean") {
    return res.status(400).json({ message: "A valid user ID and deleted status are required." });
  }
  try {
    const user = await User.findOneAndUpdate(
      { _id: userId, isGuest: { $ne: true } },
      { $set: { deletedAt: req.body.deleted ? new Date() : null } },
      { new: true, runValidators: true },
    ).select("_id username email deletedAt");
    if (!user) return res.status(404).json({ message: "EduTube user not found." });
    return res.json({
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        deletedAt: user.deletedAt,
      },
    });
  } catch (error) {
    console.error("Unable to update EduTube user status:", error);
    return res.status(500).json({ message: "Unable to update EduTube user status." });
  }
};

export const getAgentPanelPaymentConfig = (_req, res) => {
  const configuredCurrencies = process.env.RAZORPAY_ALLOWED_CURRENCIES
    ?.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean);
  const currencies = configuredCurrencies?.length ? configuredCurrencies : ["INR"];
  return res.json({
    currencies: [...new Set(currencies)],
    enabled: Boolean(
      process.env.RAZORPAY_KEY_ID?.trim() &&
      process.env.RAZORPAY_KEY_SECRET?.trim() &&
      process.env.RAZORPAY_WEBHOOK_SECRET?.trim()
    ),
  });
};

export const getAgentPanelChannelUnblockConfig = async (_req, res) => {
  try {
    const config = await ChannelUnblockConfig.findOne({ key: "channel-permanent-unblock" }).lean();
    return res.json({
      baseAmount: config?.baseAmount ? config.baseAmount / 100 : "",
      currency: "INR",
    });
  } catch (error) {
    console.error("Unable to load permanent channel unblock pricing:", error);
    return res.status(500).json({ message: "Unable to load permanent channel unblock pricing." });
  }
};

export const updateAgentPanelChannelUnblockConfig = async (req, res) => {
  const amount = minorAmountFromInput(req.body?.baseAmount, "INR");
  if (!amount || amount > 100_000_000) {
    return res.status(400).json({ message: "Enter an INR base fee between ₹1 and ₹1,000,000." });
  }
  try {
    const config = await ChannelUnblockConfig.findOneAndUpdate(
      { key: "channel-permanent-unblock" },
      { $set: { baseAmount: amount, currency: "INR" } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    ).lean();
    return res.json({ baseAmount: config.baseAmount / 100, currency: config.currency });
  } catch (error) {
    console.error("Unable to save permanent channel unblock pricing:", error);
    return res.status(500).json({ message: "Unable to save permanent channel unblock pricing." });
  }
};

export const createAgentPanelOffer = async (req, res) => {
  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const planType = body.planType;
  const planTitles = {
    individual: body.billingType === "one-time" ? "Individual prepaid" : "Individual monthly",
    student: body.billingType === "one-time" ? "Student prepaid" : "Student",
  };
  if (planType !== undefined && !Object.hasOwn(planTitles, planType)) {
    return res.status(400).json({ message: "Only Individual and Student plans are available." });
  }
  const planDescriptions = {
    individual: "EduTube membership access for this account.",
    student: "Student pricing is available to every EduTube user. Membership applies to the purchasing account.",
  };
  const isPlanType = Object.hasOwn(planTitles, planType);
  const title = isPlanType
    ? planTitles[planType]
    : typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string"
    ? body.description.trim()
    : isPlanType ? planDescriptions[planType] : "";
  const scope = isPlanType ? "account" : body.scope;
  const billingType = body.billingType;
  const currency = typeof body.currency === "string" ? body.currency.trim().toUpperCase() : "";
  const amount = minorAmountFromInput(body.amount, currency);
  if (body.description !== undefined && typeof body.description !== "string") {
    return res.status(400).json({ message: "Offer details must be text." });
  }
  if (!title || title.length > 120 || description.length > 2000) {
    return res.status(400).json({ message: "Enter an offer title (up to 120 characters) and description (up to 2,000 characters)." });
  }
  if ((!isPlanType && !["account", "channel"].includes(scope)) || !["one-time", "subscription"].includes(billingType)) {
    return res.status(400).json({ message: "Choose an account/channel scope and one-time/subscription billing." });
  }
  const configuredCurrencies = process.env.RAZORPAY_ALLOWED_CURRENCIES
    ?.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean);
  const allowedCurrencies = configuredCurrencies?.length ? configuredCurrencies : ["INR"];
  if (!allowedCurrencies.includes(currency) || !amount) {
    return res.status(400).json({ message: "Choose an enabled currency and enter a valid positive price." });
  }

  try {
    let channel = null;
    if (scope === "channel") {
      if (!mongoose.isValidObjectId(body.channelId)) {
        return res.status(400).json({ message: "Choose a channel for this channel-scoped offer." });
      }
      channel = await Channel.findById(body.channelId).select("_id name").lean();
      if (!channel) return res.status(404).json({ message: "The selected channel does not exist." });
    }

    const offer = {
      ...(isPlanType ? { planType } : {}),
      title,
      description,
      scope,
      channel: channel?._id || null,
      billingType,
      amount,
      currency,
    };
    if (billingType === "one-time") {
      const durationDays = Number(body.durationDays);
      if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650) {
        return res.status(400).json({ message: "One-time access must be valid for 1–3,650 days." });
      }
      if (isPlanType && !prepaidPlanMonths.has(durationDays)) {
        return res.status(400).json({ message: "Individual and Student prepaid terms are fixed at 12, 3, or 1 month." });
      }
      offer.durationDays = durationDays;
      if (isPlanType) {
        offer.title = `${planType === "student" ? "Student" : "Individual"} ${prepaidPlanMonths.get(durationDays)}-month prepaid`;
        offer.description = `${planType === "student" ? "Student " : ""}one-time EduTube membership access for this account. Does not automatically renew.`;
      }
    } else {
      if (!["monthly", "yearly"].includes(body.interval)) {
        return res.status(400).json({ message: "Choose a monthly or yearly subscription interval." });
      }
      if (isPlanType && body.interval !== "monthly") {
        return res.status(400).json({ message: "EduTube subscription plans currently support monthly billing only." });
      }
      offer.interval = body.interval;
    }

    const created = await PlatformOffer.create(offer);
    return res.status(201).json({ offer: asOffer({ ...created.toObject(), channel }) });
  } catch (error) {
    console.error("Unable to create platform offer:", error);
    return res.status(500).json({ message: "Unable to create platform offer." });
  }
};

export const updateAgentPanelOffer = async (req, res) => {
  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const hasActive = Object.hasOwn(body, "active");
  const hasPrice = Object.hasOwn(body, "amount") || Object.hasOwn(body, "currency");
  const hasDuration = Object.hasOwn(body, "durationDays");
  if (
    !mongoose.isValidObjectId(req.params.offerId) ||
    (!hasActive && !hasPrice && !hasDuration) ||
    (hasActive && typeof body.active !== "boolean") ||
    (hasPrice && (!Object.hasOwn(body, "amount") || !Object.hasOwn(body, "currency"))) ||
    (hasDuration && (!Number.isInteger(body.durationDays) || body.durationDays < 1 || body.durationDays > 3650))
  ) {
    return res.status(400).json({ message: "A valid offer ID and status, complete price, or prepaid validity are required." });
  }
  try {
    const currentOffer = await PlatformOffer.findById(req.params.offerId)
      .select("planType billingType durationDays amount currency active providerPlanId")
      .lean();
    if (!currentOffer) return res.status(404).json({ message: "Platform offer not found." });
    if (body.active && unavailablePlanTypes.includes(currentOffer.planType)) {
      return res.status(409).json({ message: "Family and Two-person plans are no longer available for publication." });
    }
    if (
      body.active &&
      ["individual", "student"].includes(currentOffer.planType) &&
      currentOffer.billingType === "one-time" &&
      !prepaidPlanMonths.has(currentOffer.durationDays)
    ) {
      return res.status(409).json({ message: "Only the fixed 12-, 3-, and 1-month Individual or Student prepaid plans can be published." });
    }
    if (hasDuration) {
      return res.status(400).json({ message: "Plan durations are fixed. Only the price and currency can be changed." });
    }
    const updates = {};
    if (hasActive) updates.active = body.active;
    if (hasPrice) {
      if (!["individual", "student"].includes(currentOffer.planType)) {
        return res.status(400).json({ message: "Only Individual and Student plan prices can be edited here." });
      }
      const currency = typeof body.currency === "string" ? body.currency.trim().toUpperCase() : "";
      const configuredCurrencies = process.env.RAZORPAY_ALLOWED_CURRENCIES
        ?.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean);
      const allowedCurrencies = configuredCurrencies?.length ? configuredCurrencies : ["INR"];
      const amount = minorAmountFromInput(body.amount, currency);
      if (!allowedCurrencies.includes(currency) || !amount) {
        return res.status(400).json({ message: "Choose an enabled currency and enter a valid positive price." });
      }
      updates.amount = amount;
      updates.currency = currency;
      if (amount !== currentOffer.amount || currency !== currentOffer.currency) {
        updates.providerPlanId = "";
      }
      if (body.active === undefined) updates.active = true;
    }
    const offer = await PlatformOffer.findByIdAndUpdate(
      req.params.offerId,
      { $set: updates },
      { new: true, runValidators: true },
    ).populate("channel", "name");
    if (!offer) return res.status(404).json({ message: "Platform offer not found." });
    return res.json({ offer: asOffer(offer.toObject()) });
  } catch (error) {
    console.error("Unable to update platform offer:", error);
    return res.status(500).json({ message: "Unable to update platform offer." });
  }
};
