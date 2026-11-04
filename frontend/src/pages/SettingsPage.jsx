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
  theme: "dark",
  saveWatchHistory: true,
  emailNotifications: true,
  autoplay: true,
  language: "en",
  locationMode: "auto",
  country: "US",
  timeZone: "UTC"
};

const countryCodes = "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" ");
const languageCodes = "aa ab ae af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca ce ch co cr cs cu cv cy da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om or os pa pi pl ps pt qu rm rn ro ru sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu".split(" ");
const languageNamesEn = new Intl.DisplayNames(["en"], { type: "language" });
const getLanguageName = (code) => {
  try {
    return new Intl.DisplayNames([code], { type: "language" }).of(code)
      || languageNamesEn.of(code)
      || code;
  } catch {
    return languageNamesEn.of(code) || code;
  }
};
const languages = languageCodes
  .map((code) => ({
    code,
    name: getLanguageName(code),
    englishName: languageNamesEn.of(code) || code,
  }))
  .sort((first, second) => first.englishName.localeCompare(second.englishName));

const countryNames = new Intl.DisplayNames(["en"], { type: "region" });
const countries = countryCodes
  .map((code) => ({ code, name: countryNames.of(code) }))
  .sort((first, second) => first.name.localeCompare(second.name));
const timezoneCountries = [
  [/^America\/(New_York|Detroit|Indiana|Kentucky)/, "US"],
  [/^America\/(Chicago|Menominee|North_Dakota)/, "US"],
  [/^America\/(Denver|Boise)/, "US"],
  [/^America\/(Los_Angeles|Juneau|Sitka|Metlakatla)/, "US"],
  [/^America\/(Anchorage|Nome)/, "US"],
  [/^Pacific\/Honolulu/, "US"],
  [/^America\/(Toronto|Montreal|Vancouver|Edmonton|Winnipeg|Halifax|St_Johns)/, "CA"],
  [/^America\/Mexico_City/, "MX"],
  [/^America\/Sao_Paulo/, "BR"],
  [/^America\/Argentina/, "AR"],
  [/^America\/Bogota/, "CO"],
  [/^America\/Lima/, "PE"],
  [/^America\/Santiago/, "CL"],
  [/^Europe\/London/, "GB"],
  [/^Europe\/(Paris|Monaco)/, "FR"],
  [/^Europe\/(Berlin|Busingen)/, "DE"],
  [/^Europe\/Madrid/, "ES"],
  [/^Europe\/Rome/, "IT"],
  [/^Europe\/Amsterdam/, "NL"],
  [/^Europe\/Zurich/, "CH"],
  [/^Europe\/Vienna/, "AT"],
  [/^Europe\/Lisbon/, "PT"],
  [/^Europe\/Moscow/, "RU"],
  [/^Europe\/Kyiv/, "UA"],
  [/^Europe\/Stockholm/, "SE"],
  [/^Europe\/Oslo/, "NO"],
  [/^Europe\/Helsinki/, "FI"],
  [/^Africa\/Cairo/, "EG"],
  [/^Africa\/Lagos/, "NG"],
  [/^Africa\/Nairobi/, "KE"],
  [/^Africa\/Johannesburg/, "ZA"],
  [/^Asia\/Kolkata/, "IN"],
  [/^Asia\/Dhaka/, "BD"],
  [/^Asia\/Karachi/, "PK"],
  [/^Asia\/Kathmandu/, "NP"],
  [/^Asia\/Colombo/, "LK"],
  [/^Asia\/Bangkok/, "TH"],
  [/^Asia\/Jakarta/, "ID"],
  [/^Asia\/Manila/, "PH"],
  [/^Asia\/Singapore/, "SG"],
  [/^Asia\/Kuala_Lumpur/, "MY"],
  [/^Asia\/Tokyo/, "JP"],
  [/^Asia\/Seoul/, "KR"],
  [/^Asia\/Shanghai/, "CN"],
  [/^Asia\/Hong_Kong/, "HK"],
  [/^Asia\/Dubai/, "AE"],
  [/^Asia\/Riyadh/, "SA"],
  [/^Asia\/Jerusalem/, "IL"],
  [/^Asia\/Taipei/, "TW"],
  [/^Asia\/Ho_Chi_Minh/, "VN"],
  [/^Australia\/Sydney/, "AU"],
  [/^Pacific\/Auckland/, "NZ"],
];
const getDeviceLocation = () => {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const countryFromTimeZone = timezoneCountries.find(([pattern]) => pattern.test(timeZone))?.[1];
  const countryFromLocale = navigator.language?.match(/-([A-Z]{2})$/i)?.[1]?.toUpperCase();
  const country = countryFromTimeZone || countryFromLocale || "US";
  return { country, timeZone };
};
const timeZones = typeof Intl.supportedValuesOf === "function"
  ? Intl.supportedValuesOf("timeZone")
  : [Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"];

function SettingsPage() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { userData, channelData, allChannelData } = useSelector((state) => state.user);
  const [preferences, setPreferences] = useState({ ...defaults, ...userData?.preferences });
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState("");

  useEffect(() => {
    let active = true;
    axios.get(`${serverUrl}/api/user/settings`, { withCredentials: true })
      .then(({ data }) => {
        if (!active) return;
        const deviceLocation = getDeviceLocation();
        setPreferences({
          ...defaults,
          ...data.preferences,
          theme: data.preferences?.theme === "light" ? "light" : "dark",
          country: data.preferences?.locationMode === "manual"
            ? data.preferences.country
            : deviceLocation.country,
          timeZone: data.preferences?.locationMode === "manual"
            ? data.preferences.timeZone
            : deviceLocation.timeZone,
        });
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
    const updates = typeof key === "object" ? key : { [key]: value };
    setSavingKey(Object.keys(updates)[0]);
    try {
      const { data } = await axios.patch(
        `${serverUrl}/api/user/settings`,
        updates,
        { withCredentials: true }
      );
      setPreferences((current) => ({ ...current, ...data.preferences }));
      dispatch(setUserData({ ...userData, preferences: data.preferences }));
      if (updates.profileVisibility && channelData?._id) {
        const channels = allChannelData || [];
        dispatch(setAllChannelData(
          updates.profileVisibility === "private"
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

  const detectLocation = () => {
    const location = getDeviceLocation();
    savePreference({
      locationMode: "auto",
      country: location.country,
      timeZone: location.timeZone,
    });
  };

  const toggle = (key, label) => (
    <label className="flex cursor-pointer items-center justify-between gap-4 border-b border-gray-700 py-4 last:border-b-0">
      <span className="block font-medium">{t(label)}</span>
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
        <FaArrowLeft aria-hidden="true" />{t(" Back\n      ")}        </button>
        <h1 className="mb-2 text-3xl font-bold">{t("Settings")}</h1>

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
            <select
              value={preferences.theme}
              disabled={Boolean(savingKey)}
              onChange={(event) => savePreference("theme", event.target.value)}
              className="w-full cursor-pointer rounded-lg border border-gray-600 bg-[#121212] p-3 text-white sm:w-64"
            >
              <option value="light">{t("Light theme")}</option>
              <option value="dark">{t("Dark theme")}</option>
            </select>
          </section>

          <section className="rounded-xl bg-[#212121] p-5">
            <h2 className="mb-2 text-xl font-semibold">{t("Privacy")}</h2>
            <label className="flex items-center justify-between gap-4 border-b border-gray-700 py-4">
              <span>
                <span className="block font-medium">{t("Channel visibility")}</span>
              </span>
              <select
                value={preferences.profileVisibility}
                disabled={Boolean(savingKey)}
                onChange={(event) => savePreference("profileVisibility", event.target.value)}
                className="cursor-pointer rounded-lg border border-gray-600 bg-[#121212] p-2 text-white"
              >
                <option value="public">{t("Public")}</option>
                <option value="private">{t("Private")}</option>
              </select>
            </label>
            {toggle("saveWatchHistory", "Save watch history")}
          </section>

          <section className="rounded-xl bg-[#212121] p-5">
            <h2 className="mb-2 text-xl font-semibold">{t("Notifications")}</h2>
            {toggle("emailNotifications", "Email updates")}
          </section>

          <section className="rounded-xl bg-[#212121] p-5">
            <h2 className="mb-2 text-xl font-semibold">{t("Playback")}</h2>
            {toggle("autoplay", "Autoplay videos")}
          </section>

          <section className="rounded-xl bg-[#212121] p-5">
            <h2 className="mb-2 text-xl font-semibold">{t("Language")}</h2>
            <select
              value={preferences.language}
              disabled={Boolean(savingKey)}
              onChange={(event) => savePreference("language", event.target.value)}
              className="w-full cursor-pointer rounded-lg border border-gray-600 bg-[#121212] p-3 text-white sm:w-64"
            >
              {languages.map(({ code, name }) => (
                <option key={code} value={code}>{name}</option>
              ))}
            </select>
          </section>

          <section className="rounded-xl bg-[#212121] p-5">
            <h2 className="mb-2 text-xl font-semibold">{t("Location")}</h2>
            <p className="mb-4 text-sm text-gray-400">
              {t("Choose your country and time zone, or use the device time zone to detect a location automatically.")}
            </p>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <label className="flex-1">
                <span className="mb-2 block text-sm font-medium">{t("Country")}</span>
                <select
                  value={preferences.country}
                  disabled={Boolean(savingKey)}
                  onChange={(event) => savePreference({
                    locationMode: "manual",
                    country: event.target.value,
                  })}
                  className="w-full cursor-pointer rounded-lg border border-gray-600 bg-[#121212] p-3 text-white"
                >
                  {countries.map(({ code, name }) => (
                    <option key={code} value={code}>{name}</option>
                  ))}
                </select>
              </label>
              <label className="flex-1">
                <span className="mb-2 block text-sm font-medium">{t("Time zone")}</span>
                <select
                  value={preferences.timeZone}
                  disabled={Boolean(savingKey)}
                  onChange={(event) => savePreference({
                    locationMode: "manual",
                    timeZone: event.target.value,
                  })}
                  className="w-full cursor-pointer rounded-lg border border-gray-600 bg-[#121212] p-3 text-white"
                >
                  {preferences.timeZone && !timeZones.includes(preferences.timeZone) && (
                    <option value={preferences.timeZone}>{preferences.timeZone}</option>
                  )}
                  {timeZones.map((timeZone) => (
                    <option key={timeZone} value={timeZone}>{timeZone}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={Boolean(savingKey)}
                onClick={detectLocation}
                className="rounded-lg bg-[#333] px-4 py-3 hover:bg-[#444] disabled:opacity-50"
              >
                {t("Auto-detect")}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

export default SettingsPage;
