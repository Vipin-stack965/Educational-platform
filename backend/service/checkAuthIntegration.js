const getIntegrationConfig = () => {
  const checkAuthUrl = process.env.CHECK_AUTH_URL?.trim();
  const secret = process.env.AGENT_PANEL_INTEGRATION_SECRET?.trim();
  if (!checkAuthUrl || !secret) {
    throw new Error("Check Auth moderation is not configured. Set CHECK_AUTH_URL and AGENT_PANEL_INTEGRATION_SECRET.");
  }
  if (secret.length < 32) {
    throw new Error("AGENT_PANEL_INTEGRATION_SECRET must be at least 32 characters.");
  }
  return { checkAuthUrl: checkAuthUrl.replace(/\/+$/, ""), secret };
};

export const createCheckAuthReviewTask = async (moderationCase, channelCategory) => {
  const { checkAuthUrl, secret } = getIntegrationConfig();
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 15000);
  try {
    const response = await fetch(`${checkAuthUrl}/api/integrations/moderation-tasks`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        reviewCaseId: moderationCase._id.toString(),
        contentType: moderationCase.contentType,
        title: moderationCase.title,
        description: moderationCase.description,
        tags: moderationCase.tags,
        text: moderationCase.text,
        mediaUrl: moderationCase.mediaUrl,
        thumbnailUrl: moderationCase.thumbnailUrl,
        aiReason: moderationCase.aiReason,
        channelCategory: channelCategory || "",
      }),
      signal: abortController.signal,
    });
    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(`Check Auth moderation task creation returned HTTP ${response.status}: ${responseText.slice(0, 500)}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
};
