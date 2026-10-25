import { t } from '../../utils/i18n.js';
import React, { useState } from "react";
import { FaTimes, FaCloudUploadAlt } from "react-icons/fa";
import { ClipLoader } from "react-spinners";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import axios from "axios";
import { serverUrl } from "../config";
import { showCustomAlert } from "../component/CustomAlert";
import { setChannelData } from "../redux/userSlice";
import { setAllShortData } from "../redux/contentSlice";
import handlePublishingBlock from "../utils/handlePublishingBlock";

const CreateShort = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { channelData, isAuthLoading, userData } = useSelector((state) => state.user);
  const {allShortData} = useSelector((state=>state.content))

  const [video, setVideo] = useState(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [loading, setLoading] = useState(false);

  const handlePublish = async () => {
    if (!channelData?._id) {
      showCustomAlert(t("Your channel is still loading. Please wait a moment and try again."));
      return;
    }
    if (!video || !title) {
      showCustomAlert(t("Short video and title are required!"));
      return;
    }

    const formData = new FormData();
    formData.append("short", video);
    formData.append("title", title);
    formData.append("description", description);
    formData.append(
      "tags",
      JSON.stringify(tags.split(",").map((tag) => tag.trim()))
    );
    formData.append("channelId", channelData?._id);

    setLoading(true);
    try {
      const result = await axios.post(
        `${serverUrl}/api/content/upload-short`,
        formData,
        {
          withCredentials: true,
        }
      );
      if (result.data.status === "pending_review") {
        showCustomAlert(result.data.message);
        navigate("/");
        return;
      }
      dispatch(setAllShortData([...(allShortData || []), result.data.short]))
      const updatedChannel = {
        ...channelData,
        shorts: [...(channelData.shorts || []), result.data.short],
      };
      dispatch(setChannelData(updatedChannel));


      showCustomAlert(t("Short Uploaded Successfully"));
      navigate("/");
    } catch (error) {
      console.error(error);
      handlePublishingBlock(error, dispatch, navigate);
      showCustomAlert(error.response?.data?.message || error.message || "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full min-h-[80vh] bg-[#0f0f0f] text-white flex flex-col pt-5">
      <main className="flex flex-1 justify-center items-center px-4 py-6">
        <div className="relative bg-[#212121] p-6 pt-14 rounded-xl w-full max-w-3xl shadow-lg grid grid-cols-1 md:grid-cols-2 gap-6">
          <button
            type="button"
            aria-label={t("Close short creation")}
            title={t("Close")}
            onClick={() => navigate("/createpage")}
            disabled={loading}
            className="absolute right-3 top-3 rounded-full p-2 text-gray-300 hover:bg-[#343434] hover:text-white disabled:cursor-not-allowed disabled:opacity-50 sm:right-4 sm:top-4"
          >
            <FaTimes size={22} aria-hidden="true" />
          </button>
          
          {/* LEFT: Video Upload */}
          <div className="flex justify-center items-start">
  <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-500 rounded-lg cursor-pointer bg-[#181818] overflow-hidden w-[220px] aspect-[9/16]">
    {video ? (
      <video
        src={URL.createObjectURL(video)}
        className="h-full w-full object-cover"
        controls
      />
    ) : (
      <>
        <FaCloudUploadAlt className="text-4xl text-gray-400 mb-2" />
        <p className="text-gray-300 text-xs text-center px-2">{t("Click to upload Shorts video")}</p>
        <span className="text-[10px] text-gray-500">{t("MP4 or MOV — Max 60s")}</span>
      </>
    )}
    <input
      type="file"
      accept="video/mp4,video/quicktime"
      className="hidden"
      onChange={(e) => setVideo(e.target.files[0])}
    />
  </label>
</div>

          {/* RIGHT: Inputs */}
          <div className="flex flex-col space-y-4">
            <input
              type="text"
              placeholder={t("Title (required)")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full p-3 rounded-lg bg-[#121212] border border-gray-700 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />

            <details className="rounded-lg border border-gray-700 bg-[#181818] p-4">
              <summary className="cursor-pointer font-medium">{t("Advanced: AI educational review")}</summary>
              <p className="mt-2 text-sm text-gray-300">{t("Every upload is checked before publishing. Uncertain content is held for moderator review; this check cannot be disabled.")}</p>
            </details>

            <textarea
              placeholder={t("Description")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full p-3 rounded-lg bg-[#121212] border border-gray-700 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none h-28"
            />

            <input
              type="text"
              placeholder={t("Tags (comma separated)")}
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full p-3 rounded-lg bg-[#121212] border border-gray-700 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />

            <button
              onClick={handlePublish}
              disabled={loading || isAuthLoading || !userData || !channelData?._id}
              className="w-full bg-blue-600 hover:bg-blue-700 py-3 rounded-lg font-medium disabled:bg-gray-600 flex items-center justify-center"
            >
              {loading ? <ClipLoader size={20} color="white" /> : !channelData?._id ? t("Loading channel...") : t("Publish Short")}
            </button>

            {loading && (
              <p className="text-center text-gray-300 text-sm animate-pulse">{t("\n                Short uploading... please wait...\n              ")}</p>
            )}
          </div>

        </div>
      </main>
    </div>
  );
};

export default CreateShort;
