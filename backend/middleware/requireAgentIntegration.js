import { timingSafeEqual } from "node:crypto";

const requireAgentIntegration = (req, res, next) => {
  const integrationSecret = process.env.AGENT_PANEL_INTEGRATION_SECRET?.trim() || "";
  if (!integrationSecret) {
    return res.status(503).json({ message: "Agent panel integration is not configured." });
  }
  const supplied = req.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const expectedBuffer = Buffer.from(integrationSecret);
  const suppliedBuffer = Buffer.from(supplied);
  if (
    expectedBuffer.length !== suppliedBuffer.length ||
    !timingSafeEqual(expectedBuffer, suppliedBuffer)
  ) {
    return res.status(401).json({ message: "Agent integration authentication failed." });
  }
  return next();
};

export default requireAgentIntegration;
