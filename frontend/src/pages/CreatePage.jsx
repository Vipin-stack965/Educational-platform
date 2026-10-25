import { t } from '../../utils/i18n.js';
import React from "react";
import { FaVideo, FaPlay, FaPen, FaList } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import create from "../assets/create.png";

function CreatePage() {
  const navigate = useNavigate();
  const userData = useSelector((state) => state.user.userData);

  const options = [
    { id: "video", icon: <FaVideo size={28} />, title: t("Upload Video"), route: "/create-video" },
    { id: "short", icon: <FaPlay size={28} />, title: t("Create Short"), route: "/create-short" },
    { id: "post", icon: <FaPen size={28} />, title: t("Create Community Post"), route: "/create-post" },
    { id: "playlist", icon: <FaList size={28} />, title: t("New Playlist"), route: "/create-playlist" },
  ];

  if (!userData?.channel) {
    return (
      <div className="mt-10 flex min-h-[70vh] flex-col items-center justify-center bg-[#0f0f0f] px-6 py-8 text-center text-white">
        <FaVideo size={40} className="mb-5 text-gray-300" />
        <h1 className="text-3xl font-bold">{t("Set up your channel first")}</h1>
        <p className="mt-3 max-w-md text-gray-400">{t("\n          Create a channel to upload videos, Shorts, and other content.\n        ")}</p>
        <button
          type="button"
          onClick={() => navigate("/createchannel")}
          className="mt-6 rounded-full bg-blue-600 px-6 py-3 font-medium hover:bg-blue-700"
        >{t("\n          Create channel\n        ")}</button>
      </div>
    );
  }

  return (
    <div className="bg-[#0f0f0f] min-h-screen text-white px-6 py-8 mt-10 flex flex-col">
      {/* Header */}
      <div className="mb-12 border-b border-[#3f3f3f] pb-4">
        <h1 className="text-4xl font-bold tracking-tight">{t("Create")}</h1>
        <p className="text-gray-400 mt-1 text-sm">{t("\n          Choose what type of content you want to create for your audience\n        ")}</p>
      </div>

      {/* Options Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 flex-1">
        {options.map((opt) => (
          <div
            key={opt.id}
            className="bg-[#1f1f1f] border border-[#3f3f3f] rounded-lg p-6 flex flex-col items-center text-center justify-center cursor-pointer transition hover:bg-[#272727]"
            onClick={() => navigate(opt.route)}
          >
            <div className="bg-[#272727] p-4 rounded-full mb-4">{opt.icon}</div>
            <h2 className="text-lg font-semibold">{opt.title}</h2>
          </div>
        ))}
      </div>

      {/* Bottom Section */}
      <div className="flex flex-col items-center mt-16">
        <img src={create} alt={t("Create")} className="w-20" />
        <p className="mt-4 font-medium">{t("Create content on any device")}</p>
        <p className="text-gray-400 text-sm text-center">{t("\n          Choose an option above to start creating content.\n        ")}</p>
      </div>
    </div>
  );
}

export default CreatePage;
