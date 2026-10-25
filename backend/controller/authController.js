import genToken from "../config/token.js"
import User from "../model/userModel.js"
import validator from 'validator'
import bcrypt from 'bcryptjs'
import uploadOnCloudinary, { getCloudinaryUploadErrorMessage } from "../config/cloudinary.js"
import sendMail from "../config/sendMail.js"
import Channel from "../model/channelModel.js"
import jwt from "jsonwebtoken"
import { randomUUID } from "node:crypto"

const isProduction = process.env.NODE_ENV === "production"
const cookieOptions = {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === undefined
        ? isProduction
        : process.env.COOKIE_SECURE === "true",
    sameSite: process.env.COOKIE_SAME_SITE || (isProduction ? "none" : "strict"),
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000
}
const guestCookieOptions = {
    ...cookieOptions,
    maxAge: 30 * 24 * 60 * 60 * 1000
}
const guestCookieClearOptions = {
    httpOnly: cookieOptions.httpOnly,
    secure: cookieOptions.secure,
    sameSite: cookieOptions.sameSite,
    path: cookieOptions.path
}
const legacyAuthCookieClearOptions = {
    ...guestCookieClearOptions,
    path: "/api/auth"
}

const clearSessionCookie = (res, name) => {
    res.clearCookie(name, guestCookieClearOptions)
    res.clearCookie(name, legacyAuthCookieClearOptions)
}

const createGuestSessionForMode = async (req, res, isAgentReview) => {
    try {
        clearSessionCookie(res, "token")
        const currentGuestToken = req.cookies?.guestToken
        if (currentGuestToken) {
            try {
                const payload = jwt.verify(currentGuestToken, process.env.JWT_SECRET)
                const existingGuest = await User.findOne({
                    _id: payload.userId,
                    isGuest: true
                }).select("-password").populate("channel")
                if (existingGuest && Boolean(payload.isAgentReview) === isAgentReview) {
                    res.clearCookie("guestToken", legacyAuthCookieClearOptions)
                    res.cookie("guestToken", currentGuestToken, guestCookieOptions)
                    return res.status(200).json({
                        ...existingGuest.toObject(),
                        isAgentReview
                    })
                }
                res.clearCookie("guestToken", legacyAuthCookieClearOptions)
            } catch {
                clearSessionCookie(res, "guestToken")
            }
        }

        const guestId = randomUUID()
        const guest = await User.create({
            username: `Guest ${guestId.slice(0, 8)}`,
            email: `guest-${guestId}@guest.invalid`,
            isGuest: true
        })

        try {
            const channel = await Channel.create({
                owner: guest._id,
                name: `Guest channel ${guestId.slice(0, 8)}`,
                category: "General"
            })
            guest.channel = channel._id
            await guest.save()
        } catch (error) {
            await User.findByIdAndDelete(guest._id)
            throw error
        }

        const token = jwt.sign(
            { userId: guest._id.toString(), isGuest: true, ...(isAgentReview && { isAgentReview: true }) },
            process.env.JWT_SECRET,
            { expiresIn: "30d" }
        )
        res.cookie("guestToken", token, guestCookieOptions)
        const guestResponse = await User.findById(guest._id).select("-password").populate("channel")
        return res.status(201).json({
            ...guestResponse.toObject(),
            isAgentReview
        })
    } catch (error) {
        console.error("Guest session creation failed:", error)
        return res.status(500).json({ message: "Unable to start a guest session" })
    }
}

export const createGuestSession = (req, res) => createGuestSessionForMode(req, res, false)

export const createAgentGuestSession = (req, res) => createGuestSessionForMode(req, res, true)

export const exitAgentReviewSession = (_req, res) => {
    clearSessionCookie(res, "guestToken")
    return res.status(200).json({ message: "Exited EduTube agent review mode." })
}


export const signUp = async (req, res) => {
    try {
        const username = typeof req.body.username === "string" ? req.body.username.trim() : ""
        const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : ""
        const password = typeof req.body.password === "string" ? req.body.password : ""

        if (!username || !email || !password) {
            return res.status(400).json({ message: "Username, email and password are required" })
        }
        if (!validator.isEmail(email)) {
            return res.status(400).json({ message: "Enter a valid email" })
        }
        if (password.length < 8) {
            return res.status(400).json({ message: "Password must be at least 8 characters" })
        }

        const existUser = await User.findOne({ email })
        if (existUser) {
            return res.status(409).json({ message: "An account with this email already exists" })
        }

        let photoUrl
        let warning
        if (req.file) {
            try {
                photoUrl = await uploadOnCloudinary(req.file.path)
            } catch (error) {
                const message = getCloudinaryUploadErrorMessage(error, "signup profile picture")
                console.error("Signup avatar upload failed:", message)
                warning = `Account created, but the profile picture could not be uploaded. ${message}`
            }
        }

        const hashPassword = await bcrypt.hash(password, 10)
        const user = await User.create({
            username,
            email,
            password: hashPassword,
            photoUrl
        })

        const token = await genToken(user._id)
        res.cookie("token", token, cookieOptions)
        const safeUser = user.toObject()
        delete safeUser.password
        return res.status(201).json({ user: safeUser, warning })
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ message: "An account with this email already exists" })
        }
        console.error("Signup failed:", error.message || error)
        return res.status(500).json({ message: "Unable to create account. Please try again." })
    }
}

export const signin = async (req,res) => {
    try {
        const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : ""
        const password = typeof req.body.password === "string" ? req.body.password : ""
        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" })
        }

        const user = await User.findOne({ email }).select("-resetOtp -otpExpires -isOtpVerifed")
        if(!user){
            return res.status(401).json({message:"Invalid email or password"})
        }
        const isMatch = user.password ? await bcrypt.compare(password, user.password) : false
        if(!isMatch){
            return res.status(401).json({message:"Invalid email or password"})
        }
        if (user.educationBlockStatus === "permanent") {
            return res.status(403).json({ message: "This account is permanently blocked after repeated educational-content policy violations." })
        }
        if (user.educationBlockStatus === "temporary" && user.educationBlockedUntil > new Date()) {
            return res.status(403).json({
                message: "This account is temporarily blocked for 3 hours after an educational-content policy violation.",
                blockedUntil: user.educationBlockedUntil,
            })
        }
        if (user.educationBlockStatus === "temporary") {
            user.educationBlockStatus = "active"
            user.educationBlockedUntil = null
            user.educationBlockReason = ""
            await user.save()
        }
        const token = await genToken(user._id)
        res.cookie("token", token, cookieOptions)
        const safeUser = user.toObject()
        delete safeUser.password
        return res.status(200).json(safeUser)

    } catch (error) {
        console.error("Signin failed:", error.message || error)
        return res.status(500).json({message:"Unable to sign in. Please try again."})
    }
    
}

export const signOut = async (req,res) => {
    try {
        clearSessionCookie(res, "token")
         return res.status(200).json({message:"SignOut Successfully"})
    } catch (error) {
        return res.status(500).json({message:`SignOut error ${error}`})
    }
}




export const googleAuth = async (req, res) => {
  try {
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const username = typeof req.body.username === "string" ? req.body.username.trim() : "";
    const photoUrl = typeof req.body.photoUrl === "string" ? req.body.photoUrl.trim() : "";
    const intent = req.body.intent || "legacy";

    if (!validator.isEmail(email)) {
      return res.status(400).json({ message: "Google account did not provide a valid email address." });
    }
    if (!["signup", "signin", "legacy"].includes(intent)) {
      return res.status(400).json({ message: "Choose Google sign up or Google sign in." });
    }

    let user = await User.findOne({ email });

    if (!user) {
      if (intent === "signin") {
        return res.status(404).json({ message: "No EduTube account exists for this Google account. Choose Sign up with Google first." });
      }
    } else if (intent === "signup") {
      return res.status(409).json({ message: "An EduTube account already exists for this Google account. Choose Sign in with Google." });
    }

    let finalPhotoUrl = photoUrl;
    if (photoUrl) {
      try {
        finalPhotoUrl = await uploadOnCloudinary(photoUrl);
      } catch (err) {
        console.log("Cloudinary upload failed, using original URL");
      }
    }

    if (!user) {
      user = await User.create({
        username: username || email.split("@")[0],
        email,
        photoUrl: finalPhotoUrl
      });
    } else {
      if (user.educationBlockStatus === "permanent") {
        return res.status(403).json({ message: "This account is permanently blocked after repeated educational-content policy violations." });
      }
      if (user.educationBlockStatus === "temporary" && user.educationBlockedUntil > new Date()) {
        return res.status(403).json({
          message: "This account is temporarily blocked for 3 hours after an educational-content policy violation.",
          blockedUntil: user.educationBlockedUntil,
        });
      }
      if (user.educationBlockStatus === "temporary") {
        user.educationBlockStatus = "active";
        user.educationBlockedUntil = null;
        user.educationBlockReason = "";
      }
      if (!user.photoUrl && finalPhotoUrl) {
        user.photoUrl = finalPhotoUrl;
      }
      if (user.isModified()) await user.save();
    }

    const token = await genToken(user._id);

    res.cookie("token", token, cookieOptions);

    const safeUser = user.toObject();
    delete safeUser.password;
    return res.status(200).json(safeUser);

  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "An account with this email already exists. Please try signing in again." });
    }
    console.error("Google authentication failed:", error.message || error);
    return res.status(500).json({ message: "Unable to sign in with Google. Please try again." });
  }
};


export const sendOTP = async (req,res) => {
    try {
        const {email} = req.body
        const user = await User.findOne({email})
        if(!user){
             return res.status(404).json({message:"User not found"})
        }
        const otp = Math.floor(1000 + Math.random()* 9000).toString()
        
        user.resetOtp = otp
        user.otpExpires = Date.now() + 5 * 60 * 1000
        user.isOtpVerifed = false
        await user.save()

        try {
            await sendMail(email, otp)
        } catch (error) {
            user.resetOtp = undefined
            user.otpExpires = undefined
            user.isOtpVerifed = false
            await user.save()
            throw error
        }
        return res.status(200).json({message:"Otp Send Successfully"})
    } catch (error) {
        console.error("Password reset email failed:", error.message || error)
        if (error.code === "EMAIL_AUTH_FAILED") {
            return res.status(503).json({ message: error.message })
        }
        return res.status(503).json({ message: error.message || "Unable to send password reset email. Please try again later." })
    }
    
}

export const verifyOTP = async (req,res) => {
    try {
        const {email,otp} = req.body
         const user = await User.findOne({email})
        if(!user || user.resetOtp != otp || user.otpExpires < Date.now() ){
             return res.status(404).json({message:"Invalid OTP"})
        }
        user.isOtpVerifed = true,
        user.resetOtp = undefined,
        user.otpExpires = undefined

        await user.save()

         return res.status(200).json({message:"Otp Verified Successfully"})

    } catch (error) {
         return res.status(500).json({message:`verify Otp error ${error}`})
    }
}


export const resetPassword = async (req,res) => {
    try {
        const {email, password} = req.body
        const user = await User.findOne({email})
        if(!user || !user.isOtpVerifed){
             return res.status(404).json({message:"OTP verification is required"})
        }
        const hashPassword = await bcrypt.hash(password,10)
        user.password = hashPassword,
        user.isOtpVerifed = false

        await user.save()
         return res.status(200).json({message:"Reset Password Successfully"})

    } catch (error) {
        return res.status(500).json({message:`reset password error ${error}`})
    }
}
