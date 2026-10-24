import express from "express"
import isAuth from "../middleware/isAuth.js";
import upload from "../middleware/multer.js";
import { addComment, addReply, addView, createVideo, deleteVideo, fetchVideo, getAllVideos, getChannelVideos, getLikedVideos, getSavedVideos, toggleDislikeVideo, toggleLikeVideo, toggleSaveVideo, updateVideo } from "../controller/videoController.js";
import {  addCommentforShort, addReplyforShort, addViewforShort, createShort, deleteShort, fetchShort, getAllShorts, getLikedShorts, getSavedShorts, toggleDislikeShort, toggleLikeShort, toggleSaveShort, updateShort } from "../controller/shortController.js";
import { addCommentInPost, addReplyInPost, createPost, deletePost, getAllPosts, toggleLikePost } from "../controller/postController.js";
import { createPlaylist, deletePlaylist, fetchPlaylist, getSavedPlaylists, toggleSavePlaylist, updatePlaylist } from "../controller/playlistController.js";
import { filterCategoryWithAi, searchWithAi } from "../controller/aiController.js";
import guestPublishLimit from "../middleware/guestPublishLimit.js"



const contentRouter = express.Router()
  
// for videoController
contentRouter.post("/upload-video",isAuth,guestPublishLimit,upload.fields([
    { name: "video", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 }
  ]),createVideo);

contentRouter.post("/get-videos",isAuth,getChannelVideos);

contentRouter.get("/allvideos", getAllVideos)

contentRouter.get("/savevideos",isAuth, getSavedVideos)

contentRouter.get("/likedvideos",isAuth, getLikedVideos)

contentRouter.get("/fetch-video/:videoId", isAuth, fetchVideo);

contentRouter.put("/update-video/:videoId",isAuth,upload.single("thumbnail"),updateVideo);

contentRouter.delete("/delete-video/:videoId",isAuth,deleteVideo);

// 👁️ Add view
contentRouter.put("/video/:videoId/add-view", addView);

// 👍 Like video
contentRouter.put("/video/:videoId/toggle-like", isAuth, toggleLikeVideo);

// 👎 Dislike video
contentRouter.put("/video/:videoId/toggle-dislike", isAuth, toggleDislikeVideo);

// 💾 Save / Unsave video
contentRouter.put("/video/:videoId/toggle-save", isAuth, toggleSaveVideo);

// 💬 Add comment
contentRouter.post("/video/:videoId/comment", isAuth, addComment);

// 💬 Add reply to comment
contentRouter.post("/video/:videoId/:commentId/reply", isAuth, addReply);



//for shortController
contentRouter.post("/upload-short",isAuth,guestPublishLimit,upload.single("short") , createShort)

contentRouter.get("/allshorts", getAllShorts)

contentRouter.get("/saveshorts",isAuth, getSavedShorts)

contentRouter.get("/likedshorts",isAuth, getLikedShorts)

contentRouter.put("/update-short/:shortId",isAuth,updateShort);

contentRouter.delete("/delete-short/:shortId",isAuth,deleteShort);

contentRouter.get("/fetch-short/:shortId", isAuth, fetchShort);


// 👁️ Add view
contentRouter.put("/short/:shortId/add-view",isAuth, addViewforShort);

// 👍 Like short
contentRouter.put("/short/:shortId/toggle-like", isAuth, toggleLikeShort);

// 👎 Dislike short
contentRouter.put("/short/:shortId/toggle-dislike", isAuth, toggleDislikeShort);

// 💾 Save / Unsave short
contentRouter.put("/short/:shortId/toggle-save", isAuth, toggleSaveShort);

// 💬 Add comment short
contentRouter.post("/short/:shortId/comment", isAuth, addCommentforShort);

// 💬 Add reply to comment short
contentRouter.post("/short/:shortId/:commentId/reply", isAuth, addReplyforShort);





// for postController
contentRouter.post("/create-post",isAuth,guestPublishLimit,upload.single("image"),createPost);

contentRouter.delete("/delete-post/:postId", isAuth, deletePost);

contentRouter.put("/post/toggle-like", isAuth, toggleLikePost);

// 💬 Add comment Post
contentRouter.post("/post/comment", isAuth, addCommentInPost);

// 💬 Add reply to comment Post
contentRouter.post("/post/reply", isAuth, addReplyInPost);

contentRouter.get("/allposts", getAllPosts)


//for  playlistController
contentRouter.post("/create-playlist",isAuth,guestPublishLimit,createPlaylist);

contentRouter.get("/fetch-playlist/:playlistId", fetchPlaylist);

contentRouter.put("/update-playlist/:playlistId", isAuth, updatePlaylist);

contentRouter.delete("/delete-playlist/:playlistId", isAuth, deletePlaylist);

contentRouter.post("/playlist/toggle-save" , isAuth , toggleSavePlaylist)

contentRouter.get("/saveplaylist",isAuth,getSavedPlaylists)



// for Ai Controller

contentRouter.post("/search" , isAuth , searchWithAi)
contentRouter.post("/filter" , isAuth , filterCategoryWithAi)



export default contentRouter