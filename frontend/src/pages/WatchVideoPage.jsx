import { t } from '../../utils/i18n.js';
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import {
  FaPlay, FaPause, FaBackward, FaVolumeUp, FaVolumeMute,
  FaExpand, FaCompress, FaThumbsUp, FaThumbsDown, FaDownload, FaBookmark,
  FaCog, FaClosedCaptioning, FaWindowRestore, FaTimes, FaShare, FaLock,
} from "react-icons/fa";
import { serverUrl } from "../config";
import axios from "axios";
import { ClipLoader } from "react-spinners";
import Description from "../component/Description";
import { showCustomAlert } from "../component/CustomAlert";
import { downloadOfflineVideo, getOfflineDownload } from "../utils/offlineStorage";
import { getVideoCategories } from "../utils/videoCategories";
import { dequeueVideo } from "../utils/homeVideoActions";
import NameAvatar from "../component/NameAvatar";
import useClickOutside from "../customHooks/useClickOutside";

const ActionButton = ({ icon, active, label, count, onClick, disabled = false, className = "" }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={count === undefined ? label : `${label}, ${count}`}
    title={label}
    className={`inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-full bg-[#272727] px-3 text-sm text-white transition hover:bg-[#3f3f3f] disabled:cursor-wait disabled:opacity-60 ${active ? "text-[#3ea6ff]" : ""} ${className}`}
  >
    {React.createElement(icon, { size: 16, "aria-hidden": true })}
    <span className="whitespace-nowrap">{count !== undefined ? count : label}</span>
  </button>
);

const getResolutionHeight = (label) => {
  const match = String(label || "").match(/(\d{3,4})\s*p/i);
  return match ? Number(match[1]) : null;
};

const createPlaybackSessionId = () => window.crypto?.randomUUID?.()
  || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const normalizeRecommendationTag = (tag) => String(tag || "").trim().replace(/^#+/, "").toLowerCase();

const getAutoQualityId = (qualities, downlink) => {
  if (!Number.isFinite(downlink) || downlink <= 0) return "original";
  const eligible = qualities
    .map((quality) => ({ ...quality, height: getResolutionHeight(quality.displayLabel) }))
    .filter((quality) => quality.height)
    .sort((first, second) => first.height - second.height);
  const maxHeightByBandwidth = [
    [0.35, 144],
    [0.6, 240],
    [1, 360],
    [1.8, 480],
    [3.5, 720],
    [7, 1080],
    [12, 1440],
    [Infinity, 2160],
  ].find(([minimumMbps]) => downlink < minimumMbps)?.[1] || 2160;
  const suitable = eligible.filter((quality) => quality.height <= maxHeightByBandwidth);
  return (suitable[suitable.length - 1] || eligible[0])?.id || "original";
};

const WatchVideoPage = ({ videoId: providedVideoId, isPersistentMiniPlayer = false, onDismissMiniPlayer }) => {
  const { videoId: routeVideoId } = useParams();
  const videoId = providedVideoId || routeVideoId;
  const navigate = useNavigate();
  const { allVideoData, recommendationData } = useSelector((state) => state.content);
  const { userData } = useSelector((state) => state.user);
   const allVideos = [
    ...(recommendationData?.recommendedVideos || []),
    ...(recommendationData?.remainingVideos || []),
  ];

  const uniqueAvailableVideos = [...new Map(
    [...(allVideoData || []), ...allVideos]
      .filter((item) => item?._id && item._id !== videoId && item.videoUrl)
      .map((item) => [item._id, item])
  ).values()];
  const suggestedVideos = uniqueAvailableVideos.slice(0, 10);

  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const pendingQualityChange = useRef(null);
  const controlsTimeoutRef = useRef(null);
  const playFeedbackTimeoutRef = useRef(null);
  const viewSessionIdRef = useRef(null);
  const settingsRef = useRef(null);
  if (!viewSessionIdRef.current) viewSessionIdRef.current = createPlaybackSessionId();
  const playbackTimeRef = useRef({ videoId: null, lastTime: null, watchedSeconds: 0, requestSent: false });
  const [video, setVideo] = useState(null); // API se video data
  const [playbackLocked, setPlaybackLocked] = useState(false);
  const [adFreeAccess, setAdFreeAccess] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [sourceQualityLabel, setSourceQualityLabel] = useState("");
  const [networkDownlink, setNetworkDownlink] = useState(null);
  const [autoQualityId, setAutoQualityId] = useState("original");
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [playFeedback, setPlayFeedback] = useState(null);
  const [channel, setChannel] = useState("")
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(false)
  const [downloadLoading, setDownloadLoading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(null)
  const [isOfflineDownloaded, setIsOfflineDownloaded] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [isMiniPlayer, setIsMiniPlayer] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsPage, setSettingsPage] = useState("main");
  const [recommendationFilter, setRecommendationFilter] = useState("all");
  const [channelPlaylists, setChannelPlaylists] = useState([]);
  const [autoplayNext, setAutoplayNext] = useState(true);
  const [selectedCaption, setSelectedCaption] = useState(-1);
  const [selectedQuality, setSelectedQuality] = useState("auto");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(
    channel?.subscribers?.some(
      (sub) => sub._id?.toString() === userData?._id?.toString() || sub?.toString() === userData?._id?.toString()
    )
  );
  useClickOutside(settingsRef, showSettings && !isCompactPlayer, () => setShowSettings(false));

  useEffect(() => {
    let cancelled = false;
    let interval;
    setAdFreeAccess(null);
    if (!userData?._id || userData.isGuest || !channel?._id) return undefined;
    const checkAccess = () => axios.get(`${serverUrl}/api/payments/ad-free-access`, {
        params: { channelId: channel._id },
        withCredentials: true,
      }).then(({ data }) => {
        if (!cancelled) setAdFreeAccess(data);
      }).catch((error) => {
        if (!cancelled) console.error("Unable to check ad-free offer access:", error);
      });
    checkAccess();
    interval = window.setInterval(checkAccess, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [userData?._id, userData?.isGuest, channel?._id, videoId]);

  const captionTracks = (video?.captionTracks || []).filter((track) => track?.src || track?.url);
  const qualityOptions = useMemo(() => [
    { id: "original", label: sourceQualityLabel || t("Original"), src: video?.videoUrl, displayLabel: sourceQualityLabel || t("Original") },
    ...(video?.qualities || [])
      .map((quality, index) => ({
        ...quality,
        id: `variant-${index}`,
        displayLabel: quality.label || quality.name || (quality.height ? `${quality.height}p` : `${t("Quality")} ${index + 1}`),
      })),
  ].filter((quality) => quality?.src || quality?.url), [sourceQualityLabel, video?.qualities, video?.videoUrl]);
  const activeVideoUrl = selectedQuality === "auto"
    ? qualityOptions.find((quality) => quality.id === autoQualityId)?.src
      || qualityOptions.find((quality) => quality.id === autoQualityId)?.url
      || video?.videoUrl
    : qualityOptions.find((quality) => quality.id === selectedQuality)?.src
      || qualityOptions.find((quality) => quality.id === selectedQuality)?.url
      || video?.videoUrl;
  const selectedQualityLabel = selectedQuality === "auto"
    ? `${t("Auto")} (${qualityOptions.find((quality) => quality.id === autoQualityId)?.displayLabel || sourceQualityLabel || t("Original")})`
    : qualityOptions.find((quality) => quality.id === selectedQuality)?.displayLabel || t("Auto");
  const chapters = (video?.description || "")
    .split(/\r?\n/)
    .map((line) => {
      const match = line.trim().match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s+(.+)$/);
      if (!match) return null;
      const hours = Number(match[1] || 0);
      const minutes = Number(match[2]);
      const seconds = Number(match[3]);
      return {
        time: hours * 3600 + minutes * 60 + seconds,
        title: match[4].trim(),
      };
    })
    .filter((chapter) => chapter && chapter.title)
    .sort((first, second) => first.time - second.time);
  const hasChapters = chapters.length >= 3 && chapters[0].time === 0;
  const activeChapter = [...chapters].reverse().find((chapter) => chapter.time <= currentTime);
  const isCompactPlayer = isMiniPlayer || isPersistentMiniPlayer;
  const recommendationCategories = [...new Map(
    [video, suggestedVideos[0]]
      .filter(Boolean)
      .flatMap((item) => getVideoCategories(item))
      .map((category) => [normalizeRecommendationTag(category), category])
  ).values()];
  const filteredSuggestions = recommendationFilter === "channel"
    ? suggestedVideos.filter((suggestion) => {
      const suggestionChannelId = suggestion.channel?._id || suggestion.channel;
      return suggestionChannelId?.toString() === channel?._id?.toString();
    })
    : recommendationFilter.startsWith("playlist:")
      ? channelPlaylists.find((playlist) => `playlist:${playlist._id}` === recommendationFilter)?.videos || []
      : recommendationFilter.startsWith("tag:")
        ? uniqueAvailableVideos.filter((suggestion) => {
          const selectedTag = normalizeRecommendationTag(recommendationFilter.slice(4));
          return getVideoCategories(suggestion).some((category) => normalizeRecommendationTag(category) === selectedTag);
        })
        : suggestedVideos;
  const channelOwnerId = channel?.owner?._id || channel?.owner;
  const isOwnChannel = Boolean(userData?._id && channelOwnerId
    && channelOwnerId.toString() === userData._id.toString());

  useEffect(() => {
    let cancelled = false;
    setIsOfflineDownloaded(false);
    if (!userData?._id || !videoId) return undefined;

    getOfflineDownload(userData._id, videoId)
      .then((record) => {
        if (!cancelled) setIsOfflineDownloaded(Boolean(record));
      })
      .catch((storageError) => {
        console.error("Unable to check whether this video is stored offline:", storageError);
      });

    return () => {
      cancelled = true;
    };
  }, [userData?._id, videoId]);


  useEffect(() => {
    if (!videoId || !allVideoData) return;

    // Redux me se current video nikal lo
    const currentVideo = allVideoData.find((v) => v._id === videoId);
    if (currentVideo && !currentVideo.isPaidContent) {
      setVideo(currentVideo);
      setChannel(currentVideo.channel || [])
      setComments(currentVideo.comments || []);
    }

  }, [videoId, allVideoData]);

  useEffect(() => {
    let cancelled = false;
    setVideo(null);
    setPlaybackLocked(false);
    if (!videoId) return undefined;

    axios.get(`${serverUrl}/api/content/fetch-video/${videoId}`, { withCredentials: true })
      .then(({ data }) => {
        if (cancelled) return;
        setVideo(data);
        setChannel(data.channel || []);
        setComments(data.comments || []);
        setPlaybackLocked(false);
      })
      .catch((error) => {
        if (cancelled) return;
        if (error.response?.status === 403 && error.response.data?.requiresPurchase) {
          const preview = error.response.data.video;
          setVideo(preview);
          setChannel(preview?.channel || []);
          setComments(preview?.comments || []);
          setPlaybackLocked(true);
          return;
        }
        console.error("Unable to load video playback:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [videoId]);

  useEffect(() => {
    viewSessionIdRef.current = createPlaybackSessionId();
    playbackTimeRef.current = { videoId, lastTime: null, watchedSeconds: 0, requestSent: false };
    setRecommendationFilter("all");
    setSelectedQuality("auto");
    setAutoQualityId("original");
    setSourceQualityLabel("");
    setSelectedCaption(-1);
    setSettingsPage("main");
    setShowSettings(false);
  }, [videoId]);

  useEffect(() => {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!connection) return undefined;

    const updateDownlink = () => {
      const downlink = Number(connection.downlink);
      setNetworkDownlink(Number.isFinite(downlink) && downlink > 0 ? downlink : null);
    };

    updateDownlink();
    connection.addEventListener?.("change", updateDownlink);
    return () => connection.removeEventListener?.("change", updateDownlink);
  }, []);

  useEffect(() => {
    if (selectedQuality !== "auto") return;
    const nextQualityId = getAutoQualityId(qualityOptions, networkDownlink);
    if (nextQualityId === autoQualityId) return;

    const nextQuality = qualityOptions.find((quality) => quality.id === nextQualityId);
    const nextSource = nextQuality?.src || nextQuality?.url || video?.videoUrl;
    if (videoRef.current && nextSource && nextSource !== activeVideoUrl) {
      pendingQualityChange.current = {
        time: videoRef.current.currentTime,
        wasPlaying: !videoRef.current.paused,
      };
    }
    setAutoQualityId(nextQualityId);
  }, [activeVideoUrl, autoQualityId, networkDownlink, qualityOptions, selectedQuality, video?.videoUrl]);

  // Video Controls
  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (isPlaying) videoRef.current.pause();
    else videoRef.current.play().catch((error) => console.error("Unable to play video:", error));
  }, [isPlaying]);

  const togglePlayWithFeedback = () => {
    setPlayFeedback(isPlaying ? "pause" : "play");
    if (playFeedbackTimeoutRef.current) clearTimeout(playFeedbackTimeoutRef.current);
    playFeedbackTimeoutRef.current = setTimeout(() => setPlayFeedback(null), 650);
    togglePlay();
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const player = videoRef.current;
    const playerTime = player.currentTime;
    const videoDuration = Number.isFinite(player.duration) ? player.duration : 0;
    const playback = playbackTimeRef.current;

    if (playback.videoId !== videoId) {
      playbackTimeRef.current = { videoId, lastTime: playerTime, watchedSeconds: 0, requestSent: false };
    }
    playbackTimeRef.current.lastTime = playerTime;

    setCurrentTime(playerTime);
    setDuration(videoDuration);
    setProgress(videoDuration
      ? (playerTime / videoDuration) * 100
      : 0);
  };

  const recordVideoView = () => {
    const playback = playbackTimeRef.current;
    if (playback.videoId !== videoId) {
      playbackTimeRef.current = { videoId, lastTime: null, watchedSeconds: 0, requestSent: false };
    }
    if (playbackTimeRef.current.requestSent) return;

    playbackTimeRef.current.requestSent = true;
    axios.put(`${serverUrl}/api/content/video/${videoId}/add-view`, {
      sessionId: viewSessionIdRef.current,
    }, { withCredentials: true })
      .then((response) => {
        if (response.data.counted) {
          setVideo((previous) => previous ? { ...previous, views: response.data.views } : previous);
        }
      })
      .catch((error) => {
        playbackTimeRef.current.requestSent = false;
        console.error("Unable to record video view:", error);
      });
  };

  const handleSeek = (e) => {
    if (!videoRef.current || !duration) return;
    const seekTime = (e.target.value / 100) * duration;
    videoRef.current.currentTime = seekTime;
    setProgress(e.target.value);
  };

  const handleVolume = (e) => {
    const vol = parseFloat(e.target.value);
    setVolume(vol);
    setIsMuted(vol === 0);
    if (videoRef.current) videoRef.current.volume = vol;
  };

  const toggleMute = useCallback(() => {
    if (!videoRef.current) return;
    const shouldMute = !isMuted;
    if (!shouldMute && videoRef.current.volume === 0) {
      const restoredVolume = volume || 0.5;
      videoRef.current.volume = restoredVolume;
      setVolume(restoredVolume);
    }
    setIsMuted(shouldMute);
    videoRef.current.muted = shouldMute;
  }, [isMuted, volume]);

  const handleFullScreen = useCallback(() => {
    if (!playerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch((error) => console.error("Unable to exit fullscreen:", error));
    } else if (playerRef.current.requestFullscreen) {
      playerRef.current.requestFullscreen().catch((error) => console.error("Unable to enter fullscreen:", error));
    }
  }, []);

  const changePlaybackRate = useCallback((rate) => {
    const player = videoRef.current;
    if (player) {
      player.playbackRate = rate;
      if (player.playbackRate !== rate) {
        console.error(`The browser did not apply playback speed ${rate}x.`);
      }
    }
    setPlaybackRate(rate);
  }, []);

  const changeQuality = (quality) => {
    if (!videoRef.current) {
      setSelectedQuality(quality);
      return;
    }
    if (quality === selectedQuality) return;
    const targetQualityId = quality === "auto" ? autoQualityId : quality;
    const targetQuality = qualityOptions.find((option) => option.id === targetQualityId);
    const nextSource = targetQuality?.src || targetQuality?.url || video?.videoUrl;
    if (nextSource === activeVideoUrl) {
      setSelectedQuality(quality);
      return;
    }
    pendingQualityChange.current = {
      time: videoRef.current.currentTime,
      wasPlaying: !videoRef.current.paused,
    };
    setSelectedQuality(quality);
  };

  const openSettingsPage = (page) => {
    setSettingsPage(page);
    setShowSettings(true);
  };

  const handleLoadedMetadata = () => {
    const player = videoRef.current;
    if (!player) return;
    setDuration(player.duration);
    player.playbackRate = playbackRate;
    if (player.videoHeight > 0) setSourceQualityLabel(`${player.videoHeight}p`);
    const pendingChange = pendingQualityChange.current;
    if (!pendingChange) return;
    pendingQualityChange.current = null;
    player.currentTime = Math.min(pendingChange.time, player.duration || pendingChange.time);
    if (pendingChange.wasPlaying) {
      player.play().catch((error) => console.error("Unable to resume video after changing quality:", error));
    }
  };

  const selectCaption = (index) => {
    setSelectedCaption(index);
    const tracks = videoRef.current?.textTracks;
    if (!tracks) return;
    Array.from(tracks).forEach((track, trackIndex) => {
      track.mode = trackIndex === index ? "showing" : "disabled";
    });
  };

  const toggleMiniPlayer = useCallback(() => {
    navigate(isPersistentMiniPlayer ? `/watch-video/${videoId}` : "/");
  }, [isPersistentMiniPlayer, navigate, videoId]);

  const closeMiniPlayer = () => {
    if (isPersistentMiniPlayer) {
      onDismissMiniPlayer?.();
      return;
    }
    videoRef.current?.pause();
    setIsMiniPlayer(false);
    setShowControls(false);
  };

  const revealControls = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (!isPlaying || showSettings || isPersistentMiniPlayer) return;
    controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
  }, [isPersistentMiniPlayer, isPlaying, showSettings]);

  useEffect(() => () => {
    if (playFeedbackTimeoutRef.current) clearTimeout(playFeedbackTimeoutRef.current);
  }, []);

  const playNextVideo = () => {
    const queuedVideo = dequeueVideo();
    if (queuedVideo?._id) {
      navigate(`/watch-video/${queuedVideo._id}`);
      return;
    }
    if (autoplayNext && suggestedVideos[0]?._id) {
      navigate(`/watch-video/${suggestedVideos[0]._id}`);
    }
  };

  useEffect(() => {
    const updateFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);

  useEffect(() => {
    const handleKeyboardShortcuts = (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest("input, textarea, select, button, [contenteditable='true']")) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      switch (event.key.toLowerCase()) {
        case " ":
        case "k":
          event.preventDefault();
          togglePlay();
          break;
        case "arrowleft":
        case "j":
          event.preventDefault();
          if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - (event.key === "j" ? 10 : 5));
          break;
        case "arrowright":
        case "l":
          event.preventDefault();
            if (videoRef.current) {
              const videoDuration = Number.isFinite(videoRef.current.duration) ? videoRef.current.duration : Infinity;
              videoRef.current.currentTime = Math.min(videoDuration, videoRef.current.currentTime + (event.key === "l" ? 10 : 5));
            }
          break;
        case "m":
          toggleMute();
          break;
        case "f":
          handleFullScreen();
          break;
        case "t":
          event.preventDefault();
          setIsTheaterMode((current) => !current);
          break;
        case "i":
          toggleMiniPlayer();
          break;
        case ">":
          changePlaybackRate(Math.min(2, Number((playbackRate + 0.25).toFixed(2))));
          break;
        case "<":
          changePlaybackRate(Math.max(0.25, Number((playbackRate - 0.25).toFixed(2))));
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", handleKeyboardShortcuts);
    return () => window.removeEventListener("keydown", handleKeyboardShortcuts);
  }, [autoplayNext, changePlaybackRate, duration, handleFullScreen, isMuted, isPlaying, playbackRate, toggleMiniPlayer, toggleMute, togglePlay, volume]);

  useEffect(() => {
    if (!videoRef.current) return;
    Array.from(videoRef.current.textTracks || []).forEach((track, index) => {
      track.mode = index === selectedCaption ? "showing" : "disabled";
    });
  }, [selectedCaption, video?.captionTracks]);

  useEffect(() => {
    setSelectedQuality("auto");
    setSelectedCaption(-1);
    setIsMiniPlayer(false);
    setIsTheaterMode(false);
    setShowSettings(false);
    pendingQualityChange.current = null;
    setCurrentTime(0);
    setProgress(0);
    setDuration(0);
    setIsPlaying(false);
  }, [videoId]);

  useEffect(() => {
    if (isPersistentMiniPlayer) setShowControls(true);
    else setIsMiniPlayer(false);
  }, [isPersistentMiniPlayer]);

  useEffect(() => () => {
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
  }, []);

  useEffect(() => {
    setAutoplayNext(userData?.preferences?.autoplay !== false);
  }, [userData?.preferences?.autoplay]);

  useEffect(() => {
    let cancelled = false;
    setChannelPlaylists([]);
    setRecommendationFilter("all");
    const playlistIds = (channel?.playlists || [])
      .map((playlist) => (typeof playlist === "string" ? playlist : playlist?._id)?.toString())
      .filter(Boolean);
    if (!playlistIds.length) return undefined;

    Promise.all(playlistIds.map(async (playlistId) => {
      try {
        const response = await axios.get(`${serverUrl}/api/content/fetch-playlist/${playlistId}`, {
          withCredentials: true,
        });
        return response.data.playlist;
      } catch (error) {
        console.error(`Unable to load playlist ${playlistId} for video recommendations:`, error);
        return null;
      }
    })).then((playlists) => {
      if (!cancelled) setChannelPlaylists(playlists.filter(Boolean));
    });

    return () => {
      cancelled = true;
    };
  }, [channel?._id, channel?.playlists, videoId]);

  const formatTime = (time) => {
    if (isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  };

  // --- Action APIs ---
  const handleLike = async () => {
    try {
      const res = await axios.put(`${serverUrl}/api/content/video/${videoId}/toggle-like`, {}, { withCredentials: true });
      setVideo((previous) => ({
        ...res.data,
        videoUrl: previous?.videoUrl || res.data.videoUrl,
        qualities: previous?.qualities?.length ? previous.qualities : res.data.qualities,
        captionTracks: previous?.captionTracks?.length ? previous.captionTracks : res.data.captionTracks,
      }));
      console.log(res.data)
    } catch (err) { console.error(err); }
  };

  const handleDislike = async () => {
    try {
      const res = await axios.put(`${serverUrl}/api/content/video/${videoId}/toggle-dislike`, {}, { withCredentials: true });
      setVideo((previous) => ({
        ...res.data,
        videoUrl: previous?.videoUrl || res.data.videoUrl,
        qualities: previous?.qualities?.length ? previous.qualities : res.data.qualities,
        captionTracks: previous?.captionTracks?.length ? previous.captionTracks : res.data.captionTracks,
      }));
      console.log(res.data)
    } catch (err) { console.error(err); }
  };

  const handleSave = async () => {
    try {
      const res = await axios.put(`${serverUrl}/api/content/video/${videoId}/toggle-save`, {}, { withCredentials: true });
      setVideo((previous) => ({
        ...res.data,
        videoUrl: previous?.videoUrl || res.data.videoUrl,
        qualities: previous?.qualities?.length ? previous.qualities : res.data.qualities,
        captionTracks: previous?.captionTracks?.length ? previous.captionTracks : res.data.captionTracks,
      }));
    } catch (err) { console.error(err); }
  };

  const handleShare = async () => {
    const shareData = {
      title: video?.title || t("EduTube video"),
      url: window.location.href,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareData.url);
        showCustomAlert(t("Link copied"));
      } else {
        throw new Error("Sharing and clipboard access are unavailable in this browser.");
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("Unable to share video:", error);
        showCustomAlert(t("Unable to share this video."));
      }
    }
  };

  const handleDownload = async () => {
    if (playbackLocked || (video?.isPaidContent && !video?.videoUrl)) {
      showCustomAlert(t("Purchase this video or join the channel membership before downloading."));
      return;
    }
    if (!userData || userData.isGuest) {
      showCustomAlert(t("Sign in to save videos to your account Downloads."));
      navigate("/signin");
      return;
    }

    setDownloadLoading(true);
    setDownloadProgress(0);
    try {
      const existingDownload = await getOfflineDownload(userData._id, videoId);
      if (existingDownload) {
        showCustomAlert(t("This video is already in your EduTube Downloads."));
        return;
      }
      if (!navigator.onLine) {
        throw new Error(t("Connect to the internet to download this video."));
      }

      await downloadOfflineVideo({
        userId: userData._id,
        video,
        onProgress: setDownloadProgress,
      });
      setIsOfflineDownloaded(true);
      try {
        const res = await axios.put(
          `${serverUrl}/api/content/video/${videoId}/download`,
          {},
          { withCredentials: true }
        );
        setVideo((previous) => ({
          ...res.data,
          videoUrl: previous?.videoUrl || res.data.videoUrl,
          qualities: previous?.qualities?.length ? previous.qualities : res.data.qualities,
          captionTracks: previous?.captionTracks?.length ? previous.captionTracks : res.data.captionTracks,
        }));
        showCustomAlert(t("Video added to EduTube Downloads. It is available for offline playback in this browser."));
      } catch (syncError) {
        console.error("Video is saved in EduTube Downloads, but account sync failed:", syncError);
        showCustomAlert(t("Video is available offline in this browser, but could not be synced to your account Downloads."));
      }
    } catch (err) {
      console.error("Unable to download video for offline playback:", err);
      showCustomAlert(err.response?.data?.message || err.message || t("Unable to add this video to Downloads."));
    } finally {
      setDownloadLoading(false);
      setDownloadProgress(null);
    }
  };

  const handleSubscribe = async () => {
  if (!channel?._id || isOwnChannel) return;
  setLoading(true);
  try {
    const res = await axios.post(`${serverUrl}/api/user/subscribe`, { channelId: channel._id }, { withCredentials: true });
    // Update channel's subscribers
    setChannel((prev) => ({
      ...prev,
      subscribers: res.data.subscribers || prev.subscribers,
    }));
    setLoading(false);
  } catch (err) {
    console.error(err);
    setLoading(false);
  }
};

  useEffect(() => {
    setIsSubscribed(
      channel?.subscribers?.some(
        (sub) => sub._id?.toString() === userData?._id?.toString() || sub?.toString() === userData?._id?.toString()
      )
    );
  }, [channel.subscribers, userData?._id]);

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    try {
      const res = await axios.post(`${serverUrl}/api/content/video/${videoId}/comment`, { message: newComment }, { withCredentials: true });
      setComments(res.data?.comments);
      console.log(res.data.comments)

    } catch (err) { console.error(err); }
  };




  const handleAddReply = async (commentId, replyText) => {
    if (!replyText.trim()) return;
    try {
      const res = await axios.post(`${serverUrl}/api/content/video/${videoId}/${commentId}/reply`, { message: replyText }, { withCredentials: true });

      setComments(res.data.comments);
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    const addHistory = async () => {
      try {
       const res =  await axios.post(
          `${serverUrl}/api/user/addhistory`,
          { contentId: videoId,
  contentType: "Video" },
          { withCredentials: true }
        );
        console.log(res.data)
      } catch (err) {
        console.error("Error adding history:", err);
      }
    };

    if (videoId) addHistory();
  }, [videoId]);




  return (
    <div className={isPersistentMiniPlayer
      ? "fixed bottom-4 right-4 z-[60] w-[min(90vw,400px)] overflow-hidden rounded-lg bg-[#0f0f0f] text-white shadow-2xl"
      : "fixed inset-x-0 top-[60px] bottom-[calc(64px+env(safe-area-inset-bottom))] z-20 overflow-y-auto md:bottom-0 md:left-[var(--youtube-sidebar-width,0px)] flex bg-[#0f0f0f] text-white flex-col items-start gap-0 p-0 md:gap-4 md:p-4 lg:flex-row lg:gap-6 lg:p-6"}>
      {/* Left - Video & Details */}
      <div className={isPersistentMiniPlayer ? "w-full" : "w-full min-w-0 flex-1"}>
        {/* Video Player */}
        <div
          ref={playerRef}
          className={`${isMiniPlayer && !isPersistentMiniPlayer
            ? "fixed bottom-4 right-4 z-[60] w-[min(90vw,400px)] shadow-2xl"
            : isTheaterMode
              ? "mx-auto w-full md:w-[calc(100%-2rem)]"
              : "w-full"} aspect-video bg-black rounded-none md:rounded-lg overflow-hidden relative`}
          onMouseEnter={revealControls}
          onMouseMove={revealControls}
          onMouseLeave={() => {
            if (!isPlaying) setShowControls(false);
          }}
          onTouchStart={revealControls}
          onDoubleClick={handleFullScreen}
        >
          {adFreeAccess?.entitled && !playbackLocked && (
            <div className="pointer-events-none absolute right-3 top-3 z-10 rounded-full bg-black/70 px-3 py-1 text-xs font-medium text-green-200" role="status">
              Ad-free offer active
            </div>
          )}
          {playbackLocked ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#141414] px-6 text-center">
              {video?.thumbnail && (
                <img src={video.thumbnail} alt="" className="absolute inset-0 h-full w-full object-cover opacity-20" />
              )}
              <FaLock className="relative z-10 text-3xl text-blue-300" aria-hidden="true" />
              <h2 className="relative z-10 text-lg font-semibold">{t("Protected paid video")}</h2>
              <p className="relative z-10 max-w-md text-sm text-gray-300">
                {t("Purchase this video or join the channel membership to watch.")}
              </p>
              <button
                type="button"
                onClick={() => navigate("/memberships-and-purchases")}
                className="relative z-10 rounded-full bg-blue-600 px-5 py-2 text-sm font-medium hover:bg-blue-500"
              >
                {t("Browse memberships & purchases")}
              </button>
            </div>
          ) : <video
            ref={videoRef}
            src={activeVideoUrl}
            crossOrigin={captionTracks.length > 0 ? "anonymous" : undefined}
            className="w-full h-full object-contain"
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={playNextVideo}
            onPlay={() => {
              playbackTimeRef.current.lastTime = videoRef.current?.currentTime ?? null;
              setIsPlaying(true);
              recordVideoView();
            }}
            onPause={() => {
              playbackTimeRef.current.lastTime = null;
              setIsPlaying(false);
            }}
            controls={false}
            autoPlay={userData?.preferences?.autoplay !== false}
            onClick={() => {
              setShowControls(true);
              togglePlayWithFeedback();
            }}
          >
            {captionTracks.map((track, index) => (
              <track
                key={`${track.src || track.url}-${index}`}
                kind="captions"
                src={track.src || track.url}
                srcLang={track.language || track.srclang || "en"}
                label={track.label || track.language || `Caption ${index + 1}`}
              />
            ))}
          </video>}
          {isPlaying && !showControls && !isCompactPlayer && duration > 0 && (
            <div
              role="progressbar"
              aria-label={t("Video progress")}
              aria-valuemin={0}
              aria-valuemax={duration}
              aria-valuenow={currentTime}
              className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-5"
            >
              <div className="mb-1 flex justify-end text-[11px] font-medium text-white">
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-white/40">
                <div
                  className="h-full bg-red-600 transition-[width] duration-200"
                  style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                />
              </div>
            </div>
          )}
          {showControls && (isMiniPlayer || isPersistentMiniPlayer) && (
            <div className="absolute left-0 right-0 top-0 z-30 flex items-center justify-between gap-2 bg-gradient-to-b from-black/90 to-transparent px-3 py-2">
              <p className="min-w-0 flex-1 truncate text-xs font-medium text-white">{video?.title}</p>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={closeMiniPlayer}
                  aria-label={t("Close miniplayer")}
                  title={t("Close miniplayer")}
                  className="rounded-full p-2 hover:bg-white/20"
                >
                  <FaTimes />
                </button>
              </div>
            </div>
          )}
          {playFeedback && (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/60 text-white">
                {playFeedback === "play" ? <FaPlay size={25} /> : <FaPause size={25} />}
              </span>
            </div>
          )}
          {showControls && (
          <div className={`absolute bottom-0 left-0 right-0 z-30 ${isCompactPlayer ? "bg-gradient-to-t from-black/75 to-transparent px-3 pb-2 pt-4" : "bg-gradient-to-t from-black/80 via-black/60 to-transparent px-2 py-2 sm:px-4"}`}>
            {isCompactPlayer ? (
              <>
                <input
                  aria-label={t("Seek")}
                  type="range"
                  min="0"
                  max="100"
                  value={progress}
                  onChange={handleSeek}
                  className="block h-1 w-full cursor-pointer accent-red-600"
                />
                <div className="mt-1 flex items-center justify-between text-[11px] text-white">
                  <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
                  {!isPersistentMiniPlayer && (
                    <button
                      type="button"
                      onClick={handleFullScreen}
                      aria-label={t("Fullscreen")}
                      title={t("Fullscreen")}
                      className="rounded-full p-1 hover:bg-white/20"
                    >
                      <FaExpand size={13} />
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
            <div className="relative flex items-center px-1">
              <input
                aria-label={t("Seek")}
                type="range"
                min="0"
                max="100"
                value={progress}
                onChange={handleSeek}
                className="h-1 w-full cursor-pointer appearance-none rounded-full accent-red-600"
                style={{ background: `linear-gradient(to right, #f00 ${progress}%, rgba(255,255,255,.35) ${progress}%)` }}
              />
              {hasChapters && duration > 0 && chapters.map((chapter) => (
                <button
                  key={`${chapter.time}-${chapter.title}`}
                  type="button"
                  title={`${formatTime(chapter.time)} ${chapter.title}`}
                  aria-label={`${t("Jump to chapter")}: ${chapter.title}`}
                  onClick={() => { if (videoRef.current) videoRef.current.currentTime = Math.min(chapter.time, duration); }}
                  className="absolute h-2 w-1 -translate-x-1/2 rounded-full bg-white/80 hover:bg-red-500"
                  style={{ left: `${Math.min(100, (chapter.time / duration) * 100)}%` }}
                />
              ))}
            </div>

            <div className="mt-1 flex min-h-12 items-center justify-between gap-2 rounded-full px-2 py-1 text-white sm:px-3">
              <div className="flex min-w-0 items-center gap-2 px-1.5 py-0.5 sm:gap-3">
                <button
                  type="button"
                  onClick={togglePlay}
                  aria-label={isPlaying ? t("Pause") : t("Play")}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-700/55 hover:bg-slate-700/75"
                >
                  {isPlaying ? <FaPause size={17} /> : <FaPlay size={17} />}
                </button>
                <div className="group hidden shrink-0 items-center rounded-full bg-white/20 md:flex">
                  <button
                    type="button"
                    onClick={toggleMute}
                    aria-label={isMuted ? t("Unmute") : t("Mute")}
                    className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/15"
                  >
                    {isMuted ? <FaVolumeMute size={18} /> : <FaVolumeUp size={18} />}
                  </button>
                  <input
                    aria-label={t("Volume")}
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={isMuted ? 0 : volume}
                    onChange={handleVolume}
                    className="w-0 cursor-pointer accent-white opacity-0 transition-all duration-200 group-hover:mr-3 group-hover:w-20 group-hover:opacity-100"
                  />
                </div>
                <span className="shrink-0 rounded-full px-3 py-2 text-xs font-medium tabular-nums sm:text-sm">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
                {activeChapter && (
                  <span className="hidden max-w-36 truncate px-3 py-2 text-xs sm:block">
                    {activeChapter.title}
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-0.5 px-1.5 py-0.5 sm:gap-2 sm:px-2">
                <button
                  type="button"
                  onClick={() => setAutoplayNext((enabled) => !enabled)}
                  aria-label={autoplayNext ? t("Turn off autoplay") : t("Turn on autoplay")}
                  title={autoplayNext ? t("Turn off autoplay") : t("Turn on autoplay")}
                  aria-pressed={autoplayNext}
                  className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/15"
                >
                  <span
                    aria-hidden="true"
                    className={`relative h-4 w-8 rounded-full transition-colors ${autoplayNext ? "bg-red-600" : "bg-white/35"}`}
                  >
                    <span className={`absolute top-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-white transition-transform ${autoplayNext ? "translate-x-4" : "translate-x-0.5"}`}>
                      <FaPlay className="text-[6px] text-gray-800" />
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => openSettingsPage("captions")}
                  aria-label={t("Captions")}
                  title={t("Captions")}
                  className={`flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/15 ${selectedCaption >= 0 ? "text-red-400" : ""}`}
                >
                  <FaClosedCaptioning size={19} />
                </button>
                <button
                  type="button"
                  onClick={() => openSettingsPage("main")}
                  aria-label={t("Playback settings")}
                  title={t("Playback settings")}
                  className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/15"
                >
                  <FaCog size={19} />
                </button>
                <button
                  type="button"
                  onClick={handleFullScreen}
                  aria-label={isFullscreen ? t("Exit fullscreen") : t("Fullscreen")}
                  title={t("Fullscreen")}
                  className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/15"
                >
                  {isFullscreen ? <FaCompress size={18} /> : <FaExpand size={18} />}
                </button>
              </div>
            </div>
              </>
            )}

          </div>
          )}
          {showSettings && !isCompactPlayer && (
            <div ref={settingsRef} className="absolute bottom-16 right-3 z-40 max-h-[80%] w-72 overflow-y-auto rounded-xl bg-[#202020] p-3 text-sm shadow-xl sm:w-80">
              <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-2 font-semibold">
                <div className="flex min-w-0 items-center gap-2">
                  {settingsPage !== "main" && (
                    <button
                      type="button"
                      onClick={() => setSettingsPage("main")}
                      aria-label={t("Back to settings")}
                      className="rounded-full px-2 py-1 hover:bg-white/10"
                    >
                      ←
                    </button>
                  )}
                  <span>{t(settingsPage === "main" ? "Settings" : settingsPage === "quality" ? "Quality" : settingsPage === "speed" ? "Playback speed" : "Captions")}</span>
                </div>
                <button type="button" onClick={() => setShowSettings(false)} aria-label={t("Close settings")} className="rounded-full p-2 hover:bg-white/10"><FaTimes /></button>
              </div>
              {settingsPage === "main" && (
                <div className="space-y-1">
                  <button type="button" onClick={() => setSettingsPage("quality")} className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left hover:bg-white/10">
                    <span>{t("Quality")}</span><span className="text-gray-300">{selectedQualityLabel} ›</span>
                  </button>
                  <button type="button" onClick={() => setSettingsPage("speed")} className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left hover:bg-white/10">
                    <span>{t("Playback speed")}</span><span className="text-gray-300">{playbackRate === 1 ? t("Normal") : `${playbackRate}x`} ›</span>
                  </button>
                  <button type="button" onClick={() => setSettingsPage("captions")} className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left hover:bg-white/10">
                    <span>{t("Subtitles/CC")}</span>
                    <span className="max-w-36 truncate text-gray-300">{selectedCaption < 0 ? t("Off") : captionTracks[selectedCaption]?.label || captionTracks[selectedCaption]?.language || t("On")} ›</span>
                  </button>
                  <label className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-3 hover:bg-white/10">
                    <span>{t("Autoplay")}</span>
                    <input type="checkbox" checked={autoplayNext} onChange={(event) => setAutoplayNext(event.target.checked)} className="h-4 w-4 accent-red-600" />
                  </label>
                  {hasChapters && <p className="px-3 py-2 text-xs text-gray-300">{t("Chapters are available below the progress bar.")}</p>}
                </div>
              )}
              {settingsPage === "quality" && (
                <div className="space-y-0.5">
                  <button type="button" onClick={() => changeQuality("auto")} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-white/10 ${selectedQuality === "auto" ? "text-white" : "text-gray-300"}`}>
                    <span className="w-5 text-center">{selectedQuality === "auto" ? "✓" : ""}</span>
                    <span>{t("Auto")} <span className="text-xs text-gray-400">({qualityOptions.find((quality) => quality.id === autoQualityId)?.displayLabel || sourceQualityLabel || t("Original")})</span></span>
                  </button>
                  {qualityOptions.map((quality) => (
                    <button
                      key={quality.id}
                      type="button"
                      onClick={() => changeQuality(quality.id)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-white/10 ${selectedQuality === quality.id ? "text-white" : "text-gray-300"}`}
                    >
                      <span className="w-5 text-center">{selectedQuality === quality.id ? "✓" : ""}</span>
                      <span>{quality.displayLabel}</span>
                    </button>
                  ))}
                </div>
              )}
              {settingsPage === "speed" && (
                <div className="space-y-1">
                  {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => changePlaybackRate(rate)}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left hover:bg-white/10 ${playbackRate === rate ? "text-white" : "text-gray-300"}`}
                    >
                      <span>{rate === 1 ? t("Normal") : `${rate}x`}</span>
                      {playbackRate === rate && <span aria-hidden="true">✓</span>}
                    </button>
                  ))}
                </div>
              )}
              {settingsPage === "captions" && (
                <div className="space-y-1">
                  <button type="button" onClick={() => selectCaption(-1)} className={`flex w-full items-center justify-between rounded-lg px-3 py-3 text-left hover:bg-white/10 ${selectedCaption === -1 ? "text-white" : "text-gray-300"}`}>
                    <span>{t("Off")}</span>{selectedCaption === -1 && <span aria-hidden="true">✓</span>}
                  </button>
                  {captionTracks.map((track, index) => (
                    <button
                      key={`${track.src || track.url}-${index}`}
                      type="button"
                      onClick={() => selectCaption(index)}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-3 text-left hover:bg-white/10 ${selectedCaption === index ? "text-white" : "text-gray-300"}`}
                    >
                      <span>{track.label || track.language || `${t("Caption")} ${index + 1}`}</span>
                      {selectedCaption === index && <span aria-hidden="true">✓</span>}
                    </button>
                  ))}
                  {captionTracks.length === 0 && <p className="px-3 py-3 text-xs text-gray-400">{t("No captions are available for this video.")}</p>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Video Info */}
        <div className={isPersistentMiniPlayer ? "hidden" : "px-3 pb-5 md:px-0"}>
        <h1 className="mt-4 text-lg sm:text-xl font-bold text-white flex gap-3">{video?.title} </h1>

        <p className="text-sm text-gray-400">{video?.views}{t(" views")}</p>
        <div className="flex flex-wrap items-center justify-between">
          <div className="flex items-center justify-start gap-4" ><NameAvatar src={channel?.avatar} name={channel?.name} className="h-12 w-12 border-2 border-gray-600 text-sm" onClick={() => navigate(`/channelpage/${channel._id}`)} />
            <div>
              <h1 className="text-md font-bold" onClick={() => navigate(`/channelpage/${channel._id}`)}>{channel?.name}</h1>
              <h3 className="text-[13px]">{channel?.subscribers?.length}</h3>
            </div>
            {!isOwnChannel && <button
              className={`px-[20px] py-[8px] rounded-4xl border border-gray-600 ml-[20px] text-md ${isSubscribed ? "bg-black text-white hover:bg-orange-600 hover:text-black" : "bg-white text-black hover:bg-orange-600 hover:text-black"
                }`}
              onClick={handleSubscribe}
              disabled={loading}
            >
              {loading ? <ClipLoader size={20} color="gray" /> : isSubscribed ? t("Subscribed") : t("Subscribe")}
            </button>}

          </div>
          <div className="mt-3 flex max-w-full items-center gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible">
            <div className="flex shrink-0 items-center overflow-hidden rounded-full bg-[#272727]">
              <ActionButton
                icon={FaThumbsUp}
                active={video?.likes?.some((id) => id?.toString() === userData?._id?.toString())}
                label={t("Like")}
                count={video?.likes?.length || 0}
                onClick={handleLike}
                className="rounded-r-none bg-transparent hover:bg-[#3f3f3f]"
              />
              <span className="h-5 w-px bg-gray-500" aria-hidden="true" />
              <ActionButton
                icon={FaThumbsDown}
                active={video?.dislikes?.some((id) => id?.toString() === userData?._id?.toString())}
                label={t("Dislike")}
                onClick={handleDislike}
                className="rounded-l-none bg-transparent hover:bg-[#3f3f3f]"
              />
            </div>
            <ActionButton icon={FaShare} label={t("Share")} onClick={handleShare} />
            <div className="flex shrink-0 flex-col items-center">
              <ActionButton
                icon={FaDownload}
                active={isOfflineDownloaded}
                label={downloadLoading
                  ? `${t("Downloading...")}${downloadProgress === null ? "" : ` ${downloadProgress}%`}`
                  : isOfflineDownloaded ? t("In Downloads") : t("Download")}
                onClick={handleDownload}
                disabled={downloadLoading || playbackLocked}
              />
              {downloadLoading && (
                <div
                  role="progressbar"
                  aria-label={t("Video download progress")}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={downloadProgress ?? undefined}
                  className="mt-1 h-1 w-full overflow-hidden rounded-full bg-gray-600"
                >
                  <div
                    className={`h-full bg-red-500 ${downloadProgress === null ? "w-1/3 animate-pulse" : ""}`}
                    style={downloadProgress === null ? undefined : { width: `${downloadProgress}%` }}
                  />
                </div>
              )}
            </div>
            <ActionButton icon={FaBookmark} active={video?.saveBy?.some((id) => id.toString() === userData?._id?.toString())} label={t("Save")} onClick={handleSave} />
          </div>
        </div>

     <div className="mt-4 bg-[#1a1a1a] p-3 rounded-lg">
  <h2 className="text-md font-semibold mb-2">{t("Description")}</h2>
  <Description text={video?.description} />
</div>
        {/* Comments */}
        <div className="mt-6">
          <h2 className="text-lg font-semibold mb-3">{t("Comments")}</h2>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder={t("Add a comment...")}
              className="flex-1 border border-gray-700 bg-[#1a1a1a] text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-red-600"
            />
            <button onClick={handleAddComment} className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg">{t("Post")}</button>
          </div>

          <div className="space-y-3">
            {comments?.map((comment) => (

              <div key={comment?._id} className="p-3 bg-[#1a1a1a] rounded-lg shadow-sm text-sm">
                <div className="flex items-center justify-start gap-1">
                  <NameAvatar src={comment?.author?.photoUrl} name={comment?.author?.username} className="h-8 w-8 text-xs" />
                  <h1 className="text-[13px]">@{comment?.author?.username?.toLowerCase()}</h1>
                </div>
                <p className="font-medium px-[20px] py-[20px] ">{comment?.message}</p>
                <div className="ml-4 mt-2 space-y-2">
                  {comment?.replies?.map((reply) => (
                    <div key={reply._id} className="p-2 bg-[#2a2a2a] rounded ">
                      <div className="flex items-center justify-start gap-1"><NameAvatar src={reply?.author?.photoUrl} name={reply?.author?.username} className="h-8 w-8 text-xs" />
                        <h1 className="text-[13px]">@{comment?.author?.username.toLowerCase()}</h1></div>
                      <p className="px-[20px] py-[20px]">{reply?.message}</p>

                    </div>
                  ))}
                </div>
                <ReplySection comment={comment} handleAddReply={handleAddReply} />
              </div>
            ))}
          </div>
        </div>
      </div>
      </div>

      {/* Suggested long videos */}
      <div className={`${isPersistentMiniPlayer
        ? "hidden"
        : `w-full ${isTheaterMode
          ? "lg:sticky lg:top-0 lg:max-h-[calc(100vh-7rem)] lg:w-[320px] lg:overflow-y-auto"
          : "lg:w-[360px]"} lg:shrink-0 border-t px-3 py-3 md:px-0 md:py-0 lg:border-t-0`}`}>
        <div className="mb-3 flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
          <button
            type="button"
            onClick={() => setRecommendationFilter("all")}
            className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition ${recommendationFilter === "all" ? "bg-white text-black" : "bg-[#272727] text-white hover:bg-[#3f3f3f]"}`}
          >
            {t("All")}
          </button>
          {channel?._id && (
            <button
              type="button"
              onClick={() => setRecommendationFilter("channel")}
              className={`shrink-0 max-w-48 truncate rounded-lg px-3 py-2 text-xs font-medium transition ${recommendationFilter === "channel" ? "bg-white text-black" : "bg-[#272727] text-white hover:bg-[#3f3f3f]"}`}
              title={channel.name}
            >
              {t("From")} {channel.name}
            </button>
          )}
          {recommendationCategories.map((category) => {
            const tagFilter = `tag:${normalizeRecommendationTag(category)}`;
            return (
              <button
                key={tagFilter}
                type="button"
                onClick={() => setRecommendationFilter(tagFilter)}
                className={`shrink-0 max-w-40 truncate rounded-lg px-3 py-2 text-xs font-medium transition ${recommendationFilter === tagFilter ? "bg-white text-black" : "bg-[#272727] text-white hover:bg-[#3f3f3f]"}`}
                title={category}
              >
                {category}
              </button>
            );
          })}
          {channelPlaylists.map((playlist) => (
            <button
              key={playlist._id}
              type="button"
              onClick={() => setRecommendationFilter(`playlist:${playlist._id}`)}
              className={`shrink-0 max-w-48 truncate rounded-lg px-3 py-2 text-xs font-medium transition ${recommendationFilter === `playlist:${playlist._id}` ? "bg-white text-black" : "bg-[#272727] text-white hover:bg-[#3f3f3f]"}`}
              title={playlist.title}
            >
              {playlist.title || t("Playlists")}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {filteredSuggestions.map((v) => (
            <button
              key={v._id}
              type="button"
              onClick={() => navigate(`/watch-video/${v._id}`)}
              className="flex w-full cursor-pointer items-start gap-2 rounded-lg p-1.5 text-left transition hover:bg-[#1a1a1a] sm:gap-3"
            >
              <span className="relative block aspect-video w-[60%] max-w-[260px] shrink-0 overflow-hidden rounded-xl bg-[#272727]">
                {v.thumbnail ? (
                  <img src={v.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : null}
              </span>
              <span className="min-w-0 flex-1 pt-0.5">
                <span className="line-clamp-2 block text-sm font-semibold leading-5 text-white">{v.title}</span>
                <span className="mt-1 block truncate text-xs text-gray-400">{v.channel?.name}</span>
                <span className="mt-1 block text-xs text-gray-400">{v.views}{t(" views")}</span>
              </span>
            </button>
          ))}
          {filteredSuggestions.length === 0 && (
            <p className="px-2 py-4 text-sm text-gray-400">
              {t("No videos found for this topic.")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

const ReplySection = ({ comment, handleAddReply }) => {
  const [replyText, setReplyText] = useState("");
  const [showReplyInput, setShowReplyInput] = useState(false);

  return (
    <div className="mt-2">
      {showReplyInput && (
        <div className="flex gap-2 mt-1 ml-4">
          <input
            type="text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder={t("Add a reply...")}
            className="flex-1 border border-gray-700 bg-[#1a1a1a] text-white rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-red-600 text-sm"
          />
          <button onClick={() => { handleAddReply(comment._id, replyText); setReplyText(""); setShowReplyInput(false); }} className="bg-red-600 hover:bg-red-700 text-white px-3 rounded-lg text-sm">{t("Reply")}</button>
        </div>
      )}
      <button onClick={() => setShowReplyInput(!showReplyInput)} className="ml-4 text-xs text-gray-400 mt-1">{t("Reply")}</button>
    </div>
  );
};

export default WatchVideoPage;
