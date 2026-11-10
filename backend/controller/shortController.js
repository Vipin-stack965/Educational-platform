import Channel from "../model/channelModel.js";
import uploadOnCloudinary, { deleteCloudinaryAsset, getCloudinaryUploadErrorMessage } from "../config/cloudinary.js";
import Short from "../model/shortModel.js";
import { clearBlockedAccountSession, removeUploadedTempFiles, screenContentForPublishing } from "../service/moderationEnforcement.js";

const deleteUploadedShortAssets = async (assets) => {
  await Promise.all(assets.filter(Boolean).map((asset) =>
    deleteCloudinaryAsset(asset).catch((error) => {
      console.error("Unable to clean up Short media after moderation:", error);
    })
  ));
};

export const createShort = async (req, res) => {
  let uploadedAssets = [];
  let createdShort;
  try {
    const { title, description, tags, channelId } = req.body;
    const file = req.files?.short?.[0];
    const thumbnailFile = req.files?.thumbnail?.[0];

    if (!file) {
      return res.status(400).json({ message: "Shorts video is required" });
    }
    if (!title?.trim() || !channelId) {
      await removeUploadedTempFiles(req);
      return res.status(400).json({ message: "Short title and channel are required" });
    }
    const channel = await Channel.findOne({ _id: channelId, owner: req.userId });
    if (!channel) {
      await removeUploadedTempFiles(req);
      return res.status(403).json({ message: "You can only publish to your own channel" });
    }

    let parsedTags = [];
    if (tags) {
      try {
        parsedTags = JSON.parse(tags);
        if (!Array.isArray(parsedTags) || !parsedTags.every(tag => typeof tag === "string")) {
          await removeUploadedTempFiles(req);
          return res.status(400).json({ message: "Tags must be a list of text values" });
        }
      } catch {
        await removeUploadedTempFiles(req);
        return res.status(400).json({ message: "Tags must be valid JSON" });
      }
    }

    const cloudinaryUploadStartedAt = Date.now();
    const cloudinaryUploadsPromise = Promise.allSettled([
      uploadOnCloudinary(file.path, {
        resourceType: "video",
        large: true,
        keepFile: true,
        returnDetails: true,
      }),
      thumbnailFile
        ? uploadOnCloudinary(thumbnailFile.path, {
          keepFile: true,
          returnDetails: true,
        })
        : Promise.resolve(null),
    ]).then(async (results) => {
      console.info(`Short media staging completed in ${Date.now() - cloudinaryUploadStartedAt}ms.`);
      const assets = results
        .filter((result) => result.status === "fulfilled" && result.value)
        .map((result) => result.value);
      const uploadError = results.find((result) => result.status === "rejected");
      if (!uploadError) return { assets, error: null };

      await deleteUploadedShortAssets(assets);
      return { assets: null, error: uploadError.reason };
    });

    let screening;
    try {
      screening = await screenContentForPublishing({
        req,
        channel,
        contentType: "short",
        title: title.trim(),
        description: description || "",
        tags: parsedTags,
        mediaFile: file,
        thumbnailFile,
        channelCategory: channel.category,
        uploadedAssetsPromise: cloudinaryUploadsPromise,
      });
    } catch (error) {
      console.error("AI educational review or agent handoff failed; Short was not published:", error);
      const stagedUpload = await cloudinaryUploadsPromise;
      uploadedAssets = stagedUpload.assets || [];
      if (error.moderationCaseOwnsUploadedAssets) uploadedAssets = [];
      else await deleteUploadedShortAssets(uploadedAssets);
      await removeUploadedTempFiles(req);
      return res.status(503).json({
        message: "AI review or agent handoff is currently unavailable. The Short was not published; please try again later.",
      });
    }

    const stagedUpload = await cloudinaryUploadsPromise;
    uploadedAssets = stagedUpload.assets || [];
    await removeUploadedTempFiles(req);
    if (stagedUpload.error) throw stagedUpload.error;

    if (screening.status === "pending_review") {
      uploadedAssets = [];
      return res.status(202).json({
        status: screening.status,
        moderationCaseId: screening.caseId,
        message: "AI could not confirm the educational relevance. The Short was sent to Check Auth for review and will be published only if approved.",
      });
    }
    if (screening.status === "rejected") {
      await deleteUploadedShortAssets(uploadedAssets);
      uploadedAssets = [];
      clearBlockedAccountSession(res);
      const isPermanent = screening.blockType === "permanent";
      return res.status(403).json({
        message: isPermanent
          ? `This Short was not published. Channel violation ${screening.violationCount}/5: the channel is permanently blocked.${screening.selfUnblockAvailable ? " Sign in to pay for its one available self-unblock." : " This channel cannot be unblocked again."}`
          : `This Short was not published. Channel violation ${screening.violationCount}/5: the channel is blocked for 24 hours and the account has been signed out.`,
        violationCount: screening.violationCount,
        blockType: screening.blockType,
        blockedUntil: screening.blockedUntil,
        selfUnblockAvailable: screening.selfUnblockAvailable,
      });
    }

    const [videoAsset, thumbnailAsset] = stagedUpload.assets;

    // Create short in DB
    createdShort = await Short.create({
      title: title.trim(),
      description: description || "",
      tags: parsedTags,
      channel: channelId,
      shortUrl: videoAsset.secureUrl,
      thumbnail: thumbnailAsset?.secureUrl || "",
    });

    // Update channel shorts list
    await Channel.findByIdAndUpdate(channelId, {
      $push: { shorts: createdShort._id },
    });
    uploadedAssets = [];

    res.status(201).json({
      message: "Short created successfully",
      short: createdShort,
    });
  } catch (error) {
    console.error("Error creating short:", error);
    await removeUploadedTempFiles(req);
    if (createdShort) {
      await Channel.updateOne({ _id: createdShort.channel }, { $pull: { shorts: createdShort._id } });
      await Short.deleteOne({ _id: createdShort._id });
    }
    await deleteUploadedShortAssets(uploadedAssets);
    const uploadError = getCloudinaryUploadErrorMessage(error, "Short video");
    res.status(500).json({ message: `Short upload failed: ${uploadError}` });
  }
};



export const getAllShorts = async (req, res) => {
  try {
    const shorts = await Short.find()
      .populate("channel comments.author comments.replies.author") // optional: populate channel info
      .sort({ createdAt: -1 }); // newest first

    res.status(200).json(shorts);
  } catch (error) {
    console.error("Error fetching shorts:", error);
res.status(500).json({message : "Failed to fetch short"});
  }
};

export const addShortToDownloads = async (req, res) => {
  try {
    const short = await Short.findByIdAndUpdate(
      req.params.shortId,
      { $addToSet: { downloadedBy: req.userId } },
      { new: true }
    );
    if (!short) return res.status(404).json({ message: "Short not found" });
    return res.status(200).json(short);
  } catch (error) {
    console.error("Error adding Short to account downloads:", error);
    return res.status(500).json({ message: "Unable to update downloads" });
  }
};

export const removeShortFromDownloads = async (req, res) => {
  try {
    const short = await Short.findByIdAndUpdate(
      req.params.shortId,
      { $pull: { downloadedBy: req.userId } },
      { new: true }
    );
    if (!short) return res.status(404).json({ message: "Short not found" });
    return res.status(200).json(short);
  } catch (error) {
    console.error("Error removing Short from account downloads:", error);
    return res.status(500).json({ message: "Unable to remove Short from downloads" });
  }
};

export const getDownloadedShorts = async (req, res) => {
  try {
    const shorts = await Short.find({ downloadedBy: req.userId })
      .populate("channel", "name avatar")
      .sort({ createdAt: -1 });
    return res.status(200).json(shorts);
  } catch (error) {
    console.error("Error fetching account Short downloads:", error);
    return res.status(500).json({ message: "Unable to load your downloads" });
  }
};

// ---------------- FETCH SINGLE SHORT ----------------
export const fetchShort = async (req, res) => {
  try {
    const { shortId } = req.params;

    const short = await Short.findById(shortId)
      .populate("channel", "name avatar") // ✅ channel info
      .populate("likes", "username photoUrl"); // optional: who liked

    if (!short) {
      return res.status(404).json({ message: "Short not found" });
    }

    return res.status(200).json({ short });
  } catch (error) {
    console.error("Error fetching short:", error);
    return res.status(500).json({
      message: "Error fetching short",
      error: error.message,
    });
  }
};



// ---------------- UPDATE SHORT ----------------
export const updateShort = async (req, res) => {
  try {
    const { shortId } = req.params;
    const { title, tags , description } = req.body;

    const short = await Short.findById(shortId);
    if (!short) {
      return res.status(404).json({ message: "Short not found" });
    }
    const channel = await Channel.findOne({ _id: short.channel, owner: req.userId });
    if (!channel) return res.status(403).json({ message: "You can only update your own shorts" });

    if (title) short.title = title;
    if (description) short.description = description;

    if (tags) {
      try {
        short.tags = JSON.parse(tags);
      } catch {
        short.tags = [];
      }
    }

    await short.save();

    return res.status(200).json({
      message: "Short updated successfully",
      short,
    });
  } catch (error) {
    console.error("Error updating short:", error);
    return res
      .status(500)
      .json({ message: "Error updating short", error: error.message });
  }
};

// ---------------- DELETE SHORT ----------------
export const deleteShort = async (req, res) => {
  try {
    const { shortId } = req.params;

    const short = await Short.findById(shortId);
    if (!short) {
      return res.status(404).json({ message: "Short not found" });
    }
    const channel = await Channel.findOne({ _id: short.channel, owner: req.userId });
    if (!channel) return res.status(403).json({ message: "You can only delete your own shorts" });

    // remove reference from channel
    await Channel.findByIdAndUpdate(short.channel, {
      $pull: { shorts: short._id },
    });

    await Short.findByIdAndDelete(shortId);

    return res.status(200).json({
      message: "Short deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting short:", error);
    return res
      .status(500)
      .json({ message: "Error deleting short", error: error.message });
  }
};







// ---------------- LIKE VIDEO ----------------
export const toggleLikeShort = async (req, res) => {
  try {
    const { shortId } = req.params;
    const userId = req.userId; // ✅ auth middleware se aayega

    const short = await Short.findById(shortId);
    if (!short) return res.status(404).json({ message: "short not found" });

    if (short?.likes.includes(userId)) {
      // already liked → remove
      short.likes.pull(userId);
    } else {
      // add like → remove dislike if exists
      short?.likes.push(userId);
      short?.dislikes.pull(userId);
    }

    await short.save();
     await short.populate("comments.author", "username photoUrl");
    await short.populate("channel")
     await short.populate("comments.replies.author", "username photoUrl");
   return res.status(200).json(short);
  } catch (error) {
  return  res.status(500).json({ message: "Error toggling like", error: error.message });
  }
};

// ---------------- DISLIKE VIDEO ----------------
export const toggleDislikeShort = async (req, res) => {
  try {
    const { shortId } = req.params;
    const userId = req.userId;

    const short = await Short.findById(shortId);
    if (!short) return res.status(404).json({ message: "short not found" });

    if (short.dislikes.includes(userId)) {
      short.dislikes.pull(userId);
    } else {
      short.dislikes.push(userId);
      short.likes.pull(userId);
    }
 await short.populate("comments.author", "username photoUrl");
    await short.populate("channel")
     await short.populate("comments.replies.author", "username photoUrl");
    await short.save();
    return res.status(200).json(short);
  } catch (error) {
    return res.status(500).json({ message: "Error toggling dislike", error: error.message });
  }
};

// ---------------- ADD COMMENT ----------------
// ---------------- ADD COMMENT ----------------
export const addCommentforShort = async (req, res) => {
  try {
    const { shortId } = req.params;
    const { message } = req.body;
    const userId = req.userId;

    // pehle video lao
    const short = await Short.findById(shortId);
    if (!short) return res.status(404).json({ message: "short not found" });

    // comment TOP pe add karo
    short.comments.unshift({ author: userId, message });
    await short.save();
 await short.populate("comments.author", "username photoUrl");
    await short.populate("channel")
     await short.populate("comments.replies.author", "username photoUrl");

    return res.status(201).json(short);
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error adding comment", error: error.message });
  }
};

// ---------------- ADD REPLY ----------------
export const addReplyforShort = async (req, res) => {
  try {
    const { shortId, commentId } = req.params;
    const { message } = req.body;
    const userId = req.userId;

    const short = await Short.findById(shortId);
    if (!short) return res.status(404).json({ message: "Video not found" });

    const comment = short.comments.id(commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    // reply TOP pe add karo
    comment.replies.unshift({ author: userId, message });
    await short.save();
      await short.populate("comments.author", "username photoUrl");
    await short.populate("channel")
     await short.populate("comments.replies.author", "username photoUrl");

    return res.status(201).json(short);
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error adding reply", error: error.message });
  }
};


// ---------------- ADD VIEW ----------------
export const addViewforShort = async (req, res) => {
  try {
    const { shortId } = req.params;

    const short = await Short.findByIdAndUpdate(
      shortId,
      { $inc: { views: 1 } },
      { new: true }
    );

    if (!short) return res.status(404).json({ message: "Video not found" });

      await short.populate("comments.author", "username photoUrl");
    await short.populate("channel")
     await short.populate("comments.replies.author", "username photoUrl");

   return res.status(200).json(short);
  } catch (error) {
   return res.status(500).json({ message: "Error adding view", error: error.message });
  }
};

// ---------------- TOGGLE SAVE ----------------
export const toggleSaveShort = async (req, res) => {
  try {
    const { shortId } = req.params;
    const userId = req.userId;

    const short = await Short.findById(shortId);
    if (!short) return res.status(404).json({ message: "Video not found" });

    if (short.saveBy.includes(userId)) {
      short.saveBy.pull(userId);
    } else {
      short.saveBy.push(userId);
    }
    await short.populate("comments.author", "username photoUrl");
    await short.populate("channel")
     await short.populate("comments.replies.author", "username photoUrl");

    await short.save();
   return res.status(200).json(short);
  } catch (error) {
   return res.status(500).json({ message: "Error toggling save", error: error.message });
  }
};



export const getSavedShorts = async (req, res) => {
  try {
    const userId = req.userId; // ✅ Middleware se aa rahi hai
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized: User not found" });
    }

    // Find videos jisme userId saveBy array me ho
    const savedShorts = await Short.find({ saveBy: userId })
      .populate("channel", "name avatar") // channel info include karo
      .populate("saveBy", "username");    // optional: dekhna kaun save kar chuka hai

    if (!savedShorts || savedShorts.length === 0) {
      return res.status(404).json({ message: "No saved videos found" });
    }

    res.status(200).json(savedShorts);
  } catch (error) {
    console.error("Error fetching saved shorts:", error);
    res.status(500).json({
      message: "Server error while fetching saved shorts",
    });
  }
};

// ---------------- Get Liked Shorts ----------------
export const getLikedShorts = async (req, res) => {
  try {
    const userId = req.userId; // middleware se aayega
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized: User not found" });
    }

    // Find shorts jisme likes me userId hai
    const likedShorts = await Short.find({ likes: userId })
      .populate("channel", "name avatar")
      .populate("likes", "username");

    res.status(200).json(likedShorts || []);
  } catch (error) {
    console.error("Error fetching liked shorts:", error);
    res.status(500).json({
      message: "Server error while fetching liked shorts",
    });
  }
};
