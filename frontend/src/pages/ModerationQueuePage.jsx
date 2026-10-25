import { t } from "../../utils/i18n.js";
import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { FaCheck, FaTimes } from "react-icons/fa";
import { serverUrl } from "../config";
import { showCustomAlert } from "../component/CustomAlert";

const ModerationQueuePage = () => {
  const [cases, setCases] = useState([]);
  const [reasons, setReasons] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reviewingId, setReviewingId] = useState("");

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${serverUrl}/api/content/moderation/cases`, {
        withCredentials: true,
      });
      setCases(response.data);
      setError("");
    } catch (requestError) {
      console.error("Unable to load moderation queue:", requestError);
      setError(requestError.response?.data?.message || t("Unable to load the moderation queue."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const reviewCase = async (moderationCase, decision) => {
    setReviewingId(moderationCase._id);
    try {
      const response = await axios.post(
        `${serverUrl}/api/content/moderation/cases/${moderationCase._id}/review`,
        { decision, reason: reasons[moderationCase._id] || "" },
        { withCredentials: true }
      );
      setCases((current) => current.filter((item) => item._id !== moderationCase._id));
      showCustomAlert(response.data.message);
    } catch (requestError) {
      console.error("Unable to submit moderation decision:", requestError);
      showCustomAlert(requestError.response?.data?.message || t("Unable to complete the moderation decision."));
    } finally {
      setReviewingId("");
    }
  };

  return (
    <main className="mt-[50px] min-h-screen px-5 py-8 text-white lg:mt-5">
      <h1 className="mb-2 text-2xl font-bold">{t("Educational content review")}</h1>
      <p className="mb-8 text-sm text-gray-400">{t("Review AI-uncertain submissions before they can be published.")}</p>
      {loading ? (
        <p className="text-gray-400">{t("Loading moderation queue...")}</p>
      ) : error ? (
        <p role="alert" className="text-red-300">{error}</p>
      ) : cases.length ? (
        <div className="space-y-5">
          {cases.map((moderationCase) => (
            <article key={moderationCase._id} className="rounded-xl border border-gray-700 bg-[#181818] p-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{moderationCase.title || t("Community post")} · {moderationCase.contentType}</h2>
                  <p className="text-sm text-gray-400">
                    {moderationCase.channel?.name} ({moderationCase.channel?.category}) · {moderationCase.owner?.username} · {new Date(moderationCase.createdAt).toLocaleString()}
                  </p>
                </div>
                <span className="max-w-xl text-sm text-amber-300">{t("AI note")}: {moderationCase.aiReason}</span>
              </div>
              {moderationCase.contentType === "video" || moderationCase.contentType === "short" ? (
                moderationCase.mediaUrl && (
                  <video
                    src={moderationCase.mediaUrl}
                    controls
                    preload="metadata"
                    className="mb-4 max-h-[420px] w-full rounded-lg bg-black"
                  />
                )
              ) : (
                <div className="mb-4 rounded-lg bg-[#222] p-4">
                  <p className="whitespace-pre-wrap">{moderationCase.text}</p>
                  {moderationCase.mediaUrl && <img src={moderationCase.mediaUrl} alt="" className="mt-3 max-h-80 rounded-lg object-contain" />}
                </div>
              )}
              {(moderationCase.description || moderationCase.tags?.length > 0) && (
                <p className="mb-4 text-sm text-gray-300">
                  {moderationCase.description} {moderationCase.tags?.length ? `· ${moderationCase.tags.join(", ")}` : ""}
                </p>
              )}
              <label className="mb-3 block text-sm text-gray-300">
                {t("Review note (optional)")}
                <textarea
                  value={reasons[moderationCase._id] || ""}
                  onChange={(event) => setReasons((current) => ({ ...current, [moderationCase._id]: event.target.value }))}
                  maxLength={500}
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-[#101010] p-3 text-white"
                />
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={reviewingId === moderationCase._id}
                  onClick={() => reviewCase(moderationCase, "approve")}
                  className="flex items-center gap-2 rounded-lg bg-green-700 px-4 py-2 hover:bg-green-600 disabled:opacity-50"
                >
                  <FaCheck aria-hidden="true" /> {t("Approve and publish")}
                </button>
                <button
                  type="button"
                  disabled={reviewingId === moderationCase._id}
                  onClick={() => reviewCase(moderationCase, "reject")}
                  className="flex items-center gap-2 rounded-lg bg-red-800 px-4 py-2 hover:bg-red-700 disabled:opacity-50"
                >
                  <FaTimes aria-hidden="true" /> {t("Reject and apply policy")}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="text-gray-400">{t("No submissions need review.")}</p>
      )}
    </main>
  );
};

export default ModerationQueuePage;
