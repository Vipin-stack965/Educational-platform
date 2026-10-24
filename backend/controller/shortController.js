import Channel from "../model/channelModel.js";
import uploadOnCloudinary from "../config/cloudinary.js";
import Short from "../model/shortModel.js";




export const createShort = async (req, res) => {
  try {
    const { title, description, tags, channelId } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: "Shorts video is required" });
    }
    if (!title?.trim() || !channelId) {
      return res.status(400).json({ message: "Short title and channel are required" });
    }
    const channel = await Channel.findOne({ _id: channelId, owner: req.userId });
    if (!channel) {
      return res.status(403).json({ message: "You can only publish to your own channel" });
    }

    let parsedTags = [];
    if (tags) {
      try {
        parsedTags = JSON.parse(tags);
        if (!Array.isArray(parsedTags) || !parsedTags.every(tag => typeof tag === "string")) {
          return res.status(400).json({ message: "Tags must be a list of text values" });
        }
      } catch {
        return res.status(400).json({ message: "Tags must be valid JSON" });
      }
    }

    // Upload to Cloudinary
    const videoUpload = await uploadOnCloudinary(file.path, {
      resourceType: "video",
      large: true
    });

    // Create short in DB
    const newShort = await Short.create({
      title: title.trim(),
      description: description || "",
      tags: parsedTags,
      channel: channelId,
      shortUrl: videoUpload,
    });

    // Update channel shorts list
    await Channel.findByIdAndUpdate(channelId, {
      $push: { shorts: newShort._id },
    });

    res.status(201).json({
      message: "Short created successfully",
      short: newShort,
    });
  } catch (error) {
    console.error("Error creating short:", error);
    const uploadError = error.error?.message || error.message || "Unknown upload error";
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
