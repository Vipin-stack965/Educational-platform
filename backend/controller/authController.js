import genToken from "../config/token.js"
import User from "../model/userModel.js"
import validator from 'validator'
import bcrypt from 'bcryptjs'
import uploadOnCloudinary from "../config/cloudinary.js"
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
    maxAge: 7 * 24 * 60 * 60 * 1000
}
const guestCookieOptions = {
    ...cookieOptions,
    maxAge: 30 * 24 * 60 * 60 * 1000
}
const guestCookieClearOptions = {
    httpOnly: cookieOptions.httpOnly,
    secure: cookieOptions.secure,
    sameSite: cookieOptions.sameSite
}

export const createGuestSession = async (req, res) => {
    try {
        const currentGuestToken = req.cookies?.guestToken
        if (currentGuestToken) {
            try {
                const payload = jwt.verify(currentGuestToken, process.env.JWT_SECRET)
                const existingGuest = await User.findOne({
                    _id: payload.userId,
                    isGuest: true
                }).select("-password").populate("channel")
                if (existingGuest) {
                    return res.status(200).json(existingGuest)
                }
            } catch {
                res.clearCookie("guestToken", guestCookieClearOptions)
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
            { userId: guest._id.toString(), isGuest: true },
            process.env.JWT_SECRET,
            { expiresIn: "30d" }
        )
        res.cookie("guestToken", token, guestCookieOptions)
        return res.status(201).json(await User.findById(guest._id).select("-password").populate("channel"))
    } catch (error) {
        console.error("Guest session creation failed:", error)
        return res.status(500).json({ message: "Unable to start a guest session" })
    }
}


export const signUp = async (req,res) => {
    try {
        const { username, email, password} = req.body
        let photoUrl
        if(req.file){
            photoUrl = await uploadOnCloudinary(req.file.path)
        }
        let existUser = await User.findOne({email})
        if(existUser){
          return res.status(400).json({message:"User is already exist"})
        }
        if(!validator.isEmail(email)){
            return res.status(400).json({message:"Enter Valid email"})
        }
        if(password.length < 8){
            return res.status(400).json({message:"Enter Strong password"})
        }
        let hashPassword = await bcrypt.hash(password,10)
        const user = await User.create({
           username,
           email,
           password:hashPassword,
           photoUrl 
        })
        let token = await genToken(user._id)
        
        res.cookie("token", token, cookieOptions)
       return res.status(201).json(user)
    } catch (error) {
        return res.status(500).json({message:`SignUp error ${error}`})
    }
    
}

export const signin = async (req,res) => {
    try {
        const {email , password} = req.body
        let user = await User.findOne({email})
        if(!user){
            return res.status(404).json({message:"User not found"})
        }
        let isMatch = await bcrypt.compare(password , user.password)
        if(!isMatch){
            return res.status(400).json({message:"Incorrect Password"})
        }
        let token = await genToken(user._id)
        res.cookie("token", token, cookieOptions)
       return res.status(200).json(user)

    } catch (error) {
        return res.status(500).json({message:`Signin error ${error}`})
    }
    
}

export const signOut = async (req,res) => {
    try {
        res.clearCookie("token", cookieOptions)
         return res.status(200).json({message:"SignOut Successfully"})
    } catch (error) {
        return res.status(500).json({message:`SignOut error ${error}`})
    }
}




export const googleAuth = async (req, res) => {
  try {
    const { username, email, photoUrl } = req.body;

    let finalPhotoUrl = photoUrl;

    // Google ka image Cloudinary me upload karo (sirf jab image aaye)
    if (photoUrl) {
      try {
        finalPhotoUrl = await uploadOnCloudinary(photoUrl);
      } catch (err) {
        console.log("Cloudinary upload failed, using original URL");
      }
    }

    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        username,
        email,
        photoUrl: finalPhotoUrl
      });
    } else {
      if (!user.photoUrl && finalPhotoUrl) {
        user.photoUrl = finalPhotoUrl;
        await user.save();
      }
    }

    let token = await genToken(user._id);

    res.cookie("token", token, cookieOptions);

    return res.status(200).json(user);

  } catch (error) {
    return res.status(500).json({ message: `GoogleAuth error ${error}` });
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
        
        user.resetOtp = otp,
        user.otpExpires = Date.now() + 5 * 60 *1000,
        user.isOtpVerifed = false

        await user.save()
        await sendMail(email , otp)
        return res.status(200).json({message:"Otp Send Successfully"})
    } catch (error) {
        return res.status(500).json({message:`send Otp error ${error}`})
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
