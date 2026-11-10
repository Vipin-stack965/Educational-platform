import express from "express";
import isAuth from "../middleware/isAuth.js";
import requireAccount from "../middleware/requireAccount.js";
import requireModerator from "../middleware/requireModerator.js";
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
import {
  getAgentPanelChannelUnblockConfig,
  updateAgentPanelChannelUnblockConfig,
  createAgentPanelOffer,
  listAgentPanelChannels,
  listAgentPanelOffers,
  updateAgentPanelOffer,
} from "../controller/adminIntegrationController.js";

const paymentRouter = express.Router();
const accountOnly = [isAuth, requireAccount];

paymentRouter.get("/config", getPaymentConfig);
paymentRouter.get("/offerings", getPublicPlatformOffers);
paymentRouter.get("/admin/offers", ...accountOnly, requireModerator, listAgentPanelOffers);
paymentRouter.get("/admin/channels", ...accountOnly, requireModerator, listAgentPanelChannels);
paymentRouter.post("/admin/offers", ...accountOnly, requireModerator, createAgentPanelOffer);
paymentRouter.patch("/admin/offers/:offerId", ...accountOnly, requireModerator, updateAgentPanelOffer);
paymentRouter.get("/admin/channel-unblock-config", ...accountOnly, requireModerator, getAgentPanelChannelUnblockConfig);
paymentRouter.patch("/admin/channel-unblock-config", ...accountOnly, requireModerator, updateAgentPanelChannelUnblockConfig);
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
