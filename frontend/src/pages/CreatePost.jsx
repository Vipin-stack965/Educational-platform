import { t } from '../../utils/i18n.js';
import React, { useState } from "react";
import { FaTimes, FaImage } from "react-icons/fa";
import { ClipLoader } from "react-spinners";
import { useSelector, useDispatch } from "react-redux";
import { serverUrl } from "../config";
import { showCustomAlert } from "../component/CustomAlert";
import axios from "axios";
import { setChannelData } from "../redux/userSlice";
import { useNavigate } from "react-router-dom";
import handlePublishingBlock from "../utils/handlePublishingBlock";

const CreatePost = () => {
  const { channelData } = useSelector((state) => state.user);
  const dispatch = useDispatch();
  const navigate = useNavigate()

  const [content, setContent] = useState("");
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);

  const handlePublish = async () => {
    if (!content.trim()) {
      showCustomAlert(t("Post content is required!"));
      return;
    }

    const formData = new FormData();
    formData.append("channelId", channelData?._id);
    formData.append("content", content);
    if (image) formData.append("image", image);

    setLoading(true);
    try {
      const res = await axios.post(`${serverUrl}/api/content/create-post`, formData, {
        withCredentials: true,
      });

      if (res.data.status === "pending_review") {
        showCustomAlert(res.data.message);
        navigate("/");
        return;
      }

      const createdPost = res.data.post || res.data;
      const updatedChannel = {
        ...channelData,
        communityPosts: [...(channelData.communityPosts || []), createdPost],
      };
      dispatch(setChannelData(updatedChannel));

      showCustomAlert(t("Post Published Successfully!"));
      setContent("");
      navigate("/")
      setImage(null);
    } catch (error) {
      handlePublishingBlock(error, dispatch, navigate);
      showCustomAlert(error.response?.data?.message || error.message || "Post upload failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full min-h-[80vh] bg-[#0f0f0f] text-white flex flex-col pt-5 items-center justify-center">
      <div className="relative bg-[#212121] p-6 pt-14 rounded-xl w-full max-w-2xl shadow-lg space-y-4">
        <button
          type="button"
          aria-label={t("Close community post")}
          title={t("Close")}
          onClick={() => navigate("/createpage")}
          disabled={loading}
          className="absolute right-3 top-3 rounded-full p-2 text-gray-300 hover:bg-[#343434] hover:text-white disabled:cursor-not-allowed disabled:opacity-50 sm:right-4 sm:top-4"
        >
          <FaTimes size={22} aria-hidden="true" />
        </button>
        
        {/* Content Box */}
        <textarea
          placeholder={t("Write something for your community...")}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full p-3 rounded-lg bg-[#121212] border border-gray-700 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none h-28"
        />

        {/* Image Upload */}
        <label className="flex items-center space-x-3 cursor-pointer">
          <FaImage className="text-2xl text-gray-300" />
          <span className="text-gray-300">{t("Add Image (optional)")}</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => setImage(e.target.files[0])}
          />
        </label>

        {image && (
          <div className="mt-3">
            <img
              src={URL.createObjectURL(image)}
              alt={t("Preview")}
              className="rounded-lg max-h-64 object-cover"
            />
          </div>
        )}

        <details className="rounded-lg border border-gray-700 bg-[#181818] p-4">
          <summary className="cursor-pointer font-medium">{t("Advanced: AI educational review")}</summary>
          <p className="mt-2 text-sm text-gray-300">{t("Every upload is checked before publishing. Uncertain content is held for moderator review; this check cannot be disabled.")}</p>
        </details>

        {/* Publish Button */}
        <button
          onClick={handlePublish}
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 py-3 rounded-lg font-medium disabled:bg-gray-600 flex items-center justify-center"
        >
          {loading ? <ClipLoader size={20} color="white" /> : t("Publish Post")}
        </button>

      </div>
    </div>
  );
};

export default CreatePost;
