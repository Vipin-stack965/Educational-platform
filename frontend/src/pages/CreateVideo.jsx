import { t } from '../../utils/i18n.js';
import React, { useRef, useState } from "react";

import { MdCloudUpload } from "react-icons/md";
import { FaTimes } from "react-icons/fa";
import { ClipLoader } from "react-spinners";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import axios from "axios";
import { serverUrl } from "../config";
import { showCustomAlert } from "../component/CustomAlert";
import { setChannelData } from "../redux/userSlice";
import { addVideoData } from "../redux/contentSlice";
import handlePublishingBlock from "../utils/handlePublishingBlock";


const CreateVideo = () => {
  const navigate = useNavigate();
  const { channelData, isAuthLoading, userData } = useSelector((state) => state.user);

  const videoInputRef = useRef(null);
  const [videoFile, setVideoFile] = useState(null);
  const [thumbnail, setThumbnail] = useState(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingUpload, setProcessingUpload] = useState(false);
  const dispatch = useDispatch()

  const handleVideoChange = (e) => setVideoFile(e.target.files?.[0] || null);
  const handleThumbnailChange = (e) => setThumbnail(e.target.files[0]);

  const handlePublish = async () => {
    if (!channelData?._id) {
      showCustomAlert(t("Your channel is still loading. Please wait a moment and try again."));
      return;
    }
    if (!videoFile || !title.trim()) {
      showCustomAlert(t("Video and title are required!"));
      return;
    }

    const formData = new FormData();
    formData.append("video", videoFile);
    if (thumbnail) formData.append("thumbnail", thumbnail);
    formData.append("title", title);
    formData.append("description", description);
    formData.append("tags", JSON.stringify(tags.split(",").map(tag => tag.trim())));
    formData.append("channel",channelData?._id); // channel id from logged-in user

    setLoading(true);
    setUploadProgress(0);
    setProcessingUpload(false);
    try {
      const result = await axios.post(`${serverUrl}/api/content/upload-video`, formData, {
        withCredentials: true,
        onUploadProgress: (event) => {
          if (!event.total) return;
          const progress = Math.min(100, Math.round((event.loaded / event.total) * 100));
          setUploadProgress(progress);
          if (progress === 100) setProcessingUpload(true);
        },
      });
      if (result.data.status === "pending_review") {
        showCustomAlert(result.data.message);
        navigate("/");
        return;
      }
      dispatch(addVideoData(result.data.video))
       // ✅ Update Redux channelData.videos instantly
      const updatedChannel = {
        ...channelData,
        videos: [...(channelData.videos || []), result.data.video]
      };
      dispatch(setChannelData(updatedChannel));

      showCustomAlert(t("Video Uploaded Successfully"));
      console.log(result.data)
      navigate("/");
    } catch (error) {
      console.error(error);
      handlePublishingBlock(error, dispatch, navigate);
      showCustomAlert(error.response?.data?.message || error.message || "Upload failed");
    } finally {
      setLoading(false);
      setUploadProgress(0);
      setProcessingUpload(false);
    }
  };

  return (
    <div className="w-full min-h-screen bg-[#0f0f0f] text-white flex flex-col pt-5">
      {/* MAIN */}
      <main className="flex flex-1 justify-center items-center px-4 py-6">
        <div className="relative bg-[#212121] p-6 pt-14 rounded-xl w-full max-w-2xl shadow-lg space-y-6">
          <button
            type="button"
            aria-label={t("Close video upload")}
            title={t("Close")}
            onClick={() => navigate("/createpage")}
            disabled={loading}
            className="absolute right-3 top-3 rounded-full p-2 text-gray-300 hover:bg-[#343434] hover:text-white disabled:cursor-not-allowed disabled:opacity-50 sm:right-4 sm:top-4"
          >
            <FaTimes size={22} aria-hidden="true" />
          </button>
          {/* Video Upload */}
          <div className="border-2 border-dashed border-gray-600 rounded-lg p-5 text-center hover:border-blue-500 transition">
            <input
              ref={videoInputRef}
              id="video-upload"
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleVideoChange}
            />
            <button
              type="button"
              onClick={() => videoInputRef.current?.click()}
              disabled={loading}
              className="mx-auto flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-3 font-medium hover:bg-blue-700"
            >
              <MdCloudUpload size={22} />
              {videoFile ? t("Choose a different video") : t("Select video to upload")}
            </button>
            <p className="mt-3 break-all text-sm text-gray-300">
              {videoFile ? t("Video selected") : t("Choose a video file from your device")}
            </p>
          </div>

          {/* Title */}
          <input
            type="text"
            placeholder={t("Title (required)")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full p-3 rounded-lg bg-[#121212] border border-gray-700 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />

          {/* Description */}
          <textarea
            placeholder={t("Description")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full p-3 rounded-lg bg-[#121212] border border-gray-700 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />

          {/* Tags */}
          <input
            type="text"
            placeholder={t("Tags (comma separated)")}
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="w-full p-3 rounded-lg bg-[#121212] border border-gray-700 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />

          {/* Thumbnail Upload */}
          <label htmlFor="thumbnail-upload" className="block cursor-pointer">
            {thumbnail ? (
              <img
                src={URL.createObjectURL(thumbnail)}
                alt={t("thumbnail")}
                className="w-full rounded-lg border border-gray-700 mb-2"
              />
            ) : (
              <div className="w-full h-32 bg-gray-700 rounded-lg flex items-center justify-center text-gray-400 border border-gray-700 mb-2">{t("Click to upload thumbnail (optional)")}</div>
            )}
            <input
              id="thumbnail-upload"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleThumbnailChange}
            />
          </label>

          <details className="rounded-lg border border-gray-700 bg-[#181818] p-4">
            <summary className="cursor-pointer font-medium">{t("Advanced: AI educational review")}</summary>
            <p className="mt-2 text-sm text-gray-300">{t("Every upload is checked before publishing. Uncertain content is held for moderator review; this check cannot be disabled.")}</p>
          </details>

          {/* Publish Button */}
          <button
            onClick={handlePublish}
            disabled={loading || isAuthLoading || !userData || !channelData?._id}
            className="w-full bg-blue-600 hover:bg-blue-700 py-3 rounded-lg font-medium disabled:bg-gray-600 flex items-center justify-center"
          >
            {loading ? <ClipLoader size={20} color="white" /> : !channelData?._id ? t("Loading channel...") : t("Publish")}
          </button>
            {loading && (
              <div className="space-y-2 text-center text-sm text-gray-300" role="status" aria-live="polite">
                {processingUpload ? (
                  <p>{t("Upload complete. Reviewing and processing your video...")}</p>
                ) : (
                  <>
                    <p>{t("Uploading video...")} {uploadProgress}%</p>
                    <progress value={uploadProgress} max="100" className="h-2 w-full accent-blue-500" />
                  </>
                )}
              </div>
            )}

        </div>
      </main>
    </div>
  );
};

export default CreateVideo;
