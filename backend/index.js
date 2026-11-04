import express from 'express'
import dotenv from 'dotenv'
import connectDb from './config/connectDb.js'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import authRouter from './route/authRoute.js'
import userRouter from './route/userRoute.js'
import contentRouter from './route/contentRoute.js'
import paymentRouter from './route/paymentRoute.js'
import { handleRazorpayWebhook } from './controller/commerceController.js'
import { applyModerationDecision } from './controller/moderationController.js'
import {
    createAgentPanelOffer,
    getAgentPanelPaymentConfig,
    getAgentPanelAnalytics,
    listAgentPanelChannels,
    listAgentPanelOffers,
    updateAgentPanelOffer,
} from './controller/adminIntegrationController.js'
import requireAgentIntegration from './middleware/requireAgentIntegration.js'
import { sendAgentPanelPasswordResetEmail } from './config/sendMail.js'

dotenv.config()

const app = express()
const agentIntegrationSecret = process.env.AGENT_PANEL_INTEGRATION_SECRET?.trim() || ""
const agentReviewSessionRoutes = new Set([
    "/api/auth/agent-guest-session",
    "/api/auth/exit-agent-review",
])
app.post("/api/payments/webhook", express.raw({ type: "application/json" }), handleRazorpayWebhook)
app.use(cookieParser())
app.use(express.json())
app.use(cors({
    origin: (process.env.CORS_ORIGIN || "http://localhost:5173,http://localhost:8080")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    credentials: true
}))

app.post("/api/integrations/moderation-cases/:caseId/review", requireAgentIntegration, async (req, res) => {
    const result = await applyModerationDecision({
        caseId: req.params.caseId,
        decision: req.body?.decision,
        reason: req.body?.reason,
        source: "agent",
    })
    return res.status(result.status).json(result.body)
})

app.post("/api/integrations/agent-panel/password-reset-email", requireAgentIntegration, async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : ""
    const resetToken = typeof req.body?.resetToken === "string" ? req.body.resetToken : ""
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[a-f0-9]{64}$/i.test(resetToken)) {
        return res.status(400).json({ message: "A valid email and reset token are required." })
    }

    let panelUrl
    try {
        panelUrl = new URL(process.env.AGENT_PANEL_FRONTEND_URL?.trim() || "http://localhost:5174")
        if (!["http:", "https:"].includes(panelUrl.protocol)) throw new Error("Unsupported panel URL protocol.")
    } catch {
        return res.status(503).json({ message: "Agent panel frontend URL is not configured." })
    }

    panelUrl.searchParams.set("resetPassword", resetToken)
    try {
        await sendAgentPanelPasswordResetEmail(email, panelUrl.toString())
        return res.status(200).json({ message: "Password reset email sent." })
    } catch (error) {
        console.error("Agent panel password reset email failed:", error.message || error)
        return res.status(503).json({ message: "Unable to send password reset email." })
    }
})

app.get("/api/integrations/agent-panel/analytics", requireAgentIntegration, getAgentPanelAnalytics)
app.get("/api/integrations/agent-panel/channels", requireAgentIntegration, listAgentPanelChannels)
app.get("/api/integrations/agent-panel/payment-config", requireAgentIntegration, getAgentPanelPaymentConfig)
app.get("/api/integrations/agent-panel/offers", requireAgentIntegration, listAgentPanelOffers)
app.post("/api/integrations/agent-panel/offers", requireAgentIntegration, createAgentPanelOffer)
app.patch("/api/integrations/agent-panel/offers/:offerId", requireAgentIntegration, updateAgentPanelOffer)

app.use((req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next()

    if (agentReviewSessionRoutes.has(req.path)) return next()

    const reviewToken = req.cookies?.guestToken
    if (!reviewToken) return next()

    try {
        const payload = jwt.verify(reviewToken, process.env.JWT_SECRET)
        if (payload.isGuest && payload.isAgentReview) {
            return res.status(403).json({ message: "EduTube is read-only in agent review mode." })
        }
    } catch {
        return next()
    }
    return next()
})

app.use("/api/auth",authRouter)
app.use("/api/user",userRouter)
app.use("/api/content",contentRouter)
app.use("/api/payments",paymentRouter)

app.get("/" , (req,res)=>{
    res.send("Hello from Server")
})

app.get("/health", (req, res) => {
    const isDatabaseConnected = mongoose.connection.readyState === 1
    res.status(isDatabaseConnected ? 200 : 503).json({
        status: isDatabaseConnected ? "ok" : "unavailable",
        database: isDatabaseConnected ? "connected" : "disconnected"
    })
})

const startServer = async () => {
    if (!process.env.JWT_SECRET?.trim()) {
        throw new Error("JWT_SECRET must be configured.")
    }
    if (
        agentIntegrationSecret &&
        (agentIntegrationSecret.length < 32 || /replace_with|placeholder|example/i.test(agentIntegrationSecret))
    ) {
        throw new Error("AGENT_PANEL_INTEGRATION_SECRET must be a private random secret with at least 32 characters.")
    }

    await connectDb()

    const port = Number(process.env.PORT) || 8000
    app.listen(port, "0.0.0.0", () => {
        console.log(`Server started on port ${port}`)
    })
}

startServer().catch((error) => {
    console.error("Server startup failed:", error.message || error)
    process.exitCode = 1
})