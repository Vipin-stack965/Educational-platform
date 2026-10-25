import { t } from '../../utils/i18n.js';
import React, { useState } from "react";
import { FaPlay } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import NameAvatar from "./NameAvatar";
  

export const VideoThumbnail = ({ src, title, className = "" }) => {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
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

const VideoCard = ({ thumbnail, duration, channelLogo, title, channelName, views, id, isShort = false }) => {
  const navigate = useNavigate()

  return (
    <div className="w-[360px] cursor-pointer" onClick={() => navigate(`${isShort ? "/watch-short" : "/watch-video"}/${id}`)}>
      {/* Thumbnail */}
      <div className="relative">
        <VideoThumbnail
          src={thumbnail}
          title={title}
          className="rounded-xl w-full h-[200px] border border-gray-800 object-cover"
        />
        <span className="absolute bottom-2 right-2 bg-black text-white text-xs px-1 rounded">
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
        <div>
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
      </div>
    </div>
  );
};

export default VideoCard;
