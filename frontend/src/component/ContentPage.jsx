import { t } from '../../utils/i18n.js';
import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { FaEdit } from "react-icons/fa";
import { MdDelete } from "react-icons/md";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { serverUrl } from "../config";
import { setChannelData } from "../redux/userSlice";
import { showCustomAlert } from "../component/CustomAlert";

const tabs = ["Videos", "Shorts", "Playlists", "Community"];
const cardGridClass = "grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4";
const iconButtonClass = "rounded-full p-2 text-gray-400 transition hover:bg-white/10 hover:text-white";

const formatDuration = (seconds) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
    : `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
};

function VideoContentCard({ video, onEdit }) {
  const [duration, setDuration] = useState("");

  const handleMetadata = (event) => {
    const media = event.currentTarget;
    setDuration(formatDuration(media.duration));
    if (!video.thumbnail && media.duration > 0) {
      media.currentTime = Math.min(0.1, media.duration / 2);
    }
  };

  return (
    <article className="min-w-0">
      <button
        type="button"
        onClick={onEdit}
        className="group relative block aspect-video w-full cursor-pointer overflow-hidden bg-black text-left"
        aria-label={`${t("Edit")} ${video.title}`}
      >
        <video
          src={video.videoUrl}
          poster={video.thumbnail || undefined}
          preload="metadata"
          muted
          playsInline
          tabIndex={-1}
          onLoadedMetadata={handleMetadata}
          className="pointer-events-none h-full w-full object-cover"
          aria-hidden="true"
        />
        {duration && (
          <span className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            {duration}
          </span>
        )}
      </button>
      <div className="flex min-w-0 items-start justify-between gap-3 pt-3">
        <div className="min-w-0">
          <h2 className="line-clamp-2 font-medium leading-5">{video.title}</h2>
          <p className="mt-1 text-sm text-gray-400">
            {video.views || 0}{t(" views")}
          </p>
        </div>
        <button
          type="button"
          aria-label={`${t("Edit")} ${video.title}`}
          title={t("Edit")}
          className={iconButtonClass}
          onClick={onEdit}
        >
          <FaEdit aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

function ContentPage() {
  const { channelData } = useSelector((state) => state.user);
  const { videoData } = useSelector((state) => state.content);
  const [activeTab, setActiveTab] = useState("Videos");
  const navigate = useNavigate();
  const dispatch = useDispatch();

  if (!channelData) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4 text-gray-300">
        {t("Loading channel content...")}
      </div>
    );
  }

  const videos = videoData || channelData.videos || [];
  const shorts = channelData.shorts || [];
  const playlists = channelData.playlists || [];
  const posts = channelData.communityPosts || [];

  const handleDeletePost = async (postId) => {
    if (!window.confirm(t("Are you sure you want to delete this post?"))) return;

    try {
      await axios.delete(`${serverUrl}/api/content/delete-post/${postId}`, {
        withCredentials: true,
      });

      dispatch(setChannelData({
        ...channelData,
        communityPosts: posts.filter((post) => post._id !== postId),
      }));
      showCustomAlert(t("Post deleted successfully"));
    } catch (error) {
      console.error(error);
      showCustomAlert(error.response?.data?.message || "Failed to delete post");
    }
  };

  return (
    <main className="mb-16 min-h-screen w-full min-w-0 px-4 py-5 text-white sm:px-6 lg:px-8">
      <nav aria-label={t("Channel content")} className="mb-6 flex w-full gap-6 overflow-x-auto whitespace-nowrap">
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab}
            onClick={() => setActiveTab(tab)}
            aria-current={activeTab === tab ? "page" : undefined}
            className={`shrink-0 py-2 font-medium transition ${
              activeTab === tab
                ? "text-white shadow-[inset_0_-2px_0_0_#ea580c]"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {t(tab)}
          </button>
        ))}
      </nav>

      {activeTab === "Videos" && (
        videos.length ? (
          <section className={cardGridClass} aria-label={t("Videos")}>
            {videos.map((video) => (
              <VideoContentCard
                key={video._id}
                video={video}
                onEdit={() => navigate(`/ptstudio/managevideo/${video._id}`)}
              />
            ))}
          </section>
        ) : (
          <p className="py-12 text-center text-gray-400">{t("No videos uploaded yet.")}</p>
        )
      )}

      {activeTab === "Shorts" && (
        shorts.length ? (
          <section className={cardGridClass} aria-label={t("Shorts")}>
            {shorts.map((short) => (
              <article key={short._id} className="min-w-0">
                <video
                  src={short.shortUrl}
                  poster={short.thumbnail}
                  controls
                  preload="metadata"
                  playsInline
                  aria-label={short.title}
                  className="aspect-[9/16] w-full bg-black object-cover sm:max-h-[32rem]"
                />
                <div className="flex min-w-0 items-start justify-between gap-3 pt-3">
                  <div className="min-w-0">
                    <h2 className="line-clamp-2 font-medium leading-5">{short.title}</h2>
                    <p className="mt-1 text-sm text-gray-400">
                      {short.views || 0}{t(" views")}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`${t("Edit")} ${short.title}`}
                    title={t("Edit")}
                    className={iconButtonClass}
                    onClick={() => navigate(`/ptstudio/manageshort/${short._id}`)}
                  >
                    <FaEdit aria-hidden="true" />
                  </button>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <p className="py-12 text-center text-gray-400">{t("No Shorts uploaded yet.")}</p>
        )
      )}

      {activeTab === "Playlists" && (
        playlists.length ? (
          <section className={cardGridClass} aria-label={t("Playlists")}>
            {playlists.map((playlist) => (
              <article key={playlist._id} className="min-w-0">
                <button
                  type="button"
                  className="block w-full text-left"
                  onClick={() => navigate(`/ptstudio/manageplaylist/${playlist._id}`)}
                >
                  <img
                    src={playlist.videos?.[0]?.thumbnail || ""}
                    alt=""
                    className="aspect-video w-full bg-[#1c1c1c] object-cover"
                  />
                  <span className="mt-3 block font-medium">{playlist.title}</span>
                  <span className="mt-1 block text-sm text-gray-400">
                    {playlist.videos?.length || 0}{t(" videos")}
                  </span>
                </button>
              </article>
            ))}
          </section>
        ) : (
          <p className="py-12 text-center text-gray-400">{t("No playlists yet.")}</p>
        )
      )}

      {activeTab === "Community" && (
        posts.length ? (
          <section className={cardGridClass} aria-label={t("Community")}>
            {posts.map((post) => (
              <article key={post._id} className="min-w-0">
                {post.image && (
                  <img src={post.image} alt="" className="aspect-video w-full object-cover" />
                )}
                <p className="whitespace-pre-wrap pt-3">{post.content}</p>
                <div className="flex items-center justify-between gap-3 pt-2 text-sm text-gray-400">
                  <time dateTime={post.createdAt}>
                    {post.createdAt ? new Date(post.createdAt).toLocaleDateString() : ""}
                  </time>
                  <button
                    type="button"
                    aria-label={t("Delete post")}
                    title={t("Delete")}
                    className={`${iconButtonClass} hover:text-red-400`}
                    onClick={() => handleDeletePost(post._id)}
                  >
                    <MdDelete aria-hidden="true" className="h-5 w-5" />
                  </button>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <p className="py-12 text-center text-gray-400">{t("No community posts yet.")}</p>
        )
      )}
    </main>
  );
}

export default ContentPage;
