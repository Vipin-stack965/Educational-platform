const getIntegrationConfig = () => {
  const panelUrl = process.env.AGENT_PANEL_URL?.trim();
  const secret = process.env.AGENT_PANEL_INTEGRATION_SECRET?.trim();
  if (!panelUrl || !secret) {
    throw new Error("Agent moderation is not configured. Set AGENT_PANEL_URL and AGENT_PANEL_INTEGRATION_SECRET.");
  }
  if (secret.length < 32) {
    throw new Error("AGENT_PANEL_INTEGRATION_SECRET must be at least 32 characters.");
  }
  return { panelUrl: panelUrl.replace(/\/+$/, ""), secret };
};

export const createAgentReviewTask = async (moderationCase, channelCategory) => {
  const { panelUrl, secret } = getIntegrationConfig();
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 15000);
  try {
    const response = await fetch(`${panelUrl}/api/integrations/moderation-tasks`, {
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
      throw new Error(`Agent Panel task creation returned HTTP ${response.status}: ${responseText.slice(0, 500)}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
};
