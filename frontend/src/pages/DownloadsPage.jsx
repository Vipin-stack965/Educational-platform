import { t } from "../../utils/i18n.js";
import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { FaDownload, FaPlay, FaTimes } from "react-icons/fa";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { serverUrl } from "../config";
import { showCustomAlert } from "../component/CustomAlert";
import {
  clearQueuedDownloadRemoval,
  downloadOfflineVideo,
  getOfflineDownloads,
  getQueuedDownloadRemovals,
  queueOfflineDownloadRemoval,
  removeOfflineDownload,
} from "../utils/offlineStorage";
import NameAvatar from "../component/NameAvatar";

const toOfflineItem = (record) => ({
  _id: record.contentId,
  title: record.title,
  thumbnail: record.thumbnail,
  channel: { name: record.channelName, avatar: record.channelAvatar },
  downloadType: "video",
  offlineDownload: record,
});

const DownloadsPage = () => {
  const userId = useSelector((state) => state.user.userData?._id);
  const navigate = useNavigate();
  const [downloads, setDownloads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [removingDownloadId, setRemovingDownloadId] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState({});
  const [activeVideo, setActiveVideo] = useState(null);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => () => {
    if (activeVideo?.url) URL.revokeObjectURL(activeVideo.url);
  }, [activeVideo?.url]);

  const loadDownloads = useCallback(async () => {
    if (!userId) {
      setDownloads([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    let localRecords = [];
    try {
      localRecords = await getOfflineDownloads(userId);
      setDownloads(localRecords.map(toOfflineItem));
    } catch (storageError) {
      console.error("Unable to load videos stored on this device:", storageError);
      setError(t("Unable to read videos downloaded on this device."));
    }

    if (!navigator.onLine) {
      setOnline(false);
      if (!localRecords.length) {
        setError(t("Connect to the internet to view your account Downloads."));
      }
      setLoading(false);
      return;
    }

    setOnline(true);
    try {
      const [videoResponse, shortResponse, queuedRemovals] = await Promise.all([
        axios.get(`${serverUrl}/api/content/downloads`, { withCredentials: true }),
        axios.get(`${serverUrl}/api/content/downloads/shorts`, { withCredentials: true }),
        getQueuedDownloadRemovals(userId),
      ]);

      const pendingIds = new Set(queuedRemovals.map((record) => record.contentId));
      await Promise.all(queuedRemovals.map(async (record) => {
        try {
          await axios.delete(`${serverUrl}/api/content/video/${record.contentId}/download`, { withCredentials: true });
          await clearQueuedDownloadRemoval(userId, record.contentId);
        } catch (syncError) {
          console.warn("A queued download removal will be retried later:", syncError);
        }
      }));

      const localById = new Map(localRecords.map((record) => [record.contentId, record]));
      const videos = videoResponse.data
        .filter((video) => !pendingIds.has(video._id))
        .map((video) => ({
          ...video,
          downloadType: "video",
          offlineDownload: localById.get(video._id) || null,
        }));
      const accountVideoIds = new Set(videos.map((video) => video._id));
      const localOnlyVideos = localRecords
        .filter((record) => !pendingIds.has(record.contentId) && !accountVideoIds.has(record.contentId))
        .map(toOfflineItem);
      const shorts = shortResponse.data.map((short) => ({ ...short, downloadType: "short" }));

      setDownloads([...videos, ...localOnlyVideos, ...shorts]);
      setError("");
    } catch (requestError) {
      console.error("Unable to fetch account downloads:", requestError);
      if (!localRecords.length) {
        setError(requestError.response?.data?.message || t("Unable to load your account Downloads."));
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    const updateNetworkState = () => {
      const isOnline = navigator.onLine;
      setOnline(isOnline);
      if (isOnline) void loadDownloads();
      else {
        setDownloads((current) => current.filter((item) => item.offlineDownload));
        setError("");
        setLoading(false);
      }
    };

    window.addEventListener("online", updateNetworkState);
    window.addEventListener("offline", updateNetworkState);
    void loadDownloads();
    return () => {
      window.removeEventListener("online", updateNetworkState);
      window.removeEventListener("offline", updateNetworkState);
    };
  }, [loadDownloads]);

  const openOfflineVideo = (item) => {
    if (!item.offlineDownload?.blob) return;
    setActiveVideo({
      url: URL.createObjectURL(item.offlineDownload.blob),
      title: item.title,
      contentId: item._id,
    });
  };

  const downloadToDevice = async (item) => {
    const downloadId = `video:${item._id}`;
    setDownloadProgress((current) => ({ ...current, [downloadId]: 0 }));
    try {
      const blob = await downloadOfflineVideo({
        userId,
        video: item,
        onProgress: (progress) => setDownloadProgress((current) => ({
          ...current,
          [downloadId]: progress,
        })),
      });
      const offlineRecord = {
        contentId: item._id,
        title: item.title,
        thumbnail: item.thumbnail || "",
        channelName: item.channel?.name || "",
        channelAvatar: item.channel?.avatar || "",
        blob,
      };
      setDownloads((current) => current.map((download) => (
        download.downloadType === "video" && download._id === item._id
          ? { ...download, offlineDownload: offlineRecord }
          : download
      )));
      showCustomAlert(t("Video downloaded to this device."));
    } catch (downloadError) {
      console.error("Unable to download video for offline playback:", downloadError);
      showCustomAlert(downloadError.message || t("Unable to download this video."));
    } finally {
      setDownloadProgress((current) => {
        const next = { ...current };
        delete next[downloadId];
        return next;
      });
    }
  };

  const removeFromDownloads = async (item) => {
    const downloadId = `${item.downloadType}:${item._id}`;
    setRemovingDownloadId(downloadId);
    try {
      if (item.downloadType === "video" && !navigator.onLine) {
        await queueOfflineDownloadRemoval(userId, item._id);
      } else {
        const endpoint = item.downloadType === "short"
          ? `${serverUrl}/api/content/short/${item._id}/download`
          : `${serverUrl}/api/content/video/${item._id}/download`;
        await axios.delete(endpoint, { withCredentials: true });
        if (item.downloadType === "video" && item.offlineDownload) {
          await removeOfflineDownload(userId, item._id);
        }
      }

      setDownloads((current) => current.filter((download) => (
        `${download.downloadType}:${download._id}` !== downloadId
      )));
      if (activeVideo?.contentId === item._id) setActiveVideo(null);
    } catch (requestError) {
      console.error("Unable to remove account download:", requestError);
      showCustomAlert(requestError.response?.data?.message || requestError.message || t("Unable to remove this item from Downloads."));
    } finally {
      setRemovingDownloadId(null);
    }
  };

  return (
    <main className="mt-[50px] min-h-screen px-5 py-8 text-white lg:mt-5">
      <h1 className="mb-2 flex items-center gap-3 text-2xl font-bold">
        <FaDownload aria-hidden="true" />
        {t("Downloads")}
      </h1>

      {activeVideo && (
        <section className="mb-8 max-w-3xl" aria-label={activeVideo.title}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="truncate font-semibold">{activeVideo.title}</h2>
            <button
              type="button"
              aria-label={t("Close video")}
              onClick={() => setActiveVideo(null)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-[#272727]"
            >
              <FaTimes aria-hidden="true" />
            </button>
          </div>
          <video src={activeVideo.url} controls autoPlay className="max-h-[70vh] w-full bg-black" />
        </section>
      )}

      {!online && !downloads.length && !loading ? (
        <p role="alert" className="text-gray-400">{error || t("No videos are downloaded on this device yet.")}</p>
      ) : loading ? (
        <p className="text-gray-400">{t("Loading downloads...")}</p>
      ) : error && !downloads.length ? (
        <p role="alert" className="text-red-300">{error}</p>
      ) : downloads.length ? (
        <div className="max-w-4xl divide-y divide-gray-800">
          {downloads.map((item) => {
            const downloadId = `${item.downloadType}:${item._id}`;
            const progress = downloadProgress[downloadId];
            const isShort = item.downloadType === "short";
            return (
              <article key={downloadId} className="flex min-h-24 items-center gap-3 py-3 sm:gap-5">
                <button
                  type="button"
                  aria-label={item.offlineDownload ? t("Play downloaded video") : t("Open video")}
                  onClick={() => item.offlineDownload
                    ? openOfflineVideo(item)
                    : navigate(`${isShort ? "/watch-short" : "/watch-video"}/${item._id}`)}
                  className="group relative aspect-video w-32 shrink-0 overflow-hidden rounded-lg bg-[#272727] sm:w-44"
                >
                  {item.thumbnail ? (
                    <img src={item.thumbnail} alt="" className="h-full w-full object-cover" />
                  ) : isShort && item.shortUrl ? (
                    <video src={item.shortUrl} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full items-center justify-center text-gray-500">
                      {item.offlineDownload ? <FaPlay aria-hidden="true" /> : <FaDownload aria-hidden="true" />}
                    </span>
                  )}
                  {item.offlineDownload && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white opacity-0 transition-opacity group-hover:opacity-100">
                      <FaPlay aria-hidden="true" />
                    </span>
                  )}
                </button>
                <div className="min-w-0 flex-1 self-start pt-1">
                  <button
                    type="button"
                    onClick={() => item.offlineDownload
                      ? openOfflineVideo(item)
                      : navigate(`${isShort ? "/watch-short" : "/watch-video"}/${item._id}`)}
                    className="line-clamp-2 text-left text-sm font-semibold leading-5 hover:text-white sm:text-base"
                  >
                    {item.title}
                  </button>
                  <div className="mt-2 flex min-w-0 items-center gap-2">
                    <NameAvatar
                      src={item.channel?.avatar}
                      name={item.channel?.name || item.channelName}
                      className="h-5 w-5 text-[8px]"
                    />
                    <p className="truncate text-xs text-gray-400 sm:text-sm">
                      {item.channel?.name || item.channelName}
                    </p>
                  </div>
                  {progress !== undefined && (
                    <p className="mt-1 text-xs text-gray-400">
                      {t("Downloading...")}{progress === null ? "" : ` ${progress}%`}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!isShort && !item.offlineDownload && item.videoUrl && (
                    <button
                      type="button"
                      aria-label={t("Download to this device")}
                      title={t("Download to this device")}
                      disabled={progress !== undefined}
                      onClick={() => downloadToDevice(item)}
                      className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-[#272727] disabled:opacity-50"
                    >
                      <FaDownload aria-hidden="true" />
                    </button>
                  )}
                  {item.offlineDownload && (
                    <button
                      type="button"
                      aria-label={t("Play downloaded video")}
                      title={t("Play downloaded video")}
                      onClick={() => openOfflineVideo(item)}
                      className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-[#272727]"
                    >
                      <FaPlay aria-hidden="true" />
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={t("Remove from downloads")}
                    title={t("Remove from downloads")}
                    disabled={removingDownloadId === downloadId}
                    onClick={() => removeFromDownloads(item)}
                    className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-[#272727] disabled:opacity-50"
                  >
                    <FaTimes aria-hidden="true" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="text-gray-400">{t("No downloads yet.")}</p>
      )}
    </main>
  );
};

export default DownloadsPage;
