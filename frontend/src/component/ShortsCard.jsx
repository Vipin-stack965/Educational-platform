import { t } from '../../utils/i18n.js';
import React from "react";
import { useNavigate } from "react-router-dom";
import NameAvatar from "./NameAvatar";

const ShortsCard = ({ shortUrl, thumbnail, title, channelName,avatar, views ,id}) => {
  const navigate = useNavigate()
  return (
    <div className="w-45 sm:w-48 cursor-pointer relative" onClick={()=>navigate(`/watch-short/${id}`)
    }>
      {/* Video box */}
      <div className="rounded-xl overflow-hidden bg-black w-full h-70 border-1 border-gray-700">
        {thumbnail ? (
          <img src={thumbnail} alt={title} className="h-full w-full object-cover" />
        ) : (
          <video
            src={shortUrl}
            className="w-full h-full object-cover"
            muted
            playsInline
            preload="metadata"
            onLoadedMetadata={(event) => {
              const video = event.currentTarget;
              if (video.duration > 0) video.currentTime = Math.min(0.1, video.duration / 2);
            }}
            onContextMenu={(e) => e.preventDefault()}
          />
        )}
      </div>

      {/* Info */}
      <div className="mt-2 space-y-2 w-full absolute bottom-0 p-3 bg-[#00000031] rounded-xl">
        <h3 className="text-sm font-semibold text-white line-clamp-2 ">
          {title}
        </h3>
        <div className="flex items-center justify-start gap-1">
          <NameAvatar src={avatar} name={channelName} alt={channelName} className="h-4 w-4 text-[8px]" />
          <p className="text-xs text-gray-400">{channelName}</p>
        </div>
        
        <p className="text-xs text-gray-400">{
              Number(views) >= 1_000_000
                ? Math.floor(Number(views) / 1_000_000) + "M"
                : Number(views) >= 1_000
                ? Math.floor(Number(views) / 1_000) + "K"
                : Number(views) || 0
            }{t(" views")}</p>
      </div>
    </div>
  );
};

export default ShortsCard;
