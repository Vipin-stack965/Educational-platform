import fs from "node:fs/promises";
import Channel from "../model/channelModel.js";
import User from "../model/userModel.js";
import ModerationCase from "../model/moderationCaseModel.js";
import Video from "../model/videoModel.js";
import Short from "../model/shortModel.js";
import Post from "../model/postModel.js";
import uploadOnCloudinary, { deleteCloudinaryAsset } from "../config/cloudinary.js";
import { reviewEducationalContent } from "./educationalModeration.js";
import { createCheckAuthReviewTask } from "./checkAuthIntegration.js";
import { notifyEducationBlock } from "./channelBlockNotification.js";

const TEMPORARY_BLOCK_MS = 24 * 60 * 60 * 1000;
const PERMANENT_BLOCK_THRESHOLD = 5;

export const clearBlockedAccountSession = (res) => {
  const isProduction = process.env.NODE_ENV === "production";
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === undefined
      ? isProduction
      : process.env.COOKIE_SECURE === "true",
    sameSite: process.env.COOKIE_SAME_SITE || (isProduction ? "none" : "strict"),
  };
  res.clearCookie("token", cookieOptions);
  res.clearCookie("guestToken", cookieOptions);
};

export const removeUploadedTempFiles = async (req) => {
  const files = [
    ...(req.file ? [req.file] : []),
    ...Object.values(req.files || {}).flat(),
  ];
  await Promise.all(files.filter((file) => file?.path).map(async ({ path }) => {
    try {
      await fs.unlink(path);
    } catch (error) {
      if (error.code !== "ENOENT") console.error("Unable to remove temporary upload:", error);
    }
  }));
};

export const saveModerationCase = async ({
  req,
  channel,
  contentType,
  title = "",
  description = "",
  tags = [],
  text = "",
  mediaFile,
  thumbnailFile,
  imageFile,
  uploadedAssets,
  isPaidContent = false,
  fileSizeBytes,
  reason,
}) => {
  let mediaUrl = uploadedAssets?.media?.secureUrl || "";
  let thumbnailUrl = uploadedAssets?.thumbnail?.secureUrl || "";

  if (mediaFile && !mediaUrl) {
    mediaUrl = await uploadOnCloudinary(mediaFile.path, {
      resourceType: "video",
      large: true,
      folder: "moderation-pending",
    });
  }
  if (thumbnailFile && !thumbnailUrl) {
    thumbnailUrl = await uploadOnCloudinary(thumbnailFile.path, { folder: "moderation-pending" });
  }
  if (imageFile && !mediaUrl) {
    mediaUrl = await uploadOnCloudinary(imageFile.path, { folder: "moderation-pending" });
  }

  return ModerationCase.create({
    channel: channel._id,
    owner: req.userId,
    contentType,
    title,
    description,
    tags,
    text,
    mediaUrl,
    isPaidContent,
    mediaPublicId: uploadedAssets?.media?.publicId || "",
    mediaResourceType: uploadedAssets?.media?.resourceType || "",
    mediaDeliveryType: uploadedAssets?.media?.deliveryType || "upload",
    mediaVersion: uploadedAssets?.media?.version,
    mediaFormat: uploadedAssets?.media?.format || "",
    thumbnailUrl,
    fileSizeBytes,
    mimeType: mediaFile?.mimetype || imageFile?.mimetype || "",
    aiReason: reason,
  });
};

export const screenContentForPublishing = async (input) => {
  const aiResult = await reviewEducationalContent(input);
  if (aiResult.verdict === "educational") {
    return { status: "approved" };
  }
  if (aiResult.verdict === "non_educational") {
    const enforcement = await recordEducationViolation(input.channel._id, input.req.userId, aiResult.reason);
    return { status: "rejected", reason: aiResult.reason, ...enforcement };
  }

  const hasCheckAuthUrl = Boolean(process.env.CHECK_AUTH_URL?.trim());
  const hasIntegrationSecret = Boolean(process.env.AGENT_PANEL_INTEGRATION_SECRET?.trim());
  if (hasCheckAuthUrl !== hasIntegrationSecret) {
    throw new Error("Configure both CHECK_AUTH_URL and AGENT_PANEL_INTEGRATION_SECRET for Check Auth moderation.");
  }
  const hasCheckAuthConfig = hasCheckAuthUrl && hasIntegrationSecret;
  if (!hasCheckAuthConfig) {
    throw new Error("Configure CHECK_AUTH_URL and AGENT_PANEL_INTEGRATION_SECRET to review uncertain submissions in Check Auth.");
  }

  const stagedUpload = input.uploadedAssetsPromise
    ? await input.uploadedAssetsPromise
    : null;
  if (stagedUpload?.error) throw stagedUpload.error;

  const moderationCase = await saveModerationCase({
    ...input,
    uploadedAssets: stagedUpload?.assets,
    reason: aiResult.reason,
    fileSizeBytes: input.mediaFile?.size,
  });
  moderationCase.agentTaskCreated = true;
  await moderationCase.save();
  try {
    await createCheckAuthReviewTask(moderationCase, input.channel.category);
  } catch (error) {
    await ModerationCase.updateOne(
      { _id: moderationCase._id, status: "pending" },
      { $set: { agentTaskCreated: false } }
    );
    if (error && typeof error === "object") {
      error.moderationCaseOwnsUploadedAssets = true;
    }
    throw error;
  }
  return {
    status: "pending_review",
    caseId: moderationCase._id,
    reason: aiResult.reason,
  };
};

export const recordEducationViolation = async (
  channelId,
  userId,
  reason,
  { channelOnlyTemporaryBlock = false, blockDurationMinutes = 0 } = {},
) => {
  const channel = await Channel.findOneAndUpdate(
    { _id: channelId, owner: userId },
    { $inc: { educationViolationCount: 1 } },
    { new: true, projection: { name: 1, educationViolationCount: 1, educationBlockStatus: 1, paidUnblockCount: 1 } }
  );
  if (!channel) throw new Error("Unable to record the channel's education policy violation.");

  const violationCount = channel.educationViolationCount;
  if (channelOnlyTemporaryBlock && channel.educationBlockStatus === "permanent") {
    return {
      violationCount,
      blockType: "permanent",
      blockedUntil: null,
      channelOnlyTemporaryBlock: false,
    };
  }
  if (!channelOnlyTemporaryBlock && violationCount >= PERMANENT_BLOCK_THRESHOLD) {
    const [channelTransition] = await Promise.all([
      Channel.updateOne(
        { _id: channelId, educationBlockStatus: { $ne: "permanent" } },
        { $set: { educationBlockStatus: "permanent", educationBlockedUntil: null, educationBlockedAt: new Date() } },
      ),
      User.updateOne(
        { _id: userId },
        {
          $set: {
            educationBlockStatus: "permanent",
            educationBlockedUntil: null,
            educationBlockReason: "Five confirmed educational-content policy violations",
          },
        },
      ),
    ]);
    const selfUnblockAvailable = (channel.paidUnblockCount || 0) < 1;
    if (channelTransition.modifiedCount > 0) {
      try {
        await notifyEducationBlock({
          userId,
          channel,
          blockType: "permanent",
          reason: "Five confirmed educational-content policy violations",
          selfUnblockAvailable,
        });
      } catch (error) {
        console.error("Unable to email permanent channel block notice:", error);
      }
    }
    return {
      violationCount,
      blockType: "permanent",
      blockedUntil: null,
      selfUnblockAvailable,
    };
  }

  const durationMinutes = channelOnlyTemporaryBlock ? blockDurationMinutes : TEMPORARY_BLOCK_MS / 60000;
  const blockedUntil = new Date(Date.now() + durationMinutes * 60 * 1000);
  const blockUpdates = [
    Channel.updateOne(
      { _id: channelId, educationBlockStatus: { $ne: "permanent" } },
      { $set: { educationBlockStatus: "temporary", educationBlockedUntil: blockedUntil, educationBlockedAt: new Date() } },
    ),
  ];
  if (!channelOnlyTemporaryBlock) {
    blockUpdates.push(User.updateOne(
      { _id: userId, educationBlockStatus: { $ne: "permanent" } },
      {
        $set: {
          educationBlockStatus: "temporary",
          educationBlockedUntil: blockedUntil,
          educationBlockReason: reason,
        },
      },
    ));
  }
  await Promise.all(blockUpdates);
  try {
    await notifyEducationBlock({
      userId,
      channel,
      blockType: "temporary",
      reason,
      blockDurationMinutes: durationMinutes,
      channelOnly: channelOnlyTemporaryBlock,
    });
  } catch (error) {
    console.error("Unable to email temporary channel block notice:", error);
  }
  return {
    violationCount,
    blockType: "temporary",
    blockedUntil,
    channelOnlyTemporaryBlock,
    blockDurationMinutes: durationMinutes,
  };
};

export const publishModerationCase = async (moderationCase) => {
  const channel = await Channel.findById(moderationCase.channel);
  if (!channel) throw new Error("Channel no longer exists; content cannot be published.");

  if (moderationCase.contentType === "video") {
    if (!moderationCase.mediaUrl) {
      throw new Error("Pending video is missing its media.");
    }
    const video = await Video.findOneAndUpdate(
      { moderationCaseId: moderationCase._id },
      {
        $setOnInsert: {
          channel: channel._id,
          title: moderationCase.title,
          description: moderationCase.description,
          tags: moderationCase.tags,
          videoUrl: moderationCase.mediaUrl,
          isPaidContent: moderationCase.isPaidContent,
          mediaPublicId: moderationCase.mediaPublicId || "",
          mediaResourceType: moderationCase.mediaResourceType || "video",
          mediaDeliveryType: moderationCase.mediaDeliveryType || "upload",
          mediaVersion: moderationCase.mediaVersion,
          mediaFormat: moderationCase.mediaFormat || "",
          thumbnail: moderationCase.thumbnailUrl || "",
          fileSizeBytes: moderationCase.fileSizeBytes,
          moderationCaseId: moderationCase._id,
        },
      },
      { new: true, upsert: true }
    );
    if (!channel.videos.some((id) => id.equals(video._id))) {
      channel.videos.push(video._id);
      await channel.save();
    }
    return video;
  }
  if (moderationCase.contentType === "short") {
    if (!moderationCase.mediaUrl) throw new Error("Pending Short is missing its media.");
    const short = await Short.findOneAndUpdate(
      { moderationCaseId: moderationCase._id },
      {
        $setOnInsert: {
          channel: channel._id,
          title: moderationCase.title,
          description: moderationCase.description,
          tags: moderationCase.tags,
          shortUrl: moderationCase.mediaUrl,
          thumbnail: moderationCase.thumbnailUrl || "",
          moderationCaseId: moderationCase._id,
        },
      },
      { new: true, upsert: true }
    );
    if (!channel.shorts.some((id) => id.equals(short._id))) {
      channel.shorts.push(short._id);
      await channel.save();
    }
    return short;
  }
  const post = await Post.findOneAndUpdate(
    { moderationCaseId: moderationCase._id },
    {
      $setOnInsert: {
        channel: channel._id,
        content: moderationCase.text,
        image: moderationCase.mediaUrl || undefined,
        moderationCaseId: moderationCase._id,
      },
    },
    { new: true, upsert: true }
  );
  if (!channel.communityPosts.some((id) => id.equals(post._id))) {
    channel.communityPosts.push(post._id);
    await channel.save();
  }
  return post;
};

export const deletePendingMedia = async (moderationCase) => {
  const files = [{
    publicId: moderationCase.mediaPublicId,
    resourceType: moderationCase.mediaResourceType || (moderationCase.contentType === "post" ? "image" : "video"),
    deliveryType: moderationCase.mediaDeliveryType,
    url: moderationCase.mediaUrl,
  }, {
    url: moderationCase.thumbnailUrl,
    resourceType: "image",
  }].filter((file) => file.url);

  for (const file of files) {
    try {
      if (file.publicId) {
        await deleteCloudinaryAsset(file);
        continue;
      }
      const match = file.url.match(/\/(?:upload|authenticated)\/(?:s--[^/]+--\/)?(?:v\d+\/)?(.+)\.[^.]+$/);
      if (match) await deleteCloudinaryAsset({ publicId: match[1], resourceType: file.resourceType });
    } catch (error) {
      console.error("Unable to remove rejected moderation media:", error);
    }
  }
};
