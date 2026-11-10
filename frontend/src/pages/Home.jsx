import { t } from '../../utils/i18n.js';
import { useState, useRef, useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import logo from "../assets/edutube-logo.svg";
import {
  FaBars,
  FaHome,
  FaHistory,
  FaList,
  FaThumbsUp,
  FaSearch,
  FaMicrophone,
  FaTimes,
  FaDownload,
} from "react-icons/fa";
import { IoIosAddCircle } from "react-icons/io";
import { GoVideo } from "react-icons/go";
import { SiYoutubeshorts } from "react-icons/si";
import { MdOutlineSubscriptions } from "react-icons/md";
import Profile from "../component/Profile";
import { useSelector } from "react-redux";
import AllVideosPage from "../component/AllVideosPage";
import ShortsPage from "../component/ShortsPage";
import CustomAlert, { showCustomAlert } from "../component/CustomAlert";
import { serverUrl } from "../config";
import axios from "axios";
import SearchResults from "./SearchResults";
import { ClipLoader } from "react-spinners";
import FilterResults from "./FilterResult";
import RecommendationContent from "./RecommendationContent";
import UseGetSubscribedContent from "../customHooks/UseGetSubscribedContent";
import NameAvatar from "../component/NameAvatar";
import { getVideoCategories } from "../utils/videoCategories";

function Home({ accountOverlay }) {
  const [sidebarWidth, setSidebarWidth] = useState(72);
  const sidebarOpen = sidebarWidth >= 160;
  const [open, setOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [input, setInput] = useState("");
  const [searchData, setSearchData] = useState(null);
  const [searchError, setSearchError] = useState("");
  const [filterData, setFilterData] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [popUp, setPopUp] = useState(false);
  const [listening, setListening] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const recognitionRef = useRef(null);
  const silenceTimeoutRef = useRef(null);
  const voiceSearchTimeoutRef = useRef(null);
  const voiceSearchSubmittedRef = useRef(false);
  const voiceTranscriptRef = useRef("");
  const isWatchPage = /^\/watch-video\/[^/]+$/.test(location.pathname);
  const isActivePath = (path) => path === "/"
    ? location.pathname === "/"
    : location.pathname === path || location.pathname.startsWith(`${path}/`);
  const [loading, setLoading] = useState(false)
  const loadingRef = useRef(false);
  loadingRef.current = loading;
  const { userData, channelData, subscribeChannel } = useSelector((state) => state.user);
  const { allVideoData, recommendationData } = useSelector((state) => state.content);
  const contentStyle = { "--sidebar-width": "72px" };
  const categoryVideos = userData
    ? [
      ...(recommendationData?.recommendedVideos || []),
      ...(recommendationData?.remainingVideos || []),
    ]
    : allVideoData || [];
  const categories = [...new Map(
    categoryVideos.flatMap((video) => getVideoCategories(video)
      .map((category) => [category.toLowerCase(), category]))
  ).values()].slice(0, 12);
  const resizeSidebar = (event) => {
    if (event.type === "pointerdown") event.currentTarget.setPointerCapture(event.pointerId);
    if (event.type === "pointerup") {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return;
    }
    if (event.type === "pointermove" && event.buttons !== 1) return;
    const maxWidth = Math.max(72, Math.min(420, window.innerWidth - 320));
    setSidebarWidth(Math.max(72, Math.min(maxWidth, event.clientX)));
  };

  useEffect(() => {
    const root = document.documentElement;
    const previousSidebarWidth = root.style.getPropertyValue("--youtube-sidebar-width");
    const activeSidebarWidth = isWatchPage ? 0 : sidebarWidth;
    root.style.setProperty("--youtube-sidebar-width", `${activeSidebarWidth}px`);
    return () => {
      if (previousSidebarWidth) {
        root.style.setProperty("--youtube-sidebar-width", previousSidebarWidth);
      } else {
        root.style.removeProperty("--youtube-sidebar-width");
      }
    };
  }, [isWatchPage, sidebarOpen, sidebarWidth]);

  // 🔊 Speech synthesis
  function speak(message) {
    let utterance = new SpeechSynthesisUtterance(message);
    window.speechSynthesis.speak(utterance);
  }

  // 🎤 Speech recognition
  if (!recognitionRef.current && (window.SpeechRecognition || window.webkitSpeechRecognition)) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = true;
    const language = userData?.preferences?.language || "en";
    recognitionRef.current.lang = language === "hi"
      ? "hi-IN"
      : language === "en"
        ? "en-US"
        : language;

  }

  const clearSilenceTimeout = () => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
  };

  const scheduleVoiceSearch = (transcript) => {
    const query = transcript.trim();
    if (!query || voiceSearchSubmittedRef.current) return;
    if (voiceSearchTimeoutRef.current) clearTimeout(voiceSearchTimeoutRef.current);
    voiceSearchTimeoutRef.current = setTimeout(() => {
      voiceSearchTimeoutRef.current = null;
      if (voiceSearchSubmittedRef.current) return;
      voiceSearchSubmittedRef.current = true;
      voiceTranscriptRef.current = "";
      setInput(query);
      setPopUp(false);
      handleSearchData(query);
    }, 350);
  };

  const stopVoiceSearch = () => {
    clearSilenceTimeout();
    if (recognitionRef.current && listening) recognitionRef.current.stop();
    setListening(false);
  };

  const handleHomeNavigation = () => {
    voiceSearchSubmittedRef.current = true;
    voiceTranscriptRef.current = "";
    if (voiceSearchTimeoutRef.current) clearTimeout(voiceSearchTimeoutRef.current);
    voiceSearchTimeoutRef.current = null;
    stopVoiceSearch();
    setSearchData(null);
    setSearchError("");
    setFilterData(null);
    setSelectedCategory("");
    setInput("");
    setPopUp(false);
    navigate("/");
  };

  useEffect(() => () => {
    clearSilenceTimeout();
    if (voiceSearchTimeoutRef.current) clearTimeout(voiceSearchTimeoutRef.current);
    recognitionRef.current?.abort();
  }, []);

  const handleSearch = async () => {
    if (!recognitionRef.current) {
      showCustomAlert(t("Speech recognition not supported in your browser"));
      return;
    }

    if (listening) {
      stopVoiceSearch();
      return;
    }

    const recognition = recognitionRef.current;
    const startSilenceTimeout = () => {
      clearSilenceTimeout();
      silenceTimeoutRef.current = setTimeout(() => {
        recognition.stop();
        setListening(false);
      }, 5000);
    };

    recognition.onstart = () => {
      setListening(true);
      startSilenceTimeout();
    };

    recognition.onspeechstart = clearSilenceTimeout;
    recognition.onspeechend = startSilenceTimeout;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript || "")
        .join(" ")
        .trim();
      if (transcript) {
        voiceTranscriptRef.current = transcript;
        setInput(transcript);
        setSearchError("");
        const latestResult = event.results[event.results.length - 1];
        if (latestResult?.isFinal) scheduleVoiceSearch(transcript);
        startSilenceTimeout();
      }
    };

    recognition.onerror = (err) => {
      console.error("Recognition error:", err);
      setListening(false);
      clearSilenceTimeout();

      if (err.error !== "no-speech" && err.error !== "aborted") {
        showCustomAlert(t("Voice search failed. Try again."));
      }
    };

    recognition.onend = () => {
      setListening(false);
      clearSilenceTimeout();
      const transcript = voiceTranscriptRef.current;
      if (transcript) {
        scheduleVoiceSearch(transcript);
      }
    };

    if (voiceSearchTimeoutRef.current) clearTimeout(voiceSearchTimeoutRef.current);
    voiceSearchTimeoutRef.current = null;
    voiceSearchSubmittedRef.current = false;
    voiceTranscriptRef.current = "";
    setListening(true);
    try {
      recognition.start();
    } catch (error) {
      setListening(false);
      clearSilenceTimeout();
      console.error("Unable to start voice search:", error);
      showCustomAlert(t("Voice search failed. Try again."));
    }
  };

  const handleSearchData = async (query) => {
    const searchQuery = query.trim();
    if (!searchQuery || loadingRef.current) return;

    loadingRef.current = true;
    setLoading(true);
    setSearchError("");
    try {
      const result = await axios.post(
        serverUrl + "/api/content/search",
        { input: searchQuery },
        { withCredentials: true }
      );
      setSearchData(result.data);
      setFilterData(null);
      setSelectedCategory("");
      navigate("/")
      setInput("");
      setPopUp(false);
      setLoading(false);

      const { videos = [], shorts = [], playlists = [], channels = [] } = result.data;

      if (
        videos.length > 0 ||
        shorts.length > 0 ||
        playlists.length > 0 ||
        channels.length > 0
      ) {
        speak("These are the top search results I found for you");
      } else {
        speak("No results found");
      }
    } catch (error) {
      console.error("Search request failed:", error);
      setSearchError(error.response?.data?.message || t("Search failed. Please try again."));
      showCustomAlert(error.response?.data?.message || t("Search failed. Please try again."));
      setPopUp(false);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  };

  const handleSearchKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSearchData(input);
    }
  };

  const navigateFromMenu = (path) => {
    setMobileMenuOpen(false);
    setOpen(false);
    if (path === "/") {
      handleHomeNavigation();
      return;
    }
    navigate(path);
  };

  useEffect(() => {
    setMobileMenuOpen(false);
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const handleEscape = (event) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [mobileMenuOpen]);
  const handleCategoryFilter = (category) => {
    const videos = categoryVideos.filter((video) => getVideoCategories(video)
      .some((videoCategory) => videoCategory.toLowerCase() === category.toLowerCase()));
    setFilterData({ videos, shorts: [] });
    setSelectedCategory(category);
  };

  UseGetSubscribedContent()
  

  return (
    <div className="bg-[#0f0f0f] text-white min-h-screen relative">
      {/* 🎤 Voice Search Popup */}
      {popUp && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-fadeIn" onClick={() => setPopUp(false)}>
          <div className="bg-[#1f1f1f]/90 backdrop-blur-md rounded-2xl shadow-2xl w-[90%] max-w-md min-h-[400px] sm:min-h-[480px] p-8 flex flex-col items-center justify-between gap-8 relative border border-gray-700 transition-all duration-300" onClick={(event) => event.stopPropagation()}>

            {/* Close button */}
            <button
              className="absolute top-4 right-4 text-gray-400 hover:text-white transition"
              onClick={() => setPopUp(false)}
            >
              <FaTimes size={22} />
            </button>

            {/* Status */}
            <div className="flex flex-col items-center gap-3">
              {listening ? (
                <h1 className="text-xl sm:text-2xl font-semibold text-orange-400 animate-pulse">{t("\n                  Listening...\n                ")}</h1>
              ) : (
                <h1 className="text-lg sm:text-xl font-medium text-gray-300">{t("\n                  Speak or type your query\n                ")}</h1>
              )}

            </div>

            {/* Mic button at bottom */}
            <button
              className={`p-6 rounded-full shadow-xl transition-all duration-300 transform hover:scale-110 ${listening
                ? "bg-red-500 animate-pulse shadow-red-500/40"
                : "bg-orange-500 hover:bg-orange-600 shadow-orange-500/40"
                }`}
              onClick={handleSearch}
              disabled={loading}
            >
              {loading ? (
                <ClipLoader size={24} color="white" />
              ) : (
                <FaMicrophone className="w-8 h-8 text-white" />
              )}
            </button>
          </div>
        </div>
      )}



      {/* ---------- NAVBAR ---------- */}
      <header className="bg-[#0f0f0f] h-15 p-3 fixed top-0 left-0 right-0 z-50">
        <div className="flex items-center justify-between">
          {/* Left */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                if (window.innerWidth < 768) {
                  setMobileMenuOpen((isOpen) => !isOpen);
                  return;
                }
                setSidebarWidth((width) => width >= 160 ? 72 : 240);
              }}
              className="text-xl bg-[#272727] p-2 rounded-full"
              aria-label={window.innerWidth < 768
                ? mobileMenuOpen ? t("Close navigation menu") : t("Open navigation menu")
                : sidebarOpen ? t("Collapse sidebar") : t("Expand sidebar")}
              aria-expanded={window.innerWidth < 768 ? mobileMenuOpen : sidebarOpen}
            >
              {mobileMenuOpen ? <FaTimes /> : <FaBars />}
            </button>
            <button
              type="button"
              onClick={handleHomeNavigation}
              aria-label={t("Go to home")}
              className="flex items-center gap-[5px] rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              <img src={logo} alt={t("Logo")} className="w-[30px]" />
              <span className="text-white font-bold text-xl tracking-tight font-roboto">{t("\n                EduTube\n              ")}</span>
            </button>
          </div>

          {/* Search */}
          <div className="hidden md:flex items-center gap-2 flex-1 max-w-xl">
            <div className="flex flex-1">
              <input
                type="text"
                placeholder={t("Search")}
                className="flex-1 bg-[#121212] px-4 py-2 rounded-l-full outline-none border border-gray-700"
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                value={input}
              />
              <button
                className="bg-[#272727] px-4 rounded-r-full border border-gray-700"
                onClick={() => handleSearchData(input)} disabled={loading}
              >
                {loading ? <ClipLoader size={18} color="white" /> : <FaSearch />}
              </button>
            </div>
            <button
              className="bg-[#272727] p-3 rounded-full"
              onClick={() => setPopUp(true)}
            >
              <FaMicrophone />
            </button>
          </div>

          {/* Right */}
          <div className="flex items-center gap-3">
            {userData?.isAgentReview ? (
              <span className="hidden md:inline text-xs text-amber-200">Guest review</span>
            ) : (
              <>
                <button
                  className="hidden md:flex items-center gap-1 bg-[#272727] px-3 py-1 rounded-full"
                  onClick={() => navigate("/createpage")}
                >
                  <span className="text-lg">+</span>
                  <span>{t("Create")}</span>
                </button>

                <button
                  type="button"
                  aria-label={t("Open profile")}
                  className="hidden md:flex"
                  onClick={() => setOpen((prev) => !prev)}
                >
                  <NameAvatar
                    src={userData?.photoUrl}
                    name={userData?.username || userData?.name}
                    alt={t("Profile")}
                    className="h-9 w-9 border border-gray-700 text-sm"
                  />
                </button>
              </>
            )}
            <button type="button" className="text-lg md:hidden flex" aria-label={t("Search")} onClick={() => setPopUp(true)}>
              <FaSearch />
            </button>
          </div>
        </div>
      </header>

      {mobileMenuOpen && (
        <div className="fixed inset-0 top-[60px] z-[70] md:hidden" role="presentation">
          <button
            type="button"
            className="absolute inset-0 h-full w-full bg-black/60"
            aria-label={t("Close navigation menu")}
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="youtube-sidebar relative z-10 h-full w-[min(82vw,280px)] overflow-y-auto bg-[#0f0f0f] px-3 py-4 shadow-xl">
            <nav className="space-y-1">
              <SidebarItem icon={<FaHome />} text="Home" open selected={isActivePath("/")} onClick={() => navigateFromMenu("/")} />
              <SidebarItem icon={<SiYoutubeshorts />} text="Shorts" open selected={isActivePath("/shorts")} onClick={() => navigateFromMenu("/shorts")} />
              <SidebarItem icon={<MdOutlineSubscriptions />} text="Subscriptions" open selected={isActivePath("/subscribepage")} onClick={() => navigateFromMenu("/subscribepage")} />
            </nav>
            <hr className="my-3 border-gray-800" />
            <p className="px-2 text-sm text-gray-400">{t("You")}</p>
            <nav className="mt-1 space-y-1">
              {channelData && !userData?.isAgentReview && <SidebarItem icon={<GoVideo />} text="Your videos" open selected={isActivePath("/ptstudio/content")} onClick={() => navigateFromMenu("/ptstudio/content")} />}
              <SidebarItem icon={<FaHistory />} text="History" open selected={isActivePath("/history")} onClick={() => navigateFromMenu("/history")} />
              <SidebarItem icon={<FaList />} text="Playlists" open selected={isActivePath("/saveplaylist")} onClick={() => navigateFromMenu("/saveplaylist")} />
              <SidebarItem icon={<GoVideo />} text="Save videos" open selected={isActivePath("/savevideos")} onClick={() => navigateFromMenu("/savevideos")} />
              {userData && !userData.isGuest && <SidebarItem icon={<FaDownload />} text="Downloads" open selected={isActivePath("/downloads")} onClick={() => navigateFromMenu("/downloads")} />}
              <SidebarItem icon={<FaThumbsUp />} text="Liked videos" open selected={isActivePath("/likedvideos")} onClick={() => navigateFromMenu("/likedvideos")} />
              {!userData?.isAgentReview && (
                <SidebarItem icon={<NameAvatar src={userData?.photoUrl} name={userData?.username || userData?.name} className="h-6 w-6 border border-gray-700 text-[10px]" />} text="Your profile" open selected={isActivePath("/mobileprofile")} onClick={() => navigateFromMenu("/mobileprofile")} />
              )}
              {!userData?.isAgentReview && (
                <SidebarItem icon={<IoIosAddCircle />} text="Create" open selected={isActivePath("/createpage")} onClick={() => navigateFromMenu("/createpage")} />
              )}
            </nav>
            {subscribeChannel?.length > 0 && (
              <>
                <hr className="my-3 border-gray-800" />
                <p className="px-2 text-sm text-gray-400">{t("Subscriptions")}</p>
                <nav className="mt-1 space-y-1">
                  {subscribeChannel.map((item) => (
                    <SidebarItem
                      key={item._id}
                      icon={<NameAvatar src={item.avatar} name={item.name} alt={item.name} className="h-6 w-6 border border-gray-700 text-[10px]" />}
                      text={item.name}
                      open
                      selected={location.pathname === `/channelpage/${item._id}`}
                      onClick={() => navigateFromMenu(`/channelpage/${item._id}`)}
                    />
                  ))}
                </nav>
              </>
            )}
          </aside>
        </div>
      )}

      {/* ---------- SIDEBAR ---------- */}
      <aside
        style={{ width: `${sidebarWidth}px` }}
        className={`youtube-sidebar fixed left-0 top-[60px] bottom-0 z-40 hidden flex-col overflow-y-auto bg-[#0f0f0f] shadow-xl transition-[width] duration-150 md:flex ${isWatchPage && !sidebarOpen ? "!hidden" : ""}`}
      >
        <nav className="space-y-1 mt-3">
          <SidebarItem icon={<FaHome />} text="Home" open={sidebarOpen} selected={isActivePath("/")} onClick={() => navigateFromMenu("/")} />
          <SidebarItem icon={<SiYoutubeshorts />} text="Shorts" open={sidebarOpen} selected={isActivePath("/shorts")} onClick={() => navigateFromMenu("/shorts")} />
          <SidebarItem icon={<MdOutlineSubscriptions />} text="Subscriptions" open={sidebarOpen} selected={isActivePath("/subscribepage")} onClick={() => navigateFromMenu("/subscribepage")} />
        </nav>

        <hr className="border-gray-800 my-3" />

        {sidebarOpen && <p className="text-sm text-gray-400 px-2">{t("You")}</p>}
        <nav className="space-y-1 mt-1">
          {channelData && !userData?.isAgentReview && <SidebarItem icon={<GoVideo />} text="Your videos" open={sidebarOpen} selected={isActivePath("/ptstudio/content")} onClick={() => navigateFromMenu("/ptstudio/content")} />}
          <SidebarItem icon={<FaHistory />} text="History" open={sidebarOpen} selected={isActivePath("/history")} onClick={() => navigateFromMenu("/history")} />
          <SidebarItem icon={<FaList />} text="Playlists" open={sidebarOpen} selected={isActivePath("/saveplaylist")} onClick={() => navigateFromMenu("/saveplaylist")} />
          <SidebarItem icon={<GoVideo />} text="Save videos" open={sidebarOpen} selected={isActivePath("/savevideos")} onClick={() => navigateFromMenu("/savevideos")} />
          {userData && !userData.isGuest && <SidebarItem icon={<FaDownload />} text="Downloads" open={sidebarOpen} selected={isActivePath("/downloads")} onClick={() => navigateFromMenu("/downloads")} />}
          <SidebarItem icon={<FaThumbsUp />} text="Liked videos" open={sidebarOpen} selected={isActivePath("/likedvideos")} onClick={() => navigateFromMenu("/likedvideos")} />
        </nav>

        <hr className="border-gray-800 my-3" />

        {sidebarOpen && <p className="text-sm text-gray-400 px-2">{t("Subscriptions")}</p>}
        <nav className="space-y-1 mt-1">
          {subscribeChannel?.map((item, index) => (
            <button
              key={index}
              onClick={() => {
                navigateFromMenu(`/channelpage/${item._id}`);
              }}
              className={`sidebar-item flex items-center ${sidebarOpen ? "gap-3 justify-start" : "justify-center"
                } w-full text-left cursor-pointer p-2 rounded-lg transition ${location.pathname === `/channelpage/${item._id}`
                  ? "sidebar-item-selected bg-[#272727]"
                  : "hover:bg-[#272727]"
                }`}
            >
              <NameAvatar
                src={item.avatar}
                name={item.name}
                alt={item.name}
                className={`border border-gray-700 transition-transform duration-200 hover:scale-110 ${sidebarOpen ? "h-6 w-6 text-[10px]" : "h-7 w-7 text-xs"}`}
              />
              <span className={`text-white truncate ${sidebarOpen ? "text-sm" : "w-full text-center text-[10px] leading-tight"}`}>{item.name}</span>
            </button>
          ))}
        </nav>

      </aside>
      <div
        role="separator"
        aria-label={t("Resize sidebar")}
        aria-orientation="vertical"
        aria-valuemin={72}
        aria-valuemax={Math.max(72, Math.min(420, window.innerWidth - 320))}
        aria-valuenow={sidebarWidth}
        tabIndex={0}
        style={{ left: `${sidebarWidth - 4}px` }}
        className={`fixed bottom-0 top-[60px] z-40 hidden w-2 cursor-col-resize touch-none bg-transparent outline-none md:flex ${isWatchPage && !sidebarOpen ? "!hidden" : ""}`}
        onPointerDown={resizeSidebar}
        onPointerMove={resizeSidebar}
        onPointerUp={resizeSidebar}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const direction = event.key === "ArrowRight" ? 1 : -1;
          const maxWidth = Math.max(72, Math.min(420, window.innerWidth - 320));
          setSidebarWidth((width) => Math.max(72, Math.min(maxWidth, width + direction * 16)));
        }}
      />

      {/* ---------- MAIN CONTENT ---------- */}
      <main
        style={contentStyle}
        className="flex flex-col overflow-y-auto p-4 pb-16 transition-[margin] duration-150 md:ml-[var(--sidebar-width)]"
      >
        {userData?.isAgentReview && (
          <div className="mb-4 mt-[60px] flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-700 bg-amber-950/70 px-4 py-3 text-sm text-amber-100">
            <span>Agent review mode · Guest session · Read-only</span>
            <button
              type="button"
              className="rounded-md border border-amber-600 px-3 py-1.5 font-medium hover:bg-amber-900"
              onClick={async () => {
                try {
                  await axios.post(`${serverUrl}/api/auth/exit-agent-review`, {}, { withCredentials: true });
                  window.location.assign("/");
                } catch (error) {
                  console.error("Unable to exit agent review mode:", error);
                  showCustomAlert(t("Unable to exit agent review mode. Please try again."));
                }
              }}
            >
              Exit review mode
            </button>
          </div>
        )}
        {(location.pathname === "/" || location.pathname === "/signup") && (
          <>
            {/* Categories */}
            <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide pt-2 mt-[60px]">
              <button
                type="button"
                className={`whitespace-nowrap px-4 py-1 rounded-lg text-sm ${!selectedCategory ? "bg-white text-black" : "bg-[#272727] hover:bg-gray-700"}`}
                onClick={() => {
                  setFilterData(null);
                  setSelectedCategory("");
                }}
              >
                {t("All")}
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.toLowerCase()}
                  className={`whitespace-nowrap px-4 py-1 rounded-lg text-sm ${selectedCategory === cat ? "bg-white text-black" : "bg-[#272727] hover:bg-gray-700"}`}
                  onClick={() => handleCategoryFilter(cat)}
                >
                  {cat}
                </button>
              ))}

            </div>


            {/* Search + All Videos */}
            <div className="mt-6">
              {filterData ? (
                <FilterResults filterResults={filterData} />
              ) : searchData ? (
                <SearchResults searchResults={searchData} />
              ) : userData ? (
                <RecommendationContent />
              ) : (
                <>
                  <AllVideosPage />
                  <ShortsPage />
                </>
              )}
            </div>
            {searchError && <p role="alert" className="mt-3 text-sm text-red-300">{searchError}</p>}
          </>
        )}

        {open && <Profile onClose={() => setOpen(false)} />}
        <div className="mt-4">
          <Outlet />
        </div>
      </main>

      {/* ---------- BOTTOM NAV (MOBILE) ---------- */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#0f0f0f] border-t border-gray-800 flex justify-around pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] z-40">
        <MobileNavItem onClick={handleHomeNavigation} icon={<FaHome />} text="Home" active={isActivePath("/")} />
        <MobileNavItem onClick={() => navigate("/shorts")} icon={<SiYoutubeshorts />} text="Shorts" active={isActivePath("/shorts")} />
        {!userData?.isAgentReview && <MobileNavItem onClick={() => navigate("/createpage")} icon={<IoIosAddCircle className="fill-gray-500 text-4xl w-9 h-9" />} text="Create" active={isActivePath("/createpage")} />}
        <MobileNavItem onClick={() => navigate("/subscribepage")} icon={<MdOutlineSubscriptions />} text="Subscriptions" active={isActivePath("/subscribepage")} />
        {!userData?.isAgentReview && (
          <MobileNavItem
            onClick={() => navigate("/mobileprofile")}
            icon={<NameAvatar src={userData?.photoUrl} name={userData?.username || userData?.name} alt={t("Profile")} className="h-8 w-8 border border-gray-700 text-xs" />}
            text="You"
            active={isActivePath("/mobileprofile")}
          />
        )}
      </nav>
      {accountOverlay}
    </div>
  );
}

function SidebarItem({ icon, text, open, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      title={!open ? t(text) : undefined}
      aria-current={selected ? "page" : undefined}
      className={`sidebar-item flex w-full rounded-lg p-2 transition-colors ${open ? "items-center justify-start gap-4" : "flex-col items-center justify-center gap-1.5 py-3"} ${selected ? "sidebar-item-selected bg-[#272727]" : "hover:bg-[#272727]"}`}
    >
      <span className={open ? "text-lg" : "text-xl"}>{icon}</span>
      <span className={open ? "text-left text-sm" : "w-full truncate text-center text-[10px] leading-tight"}>{t(text)}</span>
    </button>
  );
}

function MobileNavItem({ icon, text, onClick, active }) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex flex-col items-center justify-center gap-1 px-2 sm:px-3 py-2 rounded-lg transition-all duration-300 ${active ? "text-white" : "text-gray-400"} hover:scale-105`}
    >
      <span className="text-xl sm:text-2xl">{icon}</span>
      {text && <span className="text-[10px] sm:text-xs">{t(text)}</span>}
    </button>
  );
}

export default Home;
