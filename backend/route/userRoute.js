import express from "express"
import isAuth from "../middleware/isAuth.js"
import requireAccount from "../middleware/requireAccount.js"
import {  addToHistory, createChannel, getAllChannel, getChannel, getCurrentUser, getHistory, getRecommendedContent, getSubscribedContent, toggleSubscribe, updateChannel } from "../controller/userController.js"
import upload from "../middleware/multer.js"
import { getHelpInfo, getSettings, submitFeedback, updateSettings } from "../controller/settingsController.js"
import User from "../model/userModel.js"


const userRouter = express.Router()
userRouter.get("/getcurrentuser",isAuth,getCurrentUser)
userRouter.post("/heartbeat", isAuth, async (req, res) => {
  if (req.isAgentReview) return res.sendStatus(204)
  const countryHeader = (process.env.EDUTUBE_COUNTRY_HEADER || "cf-ipcountry").trim().toLowerCase()
  const suppliedCountry = req.get(countryHeader)?.trim().toUpperCase() || ""
  const countryCode = /^[A-Z]{2}$/.test(suppliedCountry) && suppliedCountry !== "XX"
    ? suppliedCountry
    : ""
  try {
    await User.updateOne({ _id: req.userId }, { $set: { lastSeenAt: new Date() } }, { timestamps: false })
    if (countryCode) {
      await User.updateOne(
        {
          _id: req.userId,
          $or: [{ countryCode: { $exists: false } }, { countryCode: "" }],
        },
        { $set: { countryCode } },
        { timestamps: false },
      )
    }
    return res.sendStatus(204)
  } catch (error) {
    console.error("Unable to record user activity:", error)
    return res.status(500).json({ message: "Unable to update account activity." })
  }
})
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