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
            const account = await User.findById(verifyToken.userId)
                .select("educationBlockStatus educationBlockedUntil")
                .lean()
            if (!account) {
                return res.status(401).json({ message: "Account not found. Please sign in again." })
            }
            if (account.educationBlockStatus === "permanent") {
                return res.status(403).json({ message: "This account is permanently blocked after repeated educational-content policy violations." })
            }
            if (
                account.educationBlockStatus === "temporary" &&
                account.educationBlockedUntil &&
                new Date(account.educationBlockedUntil) > new Date()
            ) {
                return res.status(403).json({
                    message: "This account is temporarily blocked for 3 hours after an educational-content policy violation.",
                    blockedUntil: account.educationBlockedUntil,
                })
            }
            if (account.educationBlockStatus === "temporary") {
                await User.updateOne(
                    { _id: verifyToken.userId, educationBlockStatus: "temporary" },
                    { $set: { educationBlockStatus: "active", educationBlockedUntil: null, educationBlockReason: "" } }
                )
            }
            req.userId = verifyToken.userId
            req.isGuest = isGuest
            req.isAgentReview = isGuest && Boolean(verifyToken.isAgentReview)
            return next()
        }

        return res.status(401).json({ message: "Sign in or continue as guest to use this feature" })
    } catch (error) {
        console.error("Authentication middleware error:", error)
        return res.status(500).json({message:"Unable to authenticate request"})
    }
}

export default isAuth