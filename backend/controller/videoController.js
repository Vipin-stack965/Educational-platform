
import Video from "../model/videoModel.js";
import Channel from "../model/channelModel.js";
import uploadOnCloudinary, { deleteCloudinaryAsset, getCloudinaryUploadErrorMessage } from "../config/cloudinary.js";
import User from "../model/userModel.js";
import { clearBlockedAccountSession, removeUploadedTempFiles, screenContentForPublishing } from "../service/moderationEnforcement.js";


export const createVideo = async (req, res) => {
  let uploadedAssets;
  try {
    const { title, description, tags, channel } = req.body;

    // Validate required fields
    if (!title?.trim() || !req.files?.video?.[0] || !channel) {
      await removeUploadedTempFiles(req);
      return res.status(400).json({
        message: "Video, title, and channel ID are required"
      });
    }

    // Get channel by ID
    const channelData = await Channel.findById(channel);
    if (!channelData) {
      await removeUploadedTempFiles(req);
      return res.status(404).json({ message: "Channel not found" });
    }
    if (channelData.owner.toString() !== req.userId) {
      await removeUploadedTempFiles(req);
      return res.status(403).json({ message: "You can only publish to your own channel" });
    }

    // Parse tags
    let parsedTags = [];
    if (tags) {
      try {
        parsedTags = JSON.parse(tags);
      } catch {
        parsedTags = [];
      }
    }

    const videoFile = req.files.video[0];
    const thumbnailFile = req.files.thumbnail?.[0];
    const cloudinaryUploadStartedAt = Date.now();
    const cloudinaryUploadsPromise = Promise.allSettled([
      uploadOnCloudinary(videoFile.path, {
        resourceType: "video",
        large: true,
        keepFile: true,
        returnDetails: true,
      }),
      thumbnailFile
        ? uploadOnCloudinary(thumbnailFile.path, { keepFile: true, returnDetails: true })
        : Promise.resolve(null),
    ]).then(async ([videoResult, thumbnailResult]) => {
      console.info(`Video media staging completed in ${Date.now() - cloudinaryUploadStartedAt}ms.`);
      const assets = {
        media: videoResult.status === "fulfilled" ? videoResult.value : null,
        thumbnail: thumbnailResult.status === "fulfilled" ? thumbnailResult.value : null,
      };
      const uploadError = [videoResult, thumbnailResult]
        .find((result) => result.status === "rejected");
      if (!uploadError) return { assets, error: null };

      await Promise.all(Object.values(assets)
        .filter(Boolean)
        .map((asset) => deleteCloudinaryAsset(asset).catch((error) => {
          console.error("Unable to clean up a partial video upload:", error);
        })));
      return { assets: null, error: uploadError.reason };
    });

    let screening = { status: "approved" };
    if (process.env.ENABLE_VIDEO_EDUCATIONAL_MODERATION === "true") {
      const screeningStartedAt = Date.now();
      try {
        screening = await screenContentForPublishing({
          req,
          channel: channelData,
          contentType: "video",
          title,
          description: description || "",
          tags: parsedTags,
          mediaFile: videoFile,
          thumbnailFile,
          channelCategory: channelData.category,
          uploadedAssetsPromise: cloudinaryUploadsPromise,
        });
        console.info(`Video moderation completed in ${Date.now() - screeningStartedAt}ms.`);
      } catch (error) {
        console.error(`Video moderation failed after ${Date.now() - screeningStartedAt}ms.`);
        console.error("AI educational review or agent handoff failed; video was not published:", error);
        const stagedUpload = await cloudinaryUploadsPromise;
        uploadedAssets = stagedUpload.assets;
        if (error.moderationCaseOwnsUploadedAssets) {
          uploadedAssets = null;
        } else if (uploadedAssets) {
          await Promise.all(Object.values(uploadedAssets)
            .filter(Boolean)
            .map((asset) => deleteCloudinaryAsset(asset).catch((cleanupError) => {
              console.error("Unable to clean up video media after review failed:", cleanupError);
            })));
        }
        await removeUploadedTempFiles(req);
        return res.status(503).json({
          message: "Educational review is temporarily unavailable or busy. Your video was not published; please try again shortly.",
        });
      }
    } else {
      console.info("Video educational moderation is disabled.");
    }

    const stagedUpload = await cloudinaryUploadsPromise;
    uploadedAssets = stagedUpload.assets;
    await removeUploadedTempFiles(req);

    if (screening.status === "rejected") {
      await Promise.all(Object.values(uploadedAssets || {})
        .filter(Boolean)
        .map((asset) => deleteCloudinaryAsset(asset).catch((error) => {
          console.error("Unable to clean up rejected video media:", error);
        })));
      uploadedAssets = null;
      clearBlockedAccountSession(res);
      const isPermanent = screening.blockType === "permanent";
      return res.status(403).json({
        message: isPermanent
          ? `This video was not published. Channel violation ${screening.violationCount}/5: the account is permanently blocked.`
          : `This video was not published. Channel violation ${screening.violationCount}/5: the account is blocked for 3 hours and has been signed out.`,
        violationCount: screening.violationCount,
        blockType: screening.blockType,
        blockedUntil: screening.blockedUntil,
      });
    }

    if (stagedUpload.error) throw stagedUpload.error;

    if (screening.status === "pending_review") {
      uploadedAssets = null;
      return res.status(202).json({
        status: screening.status,
        moderationCaseId: screening.caseId,
        message: screening.reviewQueue === "agent"
          ? "AI could not confirm the educational relevance. The video was sent to the agent review queue."
          : "AI could not confirm the educational relevance. The video was sent for moderator review.",
      });
    }

    // Create video
    const newVideo = await Video.create({
      channel: channelData._id,
      title,
      description: description || "",
      videoUrl: uploadedAssets.media.secureUrl,
      fileSizeBytes: videoFile.size,
      thumbnail: uploadedAssets.thumbnail?.secureUrl || "",
      tags: parsedTags
    });

    await Channel.findByIdAndUpdate(
      channelData._id,
      { $push: { videos: newVideo._id } }
    );

    const populatedVideo = await newVideo.populate("channel", "name avatar");
    uploadedAssets = null;
   return res.status(201).json({
      message: "Video uploaded successfully",
      video: populatedVideo
    });

  } catch (error) {
    console.error("Error creating video:", error);
    if (uploadedAssets) {
      await Promise.all(Object.values(uploadedAssets)
        .filter(Boolean)
        .map((asset) => deleteCloudinaryAsset(asset).catch((cleanupError) => {
          console.error("Unable to clean up failed video media:", cleanupError);
        })));
    }
    await removeUploadedTempFiles(req);
    const uploadError = getCloudinaryUploadErrorMessage(error, "video");
   return res.status(500).json({
      message: `Video upload failed: ${uploadError}`
    });
  }
};




// Get all videos from a channel (for playlist selection)
export const getChannelVideos = async (req, res) => {
  try {
    const { channelId } = req.body;

    if (!channelId) {
      return res.status(400).json({ message: "Channel ID is required" });
    }

    const channel = await Channel.findById(channelId);
    if (!channel) {
      return res.status(404).json({ message: "Channel not found" });
    }

    const videos = await Video.find({ channel: channelId })
      .select("title thumbnail createdAt")
      .sort({ createdAt: -1 });

   return res.status(200).json({ videos });
  } catch (error) {
   return res.status(500).json({
      message: "Error fetching channel videos",
      error: error.message
    });
  }
};


export const getAllVideos = async (req, res) => {
  try {
    const videos = await Video.find()
      .populate("channel comments.author comments.replies.author") // optional: populate channel info
      .sort({ createdAt: -1 }); // newest first

   return res.status(200).json(videos);
  } catch (error) {
    console.error("Error fetching videos:", error);
return res.status(500).json({message : "Failed to fetch videos"});
  }
};


// ---------------- FETCH SINGLE VIDEO ----------------
export const fetchVideo = async (req, res) => {
  try {
    const { videoId } = req.params;

    const video = await Video.findById(videoId)
      .populate("channel", "name avatar") // ✅ show channel info
      .populate("likes", "username photoUrl"); // optional: who liked it

    if (!video) {
      return res.status(404).json({ message: "Video not found" });
    }

    return res.status(200).json(video);
  } catch (error) {
    console.error("Error fetching video:", error);
    return res.status(500).json({
      message: "Error fetching video",
      error: error.message,
    });
  }
};



// ---------------- UPDATE VIDEO ----------------

export const updateVideo = async (req, res) => {
  try {
    const { videoId } = req.params;
    const { title, description, tags } = req.body;

    // find video
    const video = await Video.findById(videoId);
    if (!video) {
      return res.status(404).json({ message: "Video not found" });
    }
    const channel = await Channel.findOne({ _id: video.channel, owner: req.userId });
    if (!channel) return res.status(403).json({ message: "You can only update your own videos" });

    // update fields if provided
    if (title) video.title = title;
    if (description) video.description = description;

    // parse tags if sent
    if (tags) {
      try {
        video.tags = JSON.parse(tags);
      } catch {
        video.tags = [];
      }
    }

    // ✅ if new thumbnail uploaded (single file)
    if (req.file) {
      const uploadedThumbnail = await uploadOnCloudinary(req.file.path);
      video.thumbnail = uploadedThumbnail;
    }

    await video.save();

    return res.status(200).json({
      message: "Video updated successfully",
      video,
    });
  } catch (error) {
    console.error("Error updating video:", error);
    return res
      .status(500)
      .json({ message: "Error updating video", error: error.message });
  }
};

// ---------------- DELETE VIDEO ----------------
export const deleteVideo = async (req, res) => {
  try {
    const { videoId } = req.params;

    // find video
    const video = await Video.findById(videoId);
    if (!video) {
      return res.status(404).json({ message: "Video not found" });
    }
    const channel = await Channel.findOne({ _id: video.channel, owner: req.userId });
    if (!channel) return res.status(403).json({ message: "You can only delete your own videos" });

    // remove video reference from channel
    await Channel.findByIdAndUpdate(video.channel, {
      $pull: { videos: video._id },
    });

    // delete video document
    await Video.findByIdAndDelete(videoId);

    return res.status(200).json({
      message: "Video deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting video:", error);
    return res
      .status(500)
      .json({ message: "Error deleting video", error: error.message });
  }
};



// ---------------- LIKE VIDEO ----------------
export const toggleLikeVideo = async (req, res) => {
  try {
    const { videoId } = req.params;
    const userId = req.userId; // ✅ auth middleware se aayega

    const video = await Video.findById(videoId);
    if (!video) return res.status(404).json({ message: "Video not found" });

    if (video.likes.includes(userId)) {
      // already liked → remove
      video.likes.pull(userId);
    } else {
      // add like → remove dislike if exists
      video.likes.push(userId);
      video.dislikes.pull(userId);
    }

    await video.save();
   return res.status(200).json(video);
  } catch (error) {
  return  res.status(500).json({ message: "Error toggling like", error: error.message });
  }
};

// ---------------- DISLIKE VIDEO ----------------
export const toggleDislikeVideo = async (req, res) => {
  try {
    const { videoId } = req.params;
    const userId = req.userId;

    const video = await Video.findById(videoId);
    if (!video) return res.status(404).json({ message: "Video not found" });

    if (video.dislikes.includes(userId)) {
      video.dislikes.pull(userId);
    } else {
      video.dislikes.push(userId);
      video.likes.pull(userId);
    }

    await video.save();
    return res.status(200).json(video);
  } catch (error) {
    return res.status(500).json({ message: "Error toggling dislike", error: error.message });
  }
};

// ---------------- ADD COMMENT ----------------
export const addComment = async (req, res) => {
  try {
    const { videoId } = req.params;
    const { message } = req.body;
    const userId = req.userId;

    // pehle video lao
    const video = await Video.findById(videoId);
    if (!video) return res.status(404).json({ message: "Video not found" });

    // comment push karo
    video.comments.push({ author: userId, message });
    await video.save();

    // ✅ ab dobara fetch karo with nested populate
    const populatedVideo = await Video.findById(videoId)
      .populate({
        path: "comments.author",
        select: "username photoUrl email"
      })
      .populate({
        path: "comments.replies.author",
        select: "username photoUrl email"
      });

    return res.status(201).json(populatedVideo);
  } catch (error) {
    return res.status(500).json({ message: "Error adding comment", error: error.message });
  }
};


// ---------------- ADD REPLY ----------------
export const addReply = async (req, res) => {
  try {
    const { videoId, commentId } = req.params;
    const { message } = req.body;
    const userId = req.userId;

    const video = await Video.findById(videoId);
    if (!video) return res.status(404).json({ message: "Video not found" });

    const comment = video.comments.id(commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    comment.replies.push({ author: userId, message });
    await video.save();

    // ✅ again fetch with populate
    const populatedVideo = await Video.findById(videoId)
      .populate({
        path: "comments.author",
        select: "username photoUrl email"
      })
      .populate({
        path: "comments.replies.author",
        select: "username photoUrl email"
      });

    return res.status(201).json(populatedVideo);
  } catch (error) {
    return res.status(500).json({ message: "Error adding reply", error: error.message });
  }
};

// ---------------- ADD VIEW ----------------
export const addView = async (req, res) => {
  try {
    const { videoId } = req.params;

    const video = await Video.findByIdAndUpdate(
      videoId,
      { $inc: { views: 1 } },
      { new: true }
    );

    if (!video) return res.status(404).json({ message: "Video not found" });

   return res.status(200).json(video);
  } catch (error) {
   return res.status(500).json({ message: "Error adding view", error: error.message });
  }
};

// ---------------- TOGGLE SAVE ----------------
export const toggleSaveVideo = async (req, res) => {
  try {
    const { videoId } = req.params;
    const userId = req.userId;

    const video = await Video.findById(videoId);
    if (!video) return res.status(404).json({ message: "Video not found" });

    if (video.saveBy.includes(userId)) {
      video.saveBy.pull(userId);
    } else {
      video.saveBy.push(userId);
    }

    await video.save();
   return res.status(200).json(video);
  } catch (error) {
   return res.status(500).json({ message: "Error toggling save", error: error.message });
  }
};


export const getSavedVideos = async (req, res) => {
  try {
    const userId = req.userId; // ✅ Middleware se aa rahi hai
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized: User not found" });
    }

    // Find videos jisme userId saveBy array me ho
    const savedVideos = await Video.find({ saveBy: userId })
      .populate("channel", "name avatar") // channel info include karo
      .populate("saveBy", "username");    // optional: dekhna kaun save kar chuka hai

    if (!savedVideos || savedVideos.length === 0) {
      return res.status(404).json({ message: "No saved videos found" });
    }

    res.status(200).json(savedVideos);
  } catch (error) {
    console.error("Error fetching saved videos:", error);
    res.status(500).json({
      message: "Server error while fetching saved videos",
    });
  }
};

export const addVideoToDownloads = async (req, res) => {
  try {
    const { videoId } = req.params;
    const video = await Video.findByIdAndUpdate(
      videoId,
      { $addToSet: { downloadedBy: req.userId } },
      { new: true }
    );
    if (!video) return res.status(404).json({ message: "Video not found" });

    return res.status(200).json(video);
  } catch (error) {
    console.error("Error updating account downloads:", error);
    return res.status(500).json({ message: "Unable to update downloads" });
  }
};

export const removeVideoFromDownloads = async (req, res) => {
  try {
    const { videoId } = req.params;
    const video = await Video.findByIdAndUpdate(
      videoId,
      { $pull: { downloadedBy: req.userId } },
      { new: true }
    );
    if (!video) return res.status(404).json({ message: "Video not found" });

    return res.status(200).json(video);
  } catch (error) {
    console.error("Error removing video from account downloads:", error);
    return res.status(500).json({ message: "Unable to remove video from downloads" });
  }
};

export const getDownloadedVideos = async (req, res) => {
  try {
    const videos = await Video.find({ downloadedBy: req.userId })
      .populate("channel", "name avatar")
      .sort({ createdAt: -1 });

    return res.status(200).json(videos);
  } catch (error) {
    console.error("Error fetching account downloads:", error);
    return res.status(500).json({ message: "Unable to load your downloads" });
  }
};


// ---------------- Get Liked Videos ----------------
export const getLikedVideos = async (req, res) => {
  try {
    const userId = req.userId; // middleware se aayega
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized: User not found" });
    }

    // Find videos jisme likes me userId hai
    const likedVideos = await Video.find({ likes: userId })
      .populate("channel", "name avatar")
      .populate("likes", "username");

   

    res.status(200).json(likedVideos || []);
  } catch (error) {
    console.error("Error fetching liked videos:", error);
    res.status(500).json({
      message: "Server error while fetching liked videos",
    });
  }
};
