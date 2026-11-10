import jwt from "jsonwebtoken";
import QRCode from "qrcode";
import User from "../model/userModel.js";
import { getChannelUnblockPrice, toMajorCurrencyAmount } from "./channelUnblockPricing.js";
import { sendEduTubeChannelBlockEmail } from "../config/sendMail.js";

const RECOVERY_WINDOW_SECONDS = 5 * 60;

const getWebsiteUrl = () => {
  const configuredUrl = process.env.WEBSITE_URL?.trim();
  if (!configuredUrl) throw new Error("WEBSITE_URL must be configured to email channel recovery QR codes.");
  const websiteUrl = new URL(configuredUrl);
  if (!["http:", "https:"].includes(websiteUrl.protocol)) {
    throw new Error("WEBSITE_URL must use HTTP or HTTPS.");
  }
  if (process.env.NODE_ENV === "production" && websiteUrl.protocol !== "https:") {
    throw new Error("WEBSITE_URL must use HTTPS in production.");
  }
  return websiteUrl;
};

const createRecoveryQr = async ({ user, channel }) => {
  const price = await getChannelUnblockPrice(user.countryCode);
  if (!process.env.JWT_SECRET?.trim()) throw new Error("JWT_SECRET must be configured for channel recovery links.");

  const issuedAt = Math.floor(Date.now() / 1000);
  const token = jwt.sign({
    userId: String(user._id),
    channelId: String(channel._id),
    purpose: "channel-unblock",
    unblockQuote: {
      amount: price.amount,
      currency: price.currency,
      baseAmount: price.baseAmount,
      baseCurrency: price.baseCurrency,
      exchangeRate: price.exchangeRate,
    },
    iat: issuedAt,
  }, process.env.JWT_SECRET, { expiresIn: RECOVERY_WINDOW_SECONDS });
  const payload = jwt.decode(token);
  if (!payload?.exp) throw new Error("Unable to set an expiry for the channel recovery QR code.");

  const recoveryUrl = getWebsiteUrl();
  recoveryUrl.pathname = "/signin";
  recoveryUrl.search = "";
  recoveryUrl.hash = "";
  recoveryUrl.searchParams.set("channelUnblock", token);
  recoveryUrl.searchParams.set("channelUnblockExpiresAt", String(payload.exp * 1000));
  const qrCode = await QRCode.toBuffer(recoveryUrl.toString(), {
    type: "png",
    errorCorrectionLevel: "H",
    margin: 2,
    width: 360,
  });

  return {
    amount: toMajorCurrencyAmount(price.amount, price.currency),
    currency: price.currency,
    expiresAt: new Date(payload.exp * 1000),
    recoveryUrl: recoveryUrl.toString(),
    qrCode,
  };
};

export const notifyEducationBlock = async ({
  userId,
  channel,
  blockType,
  reason = "",
  selfUnblockAvailable = false,
  blockDurationMinutes = 24 * 60,
  channelOnly = false,
}) => {
  const user = await User.findById(userId).select("_id email username countryCode").lean();
  if (!user?.email) throw new Error("The blocked channel owner has no email address.");

  let recovery = null;
  if (blockType === "permanent" && selfUnblockAvailable) {
    try {
      recovery = await createRecoveryQr({ user, channel });
    } catch (error) {
      console.error("Unable to create permanent channel unblock QR:", error);
    }
  }

  await sendEduTubeChannelBlockEmail(user.email, {
    channelName: channel.name,
    username: user.username,
    blockType,
    reason,
    blockDurationMinutes,
    channelOnly,
    selfUnblockAvailable,
    recovery,
  });
};

export const notifyAdminChannelBlock = async ({ channelName, ownerId }) => {
  const owner = await User.findById(ownerId).select("email username").lean();
  if (!owner?.email) throw new Error("The blocked channel owner has no email address.");
  await sendEduTubeChannelBlockEmail(owner.email, {
    channelName,
    blockType: "admin",
    username: owner.username,
  });
};
