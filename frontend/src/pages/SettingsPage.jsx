import { t } from '../../utils/i18n.js';
import React, { useEffect, useState } from "react";
import { FaArrowLeft, FaUserCircle } from "react-icons/fa";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { serverUrl } from "../config";
import { showCustomAlert } from "../component/CustomAlert";
import { setAllChannelData, setUserData } from "../redux/userSlice";

const defaults = {
  theme: "system",
  saveWatchHistory: true,
  emailNotifications: true,
  autoplay: true,
  language: "en"
};

function SettingsPage() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { userData, channelData, allChannelData } = useSelector((state) => state.user);
  const [preferences, setPreferences] = useState(userData?.preferences || defaults);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState("");

  useEffect(() => {
    let active = true;
    axios.get(`${serverUrl}/api/user/settings`, { withCredentials: true })
      .then(({ data }) => {
        if (!active) return;
        setPreferences({ ...defaults, ...data.preferences });
      })
      .catch((error) => {
        if (!active) return;
        showCustomAlert(error.response?.data?.message || "Could not load your settings");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, []);

  const savePreference = async (key, value) => {
    setSavingKey(key);
    try {
      const { data } = await axios.patch(
        `${serverUrl}/api/user/settings`,
        { [key]: value },
        { withCredentials: true }
      );
      setPreferences({ ...defaults, ...data.preferences });
      dispatch(setUserData({ ...userData, preferences: data.preferences }));
      if (key === "profileVisibility" && channelData?._id) {
        const channels = allChannelData || [];
        dispatch(setAllChannelData(
          value === "private"
            ? channels.filter((channel) => channel._id !== channelData._id)
            : channels.some((channel) => channel._id === channelData._id)
              ? channels
              : [...channels, channelData]
        ));
      }
    } catch (error) {
      showCustomAlert(error.response?.data?.message || "Could not save this setting");
    } finally {
      setSavingKey("");
    }
  };

  const toggle = (key, label, description) => (
    <label className="flex cursor-pointer items-center justify-between gap-4 border-b border-gray-700 py-4 last:border-b-0">
      <span>
        <span className="block font-medium">{t(label)}</span>
        <span className="mt-1 block text-sm text-gray-400">{t(description)}</span>
      </span>
      <input
        type="checkbox"
        checked={Boolean(preferences[key])}
        disabled={Boolean(savingKey)}
        onChange={(event) => savePreference(key, event.target.checked)}
        className="h-5 w-5 accent-blue-600"
      />
    </label>
  );

  return (
    <section className="mx-auto min-h-screen w-full max-w-4xl px-4 py-8 text-white sm:px-6">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-5 flex items-center gap-2 rounded-lg px-3 py-2 text-gray-300 hover:bg-[#272727]"
      >
        <FaArrowLeft aria-hidden="true" />{t(" Back\n      ")}</button>
      <h1 className="mb-2 text-3xl font-bold">{t("Settings")}</h1>
      <p className="mb-8 text-gray-400">{t("Manage your EduTube account and preferences.")}</p>

      {loading ? (
        <p className="text-gray-400">{t("Loading settings...")}</p>
      ) : (
        <div className="space-y-6">
          <section className="rounded-xl bg-[#212121] p-5">
            <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
              <FaUserCircle aria-hidden="true" />{t(" Account\n            ")}</h2>
            <p>{userData?.username}</p>
            <p className="mt-1 text-sm text-gray-400">{userData?.email}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                className="rounded-lg bg-[#333] px-4 py-2 hover:bg-[#444]"
                onClick={() => navigate(userData?.channel ? "/viewchannel" : "/createchannel")}
              >
                {userData?.channel ? t("View channel") : t("Create channel")}
              </button>
              {userData?.channel && (
                <button className="rounded-lg bg-[#333] px-4 py-2 hover:bg-[#444]" onClick={() => navigate("/updatechannel")}>{t("\n                  Edit channel\n                ")}</button>
              )}
            </div>
          </section>

          <section className="rounded-xl bg-[#212121] p-5">
            <h2 className="mb-2 text-xl font-semibold">{t("Appearance")}</h2>
            <p className="mb-3 text-sm text-gray-400">{t("Choose how EduTube looks on this account.")}</p>
            <select
              value={preferences.theme}
              disabled={Boolean(savingKey)}
              onChange={(event) => savePreference("theme", event.target.value)}
              className="w-full rounded-lg border border-gray-600 bg-[#121212] p-3 text-white sm:w-64"
            >
              <option value="system">{t("Use device setting")}</option>
              <option value="light">{t("Light theme")}</option>
              <option value="dark">{t("Dark theme")}</option>
            </select>
          </section>

          <section className="rounded-xl bg-[#212121] p-5">
            <h2 className="mb-2 text-xl font-semibold">{t("Privacy")}</h2>
            <label className="flex items-center justify-between gap-4 border-b border-gray-700 py-4">
              <span>
                <span className="block font-medium">{t("Channel visibility")}</span>
                <span className="mt-1 block text-sm text-gray-400">{t("Private channels are hidden from public channel discovery.")}</span>
              </span>
              <select
                value={preferences.profileVisibility}
                disabled={Boolean(savingKey)}
                onChange={(event) => savePreference("profileVisibility", event.target.value)}
                className="rounded-lg border border-gray-600 bg-[#121212] p-2 text-white"
              >
                <option value="public">{t("Public")}</option>
                <option value="private">{t("Private")}</option>
              </select>
            </label>
            {toggle("saveWatchHistory", "Save watch history", "When off, new videos and shorts will not be added to your history.")}
          </section>

          <section className="rounded-xl bg-[#212121] p-5">
            <h2 className="mb-2 text-xl font-semibold">{t("Notifications")}</h2>
            {toggle("emailNotifications", "Email updates", "Save your preference for EduTube account and product updates.")}
            <p className="mt-2 text-sm text-gray-400">{t("Email notification delivery is not enabled yet; this preference is saved to your account.")}</p>
          </section>

          <section className="rounded-xl bg-[#212121] p-5">
            <h2 className="mb-2 text-xl font-semibold">{t("Playback")}</h2>
            {toggle("autoplay", "Autoplay videos", "Automatically start videos when you open a watch page.")}
          </section>

          <section className="rounded-xl bg-[#212121] p-5">
            <h2 className="mb-2 text-xl font-semibold">{t("Language")}</h2>
            <p className="mb-3 text-sm text-gray-400">{t("Choose your preferred language.")}</p>
            <select
              value={preferences.language}
              disabled={Boolean(savingKey)}
              onChange={(event) => savePreference("language", event.target.value)}
              className="w-full rounded-lg border border-gray-600 bg-[#121212] p-3 text-white sm:w-64"
            >
              <option value="en">{t("English")}</option>
              <option value="hi">{t("Hindi")}</option>
            </select>
            <p className="mt-2 text-sm text-gray-400">{t("Your preference is saved across devices. Most current app content is available in English.")}</p>
          </section>
        </div>
      )}
    </section>
  );
}

export default SettingsPage;
