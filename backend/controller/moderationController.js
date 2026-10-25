import ModerationCase from "../model/moderationCaseModel.js";
import mongoose from "mongoose";
import { clearBlockedAccountSession, deletePendingMedia, publishModerationCase, recordEducationViolation } from "../service/moderationEnforcement.js";

export const getModerationQueue = async (_req, res) => {
  try {
    await ModerationCase.updateMany(
      { status: "reviewing", agentTaskCreated: { $ne: true }, updatedAt: { $lt: new Date(Date.now() - 10 * 60 * 1000) } },
      { $set: { status: "pending" } }
    );
    const cases = await ModerationCase.find({ status: "pending", agentTaskCreated: { $ne: true } })
      .populate("channel", "name category")
      .populate("owner", "username email")
      .sort({ createdAt: 1 })
      .limit(100);
    return res.status(200).json(cases);
  } catch (error) {
    console.error("Unable to load educational moderation queue:", error);
    return res.status(500).json({ message: "Unable to load the moderation queue." });
  }
};

export const applyModerationDecision = async ({ caseId, decision, reason, reviewerId, source = "moderator" }) => {
  if (!mongoose.isValidObjectId(caseId)) {
    return { status: 400, body: { message: "Moderation case ID is invalid." } };
  }
  if (!["approve", "reject"].includes(decision)) {
    return { status: 400, body: { message: "Decision must be approve or reject." } };
  }

  const reviewReason = typeof reason === "string" && reason.trim()
    ? reason.trim().slice(0, 500)
    : decision === "reject"
      ? "Moderator confirmed this content is not educational."
      : "";
  let moderationCase;
  try {
    const caseFilter = source === "agent"
      ? { _id: caseId, status: { $in: ["pending", "reviewing"] }, agentTaskCreated: true }
      : { _id: caseId, status: "pending", agentTaskCreated: { $ne: true } };
    moderationCase = await ModerationCase.findOneAndUpdate(
      caseFilter,
      { $set: { status: "reviewing" } },
      { new: true }
    );
    if (!moderationCase) {
      const existingCase = await ModerationCase.findById(caseId);
      if (
        existingCase &&
        ((source === "agent" && !existingCase.agentTaskCreated) ||
          (source === "moderator" && existingCase.agentTaskCreated))
      ) {
        return { status: 403, body: { message: "This submission is assigned to a different review workflow." } };
      }
      const completedStatus = decision === "approve" ? "approved" : "rejected";
      if (existingCase?.status === completedStatus) {
        return { status: 200, body: { message: "This case was already reviewed with the same decision." } };
      }
      return { status: 409, body: { message: "This moderation case is no longer pending." } };
    }
    if (decision === "approve") {
      const content = await publishModerationCase(moderationCase);
      moderationCase.status = "approved";
      if (reviewerId) moderationCase.reviewedBy = reviewerId;
      moderationCase.reviewedAt = new Date();
      moderationCase.reviewReason = reviewReason;
      await moderationCase.save();
      return { status: 200, body: { message: "Content approved and published.", content } };
    }

    const enforcement = await recordEducationViolation(moderationCase.channel, moderationCase.owner, reviewReason);
    moderationCase.status = "rejected";
    if (reviewerId) moderationCase.reviewedBy = reviewerId;
    moderationCase.reviewedAt = new Date();
    moderationCase.reviewReason = reviewReason;
    await moderationCase.save();
    await deletePendingMedia(moderationCase);
    return {
      status: 200,
      body: {
        message: enforcement.blockType === "permanent"
          ? `Content rejected. This is channel violation ${enforcement.violationCount}; the account is permanently blocked.`
          : `Content rejected. This is channel violation ${enforcement.violationCount}; the account is blocked for 3 hours.`,
        violationCount: enforcement.violationCount,
        blockType: enforcement.blockType,
        blockedUntil: enforcement.blockedUntil,
      },
    };
  } catch (error) {
    console.error("Unable to complete educational moderation decision:", error);
    if (moderationCase?._id) {
      await ModerationCase.updateOne(
        { _id: moderationCase._id, status: "reviewing" },
        { $set: { status: "pending" } }
      ).catch((updateError) => console.error("Unable to reopen moderation case:", updateError));
    }
    return { status: 500, body: { message: "Unable to complete the moderation decision." } };
  }
};

export const reviewModerationCase = async (req, res) => {
  const result = await applyModerationDecision({
    caseId: req.params.caseId,
    decision: req.body?.decision,
    reason: req.body?.reason,
    reviewerId: req.userId,
    source: "moderator",
  });
  if (result.status === 200 && req.body?.decision === "reject") {
    const moderationCase = await ModerationCase.findById(req.params.caseId).select("owner");
    if (moderationCase?.owner?.toString() === req.userId) clearBlockedAccountSession(res);
  }
  return res.status(result.status).json(result.body);
};
