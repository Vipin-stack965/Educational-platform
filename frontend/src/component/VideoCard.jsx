import { t } from '../../utils/i18n.js';
import React, { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import axios from "axios";
import {
  FaBan, FaClock, FaEllipsisV, FaFlag, FaListUl, FaPlay, FaShare, FaTimes,
} from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import { serverUrl } from "../config";
import { showCustomAlert } from "./CustomAlert";
import NameAvatar from "./NameAvatar";
import { enqueueVideo, updateHomeVideoPreferences } from "../utils/homeVideoActions";
import useClickOutside from "../customHooks/useClickOutside";
  

export const VideoThumbnail = ({ src, videoUrl, title, className = "" }) => {
  const [failed, setFailed] = useState(false);

  if ((!src || failed) && videoUrl) {
    return (
      <video
        src={videoUrl}
        aria-label={title ? t("Video thumbnail") : undefined}
        className={`bg-gradient-to-br from-[#252525] to-[#111] object-cover ${className}`}
        muted
        playsInline
        preload="metadata"
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          if (video.duration > 0) video.currentTime = Math.min(0.1, video.duration / 2);
        }}
      />
    );
  }

  if ((!src || failed) && !videoUrl) {
    return (
      <div
        role="img"
        aria-label={title ? t("Video thumbnail unavailable") : t("Video thumbnail")}
        className={`flex items-center justify-center bg-gradient-to-br from-[#252525] to-[#111] text-gray-400 ${className}`}
      >
        <FaPlay aria-hidden="true" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={title || t("Video thumbnail")}
      onError={() => setFailed(true)}
      className={className}
    />
  );
};

const VideoCard = ({ thumbnail, videoUrl, duration, channelLogo, title, channelName, views, id, isShort = false, video, showMoreActions = false }) => {
  const navigate = useNavigate();
  const { userData, channelData } = useSelector((state) => state.user);
  const [menuOpen, setMenuOpen] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const menuRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const resolvedVideo = video || { _id: id, title, thumbnail, videoUrl, channel: { name: channelName } };
  const ownedPlaylists = channelData?.playlists || [];
  const [savedForLater, setSavedForLater] = useState(
    Boolean(video?.saveBy?.some((savedBy) =>
      (savedBy?._id || savedBy)?.toString() === userData?._id?.toString()
    ))
  );

  useEffect(() => {
    setSavedForLater(Boolean(video?.saveBy?.some((savedBy) =>
      (savedBy?._id || savedBy)?.toString() === userData?._id?.toString()
    )));
  }, [userData?._id, video?.saveBy]);
  useClickOutside(menuRef, menuOpen, () => setMenuOpen(false));

  const handleSaveForLater = async (event) => {
    event.stopPropagation();
    if (!userData) {
      showCustomAlert(t("Sign in to save videos."));
      navigate("/signin");
      return;
    }
    setSaving(true);
    try {
      const { data } = await axios.put(`${serverUrl}/api/content/video/${id}/toggle-save`, {}, { withCredentials: true });
      const isSaved = Boolean(data.saveBy?.some((savedBy) =>
        (savedBy?._id || savedBy)?.toString() === userData?._id?.toString()
      ));
      setSavedForLater(isSaved);
      showCustomAlert(isSaved ? t("Video saved to your saved videos.") : t("Video removed from your saved videos."));
      setMenuOpen(false);
    } catch (error) {
      console.error("Unable to save video:", error);
      showCustomAlert(error.response?.data?.message || t("Unable to save this video."));
    } finally {
      setSaving(false);
    }
  };

  const handleShare = async (event) => {
    event.stopPropagation();
    const url = `${window.location.origin}${isShort ? "/watch-short" : "/watch-video"}/${id}`;
    try {
      if (navigator.share) await navigator.share({ title, url });
      else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        showCustomAlert(t("Link copied"));
      } else throw new Error("Sharing is unavailable in this browser.");
      setMenuOpen(false);
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("Unable to share video:", error);
        showCustomAlert(t("Unable to share this video."));
      }
    }
  };

  const handleSaveToPlaylist = async (event, playlist) => {
    event.stopPropagation();
    setSaving(true);
    try {
      await axios.put(`${serverUrl}/api/content/update-playlist/${playlist._id}`, {
        addVideos: [id],
      }, { withCredentials: true });
      showCustomAlert(t("Video added to playlist."));
      setPlaylistOpen(false);
      setMenuOpen(false);
    } catch (error) {
      console.error("Unable to add video to playlist:", error);
      showCustomAlert(error.response?.data?.message || t("Unable to add video to playlist."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full max-w-[360px] cursor-pointer" onClick={() => navigate(`${isShort ? "/watch-short" : "/watch-video"}/${id}`)}>
      {/* Thumbnail */}
      <div className="group relative">
        <VideoThumbnail
          src={thumbnail}
          videoUrl={resolvedVideo.videoUrl}
          title={title}
          className="rounded-xl w-full h-[200px] border border-gray-800 object-cover"
        />
        {resolvedVideo.isPaidContent && (
          <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/80 px-2 py-1 text-xs font-medium text-blue-200">
            {t("Protected")}
          </span>
        )}
        <span className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {duration}
        </span>
      </div>

      {/* Info */}
      <div className="flex mt-3">
        {/* Channel Logo */}
        <NameAvatar
          src={channelLogo}
          name={channelName}
          alt={channelName}
          className="mr-3 h-10 w-10 text-sm"
        />

        {/* Text Content */}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-snug line-clamp-2">
            {title}
          </h3>
          <p className="text-xs text-gray-400 mt-1">{channelName}</p>
          <p className="text-xs text-gray-400">
           {
              Number(views) >= 1_000_000
                ? Math.floor(Number(views) / 1_000_000) + "M"
                : Number(views) >= 1_000
                ? Math.floor(Number(views) / 1_000) + "K"
                : Number(views) || 0
            }{t(" views\n          ")}</p>
        </div>
        {showMoreActions && (
          <div ref={menuRef} className="relative ml-1 shrink-0" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              aria-label={t("More video actions")}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className="rounded-full p-2 text-gray-300 hover:bg-[#272727] hover:text-white"
            >
              <FaEllipsisV />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-10 z-50 w-56 rounded-xl border border-gray-700 bg-[#282828] py-2 text-sm text-white shadow-xl">
                <MenuAction icon={FaPlay} label={t("Add to queue")} disabled={isShort} onClick={(event) => {
                  event.stopPropagation();
                  enqueueVideo(resolvedVideo);
                  showCustomAlert(t("Added to queue"));
                  setMenuOpen(false);
                }} />
                <MenuAction icon={FaClock} label={savedForLater ? t("Remove from Watch later") : t("Save to Watch later")} onClick={handleSaveForLater} disabled={saving || isShort} />
                <MenuAction icon={FaListUl} label={t("Save to playlist")} onClick={(event) => {
                  event.stopPropagation();
                  setPlaylistOpen(true);
                }} disabled={isShort} />
                <MenuAction icon={FaShare} label={t("Share")} onClick={handleShare} />
                <div className="my-1 border-t border-gray-600" />
                <MenuAction icon={FaBan} label={t("Not interested")} onClick={(event) => {
                  event.stopPropagation();
                  updateHomeVideoPreferences((preferences) => ({
                    ...preferences,
                    dismissedVideoIds: [...new Set([...(preferences.dismissedVideoIds || []), id])],
                  }));
                  setMenuOpen(false);
                }} />
                <MenuAction icon={FaTimes} label={t("Don't recommend channel")} onClick={(event) => {
                  event.stopPropagation();
                  const channelId = resolvedVideo.channel?._id || resolvedVideo.channel;
                  if (channelId) {
                    updateHomeVideoPreferences((preferences) => ({
                      ...preferences,
                      dismissedChannelIds: [...new Set([...(preferences.dismissedChannelIds || []), channelId.toString()])],
                    }));
                  }
                  setMenuOpen(false);
                }} />
                <MenuAction icon={FaFlag} label={t("Report")} onClick={(event) => {
                  event.stopPropagation();
                  navigate("/send-feedback", { state: { reportVideo: { id, title, channelName } } });
                  setMenuOpen(false);
                }} />
              </div>
            )}
            {playlistOpen && (
              <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" onClick={(event) => {
                event.stopPropagation();
                setPlaylistOpen(false);
              }}>
                <section className="w-full max-w-sm rounded-xl border border-gray-700 bg-[#212121] p-4 text-white" onClick={(event) => event.stopPropagation()}>
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="font-semibold">{t("Save to playlist")}</h2>
                    <button type="button" aria-label={t("Close")} onClick={() => setPlaylistOpen(false)} className="rounded-full p-2 hover:bg-[#3f3f3f]"><FaTimes /></button>
                  </div>
                  {ownedPlaylists.length ? ownedPlaylists.map((playlist) => (
                    <button
                      key={playlist._id}
                      type="button"
                      disabled={saving}
                      onClick={(event) => handleSaveToPlaylist(event, playlist)}
                      className="block w-full rounded-lg px-3 py-2 text-left hover:bg-[#3f3f3f] disabled:opacity-50"
                    >
                      {playlist.title}
                    </button>
                  )) : (
                    <p className="py-2 text-sm text-gray-300">{t("Create a playlist from your channel to save videos here.")}</p>
                  )}
                  <button type="button" onClick={() => navigate("/create-playlist", { state: { videoId: id } })} className="mt-3 w-full rounded-lg bg-[#3f3f3f] px-3 py-2 hover:bg-[#505050]">
                    {t("Create playlist")}
                  </button>
                </section>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

function MenuAction({ icon, label, onClick, disabled = false }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[#3f3f3f] disabled:cursor-not-allowed disabled:opacity-50">
      {React.createElement(icon, { className: "shrink-0", "aria-hidden": true })}
      <span>{label}</span>
    </button>
  );
}

export default VideoCard;
