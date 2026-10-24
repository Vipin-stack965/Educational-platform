import express from 'express'
import dotenv from 'dotenv'
import connectDb from './config/connectDb.js'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import mongoose from 'mongoose'
import authRouter from './route/authRoute.js'
import userRouter from './route/userRoute.js'
import contentRouter from './route/contentRoute.js'

dotenv.config()

const app = express()
app.use(cookieParser())
app.use(express.json())
app.use(cors({
    origin: (process.env.CORS_ORIGIN || "http://localhost:5173")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    credentials: true
}))

app.use("/api/auth",authRouter)
app.use("/api/user",userRouter)
app.use("/api/content",contentRouter)

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