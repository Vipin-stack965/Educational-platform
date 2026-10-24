import mongoose from "mongoose";

const connectDb = async () => {
    const mongoUrl = process.env.MONGODB_URL?.trim();

    if (!mongoUrl || /add .*mongodb|your .*mongodb|placeholder|example/i.test(mongoUrl)) {
        throw new Error("MONGODB_URL must be configured with a valid MongoDB connection string.");
    }

    try {
        await mongoose.connect(mongoUrl)
        console.log("DB Connected")
    } catch (error) {
        throw new Error(`MongoDB connection failed: ${error.message || error}`, { cause: error })
    }
}

export default connectDb