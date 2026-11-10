import express from 'express'
import dotenv from 'dotenv'
import http from 'node:http'
import connectDb from './config/connectDb.js'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import { Server } from 'socket.io'
import authRouter from './route/authRoute.js'
import userRouter from './route/userRoute.js'
import contentRouter from './route/contentRoute.js'
import paymentRouter from './route/paymentRoute.js'
import { handleRazorpayWebhook } from './controller/commerceController.js'
import { applyModerationDecision } from './controller/moderationController.js'
import {
    createAgentPanelOffer,
    getAgentPanelPaymentConfig,
    getAgentPanelChannelUnblockConfig,
    getAgentPanelAnalytics,
    listAgentPanelChannels,
    listAgentPanelManagedChannels,
    listAgentPanelManagedUsers,
    listAgentPanelOffers,
    setAgentPanelUserDeleted,
    updateAgentPanelChannelUnblockConfig,
    updateAgentPanelOffer,
} from './controller/adminIntegrationController.js'
import requireAgentIntegration from './middleware/requireAgentIntegration.js'
import {
    sendAdminUsernameEmail,
    sendAdminVerificationEmail,
    sendAgentPanelPasswordResetEmail,
    sendEmployeeUsernameEmail,
} from './config/sendMail.js'
import { getHelpInfo, submitAgentPanelGuestFeedback } from './controller/settingsController.js'

dotenv.config()

const app = express()
const server = http.createServer(app)
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173,http://localhost:8080")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
const io = new Server(server, {
    cors: { origin: allowedOrigins, credentials: true },
})
const agentIntegrationSecret = process.env.AGENT_PANEL_INTEGRATION_SECRET?.trim() || ""
app.use((req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next()
    res.on("finish", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
            const paymentDataChanged =
                req.path.startsWith("/api/payments/") ||
                req.path.startsWith("/api/integrations/agent-panel/offers") ||
                req.path === "/api/integrations/agent-panel/payment-config"
            if (paymentDataChanged) io.emit("live:payment-data-changed")
            const panelUrl = process.env.AGENT_PANEL_URL?.trim().replace(/\/+$/, "")
            const integrationSecret = process.env.AGENT_PANEL_INTEGRATION_SECRET?.trim()
            if (req.path !== "/api/user/heartbeat" && panelUrl && integrationSecret) {
                const abortController = new AbortController()
                const timeout = setTimeout(() => abortController.abort(), 5000)
                fetch(`${panelUrl}/api/integrations/live-refresh`, {
                    method: "POST",
                    headers: { authorization: `Bearer ${integrationSecret}` },
                    signal: abortController.signal,
                }).then((response) => {
                    if (!response.ok) {
                        throw new Error(`Agent Panel live refresh returned HTTP ${response.status}.`)
                    }
                }).catch((error) => {
                    console.error("Unable to notify Agent Panel about EduTube data changes:", error)
                }).finally(() => clearTimeout(timeout))
            }
        }
    })
    return next()
})
const agentReviewSessionRoutes = new Set([
    "/api/auth/agent-guest-session",
    "/api/auth/exit-agent-review",
])
app.post("/api/payments/webhook", express.raw({ type: "application/json" }), handleRazorpayWebhook)
app.use(cookieParser())
app.use(express.json())
app.use(cors({
    origin: allowedOrigins,
    credentials: true
}))

app.post("/api/integrations/moderation-cases/:caseId/review", requireAgentIntegration, async (req, res) => {
    const channelOnlyTemporaryBlock = req.body?.channelOnlyTemporaryBlock === true
    const blockDurationMinutes = req.body?.blockDurationMinutes
    if (channelOnlyTemporaryBlock && blockDurationMinutes !== 180) {
        return res.status(400).json({ message: "Check Auth channel blocks must be 180 minutes." })
    }
    const result = await applyModerationDecision({
        caseId: req.params.caseId,
        decision: req.body?.decision,
        reason: req.body?.reason,
        source: "agent",
        channelOnlyTemporaryBlock,
        blockDurationMinutes,
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

app.post("/api/integrations/agent-panel/employee-username-email", requireAgentIntegration, async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : ""
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : ""
    const username = typeof req.body?.username === "string" ? req.body.username.trim() : ""
    const category = typeof req.body?.category === "string" ? req.body.category : ""
    if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        !name || name.length > 80 ||
        !/^\p{Lu}{4}\d{4}(?:-\d{1,4})?$/u.test(username) ||
        !["Authentication", "Modification"].includes(category)
    ) {
        return res.status(400).json({ message: "Valid employee details and username are required." })
    }

    try {
        await sendEmployeeUsernameEmail(email, { name, username, category })
        return res.status(200).json({ message: "Employee username email sent." })
    } catch (error) {
        console.error("Employee username email failed:", error.message || error)
        return res.status(503).json({ message: "Unable to send the employee username email." })
    }
})

app.post("/api/integrations/agent-panel/admin-email", requireAgentIntegration, async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : ""
    const type = typeof req.body?.type === "string" ? req.body.type : ""
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !["verification", "username"].includes(type)) {
        return res.status(400).json({ message: "A valid email address and admin email type are required." })
    }

    try {
        if (type === "verification") {
            const otp = typeof req.body?.otp === "string" ? req.body.otp : ""
            if (!/^\d{6}$/.test(otp)) return res.status(400).json({ message: "A valid verification code is required." })
            await sendAdminVerificationEmail(email, otp)
        } else {
            const name = typeof req.body?.name === "string" ? req.body.name.trim() : ""
            const username = typeof req.body?.username === "string" ? req.body.username.trim() : ""
            if (!name || name.length > 80 || !username || username.length > 128) {
                return res.status(400).json({ message: "Valid admin name and username are required." })
            }
            await sendAdminUsernameEmail(email, { name, username })
        }
        return res.status(200).json({ message: "Admin email sent." })
    } catch (error) {
        console.error("Admin Studio email failed:", error.message || error)
        const message = error.code === "EMAIL_NOT_CONFIGURED"
            ? "Admin email delivery is not configured. Set USER_EMAIL and USER_PASSWORD in the EduTube backend environment."
            : error.code === "EMAIL_AUTH_FAILED"
                ? "Gmail rejected the sender credentials. Check USER_EMAIL and the Gmail App Password in the EduTube backend environment."
                : ["ETIMEDOUT", "ECONNECTION", "ECONNREFUSED", "EHOSTUNREACH", "ENOTFOUND", "ESOCKET"].includes(error.code)
                    ? "The EduTube backend could not connect to Gmail. Check its outbound email/network configuration."
                    : "Unable to send the Admin Studio email. Check the EduTube backend logs."
        return res.status(503).json({ message })
    }
})

app.get("/api/integrations/agent-panel/help", requireAgentIntegration, getHelpInfo)
app.post("/api/integrations/agent-panel/feedback", requireAgentIntegration, submitAgentPanelGuestFeedback)
app.get("/api/integrations/agent-panel/analytics", requireAgentIntegration, getAgentPanelAnalytics)
app.get("/api/integrations/agent-panel/channels", requireAgentIntegration, listAgentPanelChannels)
app.get("/api/integrations/agent-panel/managed-channels", requireAgentIntegration, listAgentPanelManagedChannels)
app.patch("/api/integrations/agent-panel/managed-channels/:channelId", requireAgentIntegration, (_req, res) => {
    return res.status(403).json({ message: "Channel restrictions are controlled automatically by EduTube policy." })
})
app.get("/api/integrations/agent-panel/users", requireAgentIntegration, listAgentPanelManagedUsers)
app.patch("/api/integrations/agent-panel/users/:userId", requireAgentIntegration, setAgentPanelUserDeleted)
app.get("/api/integrations/agent-panel/payment-config", requireAgentIntegration, getAgentPanelPaymentConfig)
app.get("/api/integrations/agent-panel/channel-unblock-config", requireAgentIntegration, getAgentPanelChannelUnblockConfig)
app.patch("/api/integrations/agent-panel/channel-unblock-config", requireAgentIntegration, updateAgentPanelChannelUnblockConfig)
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
    server.listen(port, "0.0.0.0", () => {
        console.log(`Server started on port ${port}`)
    })
}

startServer().catch((error) => {
    console.error("Server startup failed:", error.message || error)
    process.exitCode = 1
})