import crypto from "node:crypto";
import Razorpay from "razorpay";
import mongoose from "mongoose";
import Channel from "../model/channelModel.js";
import ChannelMembership from "../model/channelMembershipModel.js";
import CommerceOffering from "../model/commerceOfferingModel.js";
import CommerceTransaction from "../model/commerceTransactionModel.js";
import Playlist from "../model/playlistModel.js";
import RazorpayWebhookEvent from "../model/razorpayWebhookEventModel.js";
import { canAccessPaidVideo, getPlaylistAccess } from "../service/paidContentAccess.js";
import Video from "../model/videoModel.js";
import { processPlatformWebhook } from "./platformCommerceController.js";

const allowedCurrencies = () => {
  const configured = process.env.RAZORPAY_ALLOWED_CURRENCIES
    ?.split(",").map((currency) => currency.trim().toUpperCase()).filter(Boolean);
  return configured?.length ? [...new Set(configured)] : ["INR"];
};

const currencyDigits = (currency) => ({
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  JPY: 0, KRW: 0, VND: 0,
}[currency] ?? 2);

const getRazorpay = () => {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  if (!keyId || !keySecret || !webhookSecret) {
    const error = new Error("Razorpay payments are not configured.");
    error.status = 503;
    throw error;
  }
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
};

const signatureMatches = (message, suppliedSignature, secret) => {
  if (typeof suppliedSignature !== "string" || !secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(message).digest();
  let supplied;
  try {
    supplied = Buffer.from(suppliedSignature, "hex");
  } catch {
    return false;
  }
  return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
};

const asOffering = (offering) => ({
  id: offering._id,
  type: offering.type,
  title: offering.title,
  description: offering.description,
  amount: offering.amount,
  currency: offering.currency,
  interval: offering.interval || null,
  targetId: offering.targetId || null,
  targetType: offering.targetType || null,
  active: offering.active,
  channel: offering.channel?._id || offering.channel,
  channelName: offering.channel?.name || "",
  channelAvatar: offering.channel?.avatar || "",
});

const minorAmountFromInput = (input, currency) => {
  const digits = currencyDigits(currency);
  const value = typeof input === "string" ? input.trim() : String(input ?? "");
  const match = value.match(digits === 0 ? /^(\d+)$/ : new RegExp(`^(\\d+)(?:\\.(\\d{1,${digits}}))?$`));
  if (!match) return null;
  const fraction = (match[2] || "").padEnd(digits, "0");
  const minor = Number(`${match[1]}${fraction}`);
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
};

const periodEnd = (subscription) => subscription.current_end
  ? new Date(subscription.current_end * 1000)
  : undefined;

const sendError = (res, error, fallback) => {
  if (error?.status) return res.status(error.status).json({ message: error.message });
  console.error(fallback, error);
  return res.status(500).json({ message: fallback });
};

const activeChannelFor = async (userId) => Channel.findOne({ owner: userId }).select("_id name").lean();

const filterProtectedOffers = async (offerings) => {
  const protectedOffers = offerings.filter((offering) => offering.type === "membership");
  const videoOffers = offerings.filter((offering) => offering.type === "video");
  const courseOffers = offerings.filter((offering) => offering.type === "course");
  const videoIds = videoOffers.map((offering) => offering.targetId).filter(Boolean);
  const courseIds = courseOffers.map((offering) => offering.targetId).filter(Boolean);
  const [secureVideoRows, playlists] = await Promise.all([
    videoIds.length || courseIds.length
      ? Video.find({
          $or: [
            ...(videoIds.length ? [{ _id: { $in: videoIds } }] : []),
            ...(courseIds.length ? [{ channel: { $in: courseOffers.map((offer) => offer.channel) } }] : []),
          ],
          isPaidContent: true,
          mediaDeliveryType: "authenticated",
          mediaPublicId: { $ne: "" },
        }).select("_id channel").lean()
      : [],
    courseIds.length
      ? Playlist.find({ _id: { $in: courseIds } }).select("_id channel videos").lean()
      : [],
  ]);
  const protectedVideosById = new Map(secureVideoRows.map((video) => [String(video._id), video]));
  const protectedVideosByChannel = new Map();
  for (const video of secureVideoRows) {
    const channelKey = String(video.channel);
    if (!protectedVideosByChannel.has(channelKey)) protectedVideosByChannel.set(channelKey, new Set());
    protectedVideosByChannel.get(channelKey).add(String(video._id));
  }
  const playlistsById = new Map(playlists.map((playlist) => [String(playlist._id), playlist]));

  for (const offering of videoOffers) {
    const video = protectedVideosById.get(String(offering.targetId));
    if (video && String(video.channel) === String(offering.channel)) protectedOffers.push(offering);
  }
  for (const offering of courseOffers) {
    const playlist = playlistsById.get(String(offering.targetId));
    const channelVideos = protectedVideosByChannel.get(String(offering.channel));
    if (
      playlist &&
      String(playlist.channel) === String(offering.channel) &&
      playlist.videos?.length &&
      channelVideos &&
      playlist.videos.every((videoId) => channelVideos.has(String(videoId)))
    ) protectedOffers.push(offering);
  }
  return protectedOffers;
};

const isOfferingProtected = async (offering) => (
  (await filterProtectedOffers([offering])).length > 0
);

export const getPaymentConfig = (_req, res) => {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim() || "";
  return res.json({
    keyId,
    enabled: Boolean(keyId && process.env.RAZORPAY_KEY_SECRET?.trim() && process.env.RAZORPAY_WEBHOOK_SECRET?.trim()),
    currencies: allowedCurrencies(),
  });
};

export const getOfferings = async (_req, res) => {
  try {
    const offerings = await CommerceOffering.find({ active: true })
      .populate("channel", "name avatar")
      .sort({ createdAt: -1 }).lean();
    const protectedOffers = await filterProtectedOffers(offerings);
    return res.json(protectedOffers.map(asOffering));
  } catch (error) {
    return sendError(res, error, "Unable to load payment offerings.");
  }
};

export const getCreatorOfferings = async (req, res) => {
  try {
    const channel = await activeChannelFor(req.userId);
    if (!channel) return res.json({ channel: null, offerings: [], options: { videos: [], courses: [] } });
    const [offerings, videos, playlists] = await Promise.all([
      CommerceOffering.find({ channel: channel._id }).populate("channel", "name avatar").sort({ createdAt: -1 }).lean(),
      Video.find({
        channel: channel._id,
        isPaidContent: true,
        mediaDeliveryType: "authenticated",
        mediaPublicId: { $ne: "" },
      }).select("_id title").sort({ createdAt: -1 }).lean(),
      Playlist.find({ channel: channel._id }).select("_id title").sort({ createdAt: -1 }).lean(),
    ]);
    return res.json({
      channel,
      offerings: offerings.map(asOffering),
      options: { videos, courses: playlists },
    });
  } catch (error) {
    return sendError(res, error, "Unable to load creator offerings.");
  }
};

export const createOffering = async (req, res) => {
  try {
    const channel = await activeChannelFor(req.userId);
    if (!channel) return res.status(403).json({ message: "Create a channel before publishing paid offerings." });

    const type = typeof req.body.type === "string" ? req.body.type : "";
    const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
    const description = typeof req.body.description === "string" ? req.body.description.trim() : "";
    const currency = typeof req.body.currency === "string" ? req.body.currency.trim().toUpperCase() : "";
    if (!["membership", "video", "course"].includes(type)) {
      return res.status(400).json({ message: "Choose a membership, video, or course offering." });
    }
    if (!title || title.length > 120 || description.length > 2000) {
      return res.status(400).json({ message: "Enter a title (up to 120 characters) and description (up to 2,000 characters)." });
    }
    if (!allowedCurrencies().includes(currency)) {
      return res.status(400).json({ message: "That currency is not enabled for this merchant." });
    }
    const amount = minorAmountFromInput(req.body.amount, currency);
    if (!amount) return res.status(400).json({ message: `Enter a positive price with at most ${currencyDigits(currency)} decimal places.` });

    let targetId;
    let targetType;
    let interval;
    if (type === "membership") {
      interval = req.body.interval;
      if (!["monthly", "yearly"].includes(interval)) {
        return res.status(400).json({ message: "Membership billing must be monthly or yearly." });
      }
    } else {
      targetId = req.body.targetId;
      targetType = type === "video" ? "Video" : "Playlist";
      if (!mongoose.isValidObjectId(targetId)) {
        return res.status(400).json({ message: `Choose a ${type} from your channel.` });
      }
      const target = targetType === "Video"
        ? await Video.findOne({
            _id: targetId,
            channel: channel._id,
            isPaidContent: true,
            mediaDeliveryType: "authenticated",
            mediaPublicId: { $ne: "" },
          }).select("_id")
        : await Playlist.findOne({ _id: targetId, channel: channel._id }).select("_id videos");
      if (!target) return res.status(400).json({ message: "The selected content does not belong to your channel." });
      if (targetType === "Playlist") {
        const playlistVideoIds = target.videos || [];
        if (!playlistVideoIds.length) {
          return res.status(400).json({ message: "A paid course playlist must contain protected paid videos." });
        }
        const protectedCount = await Video.countDocuments({
          _id: { $in: playlistVideoIds },
          channel: channel._id,
          isPaidContent: true,
          mediaDeliveryType: "authenticated",
          mediaPublicId: { $ne: "" },
        });
        if (protectedCount !== playlistVideoIds.length) {
          return res.status(400).json({ message: "Every video in a paid course playlist must be uploaded as protected paid content." });
        }
      }
    }

    const offering = await CommerceOffering.create({
      channel: channel._id, type, title, description, amount, currency, interval, targetId, targetType,
    });
    return res.status(201).json(asOffering({ ...offering.toObject(), channel }));
  } catch (error) {
    return sendError(res, error, "Unable to create the offering.");
  }
};

export const updateOffering = async (req, res) => {
  try {
    const channel = await activeChannelFor(req.userId);
    const offering = await CommerceOffering.findOne({ _id: req.params.offeringId, channel: channel?._id });
    if (!offering) return res.status(404).json({ message: "Offering not found." });
    if (typeof req.body.active !== "boolean") {
      return res.status(400).json({ message: "Only the published status can be changed." });
    }
    if (req.body.active && !await isOfferingProtected(offering.toObject())) {
      return res.status(400).json({
        message: "This offer cannot be published because its selected content is not protected paid media.",
      });
    }
    offering.active = req.body.active;
    await offering.save();
    return res.json({ id: offering._id, active: offering.active });
  } catch (error) {
    return sendError(res, error, "Unable to update the offering.");
  }
};

const findPurchasableOffering = async (offeringId) => {
  if (!mongoose.isValidObjectId(offeringId)) return null;
  const offering = await CommerceOffering.findOne({ _id: offeringId, active: true }).lean();
  if (!offering || !await isOfferingProtected(offering)) return null;
  return offering;
};

export const createOrder = async (req, res) => {
  try {
    const offering = await findPurchasableOffering(req.body.offeringId);
    if (!offering) return res.status(404).json({ message: "This offering is unavailable." });
    if (offering.type === "membership") return res.status(400).json({ message: "Use subscription checkout for a membership." });
    const channel = await Channel.findById(offering.channel).select("owner").lean();
    if (String(channel?.owner) === String(req.userId)) {
      return res.status(403).json({ message: "You cannot purchase your own channel offering." });
    }
    const razorpay = getRazorpay();
    const order = await razorpay.orders.create({
      amount: offering.amount,
      currency: offering.currency,
      receipt: `edu_${crypto.randomUUID().replaceAll("-", "").slice(0, 30)}`,
      notes: { offeringId: String(offering._id), buyerId: String(req.userId), channelId: String(offering.channel) },
    });
    await CommerceTransaction.create({
      user: req.userId, offering: offering._id, channel: offering.channel, type: "purchase",
      status: "pending", amount: offering.amount, currency: offering.currency, orderId: order.id,
    });
    return res.status(201).json({
      orderId: order.id, amount: order.amount, currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID.trim(), name: "EduTube",
      description: offering.title,
    });
  } catch (error) {
    return sendError(res, error, "Unable to start checkout.");
  }
};

const ensurePlan = async (offering) => {
  if (offering.providerPlanId) return offering.providerPlanId;
  const razorpay = getRazorpay();
  const plan = await razorpay.plans.create({
    period: offering.interval,
    interval: 1,
    item: {
      name: offering.title,
      amount: offering.amount,
      currency: offering.currency,
      description: offering.description || offering.title,
    },
  });
  await CommerceOffering.updateOne(
    { _id: offering._id, providerPlanId: "" },
    { $set: { providerPlanId: plan.id } },
  );
  const updated = await CommerceOffering.findById(offering._id).select("providerPlanId").lean();
  return updated.providerPlanId || plan.id;
};

export const createSubscription = async (req, res) => {
  try {
    const offering = await findPurchasableOffering(req.body.offeringId);
    if (!offering || offering.type !== "membership") {
      return res.status(404).json({ message: "This membership offering is unavailable." });
    }
    const channel = await Channel.findById(offering.channel).select("owner").lean();
    if (String(channel?.owner) === String(req.userId)) {
      return res.status(403).json({ message: "You cannot join your own channel membership." });
    }
    const razorpay = getRazorpay();
    const planId = await ensurePlan(offering);
    const subscription = await razorpay.subscriptions.create({
      plan_id: planId,
      customer_notify: 1,
      total_count: 100,
      notes: { offeringId: String(offering._id), buyerId: String(req.userId), channelId: String(offering.channel) },
    });
    await ChannelMembership.findOneAndUpdate(
      { subscriptionId: subscription.id },
      {
        $setOnInsert: {
          user: req.userId, channel: offering.channel, offering: offering._id,
          subscriptionId: subscription.id, status: "pending",
        },
      },
      { upsert: true, new: true },
    );
    return res.status(201).json({
      subscriptionId: subscription.id, keyId: process.env.RAZORPAY_KEY_ID.trim(),
      name: "EduTube", description: offering.title,
    });
  } catch (error) {
    return sendError(res, error, "Unable to start membership checkout.");
  }
};

const markPurchasePaid = async ({ transaction, payment, order }) => {
  if (
    !transaction || transaction.type !== "purchase" || order.status !== "paid" ||
    order.id !== transaction.orderId || payment.order_id !== transaction.orderId ||
    String(order.notes?.buyerId || "") !== String(transaction.user) ||
    String(order.notes?.offeringId || "") !== String(transaction.offering) ||
    String(order.notes?.channelId || "") !== String(transaction.channel) ||
    Number(order.amount) !== transaction.amount || Number(payment.amount) !== transaction.amount ||
    order.currency !== transaction.currency || payment.currency !== transaction.currency
  ) {
    const error = new Error("The captured payment does not match this purchase.");
    error.status = 409;
    throw error;
  }
  transaction.status = "paid";
  transaction.providerPaymentId = payment.id;
  transaction.paidAt = new Date();
  await transaction.save();
};

const fulfillSubscriptionPayment = async ({ subscriptionId, paymentId, razorpay, expectedUserId }) => {
  const membership = await ChannelMembership.findOne({ subscriptionId });
  if (!membership || (expectedUserId && String(membership.user) !== String(expectedUserId))) {
    const error = new Error("The membership subscription could not be matched to this account.");
    error.status = 404;
    throw error;
  }
  const offering = await CommerceOffering.findById(membership.offering).lean();
  if (!offering) {
    const error = new Error("The membership offering no longer exists.");
    error.status = 404;
    throw error;
  }
  const [payment, subscription] = await Promise.all([
    razorpay.payments.fetch(paymentId),
    razorpay.subscriptions.fetch(subscriptionId),
  ]);
  if (
    payment.status !== "captured" ||
    String(payment.subscription_id || "") !== subscriptionId ||
    Number(payment.amount) !== offering.amount ||
    payment.currency !== offering.currency ||
    String(subscription.plan_id) !== String(offering.providerPlanId) ||
    !["active", "authenticated"].includes(subscription.status)
  ) {
    const error = new Error("Razorpay has not confirmed the expected active membership payment.");
    error.status = 409;
    throw error;
  }

  membership.status = "active";
  membership.currentPeriodEnd = periodEnd(subscription);
  await membership.save();
  await CommerceTransaction.findOneAndUpdate(
    { providerPaymentId: payment.id },
    {
      $setOnInsert: {
        user: membership.user, offering: offering._id, channel: membership.channel,
        type: "membership", amount: Number(payment.amount), currency: payment.currency,
        providerPaymentId: payment.id, subscriptionId,
      },
      $set: { status: "paid", paidAt: new Date() },
    },
    { upsert: true, new: true },
  );
  return { payment, membership };
};

export const verifyOrder = async (req, res) => {
  try {
    const { orderId, paymentId, signature } = req.body || {};
    if (!orderId || !paymentId || !signature) return res.status(400).json({ message: "Missing Razorpay payment details." });
    const transaction = await CommerceTransaction.findOne({ orderId, user: req.userId, type: "purchase" });
    if (!transaction) return res.status(404).json({ message: "Purchase order not found." });
    if (transaction.status === "paid" && transaction.providerPaymentId === paymentId) {
      return res.json({ success: true, message: "Payment already confirmed." });
    }
    const secret = process.env.RAZORPAY_KEY_SECRET?.trim();
    if (!signatureMatches(`${orderId}|${paymentId}`, signature, secret)) {
      return res.status(400).json({ message: "Payment signature verification failed." });
    }
    const razorpay = getRazorpay();
    const [payment, order, offering] = await Promise.all([
      razorpay.payments.fetch(paymentId),
      razorpay.orders.fetch(orderId),
      CommerceOffering.findById(transaction.offering).lean(),
    ]);
    if (
      !offering ||
      String(order.notes?.buyerId || "") !== String(req.userId) ||
      String(order.notes?.offeringId || "") !== String(offering._id) ||
      String(order.notes?.channelId || "") !== String(offering.channel)
    ) {
      return res.status(409).json({ message: "The payment does not match this account and offering." });
    }
    await markPurchasePaid({ transaction, payment, order });
    return res.json({ success: true, message: "Payment confirmed." });
  } catch (error) {
    return sendError(res, error, "Unable to verify the payment.");
  }
};

export const verifySubscription = async (req, res) => {
  try {
    const { subscriptionId, paymentId, signature } = req.body || {};
    if (!subscriptionId || !paymentId || !signature) {
      return res.status(400).json({ message: "Missing Razorpay membership details." });
    }
    if (!signatureMatches(`${subscriptionId}|${paymentId}`, signature, process.env.RAZORPAY_KEY_SECRET?.trim())) {
      return res.status(400).json({ message: "Membership signature verification failed." });
    }
    const razorpay = getRazorpay();
    await fulfillSubscriptionPayment({ subscriptionId, paymentId, razorpay, expectedUserId: req.userId });
    return res.json({ success: true, message: "Membership payment confirmed." });
  } catch (error) {
    return sendError(res, error, "Unable to verify the membership payment.");
  }
};

export const getPaymentHistory = async (req, res) => {
  try {
    const [transactions, memberships] = await Promise.all([
      CommerceTransaction.find({ user: req.userId }).populate("offering", "title type interval")
        .populate("channel", "name").sort({ createdAt: -1 }).lean(),
      ChannelMembership.find({ user: req.userId }).populate("offering", "title interval amount currency")
        .populate("channel", "name").sort({ createdAt: -1 }).lean(),
    ]);
    return res.json({
      transactions: transactions.map((item) => ({
        id: item._id, status: item.status, type: item.type, amount: item.amount,
        currency: item.currency, createdAt: item.createdAt, paidAt: item.paidAt,
        title: item.offering?.title || "Unavailable offering",
        channelName: item.channel?.name || "",
      })),
      memberships: memberships.map((item) => ({
        id: item._id, status: item.status, currentPeriodEnd: item.currentPeriodEnd,
        cancelAtPeriodEnd: item.cancelAtPeriodEnd,
        subscriptionId: item.subscriptionId, title: item.offering?.title || "Membership",
        interval: item.offering?.interval, amount: item.offering?.amount,
        currency: item.offering?.currency, channelName: item.channel?.name || "",
      })),
    });
  } catch (error) {
    return sendError(res, error, "Unable to load payment history.");
  }
};

export const cancelMembership = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.membershipId)) {
      return res.status(400).json({ message: "Invalid membership id." });
    }
    const membership = await ChannelMembership.findOne({ _id: req.params.membershipId, user: req.userId });
    if (!membership) return res.status(404).json({ message: "Membership not found." });
    if (membership.status !== "active") {
      return res.status(409).json({ message: "Only an active membership can be cancelled." });
    }
    if (membership.cancelAtPeriodEnd) {
      return res.json({ success: true, message: "This membership is already scheduled to end." });
    }
    const razorpay = getRazorpay();
    await razorpay.subscriptions.cancel(membership.subscriptionId, true);
    membership.cancelAtPeriodEnd = true;
    await membership.save();
    return res.json({ success: true, message: "Membership cancellation is scheduled for the end of the current billing period." });
  } catch (error) {
    return sendError(res, error, "Unable to cancel the membership.");
  }
};

export const checkEntitlement = async (req, res) => {
  try {
    const videoId = req.query.videoId;
    const playlistId = req.query.playlistId;
    if ((videoId && !mongoose.isValidObjectId(videoId)) || (playlistId && !mongoose.isValidObjectId(playlistId))) {
      return res.status(400).json({ message: "Invalid content id." });
    }
    let target;
    let targetType;
    if (videoId) {
      target = await Video.findById(videoId).select("_id channel isPaidContent mediaDeliveryType").lean();
      targetType = "Video";
    } else if (playlistId) {
      target = await Playlist.findById(playlistId).select("channel").lean();
      targetType = "Playlist";
    } else {
      return res.status(400).json({ message: "Provide a videoId or playlistId." });
    }
    if (!target) return res.status(404).json({ message: "Content not found." });
    if (targetType === "Video") {
      const access = await canAccessPaidVideo(req.userId, target);
      return res.json({ entitled: access.entitled, owner: access.owner });
    }
    const playlist = await Playlist.findById(playlistId).select("channel videos").lean();
    const access = await getPlaylistAccess(req.userId, playlist);
    return res.json({ entitled: access.entitled, owner: access.owner });
  } catch (error) {
    return sendError(res, error, "Unable to check content access.");
  }
};

const processWebhook = async (event, razorpay) => {
  if (await processPlatformWebhook(event, razorpay)) return;
  const payment = event.payload?.payment?.entity;
  if (event.event === "payment.captured" && payment?.order_id) {
    const transaction = await CommerceTransaction.findOne({ orderId: payment.order_id, type: "purchase" });
    if (!transaction) return;
    const [verifiedPayment, order] = await Promise.all([
      razorpay.payments.fetch(payment.id),
      razorpay.orders.fetch(payment.order_id),
    ]);
    if (
      Number(verifiedPayment.amount) !== transaction.amount ||
      verifiedPayment.currency !== transaction.currency
    ) throw new Error("Webhook payment amount or currency does not match the stored order.");
    await markPurchasePaid({ transaction, payment: verifiedPayment, order });
    return;
  }

  if (event.event === "subscription.cancelled" || event.event === "subscription.completed" ||
      event.event === "subscription.halted") {
    const subscription = event.payload?.subscription?.entity;
    if (subscription?.id) {
      await ChannelMembership.updateOne(
        { subscriptionId: subscription.id },
        {
          $set: {
            status: event.event === "subscription.halted" ? "expired" : "cancelled",
            ...(subscription.current_end ? { currentPeriodEnd: new Date(subscription.current_end * 1000) } : {}),
          },
        },
      );
    }
    return;
  }

  if (event.event === "subscription.charged" || event.event === "subscription.activated") {
    const subscription = event.payload?.subscription?.entity;
    const subscriptionId = subscription?.id;
    const paymentId = payment?.id || subscription?.payment_id;
    if (subscriptionId && paymentId) {
      await fulfillSubscriptionPayment({ subscriptionId, paymentId, razorpay });
    }
  }
};

export const handleRazorpayWebhook = async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  if (!secret) return res.status(503).json({ message: "Razorpay webhooks are not configured." });
  if (!Buffer.isBuffer(req.body)) return res.status(400).json({ message: "Invalid webhook body." });
  const signature = req.get("x-razorpay-signature");
  const eventId = req.get("x-razorpay-event-id");
  if (!signatureMatches(req.body, signature, secret)) {
    return res.status(400).json({ message: "Webhook signature verification failed." });
  }
  if (!eventId || eventId.length > 200) return res.status(400).json({ message: "Missing webhook event id." });

  let event;
  try {
    event = JSON.parse(req.body.toString("utf8"));
  } catch {
    return res.status(400).json({ message: "Invalid webhook JSON." });
  }

  try {
    let eventRecord;
    try {
      eventRecord = await RazorpayWebhookEvent.create({ eventId, event: event.event || "unknown" });
    } catch (error) {
      if (error.code !== 11000) throw error;
      eventRecord = await RazorpayWebhookEvent.findOne({ eventId });
      if (eventRecord?.processedAt) return res.json({ received: true, duplicate: true });
    }
    await processWebhook(event, getRazorpay());
    eventRecord.processedAt = new Date();
    eventRecord.processingError = "";
    await eventRecord.save();
    return res.json({ received: true });
  } catch (error) {
    try {
      await RazorpayWebhookEvent.updateOne({ eventId }, { $set: { processingError: error.message || "Processing failed." } });
    } catch (recordError) {
      console.error("Could not save Razorpay webhook error:", recordError);
    }
    console.error("Razorpay webhook processing failed:", error);
    return res.status(500).json({ message: "Webhook processing failed; Razorpay may retry this event." });
  }
};
