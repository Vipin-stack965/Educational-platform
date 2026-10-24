import React from "react";
import { FaVideo, FaPlay, FaPen, FaList } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import create from "../assets/create.png";

function CreatePage() {
  const navigate = useNavigate();

  const options = [
    { id: "video", icon: <FaVideo size={28} />, title: "Upload Video", route: "/create-video" },
    { id: "short", icon: <FaPlay size={28} />, title: "Create Short", route: "/create-short" },
    { id: "post", icon: <FaPen size={28} />, title: "Create Community Post", route: "/create-post" },
    { id: "playlist", icon: <FaList size={28} />, title: "New Playlist", route: "/create-playlist" },
  ];

  return (
    <div className="bg-[#0f0f0f] min-h-screen text-white px-6 py-8 mt-10 flex flex-col">
      {/* Header */}
      <div className="mb-12 border-b border-[#3f3f3f] pb-4">
        <h1 className="text-4xl font-bold tracking-tight">Create</h1>
        <p className="text-gray-400 mt-1 text-sm">
          Choose what type of content you want to create for your audience
        </p>
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
        <img src={create} alt="Create" className="w-20" />
        <p className="mt-4 font-medium">Create content on any device</p>
        <p className="text-gray-400 text-sm text-center">
          Choose an option above to start creating content.
        </p>
      </div>
    </div>
  );
}

export default CreatePage;
