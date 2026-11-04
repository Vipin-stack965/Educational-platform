import mongoose from "mongoose";

const commerceTransactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  offering: { type: mongoose.Schema.Types.ObjectId, ref: "CommerceOffering", required: true },
  channel: { type: mongoose.Schema.Types.ObjectId, ref: "Channel", required: true },
  type: { type: String, enum: ["purchase", "membership"], required: true },
  status: { type: String, enum: ["pending", "paid"], default: "pending", index: true },
  amount: { type: Number, required: true },
  currency: { type: String, required: true },
  orderId: { type: String, unique: true, sparse: true },
  subscriptionId: { type: String, index: true },
  providerPaymentId: { type: String, unique: true, sparse: true },
  paidAt: { type: Date },
}, { timestamps: true });

export default mongoose.model("CommerceTransaction", commerceTransactionSchema);
