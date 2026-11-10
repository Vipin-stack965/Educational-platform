import crypto from "node:crypto";
import Razorpay from "razorpay";
import jwt from "jsonwebtoken";
import Channel from "../model/channelModel.js";
import ChannelUnblockOrder from "../model/channelUnblockOrderModel.js";
import User from "../model/userModel.js";
import { getChannelUnblockPrice, toMajorCurrencyAmount } from "../service/channelUnblockPricing.js";

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

const reportError = (res, error, fallback) => {
  if (error?.status) return res.status(error.status).json({ message: error.message });
  console.error(fallback, error);
  return res.status(500).json({ message: fallback });
};

const decodeUnblockToken = (token, allowExpiredToken = false) => {
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, allowExpiredToken ? { ignoreExpiration: true } : undefined);
  } catch {
    const error = new Error("This unblock session expired. Sign in again to continue.");
    error.status = 401;
    throw error;
  }
  if (payload.purpose !== "channel-unblock" || !payload.userId) {
    const error = new Error("This unblock session is invalid.");
    error.status = 401;
    throw error;
  }
  return payload;
};

const verifyUnblockToken = async (
  token,
  { channelId, allowAlreadyUnblocked = false, allowExpiredToken = false } = {},
) => {
  const payload = decodeUnblockToken(token, allowExpiredToken);
  const selectedChannelId = channelId || payload.channelId;
  if (!selectedChannelId || (payload.channelId && channelId && payload.channelId !== channelId)) {
    const error = new Error("Select the channel associated with this unblock session.");
    error.status = 400;
    throw error;
  }
  const [user, channel] = await Promise.all([
    User.findById(payload.userId).select("_id countryCode educationBlockStatus deletedAt"),
    Channel.findOne({ _id: selectedChannelId, owner: payload.userId })
      .select("_id name educationBlockStatus paidUnblockCount deletedAt"),
  ]);
  if (!user || !channel || user.deletedAt || channel.deletedAt) {
    const error = new Error("This account or channel is unavailable.");
    error.status = 403;
    throw error;
  }
  const isEligible = channel.educationBlockStatus === "permanent" &&
    user.educationBlockStatus === "permanent" &&
    (channel.paidUnblockCount || 0) === 0;
  const wasAlreadyUnblocked = allowAlreadyUnblocked &&
    channel.educationBlockStatus === "active" &&
    ["active", "permanent"].includes(user.educationBlockStatus) &&
    channel.paidUnblockCount === 1;
  if (!isEligible && !wasAlreadyUnblocked) {
    const error = new Error("Paid self-unblock is unavailable for this channel.");
    error.status = 409;
    throw error;
  }
  const quotedPrice = payload.unblockQuote;
  const hasQuotedPrice = quotedPrice && typeof quotedPrice === "object";
  if (hasQuotedPrice && (
    !Number.isSafeInteger(quotedPrice.amount) ||
    quotedPrice.amount < 1 ||
    typeof quotedPrice.currency !== "string" ||
    !/^[A-Z]{3}$/.test(quotedPrice.currency) ||
    !Number.isSafeInteger(quotedPrice.baseAmount) ||
    quotedPrice.baseAmount < 1 ||
    typeof quotedPrice.baseCurrency !== "string" ||
    !/^[A-Z]{3}$/.test(quotedPrice.baseCurrency) ||
    typeof quotedPrice.exchangeRate !== "number" ||
    !Number.isFinite(quotedPrice.exchangeRate) ||
    quotedPrice.exchangeRate <= 0
  )) {
    const error = new Error("This unblock session contains an invalid payment quote.");
    error.status = 401;
    throw error;
  }
  return {
    user,
    channel,
    quotedPrice: hasQuotedPrice ? quotedPrice : null,
    expiresAt: payload.exp ? new Date(payload.exp * 1000) : null,
  };
};

const verifyPaymentSignature = (orderId, paymentId, signature) => {
  const secret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (typeof signature !== "string" || !secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest();
  const supplied = Buffer.from(signature, "hex");
  return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
};

const activateUnblockedChannel = async ({ unblockOrder, payment, order, razorpay, capturedAt }) => {
  const notes = order?.notes || {};
  if (
    order?.status !== "paid" ||
    order.id !== unblockOrder.orderId ||
    payment.order_id !== unblockOrder.orderId ||
    String(notes.userId || "") !== String(unblockOrder.user) ||
    String(notes.channelId || "") !== String(unblockOrder.channel) ||
    Number(order.amount) !== unblockOrder.amount ||
    Number(payment.amount) !== unblockOrder.amount ||
    order.currency !== unblockOrder.currency ||
    payment.currency !== unblockOrder.currency ||
    payment.status !== "captured"
  ) {
    const error = new Error("The captured payment does not match this channel unblock.");
    error.status = 409;
    throw error;
  }
  const paymentTime = Number(payment.captured_at || capturedAt || payment.created_at) * 1000;
  const paymentMissedDeadline = unblockOrder.expiresAt &&
    (!Number.isFinite(paymentTime) || paymentTime > unblockOrder.expiresAt.getTime());
  if (unblockOrder.status === "expired" && (!unblockOrder.expiresAt || paymentMissedDeadline)) {
    if (
      payment.status === "captured" &&
      Number(payment.amount_refunded || 0) < unblockOrder.amount
    ) {
      await razorpay.payments.refund(payment.id);
      unblockOrder.providerPaymentId = payment.id;
      await unblockOrder.save();
    }
    return;
  }
  if (unblockOrder.status === "paid") {
    if (unblockOrder.providerPaymentId !== payment.id) {
      const error = new Error("This unblock order was already confirmed with a different payment.");
      error.status = 409;
      throw error;
    }
    return;
  }
  if (paymentMissedDeadline) {
    await razorpay.payments.refund(payment.id);
    unblockOrder.status = "expired";
    unblockOrder.providerPaymentId = payment.id;
    await unblockOrder.save();
    const error = new Error("The recovery QR expired before payment. The captured payment was refunded.");
    error.status = 410;
    throw error;
  }

  const channel = await Channel.findOneAndUpdate(
    {
      _id: unblockOrder.channel,
      owner: unblockOrder.user,
      educationBlockStatus: "permanent",
      paidUnblockCount: { $in: [0, null] },
      deletedAt: null,
    },
    {
      $set: {
        educationBlockStatus: "active",
        educationBlockedUntil: null,
        educationBlockedAt: null,
        paidUnblockOrderId: unblockOrder.orderId,
      },
      $inc: { paidUnblockCount: 1 },
    },
    { new: true },
  );
  const alreadyUnblocked = !channel && await Channel.exists({
    _id: unblockOrder.channel,
    owner: unblockOrder.user,
    educationBlockStatus: "active",
    paidUnblockCount: 1,
    paidUnblockOrderId: unblockOrder.orderId,
    deletedAt: null,
  });
  if (!channel && !alreadyUnblocked) {
    const error = new Error("This channel is no longer eligible for self-unblock.");
    error.status = 409;
    throw error;
  }
  const user = await User.findOneAndUpdate(
    {
      _id: unblockOrder.user,
      deletedAt: null,
      ...(alreadyUnblocked
        ? { educationBlockStatus: { $in: ["active", "permanent"] } }
        : { educationBlockStatus: "permanent" }),
    },
    {
      $set: {
        educationBlockStatus: "active",
        educationBlockedUntil: null,
        educationBlockReason: "",
      },
    },
    { new: true },
  );
  if (!user) {
    console.error(`Channel ${unblockOrder.channel} was paid-unblocked, but its owner status could not be updated.`);
    const error = new Error("Payment was captured, but account restoration needs support. Contact EduTube support.");
    error.status = 500;
    throw error;
  }
  unblockOrder.status = "paid";
  unblockOrder.providerPaymentId = payment.id;
  unblockOrder.paidAt = new Date();
  await unblockOrder.save();
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const listEligibleChannelUnblocks = async (req, res) => {
  try {
    const payload = decodeUnblockToken(req.body?.unblockToken);
    const user = await User.findOne({
      _id: payload.userId,
      deletedAt: null,
      educationBlockStatus: "permanent",
    }).select("_id email");
    if (!user) {
      return res.status(409).json({ message: "There are no channels eligible for paid self-unblock on this account." });
    }

    const search = typeof req.body?.search === "string" ? req.body.search.trim().slice(0, 100) : "";
    const channelFilter = {
      owner: user._id,
      educationBlockStatus: "permanent",
      paidUnblockCount: { $in: [0, null] },
      deletedAt: null,
    };
    if (payload.channelId) channelFilter._id = payload.channelId;
    if (search) channelFilter.name = { $regex: escapeRegex(search), $options: "i" };
    let channels = await Channel.find(channelFilter)
      .select("_id name educationBlockedAt")
      .sort({ name: 1 })
      .limit(50)
      .lean();
    if (search && user.email.toLowerCase().includes(search.toLowerCase()) && !payload.channelId) {
      channels = await Channel.find({
        owner: user._id,
        educationBlockStatus: "permanent",
        paidUnblockCount: { $in: [0, null] },
        deletedAt: null,
      })
        .select("_id name educationBlockedAt")
        .sort({ name: 1 })
        .limit(50)
        .lean();
    }
    return res.json({
      email: user.email,
      channels: channels.map((channel) => ({
        id: channel._id,
        name: channel.name,
        blockedAt: channel.educationBlockedAt || null,
      })),
    });
  } catch (error) {
    return reportError(res, error, "Unable to search blocked channels.");
  }
};

export const getChannelUnblockQuote = async (req, res) => {
  try {
    const { user, channel, quotedPrice } = await verifyUnblockToken(req.body?.unblockToken, {
      channelId: req.body?.channelId,
    });
    const price = quotedPrice || await getChannelUnblockPrice(user.countryCode);
    return res.json({
      amount: price.amount,
      currency: price.currency,
      amountMajor: toMajorCurrencyAmount(price.amount, price.currency),
      baseAmount: toMajorCurrencyAmount(price.baseAmount, price.baseCurrency),
      baseCurrency: price.baseCurrency,
      exchangeRate: price.exchangeRate,
      channelName: channel.name,
    });
  } catch (error) {
    return reportError(res, error, "Unable to calculate the channel unblock fee.");
  }
};

export const createChannelUnblockOrder = async (req, res) => {
  if (req.body?.acceptedTerms !== true) {
    return res.status(400).json({ message: "Accept the educational-content terms before continuing." });
  }
  try {
    const { user, channel, quotedPrice, expiresAt } = await verifyUnblockToken(req.body?.unblockToken, {
      channelId: req.body?.channelId,
    });
    const staleBefore = new Date(Date.now() - 30 * 60 * 1000);
    await ChannelUnblockOrder.updateMany(
      { user: user._id, status: "pending", createdAt: { $lt: staleBefore } },
      { $set: { status: "expired" } },
    );
    if (await ChannelUnblockOrder.exists({ user: user._id, channel: channel._id, status: "pending" })) {
      return res.status(409).json({ message: "A previous unblock payment is still pending. Wait 30 minutes and try again." });
    }

    const price = quotedPrice || await getChannelUnblockPrice(user.countryCode);
    const razorpay = getRazorpay();
    const receipt = `unblock_${crypto.randomUUID().replaceAll("-", "").slice(0, 25)}`;
    const order = await razorpay.orders.create({
      amount: price.amount,
      currency: price.currency,
      receipt,
      notes: {
        userId: String(user._id),
        channelId: String(channel._id),
        purpose: "permanent_channel_unblock",
        acceptedTerms: "true",
      },
    });
    await ChannelUnblockOrder.create({
      user: user._id,
      channel: channel._id,
      orderId: order.id,
      amount: price.amount,
      currency: price.currency,
      acceptedTerms: true,
      ...(expiresAt ? { expiresAt } : {}),
    });
    return res.status(201).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID.trim(),
      name: "EduTube",
      description: "Permanent channel unblock",
    });
  } catch (error) {
    return reportError(res, error, "Unable to start channel unblock payment.");
  }
};

export const verifyChannelUnblockOrder = async (req, res) => {
  const { unblockToken, channelId, orderId, paymentId, signature } = req.body || {};
  if (!orderId || !paymentId || !signature) {
    return res.status(400).json({ message: "Missing Razorpay payment details." });
  }
  try {
    const { user, channel } = await verifyUnblockToken(unblockToken, {
      channelId,
      allowAlreadyUnblocked: true,
      allowExpiredToken: true,
    });
    const unblockOrder = await ChannelUnblockOrder.findOne({ orderId, user: user._id });
    if (!unblockOrder) return res.status(404).json({ message: "Channel unblock order not found." });
    if (String(unblockOrder.channel) !== String(channel._id)) {
      return res.status(403).json({ message: "This payment is for a different channel." });
    }
    if (unblockOrder.status === "expired" && !unblockOrder.expiresAt) {
      return res.status(410).json({ message: "The recovery QR expired before payment. Any late captured payment is being refunded." });
    }
    if (unblockOrder.status === "paid" && unblockOrder.providerPaymentId === paymentId) {
      return res.json({ success: true, message: "Channel unblock payment was already confirmed." });
    }
    if (!verifyPaymentSignature(orderId, paymentId, signature)) {
      return res.status(400).json({ message: "Payment signature verification failed." });
    }
    const razorpay = getRazorpay();
    const [payment, order] = await Promise.all([
      razorpay.payments.fetch(paymentId),
      razorpay.orders.fetch(orderId),
    ]);
    await activateUnblockedChannel({
      unblockOrder,
      payment,
      order,
      razorpay,
      capturedAt: Math.floor(Date.now() / 1000),
    });
    return res.json({ success: true, message: "Channel unblocked. You can now sign in." });
  } catch (error) {
    return reportError(res, error, "Unable to verify the channel unblock payment.");
  }
};

export const processChannelUnblockWebhook = async (event, razorpay) => {
  const payment = event.payload?.payment?.entity;
  if (event.event !== "payment.captured" || !payment?.order_id) return false;
  const unblockOrder = await ChannelUnblockOrder.findOne({ orderId: payment.order_id });
  if (!unblockOrder) return false;
  const [verifiedPayment, order] = await Promise.all([
    razorpay.payments.fetch(payment.id),
    razorpay.orders.fetch(payment.order_id),
  ]);
  await activateUnblockedChannel({
    unblockOrder,
    payment: verifiedPayment,
    order,
    razorpay,
    capturedAt: Number(event.created_at),
  });
  return true;
};
