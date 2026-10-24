import jwt from "jsonwebtoken"
import User from "../model/userModel.js"

const isAuth = async (req,res,next) => {
    try {
        const token = req.cookies?.token
        const guestToken = req.cookies?.guestToken
        let verifyToken

        for (const [candidate, isGuest] of [[token, false], [guestToken, true]]) {
            if (!candidate) continue
            try {
                verifyToken = jwt.verify(candidate, process.env.JWT_SECRET)
            } catch {
                continue
            }
            if (isGuest && (!verifyToken.isGuest || !await User.exists({ _id: verifyToken.userId, isGuest: true }))) {
                continue
            }
            req.userId = verifyToken.userId
            req.isGuest = isGuest
            return next()
        }

        return res.status(401).json({ message: "Sign in or continue as guest to use this feature" })
    } catch (error) {
        console.error("Authentication middleware error:", error)
        return res.status(500).json({message:"Unable to authenticate request"})
    }
}

export default isAuth