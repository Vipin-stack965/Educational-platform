import express from "express"
import isAuth from "../middleware/isAuth.js"
import {  addToHistory, createChannel, getAllChannel, getChannel, getCurrentUser, getHistory, getRecommendedContent, getSubscribedContent, toggleSubscribe, updateChannel } from "../controller/userController.js"
import upload from "../middleware/multer.js"
import { getHelpInfo, getSettings, submitFeedback, updateSettings } from "../controller/settingsController.js"
import requireAccount from "../middleware/requireAccount.js"


const userRouter = express.Router()
userRouter.get("/getcurrentuser",isAuth,getCurrentUser)
userRouter.get("/help", getHelpInfo)
userRouter.get("/settings", isAuth, getSettings)
userRouter.patch("/settings", isAuth, updateSettings)
userRouter.post("/feedback", isAuth, requireAccount, submitFeedback)
userRouter.post("/create-channel", isAuth , upload.fields([
    { name: "avatar", maxCount: 1 },
    { name: "bannerImage", maxCount: 1 }
  ]) , createChannel)
  userRouter.post("/update-channel", isAuth , upload.fields([
    { name: "avatar", maxCount: 1 },
    { name: "bannerImage", maxCount: 1 }
  ]) , updateChannel)
  userRouter.get("/getchannel", isAuth, getChannel);
  userRouter.get("/getallchannel", getAllChannel);
  userRouter.post("/subscribe",isAuth,toggleSubscribe)
  userRouter.get("/subscribedcontent",isAuth,getSubscribedContent)
  userRouter.post("/addhistory",isAuth,addToHistory)
  userRouter.get("/gethistory",isAuth,getHistory)
  userRouter.get("/getrecommendation",isAuth,getRecommendedContent)



export default userRouter