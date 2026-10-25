import { t } from '../../utils/i18n.js';
import React, { useState } from "react";
import { FaUserCircle } from "react-icons/fa";
import { IoIosArrowForward } from "react-icons/io";
import logo from "../assets/edutube-logo.svg";
import {  useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { showCustomAlert } from "../component/CustomAlert";
import axios from "axios";
import { serverUrl } from "../config";
import { ClipLoader } from "react-spinners";
import { setChannelData, setUserData } from "../redux/userSlice";
import ChannelImagePicker from "../component/ChannelImagePicker";

const CreateChannelFlow = () => {
  const [step, setStep] = useState(1);
  const [channelName, setChannelName] = useState("");
  const [avatar, setAvatar] = useState(null);
  const [banner, setBanner] = useState(null);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("General");
  const {userData}  = useSelector(state=>state.user)
  const [loading,setLoading] = useState(false)
  const navigate = useNavigate()
  const dispatch = useDispatch()
  

  const nextStep = () => setStep((prev) => prev + 1);
  const prevStep = () => setStep((prev) => prev - 1);

  const handleCreateChannel = async () => {
    if (!channelName.trim()) {
      showCustomAlert(t("Please enter a channel name."));
      setStep(1);
      return;
    }
    const formData = new FormData()
    formData.append("name",channelName.trim());
    formData.append("description",description);
    formData.append("category",category);
    if (avatar) formData.append("avatar", avatar);
    if (banner) formData.append("bannerImage", banner);
    setLoading(true)
    try {
      const result = await axios.post(serverUrl + "/api/user/create-channel" ,formData , {withCredentials:true})
      console.log(result)
      showCustomAlert(result.data.warning || "Channel Created")
      dispatch(setChannelData(result.data))
      dispatch(setUserData({ ...userData, username: result.data.name, photoUrl: result.data.avatar || userData?.photoUrl, channel: result.data }))
      navigate("/")
      setLoading(false)
    } catch (error) {
      console.log(error)
      showCustomAlert(error.response?.data?.message || "Unable to create channel. Please try again.")
      setLoading(false)
    }
    
  }


  return (
    <div className="w-full min-h-screen bg-[#0f0f0f] text-white flex flex-col">
      {/* HEADER */}
      <header className="flex justify-between items-center px-6 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <img src={logo} alt={t("EduTube")} className="w-8 h-8" />
          <span className="text-xl font-bold">{t("EduTube")}</span>
        </div>
        <div className="flex items-center gap-3">
          {!userData?.photoUrl ?
            <FaUserCircle className="text-3xl cursor-pointer" /> :
            <img src={userData?.photoUrl} className="w-9 h-9 rounded-full"/>}
        </div>
      </header>

      {/* MAIN */}
      <main className="flex flex-1 justify-center items-center px-4">
        <div className="bg-[#212121] p-6 rounded-xl w-full max-w-lg shadow-lg">
          {/* Step 1 */}
          {step === 1 && (
            <>
              <h2 className="text-2xl font-semibold mb-4">{t("How you’ll appear")}</h2>
              <p className="text-sm text-gray-400 mb-6">{t("\n                Choose a profile picture, channel name.\n              ")}</p>

              <div className="mb-6">
                <ChannelImagePicker type="avatar" file={avatar} onChange={setAvatar} />
              </div>

              {/* Channel Name */}
              <input
                type="text"
                placeholder={t("Channel name")}
                className="w-full p-3 mb-4 rounded-lg bg-[#121212] border border-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
              />

              

              <button
                onClick={nextStep}
                disabled={!channelName}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 transition py-3 rounded-lg font-medium disabled:bg-gray-600"
              >{t("\n                Continue ")}<IoIosArrowForward size={20} />
              </button>
              <span onClick={()=>navigate("/")} className=" w-full flex items-center justify-center text-sm text-blue-400 cursor-pointer hover:underline  mt-2">{t("Back to Home Page")}</span>
            </>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <>
              <h2 className="text-2xl font-semibold mb-4">{t("Your Channel")}</h2>
              <div className="flex flex-col items-center mb-6">
                <ChannelImagePicker type="avatar" file={avatar} onChange={setAvatar} />
                <h3 className="mt-3 text-lg font-semibold">{channelName}</h3>
              
              </div>

              <div className="flex gap-3">
                <button
                  onClick={nextStep}
                  className="flex w-full items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 py-3 rounded-lg"
                >{t("\n                Continue and Create Channel ")}<IoIosArrowForward size={20} />
                </button>
                
              </div>

              <button
                onClick={prevStep}
                className="mt-4 w-full flex items-center justify-center text-blue-400 hover:underline text-sm"
              >{t("\n                Back\n              ")}</button>
            </>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <>
              <h2 className="text-2xl font-semibold mb-4">{t("Create Channel")}</h2>

              {/* Banner Upload */}
              <div className="mb-4">
                <ChannelImagePicker type="banner" file={banner} onChange={setBanner} />
              </div>

              {/* Description */}
              <textarea
                placeholder={t("Channel description")}
                className="w-full p-3 mb-4 rounded-lg bg-[#121212] border border-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />

              {/* Category */}
              <input
                className="w-full p-3 mb-6 rounded-lg bg-[#121212] border border-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={category}
                placeholder={t("Category")}
                onChange={(e) => setCategory(e.target.value)}
              />
                
              {/* Buttons */}
              <div className="flex justify-between">
                <button
                  onClick={prevStep}
                  className="bg-gray-700 hover:bg-gray-600 py-3 px-5 rounded-lg"
                >{t("\n                  Back\n                ")}</button>
                <button
                  onClick={handleCreateChannel}
                  disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700 py-3 px-5 rounded-lg"
                >
                {loading ? <ClipLoader size={20} color="white"/>:t("Save")}
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default CreateChannelFlow;
