import { t } from '../../utils/i18n.js';
import React, { useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import create from "../assets/create.png"
import { useNavigate } from 'react-router-dom'
import { FaCamera, FaImage, FaUserCircle } from "react-icons/fa"
import axios from "axios"
import { serverUrl } from "../config"
import { showCustomAlert } from "../component/CustomAlert"
import { setChannelData, setUserData } from "../redux/userSlice"

function ViewChannel() {
    const {userData} = useSelector(state=>state.user)
    const {channelData} = useSelector(state=>state.user)
    const navigate = useNavigate()
    const dispatch = useDispatch()
    const avatarInputRef = useRef(null)
    const bannerInputRef = useRef(null)
    const [selectedImage, setSelectedImage] = useState(null)
    const [imagePreviewUrl, setImagePreviewUrl] = useState("")
    const [savingImage, setSavingImage] = useState(false)
    const selectedFile = selectedImage?.file

    useEffect(() => {
      if (!selectedFile) {
        setImagePreviewUrl("")
        return undefined
      }
      const previewUrl = URL.createObjectURL(selectedFile)
      setImagePreviewUrl(previewUrl)
      return () => URL.revokeObjectURL(previewUrl)
    }, [selectedFile])

    const chooseImage = (type) => (event) => {
      const file = event.target.files?.[0]
      event.target.value = ""
      if (!file) return
      const maxSize = type === "avatar" ? 4 * 1024 * 1024 : 6 * 1024 * 1024
      if (!file.type.startsWith("image/")) {
        showCustomAlert(t("Please choose an image file."))
        return
      }
      if (file.size > maxSize) {
        showCustomAlert(`${type === "avatar" ? "Profile picture" : "Channel banner"} must be smaller than ${maxSize / (1024 * 1024)} MB.`)
        return
      }
      setSelectedImage({ type, file })
    }

    const saveSelectedImage = async () => {
      if (!selectedImage) return
      const formData = new FormData()
      formData.append(selectedImage.type === "avatar" ? "avatar" : "bannerImage", selectedImage.file)
      setSavingImage(true)
      try {
        const result = await axios.post(`${serverUrl}/api/user/update-channel`, formData, { withCredentials: true })
        dispatch(setChannelData(result.data))
        dispatch(setUserData({
          ...userData,
          photoUrl: result.data.avatar || userData?.photoUrl,
          channel: result.data
        }))
        if (result.data.warning) {
          showCustomAlert(result.data.warning)
        } else {
          setSelectedImage(null)
          showCustomAlert(`${selectedImage.type === "avatar" ? "Profile picture" : "Channel banner"} updated.`)
        }
      } catch (error) {
        showCustomAlert(error.response?.data?.message || "Unable to update the image. Please try again.")
      } finally {
        setSavingImage(false)
      }
    }

    const visibleAvatar = selectedImage?.type === "avatar" && imagePreviewUrl ? imagePreviewUrl : channelData?.avatar
    const visibleBanner = selectedImage?.type === "banner" && imagePreviewUrl ? imagePreviewUrl : channelData?.bannerImage
  return (
    <div className=" flex flex-col gap-3 ">
      {/* Banner */}
      <div className="relative mt-6 mb-10 aspect-[16/6] w-full overflow-hidden rounded-lg border border-gray-600 bg-gray-700">
        {visibleBanner ? (
          <img
            src={visibleBanner}
            alt={t("Banner")}
            className="w-full h-full object-cover rounded-lg"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-r from-gray-800 to-gray-900"></div>
        )}
        <button
          type="button"
          onClick={() => bannerInputRef.current?.click()}
          className="absolute bottom-3 right-3 flex items-center gap-2 rounded-full bg-black/75 px-4 py-2 text-sm font-medium text-white hover:bg-black"
          aria-label={t("Choose channel banner")}
        >
          <FaImage />{t(" Edit banner\n        ")}</button>
        <p className="absolute bottom-4 left-4 rounded bg-black/60 px-3 py-1 text-xs text-white">{t("\n          Recommended: 2560 × 1440 px\n        ")}</p>
        <input
          ref={bannerInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="sr-only"
          onChange={chooseImage("banner")}
        />
      </div>

      {/* Main Content */}
      <div className="px-10 py-8">
        {/* Avatar + Info */}
        <div className="flex flex-col items-center">
          <div className="relative -mt-14">
            {visibleAvatar ? (
              <img
                src={visibleAvatar}
                alt={userData?.isGuest ? t("Profile picture") : `${channelData?.name || t("Channel")} ${t("profile picture")}`}
                className="h-28 w-28 rounded-full border-4 border-gray-500 bg-[#212121] object-cover"
              />
            ) : (
              <div className="flex h-28 w-28 items-center justify-center rounded-full border-4 border-gray-500 bg-[#212121] text-gray-400">
                <FaUserCircle size={64} aria-hidden="true" />
              </div>
            )}
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#0f0f0f] bg-[#272727] text-white hover:bg-[#3f3f3f]"
              aria-label={t("Choose channel profile picture")}
            >
              <FaCamera />
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="sr-only"
              onChange={chooseImage("avatar")}
            />
          </div>
          {!userData?.isGuest && (
            <>
              <h1 className="text-2xl font-bold mt-3">{channelData?.name || t("Channel Name")}</h1>
              <p className="text-gray-400">@{userData?.username}</p>
            </>
          )}
          <p className="mt-1 text-xs text-gray-400">{t("Click the camera or banner button to change channel images.")}</p>
          <p className="text-sm text-gray-400 mt-1">{t("\n            More about this channel... ")}<span className="text-blue-400 cursor-pointer">{userData?.channel?.category}</span>
          </p>
          {selectedImage && (
            <div className="mt-4 flex items-center gap-3">
              <span className="text-sm text-gray-300">{t("Previewing ")}{selectedImage.type === "avatar" ? t("profile picture") : t("banner")}</span>
              <button
                type="button"
                onClick={saveSelectedImage}
                disabled={savingImage}
                className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black hover:bg-gray-200 disabled:opacity-60"
              >
                {savingImage ? t("Saving...") : t("Save")}
              </button>
              <button
                type="button"
                onClick={() => setSelectedImage(null)}
                disabled={savingImage}
                className="rounded-full bg-[#272727] px-4 py-2 text-sm font-medium text-white hover:bg-[#3f3f3f] disabled:opacity-60"
              >{t("\n                Cancel\n              ")}</button>
            </div>
          )}
          {/* Buttons */}
          <div className="flex gap-4 mt-4">
            <button className="bg-white text-black px-4 py-1 rounded-full font-medium" onClick={()=>navigate("/updatechannel")}>{t("\n              Customize channel\n            ")}</button>
            <button className="bg-[#272727] px-4 py-1 rounded-full font-medium" onClick={()=>navigate("/ptstudio/dashboard")}>{t("\n              Manage videos\n            ")}</button>
          </div>
        </div>

        {/* Empty State */}
        <div className="flex flex-col items-center mt-16">
          <img src={create} alt={t("Create")} className="w-20" />
          <p className="mt-4 font-medium">{t("Create content on any device")}</p>
          <p className="text-gray-400 text-sm text-center">{t("\n            Upload and record at home or on the go. Everything you make public will appear here.\n          ")}</p>
          <button className="bg-white text-black mt-4 px-5 py-1 rounded-full font-medium" onClick={()=>navigate("/createpage")}>{t("\n            + Create\n          ")}</button>
        </div>
      </div>
    </div>
  )
}

export default ViewChannel
