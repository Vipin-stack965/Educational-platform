import fs from "node:fs/promises";
import Channel from "../model/channelModel.js";
import User from "../model/userModel.js";
import ModerationCase from "../model/moderationCaseModel.js";
import Video from "../model/videoModel.js";
import Short from "../model/shortModel.js";
import Post from "../model/postModel.js";
import uploadOnCloudinary from "../config/cloudinary.js";
import { reviewEducationalContent } from "./educationalModeration.js";
import { createAgentReviewTask } from "./agentPanelIntegration.js";

const TEMPORARY_BLOCK_MS = 3 * 60 * 60 * 1000;
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

  const configuredModerators = (process.env.MODERATOR_EMAILS || "")
    .split(",")
    .map((email) => email.trim())
    .filter((email) => email && !/example\.com$/i.test(email));
  const hasAgentPanelUrl = Boolean(process.env.AGENT_PANEL_URL?.trim());
  const hasAgentPanelSecret = Boolean(process.env.AGENT_PANEL_INTEGRATION_SECRET?.trim());
  if (hasAgentPanelUrl !== hasAgentPanelSecret) {
    throw new Error("Configure both AGENT_PANEL_URL and AGENT_PANEL_INTEGRATION_SECRET for agent moderation.");
  }
  const hasAgentPanelConfig = hasAgentPanelUrl && hasAgentPanelSecret;
  if (!configuredModerators.length && !hasAgentPanelConfig) {
    throw new Error("No human moderator or Agent Panel is configured for uncertain submissions.");
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
  if (hasAgentPanelConfig) {
    moderationCase.agentTaskCreated = true;
    await moderationCase.save();
    try {
      await createAgentReviewTask(moderationCase, input.channel.category);
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
  }
  return {
    status: "pending_review",
    caseId: moderationCase._id,
    reason: aiResult.reason,
    reviewQueue: hasAgentPanelConfig ? "agent" : "moderator",
  };
};

export const recordEducationViolation = async (channelId, userId, reason) => {
  const channel = await Channel.findOneAndUpdate(
    { _id: channelId, owner: userId },
    { $inc: { educationViolationCount: 1 } },
    { new: true, projection: { educationViolationCount: 1 } }
  );
  if (!channel) throw new Error("Unable to record the channel's education policy violation.");

  const violationCount = channel.educationViolationCount;
  if (violationCount >= PERMANENT_BLOCK_THRESHOLD) {
    await User.updateOne(
      { _id: userId },
      {
        $set: {
          educationBlockStatus: "permanent",
          educationBlockedUntil: null,
          educationBlockReason: "Five confirmed educational-content policy violations",
        },
      }
    );
    return { violationCount, blockType: "permanent", blockedUntil: null };
  }

  const blockedUntil = new Date(Date.now() + TEMPORARY_BLOCK_MS);
  await User.updateOne(
    { _id: userId, educationBlockStatus: { $ne: "permanent" } },
    {
      $set: {
        educationBlockStatus: "temporary",
        educationBlockedUntil: blockedUntil,
        educationBlockReason: reason,
      },
    }
  );
  return { violationCount, blockType: "temporary", blockedUntil };
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
  const { v2: cloudinary } = await import("cloudinary");
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME?.trim(),
    api_key: process.env.CLOUDINARY_API_KEY?.trim(),
    api_secret: process.env.CLOUDINARY_API_SECRET?.trim(),
  });
  const files = [
    { url: moderationCase.mediaUrl, resourceType: moderationCase.contentType === "post" ? "image" : "video" },
    { url: moderationCase.thumbnailUrl, resourceType: "image" },
  ].filter((file) => file.url);

  for (const file of files) {
    const match = file.url.match(/\/upload\/(?:v\d+\/)?(.+)\.[^.]+$/);
    if (!match) continue;
    try {
      await cloudinary.uploader.destroy(match[1], { resource_type: file.resourceType });
    } catch (error) {
      console.error("Unable to remove rejected moderation media:", error);
    }
  }
};
