import crypto from "node:crypto";
import mongoose from "mongoose";
import Razorpay from "razorpay";
import Channel from "../model/channelModel.js";
import PlatformMembership from "../model/platformMembershipModel.js";
import PlatformOffer from "../model/platformOfferModel.js";
import PlatformOrder from "../model/platformOrderModel.js";

const unavailablePlanTypes = ["family", "two-person"];

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
  const supplied = Buffer.from(suppliedSignature, "hex");
  return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
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
});

const getOffer = async (offerId) => {
  if (!mongoose.isValidObjectId(offerId)) return null;
  const offer = await PlatformOffer.findOne({ _id: offerId, active: true }).lean();
  if (!offer) return null;
  if (offer.scope === "channel" && !await Channel.exists({ _id: offer.channel })) return null;
  return offer;
};

const reportError = (res, error, fallback) => {
  if (error?.status) return res.status(error.status).json({ message: error.message });
  console.error(fallback, error);
  return res.status(500).json({ message: fallback });
};

export const getPublicPlatformOffers = async (_req, res) => {
  try {
    const offers = await PlatformOffer.find({ active: true })
      .populate("channel", "name avatar")
      .sort({ createdAt: -1 })
      .lean();
    return res.json(offers
      .filter((offer) => (
        (offer.scope === "account" || offer.channel) &&
        !unavailablePlanTypes.includes(offer.planType)
      ))
      .map(asOffer));
  } catch (error) {
    return reportError(res, error, "Unable to load current offers.");
  }
};

export const createPlatformOrder = async (req, res) => {
  try {
    const offer = await getOffer(req.body?.offeringId);
    if (!offer) return res.status(404).json({ message: "This offer is unavailable." });
    if (offer.billingType !== "one-time") {
      return res.status(400).json({ message: "Use subscription checkout for this offer." });
    }

    const razorpay = getRazorpay();
    const order = await razorpay.orders.create({
      amount: offer.amount,
      currency: offer.currency,
      receipt: `edu_${crypto.randomUUID().replaceAll("-", "").slice(0, 30)}`,
      notes: {
        buyerId: String(req.userId),
        offerId: String(offer._id),
        scope: offer.scope,
        channelId: offer.channel ? String(offer.channel) : "",
      },
    });
    await PlatformOrder.create({
      user: req.userId,
      offer: offer._id,
      title: offer.title,
      scope: offer.scope,
      channel: offer.channel || null,
      billingType: offer.billingType,
      durationDays: offer.durationDays,
      status: "pending",
      amount: offer.amount,
      currency: offer.currency,
      orderId: order.id,
    });
    return res.status(201).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID.trim(),
      name: "EduTube",
      description: offer.title,
    });
  } catch (error) {
    return reportError(res, error, "Unable to start offer checkout.");
  }
};

const ensurePlan = async (offer) => {
  if (offer.providerPlanId) return offer.providerPlanId;
  const razorpay = getRazorpay();
  const plan = await razorpay.plans.create({
    period: offer.interval,
    interval: 1,
    item: {
      name: offer.title,
      amount: offer.amount,
      currency: offer.currency,
      description: offer.description || offer.title,
    },
  });
  await PlatformOffer.updateOne(
    { _id: offer._id, providerPlanId: "" },
    { $set: { providerPlanId: plan.id } },
  );
  const updated = await PlatformOffer.findById(offer._id).select("providerPlanId").lean();
  return updated.providerPlanId || plan.id;
};

export const createPlatformSubscription = async (req, res) => {
  try {
    const offer = await getOffer(req.body?.offeringId);
    if (!offer || offer.billingType !== "subscription") {
      return res.status(404).json({ message: "This membership offer is unavailable." });
    }
    const razorpay = getRazorpay();
    const planId = await ensurePlan(offer);
    const subscription = await razorpay.subscriptions.create({
      plan_id: planId,
      customer_notify: 1,
      total_count: 100,
      notes: {
        offerId: String(offer._id),
        buyerId: String(req.userId),
        scope: offer.scope,
        channelId: offer.channel ? String(offer.channel) : "",
      },
    });
    await PlatformMembership.findOneAndUpdate(
      { subscriptionId: subscription.id },
      {
        $setOnInsert: {
          user: req.userId,
          offer: offer._id,
          scope: offer.scope,
          channel: offer.channel || null,
          subscriptionId: subscription.id,
          status: "pending",
        },
      },
      { upsert: true, new: true },
    );
    return res.status(201).json({
      subscriptionId: subscription.id,
      keyId: process.env.RAZORPAY_KEY_ID.trim(),
      name: "EduTube",
      description: offer.title,
    });
  } catch (error) {
    return reportError(res, error, "Unable to start membership checkout.");
  }
};

const validateCapturedPlatformOrder = ({ transaction, payment, order }) => {
  const notes = order?.notes || {};
  if (
    !transaction || order?.status !== "paid" ||
    order.id !== transaction.orderId || payment.order_id !== transaction.orderId ||
    String(notes.buyerId || "") !== String(transaction.user) ||
    String(notes.offerId || "") !== String(transaction.offer) ||
    String(notes.scope || "") !== transaction.scope ||
    String(notes.channelId || "") !== String(transaction.channel || "") ||
    Number(order.amount) !== transaction.amount || Number(payment.amount) !== transaction.amount ||
    order.currency !== transaction.currency || payment.currency !== transaction.currency ||
    payment.status !== "captured"
  ) {
    const error = new Error("The captured payment does not match this offer.");
    error.status = 409;
    throw error;
  }
};

const markPlatformOrderPaid = async ({ transaction, payment, order }) => {
  validateCapturedPlatformOrder({ transaction, payment, order });
  if (transaction.status === "paid") {
    if (transaction.providerPaymentId !== payment.id) {
      const error = new Error("This offer order was already confirmed with a different payment.");
      error.status = 409;
      throw error;
    }
    return transaction;
  }
  if (!Number.isInteger(transaction.durationDays) || transaction.durationDays < 1) {
    const error = new Error("The offer order has an invalid validity period.");
    error.status = 409;
    throw error;
  }
  transaction.status = "paid";
  transaction.providerPaymentId = payment.id;
  transaction.paidAt = new Date();
  transaction.validUntil = new Date(Date.now() + transaction.durationDays * 24 * 60 * 60 * 1000);
  await transaction.save();
  return transaction;
};

export const verifyPlatformOrder = async (req, res) => {
  try {
    const { orderId, paymentId, signature } = req.body || {};
    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({ message: "Missing Razorpay payment details." });
    }
    const transaction = await PlatformOrder.findOne({ orderId, user: req.userId, billingType: "one-time" });
    if (!transaction) return res.status(404).json({ message: "Purchase order not found." });
    if (transaction.status === "paid" && transaction.providerPaymentId === paymentId) {
      return res.json({ success: true, message: "Payment already confirmed." });
    }
    if (!signatureMatches(`${orderId}|${paymentId}`, signature, process.env.RAZORPAY_KEY_SECRET?.trim())) {
      return res.status(400).json({ message: "Payment signature verification failed." });
    }
    const razorpay = getRazorpay();
    const [payment, order] = await Promise.all([
      razorpay.payments.fetch(paymentId),
      razorpay.orders.fetch(orderId),
    ]);
    await markPlatformOrderPaid({ transaction, payment, order });
    return res.json({ success: true, message: "Ad-free offer activated." });
  } catch (error) {
    return reportError(res, error, "Unable to verify the payment.");
  }
};

const fulfillPlatformSubscriptionPayment = async ({ subscriptionId, paymentId, razorpay, expectedUserId }) => {
  const membership = await PlatformMembership.findOne({ subscriptionId });
  if (!membership || (expectedUserId && String(membership.user) !== String(expectedUserId))) {
    const error = new Error("The membership subscription could not be matched to this account.");
    error.status = 404;
    throw error;
  }
  const offer = await PlatformOffer.findById(membership.offer).lean();
  if (!offer) {
    const error = new Error("The membership offer no longer exists.");
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
    Number(payment.amount) !== offer.amount ||
    payment.currency !== offer.currency ||
    String(subscription.plan_id) !== String(offer.providerPlanId) ||
    !["active", "authenticated"].includes(subscription.status)
  ) {
    const error = new Error("Razorpay has not confirmed the expected membership payment.");
    error.status = 409;
    throw error;
  }

  const currentPeriodEnd = subscription.current_end
    ? new Date(subscription.current_end * 1000)
    : undefined;
  membership.status = "active";
  membership.currentPeriodEnd = currentPeriodEnd;
  await membership.save();
  await PlatformOrder.findOneAndUpdate(
    { providerPaymentId: payment.id },
    {
      $setOnInsert: {
        user: membership.user,
        offer: offer._id,
        title: offer.title,
        scope: membership.scope,
        channel: membership.channel,
        billingType: "subscription",
        amount: Number(payment.amount),
        currency: payment.currency,
        providerPaymentId: payment.id,
        subscriptionId,
      },
      $set: { status: "paid", paidAt: new Date(), validUntil: currentPeriodEnd },
    },
    { upsert: true, new: true },
  );
  return { payment, membership };
};

export const verifyPlatformSubscription = async (req, res) => {
  try {
    const { subscriptionId, paymentId, signature } = req.body || {};
    if (!subscriptionId || !paymentId || !signature) {
      return res.status(400).json({ message: "Missing Razorpay membership details." });
    }
    if (!signatureMatches(`${subscriptionId}|${paymentId}`, signature, process.env.RAZORPAY_KEY_SECRET?.trim())) {
      return res.status(400).json({ message: "Membership signature verification failed." });
    }
    await fulfillPlatformSubscriptionPayment({
      subscriptionId,
      paymentId,
      razorpay: getRazorpay(),
      expectedUserId: req.userId,
    });
    return res.json({ success: true, message: "Ad-free membership activated." });
  } catch (error) {
    return reportError(res, error, "Unable to verify the membership payment.");
  }
};

export const getPlatformPurchaseHistory = async (req, res) => {
  try {
    const [orders, memberships] = await Promise.all([
      PlatformOrder.find({ user: req.userId }).populate("channel", "name").sort({ createdAt: -1 }).lean(),
      PlatformMembership.find({ user: req.userId }).populate("channel", "name")
        .populate("offer", "title interval amount currency").sort({ createdAt: -1 }).lean(),
    ]);
    return res.json({
      purchases: orders.map((item) => ({
        id: item._id,
        status: item.status,
        title: item.title,
        scope: item.scope,
        channelName: item.channel?.name || "",
        amount: item.amount,
        currency: item.currency,
        createdAt: item.createdAt,
        paidAt: item.paidAt,
        validUntil: item.validUntil,
      })),
      memberships: memberships.map((item) => ({
        id: item._id,
        status: item.status,
        scope: item.scope,
        channelName: item.channel?.name || "",
        subscriptionId: item.subscriptionId,
        currentPeriodEnd: item.currentPeriodEnd,
        cancelAtPeriodEnd: item.cancelAtPeriodEnd,
        title: item.offer?.title || "Unavailable offer",
        interval: item.offer?.interval || "",
        amount: item.offer?.amount,
        currency: item.offer?.currency,
      })),
    });
  } catch (error) {
    return reportError(res, error, "Unable to load offer history.");
  }
};

export const cancelPlatformMembership = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.membershipId)) {
      return res.status(400).json({ message: "Invalid membership id." });
    }
    const membership = await PlatformMembership.findOne({
      _id: req.params.membershipId,
      user: req.userId,
    });
    if (!membership) return res.status(404).json({ message: "Membership not found." });
    if (membership.status !== "active") {
      return res.status(409).json({ message: "Only an active membership can be cancelled." });
    }
    if (membership.cancelAtPeriodEnd) {
      return res.json({ success: true, message: "This membership is already scheduled to end." });
    }
    await getRazorpay().subscriptions.cancel(membership.subscriptionId, true);
    membership.cancelAtPeriodEnd = true;
    await membership.save();
    return res.json({ success: true, message: "Membership cancellation is scheduled for the end of the billing period." });
  } catch (error) {
    return reportError(res, error, "Unable to cancel this membership.");
  }
};

export const getAdFreeAccess = async (req, res) => {
  try {
    const channelId = typeof req.query.channelId === "string" ? req.query.channelId : "";
    if (channelId && !mongoose.isValidObjectId(channelId)) {
      return res.status(400).json({ message: "Channel ID is invalid." });
    }
    const now = new Date();
    const scope = channelId
      ? { $or: [{ scope: "account" }, { scope: "channel", channel: channelId }] }
      : { scope: "account" };
    const [purchase, membership] = await Promise.all([
      PlatformOrder.findOne({
        user: req.userId,
        status: "paid",
        billingType: "one-time",
        validUntil: { $gt: now },
        ...scope,
      }).select("_id validUntil scope channel").sort({ validUntil: -1 }).lean(),
      PlatformMembership.findOne({
        user: req.userId,
        status: { $in: ["active", "cancelled"] },
        currentPeriodEnd: { $gt: now },
        ...scope,
      }).select("_id currentPeriodEnd scope channel").sort({ currentPeriodEnd: -1 }).lean(),
    ]);
    const activeGrants = [purchase, membership].filter(Boolean).sort((left, right) => (
      new Date(right.validUntil || right.currentPeriodEnd) - new Date(left.validUntil || left.currentPeriodEnd)
    ));
    const active = activeGrants[0];
    return res.json({
      entitled: Boolean(active),
      validUntil: active?.validUntil || active?.currentPeriodEnd || null,
      scope: active?.scope || null,
    });
  } catch (error) {
    return reportError(res, error, "Unable to check ad-free access.");
  }
};

export const processPlatformWebhook = async (event, razorpay) => {
  const payment = event.payload?.payment?.entity;
  if (event.event === "payment.captured" && payment?.order_id) {
    const transaction = await PlatformOrder.findOne({
      orderId: payment.order_id,
      billingType: "one-time",
    });
    if (!transaction) return false;
    const [verifiedPayment, order] = await Promise.all([
      razorpay.payments.fetch(payment.id),
      razorpay.orders.fetch(payment.order_id),
    ]);
    await markPlatformOrderPaid({ transaction, payment: verifiedPayment, order });
    return true;
  }

  const subscription = event.payload?.subscription?.entity;
  if (
    ["subscription.cancelled", "subscription.completed", "subscription.halted"].includes(event.event) &&
    subscription?.id
  ) {
    const status = event.event === "subscription.halted" ? "expired" : "cancelled";
    await PlatformMembership.updateOne(
      { subscriptionId: subscription.id },
      {
        $set: {
          status,
          ...(subscription.current_end ? { currentPeriodEnd: new Date(subscription.current_end * 1000) } : {}),
        },
      },
    );
    return Boolean(await PlatformMembership.exists({ subscriptionId: subscription.id }));
  }

  if (["subscription.charged", "subscription.activated"].includes(event.event)) {
    const subscriptionId = subscription?.id;
    const paymentId = payment?.id || subscription?.payment_id;
    if (!subscriptionId || !paymentId) return false;
    if (!await PlatformMembership.exists({ subscriptionId })) return false;
    await fulfillPlatformSubscriptionPayment({ subscriptionId, paymentId, razorpay });
    return true;
  }
  return false;
};
