import { t } from '../../utils/i18n.js';
import React, { useEffect, useId, useRef, useState } from "react";
import { FaImage, FaUserCircle } from "react-icons/fa";
import { showCustomAlert } from "./CustomAlert";

const imageSettings = {
  avatar: {
    label: "Profile picture",
    guidance: "Use a square image. JPG, PNG, GIF, or WebP; up to 4 MB.",
    maxSize: 4 * 1024 * 1024
  },
  banner: {
    label: "Channel banner",
    guidance: "Recommended: 2560 × 1440 px. Keep important text centered; up to 6 MB.",
    maxSize: 6 * 1024 * 1024
  }
};

const ChannelImagePicker = ({ type, file, currentImage, onChange }) => {
  const inputId = useId();
  const inputRef = useRef(null);
  const [preview, setPreview] = useState("");
  const settings = imageSettings[type];
  const isAvatar = type === "avatar";

  useEffect(() => {
    if (!file) {
      setPreview("");
      return undefined;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const handleFileChange = (event) => {
    const selectedFile = event.target.files?.[0];
    event.target.value = "";
    if (!selectedFile) return;

    if (!selectedFile.type.startsWith("image/")) {
      showCustomAlert(t("Please choose an image file."));
      return;
    }
    if (selectedFile.size > settings.maxSize) {
      showCustomAlert(`${t(settings.label)} ${t("must be smaller than")} ${settings.maxSize / (1024 * 1024)} MB.`);
      return;
    }
    onChange(selectedFile);
  };

  const imageSource = preview || currentImage;

  return (
    <section className="w-full">
      <div
        className={`relative overflow-hidden border border-[#3f3f3f] bg-[#181818] ${
          isAvatar ? "mx-auto h-36 w-36 rounded-full" : "aspect-[16/9] w-full rounded-xl"
        }`}
      >
        {imageSource ? (
          <img
            src={imageSource}
            alt={`${t(settings.label)} ${t("preview")}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-gray-400">
            {isAvatar ? <FaUserCircle size={48} /> : <FaImage size={32} />}
            <span className="text-sm">{t(settings.label)}{t(" preview")}</span>
          </div>
        )}
        {!isAvatar && (
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 h-[30%] w-[60%] -translate-x-1/2 -translate-y-1/2 rounded border border-dashed border-white/80 bg-black/10"
            aria-hidden="true"
          />
        )}
        {!isAvatar && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="absolute bottom-3 right-3 flex items-center gap-2 rounded-full bg-black/75 px-4 py-2 text-sm text-white transition hover:bg-black"
            aria-label={`${t("Upload")} ${t(settings.label.toLowerCase())}`}
          >
            <FaImage /> {imageSource ? t("Change banner") : t("Upload banner")}
          </button>
        )}
      </div>

      {isAvatar && (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-full bg-[#272727] px-4 py-2 text-sm font-medium hover:bg-[#3f3f3f]"
          >
            {imageSource ? t("Change picture") : t("Upload picture")}
          </button>
        </div>
      )}

      <p className={`mt-2 text-xs text-gray-400 ${isAvatar ? "text-center" : ""}`}>{t(settings.guidance)}</p>
      {file && <p className="mt-1 truncate text-xs text-gray-300">{file.name}</p>}

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="sr-only"
        onChange={handleFileChange}
      />
    </section>
  );
};

export default ChannelImagePicker;
