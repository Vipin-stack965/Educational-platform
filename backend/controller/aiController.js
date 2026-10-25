import Video from "../model/videoModel.js";
import Short from "../model/shortModel.js";
import Playlist from "../model/playlistModel.js";
import Channel from "../model/channelModel.js";  // ✅ Channel import karo
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();
export const searchWithAi = async (req, res) => {
  try {
    const { input } = req.body;
    if (!input) {
      return res.status(400).json({ message: "Search query is required" });
    }

    // ✅ Step 1: AI se keyword nikalo (autocorrect + simplified)
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    const prompt = `You are a search assistant for a video streaming platform. 
The user query is: "${input}"

🎯 Your job:
- If query has typos, correct them.
- If query has multiple words, break them into meaningful keywords.
- Return only the corrected word(s), comma-separated.
- Do not explain, only return keyword(s).`;

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt,
    });

    let keyword = (response.text || input).trim().replace(/[\n\r]+/g, "");

    // ✅ Step 2: Split keywords for OR search
    const searchWords = keyword.split(",").map((w) => w.trim()).filter(Boolean);

    // ✅ Helper: create OR regex query
    const buildRegexQuery = (fields) => {
      return {
        $or: searchWords.map((word) => ({
          $or: fields.map((field) => ({
            [field]: { $regex: word, $options: "i" },
          })),
        })),
      };
    };

    // 1️⃣ Channels
    const matchedChannels = await Channel.find(
      buildRegexQuery(["name"])
    ).select("_id name avatar");

    const channelIds = matchedChannels.map((c) => c._id);

    // 2️⃣ Videos
    const videos = await Video.find({
      $or: [
        buildRegexQuery(["title", "description", "tags"]),
        { channel: { $in: channelIds } },
      ],
    }).populate("channel comments.author comments.replies.author");

    // 3️⃣ Shorts
    const shorts = await Short.find({
      $or: [
        buildRegexQuery(["title", "tags"]),
        { channel: { $in: channelIds } },
      ],
    })
      .populate("channel", "name avatar")
      .populate("likes", "username photoUrl");

    // 4️⃣ Playlists
    const playlists = await Playlist.find({
      $or: [
        buildRegexQuery(["title", "description"]),
        { channel: { $in: channelIds } },
      ],
    })
      .populate("channel", "name avatar")
      .populate({
        path: "videos",
        populate: { path: "channel", select: "name avatar" },
      });

    return res.status(200).json({
      keyword, // final corrected keyword used
      channels: matchedChannels,
      videos,
      shorts,
      playlists,
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