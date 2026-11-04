import Video from "../model/videoModel.js";
import Short from "../model/shortModel.js";
import Playlist from "../model/playlistModel.js";
import Channel from "../model/channelModel.js";  // ✅ Channel import karo
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();
export const searchWithAi = async (req, res) => {
  try {
    const input = typeof req.body?.input === "string" ? req.body.input.trim() : "";
    if (!input) {
      return res.status(400).json({ message: "Search query is required" });
    }
    if (input.length > 200) {
      return res.status(400).json({ message: "Search query must be 200 characters or fewer" });
    }

    const keyword = input;
    const searchWords = [...new Set(
      input.split(/\s+/).map((word) => word.trim()).filter(Boolean)
    )].slice(0, 12);
    const buildTextQuery = (fields) => ({
      $and: searchWords.map((word) => {
        const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return {
          $or: fields.map((field) => ({
            [field]: { $regex: escapedWord, $options: "i" },
          })),
        };
      }),
    });

    const matchedChannels = await Channel.find(buildTextQuery(["name"]))
      .select("_id name avatar")
      .limit(50);

    const channelIds = matchedChannels.map((c) => c._id);

    const videos = await Video.find({
      $or: [
        buildTextQuery(["title", "description", "tags"]),
        { channel: { $in: channelIds } },
      ],
    })
      .populate("channel comments.author comments.replies.author")
      .sort({ views: -1, createdAt: -1 })
      .limit(100);

    const shorts = await Short.find({
      $or: [
        buildTextQuery(["title", "tags"]),
        { channel: { $in: channelIds } },
      ],
    })
      .populate("channel", "name avatar")
      .populate("likes", "username photoUrl")
      .sort({ views: -1, createdAt: -1 })
      .limit(100);

    const playlists = await Playlist.find({
      $or: [
        buildTextQuery(["title", "description"]),
        { channel: { $in: channelIds } },
      ],
    })
      .populate("channel", "name avatar")
      .populate({
        path: "videos",
        populate: { path: "channel", select: "name avatar" },
      });

    return res.status(200).json({
      keyword,
      channels: matchedChannels,
      videos,
      shorts,
      playlists: playlists.slice(0, 100),
    });
  } catch (error) {
    console.error("Search error:", error);
    return res
      .status(500)
      .json({ message: `Failed to search: ${error.message}` });
  }
};




export const filterCategoryWithAi = async (req, res) => {
  try {
    const { input } = req.body;
    if (!input) {
      return res.status(400).json({ message: "Search query is required" });
    }

    // ✅ Initialize Gemini
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    const categories = [
      "Music", "Gaming", "Movies", "TV Shows", "News",
      "Trending", "Entertainment", "Education", "Science & Tech",
      "Travel", "Fashion", "Cooking", "Sports", "Pets",
      "Art", "Comedy", "Vlogs"
    ];

    const prompt = `You are a category classifier for a video streaming platform.

The user query is: "${input}"

🎯 Your job:
- Match this query with the most relevant categories from this list:
${categories.join(", ")}
- If more than one category fits, return them comma-separated.
- If nothing fits, return the single closest category.
- Do NOT explain. Do NOT return JSON. Only return category names.

Examples:
- "arijit singh songs" → "Music"
- "pubg gameplay" → "Gaming"
- "netflix web series" → "TV Shows"
- "india latest news" → "News"
- "funny animal videos" → "Comedy, Pets"
- "fitness tips" → "Education, Sports"
`;

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODERATION_MODEL?.trim() || "gemini-3.8-flash",
      contents: prompt,
    });

    // ✅ Split categories safely
    const keywordText = response.text.trim();
    const keywords = keywordText.split(",").map(k => k.trim());

    // ✅ Build conditions for each keyword
    const videoConditions = [];
    const shortConditions = [];
    const channelConditions = [];

    keywords.forEach(kw => {
      videoConditions.push(
        { title: { $regex: kw, $options: "i" } },
        { description: { $regex: kw, $options: "i" } },
        { tags: { $regex: kw, $options: "i" } }
      );
      shortConditions.push(
        { title: { $regex: kw, $options: "i" } },
        { tags: { $regex: kw, $options: "i" } }
      );
      channelConditions.push(
        { name: { $regex: kw, $options: "i" } },
        { category: { $regex: kw, $options: "i" } },
        { description: { $regex: kw, $options: "i" } }
      );
    });

    // ✅ Find videos
    const videos = await Video.find({ $or: videoConditions })
      .populate("channel comments.author comments.replies.author");

    // ✅ Find shorts
    const shorts = await Short.find({ $or: shortConditions })
      .populate("channel", "name avatar")
      .populate("likes", "username photoUrl");

    // ✅ Find channels
    const channels = await Channel.find({ $or: channelConditions })
      .populate("owner", "username photoUrl")
      .populate("subscribers", "username photoUrl")
      .populate({
        path: "videos",
        populate: { path: "channel", select: "name avatar" },
      })
      .populate({
        path: "shorts",
        populate: { path: "channel", select: "name avatar" },
      });

    return res.status(200).json({
      videos,
      shorts,
      channels,
      keywords,
    });
  } catch (error) {
    console.error("Filter error:", error);
    return res
      .status(500)
      .json({ message: `Failed to filter: ${error.message}` });
  }
};