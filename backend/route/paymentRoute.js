import express from "express";
import isAuth from "../middleware/isAuth.js";
import requireAccount from "../middleware/requireAccount.js";
import {
  checkEntitlement,
  cancelMembership,
  getPaymentConfig,
  getPaymentHistory,
} from "../controller/commerceController.js";
import {
  cancelPlatformMembership,
  createPlatformOrder,
  createPlatformSubscription,
  getAdFreeAccess,
  getPlatformPurchaseHistory,
  getPublicPlatformOffers,
  verifyPlatformOrder,
  verifyPlatformSubscription,
} from "../controller/platformCommerceController.js";

const paymentRouter = express.Router();
const accountOnly = [isAuth, requireAccount];

paymentRouter.get("/config", getPaymentConfig);
paymentRouter.get("/offerings", getPublicPlatformOffers);
paymentRouter.get("/history", ...accountOnly, getPaymentHistory);
paymentRouter.get("/platform-history", ...accountOnly, getPlatformPurchaseHistory);
paymentRouter.post("/memberships/:membershipId/cancel", ...accountOnly, cancelMembership);
paymentRouter.post("/platform-memberships/:membershipId/cancel", ...accountOnly, cancelPlatformMembership);
paymentRouter.get("/ad-free-access", ...accountOnly, getAdFreeAccess);
paymentRouter.get("/entitlement", ...accountOnly, checkEntitlement);
paymentRouter.post("/platform-orders", ...accountOnly, createPlatformOrder);
paymentRouter.post("/platform-subscriptions", ...accountOnly, createPlatformSubscription);
paymentRouter.post("/verify-platform-order", ...accountOnly, verifyPlatformOrder);
paymentRouter.post("/verify-platform-subscription", ...accountOnly, verifyPlatformSubscription);

export default paymentRouter;
