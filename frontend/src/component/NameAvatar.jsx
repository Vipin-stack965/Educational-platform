import React, { useState } from "react";
import { FaUserCircle } from "react-icons/fa";

const NameAvatar = ({ src, name, alt, className = "", onClick }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const initial = [...(name?.trim() || "")][0]?.toLocaleUpperCase();

  return (
    <span
      role="img"
      aria-label={alt || name || "User"}
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#303030] font-semibold text-white ${className}`}
      onClick={onClick}
    >
      {src && !imageFailed ? (
        <img
          src={src}
          alt=""
          className="absolute inset-0 h-full w-full rounded-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : initial ? (
        <span aria-hidden="true">{initial}</span>
      ) : (
        <FaUserCircle aria-hidden="true" className="h-full w-full text-gray-400" />
      )}
    </span>
  );
};

export default NameAvatar;
