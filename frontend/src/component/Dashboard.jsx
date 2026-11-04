import { t } from '../../utils/i18n.js';
import React, { useState } from "react";
import { useSelector } from "react-redux";
import {
  FaEye,
 
  FaThumbsUp,
  FaComment,
} from "react-icons/fa";

import { useNavigate } from "react-router-dom";

function Dashboard() {
  const { channelData } = useSelector((state) => state.user);
  const {contentRevenue} = useSelector((state)=>state.content)
  const navigate = useNavigate()

  if (!channelData) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-400">{t("\n        Loading channel data...\n      ")}</div>
    );
  }

  const totalVideoViews = (channelData.videos || []).reduce(
    (acc, vid) => acc + (vid.views || 0),
    0
  );
  const totalShortViews = (channelData.shorts || []).reduce(
    (acc, short) => acc + (short.views || 0),
    0
  );
  const totalViews = totalVideoViews + totalShortViews;

  return (
    <div className="w-full  text-white min-h-screen p-4 sm:p-6 space-y-6 mb-[50px]">
      {/* -------- Channel Info -------- */}
      <div className="flex flex-col md:flex-row items-center md:items-start gap-4">
        <img
          src={channelData.avatar}
          alt={t("channel avatar")}
          className="w-16 h-16 rounded-full object-cover border border-gray-700"
        />
        <div className="text-center sm:text-left">
          <h2 className="text-lg sm:text-xl font-bold">{channelData.name}</h2>
          <p className="text-gray-400 text-sm">
            {channelData.subscribers?.length || 0}{t(" Total subscribers\n          ")}</p>
        </div>
      </div>

      {/* -------- Channel Analytics -------- */}
      <div>
        <h3 className="pl-1 text-start sm:text-lg font-semibold mb-3">{t("\n          Channel Analytics\n        ")}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <AnalyticsCard
            
            label={t("Views")}
            value={totalViews || "0"}
            onClick={()=>navigate("/ptstudio/analytics")}
          />
          <AnalyticsCard
            
            label={t("Subscribers")}
            value={channelData.subscribers?.length || 0}
          />
          <AnalyticsCard
           
            label={t("Estimated revenue")}
            value={contentRevenue || 0}
            onClick={()=>navigate("/ptstudio/revenue")}
          />
        </div>
      </div>

      {/* -------- Latest Videos & Shorts -------- */}
     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
  {/* Videos */}
  <div>
    {channelData?.videos?.length > 0 && (
      <h3 className="pl-1 text-start sm:text-lg font-semibold mb-3">{t("\n        Latest Videos\n      ")}</h3>
    )}
    <div className="space-y-4">
      {(channelData.videos || [])
        .slice()
        .reverse()
        .slice(0, 5)
        .map((video, idx) => (
          <ContentCard key={idx} content={video} onClick={()=>navigate(`/watch-video/${video._id}`)} />
        ))}
    </div>
  </div>

  {/* Shorts */}
  <div>
    {channelData?.shorts?.length > 0 && (
      <h3 className="pl-1 text-start sm:text-lg font-semibold mb-3">{t("\n        Latest Shorts\n      ")}</h3>
    )}
    <div className="space-y-4">
      {(channelData.shorts || [])
        .slice()
        .reverse()
        .slice(0, 5)
        .map((short, idx) => (
          <ContentCard1 key={idx} content={short} onClick={()=>navigate(`/watch-short/${short._id}`)} />
        ))}
    </div>
  </div>
</div>

{/* Shorts */}

    </div>
  );
}

function AnalyticsCard({  label, value , onClick }) {
  return (
    <div className="cursor-pointer bg-[#0f0f0f] border border-gray-700 rounded-lg p-3 sm:p-4 shadow hover:shadow-lg transition" onClick={onClick}>
      <div className="flex items-center gap-2 text-gray-400 text-xs sm:text-sm mb-2">
       {label}
      </div>
      <h4 className="text-lg sm:text-xl text-start font-bold">{value}</h4>
    </div>
  );
}

function ContentCard({ content, isShort = false , onClick  }) {
  const [duration, setDuration] = useState("");
  const hasThumbnail = Boolean(content.thumbnail);

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

  const handleVideoMetadata = (event) => {
    setDuration(formatDuration(event.currentTarget.duration));
    if (!hasThumbnail && event.currentTarget.duration > 0) {
      event.currentTarget.currentTime = Math.min(0.1, event.currentTarget.duration / 2);
    }
  };

  return (
    <article className="flex w-full flex-col items-start gap-4 sm:flex-row">
      <button
        type="button"
        aria-label={content.title}
        className={`group/video relative block w-full shrink-0 cursor-pointer overflow-hidden bg-black text-left ${isShort ? "h-48 sm:w-28 sm:h-40" : "aspect-video sm:aspect-auto sm:h-24 sm:w-40"}`}
        onClick={onClick}
      >
        <video
          src={content.videoUrl}
          poster={content.thumbnail || undefined}
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={handleVideoMetadata}
          className="h-full w-full object-cover"
          aria-hidden="true"
        />
        {duration && (
          <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-black/80 px-1.5 py-0.5 text-xs text-white opacity-0 transition-opacity group-hover/video:opacity-100">
            {duration}
          </span>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div className="w-[100%] flex flex-col items-start justify-center gap-2"><h4 className="w-full truncate font-semibold text-sm sm:text-base">
          {content.title}
        </h4>
        <p className="text-xs text-gray-400 mt-1">{t("\n          Published ")}{new Date(content.createdAt).toLocaleDateString()}
        </p>
        </div>

        {/* Stats */}
        <div className="flex flex-wrap gap-4 mt-2 text-gray-300 text-sm">
          <span className="flex items-center gap-1">
            <FaEye /> {content.views || 0}
          </span>
          <span className="flex items-center gap-1">
            <FaThumbsUp /> {content.likes?.length || 0}
          </span>
          <span className="flex items-center gap-1">
            <FaComment /> {content.comments?.length || 0}
          </span>
        </div>
      </div>
    </article>
  );
}

function ContentCard1({ content , onClick }) {
  return (
    <article className="flex w-full flex-col items-start gap-4 sm:flex-row">
      {/* Thumbnail */}
      <button
        type="button"
        aria-label={content.title}
        className="w-full cursor-pointer text-left sm:w-auto"
        onClick={onClick}
      >
       <video
          src={content.shortUrl}
          className="h-48 w-full object-cover sm:h-40 sm:w-28"
          muted
          playsInline
          preload="metadata"
          onContextMenu={(e) => e.preventDefault()}
        />
      </button>

      {/* Content Info */}
      <div className="min-w-0 flex-1">
        <div className="w-[100%] flex flex-col items-start justify-center gap-2"><h4 className="w-full truncate font-semibold text-sm sm:text-base">
          {content.title}
        </h4>
        <p className="text-xs text-gray-400 mt-1">{t("\n          Published ")}{new Date(content.createdAt).toLocaleDateString()}
        </p>
        </div>

        {/* Stats */}
        <div className="flex flex-wrap gap-4 mt-2 text-gray-300 text-sm">
          <span className="flex items-center gap-1">
            <FaEye /> {content.views || 0}
          </span>
          <span className="flex items-center gap-1">
            <FaThumbsUp /> {content.likes?.length || 0}
          </span>
          <span className="flex items-center gap-1">
            <FaComment /> {content.comments?.length || 0}
          </span>
        </div>
      </div>
    </article>
  );
}

export default Dashboard;
