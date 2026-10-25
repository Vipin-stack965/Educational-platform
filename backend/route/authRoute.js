import express from "express"
import { createAgentGuestSession, createGuestSession, exitAgentReviewSession, googleAuth, resetPassword, sendOTP, signin, signOut, signUp, verifyOTP } from "../controller/authController.js"
import upload from "../middleware/multer.js"


const authRouter = express.Router()

authRouter.post("/guest-session", createGuestSession)
authRouter.post("/agent-guest-session", createAgentGuestSession)
authRouter.post("/exit-agent-review", exitAgentReviewSession)
authRouter.post("/signup",upload.single("photoUrl"),signUp)
authRouter.post("/signin",signin)
authRouter.get("/signout",signOut)
authRouter.post("/google-auth", upload.single("photoUrl"), googleAuth);
authRouter.post("/sendotp",sendOTP)
authRouter.post("/verifyotp",verifyOTP)
authRouter.post("/resetpassword",resetPassword)



export default authRouter