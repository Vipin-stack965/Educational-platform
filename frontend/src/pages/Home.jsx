import { t } from '../../utils/i18n.js';
import { useState, useRef } from "react";
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

function Home({ accountOverlay }) {
  const [sidebarWidth, setSidebarWidth] = useState(72);
  const sidebarOpen = sidebarWidth >= 160;
  const [selectedItem, setSelectedItem] = useState("Home");
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [searchData, setSearchData] = useState(null);
  const [filterData, setFilterData] = useState(null);
  const [popUp, setPopUp] = useState(false);
  const [listening, setListening] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false)
  const [loading1, setLoading1] = useState(false)
  const { userData, subscribeChannel } = useSelector((state) => state.user);
  const sidebarStyle = { "--sidebar-width": "72px" };
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

  const categories = [
    "Music", "Gaming", "Movies", "TV Shows", "News",
    "Trending", "Entertainment", "Education", "Science & Tech",
    "Travel", "Fashion", "Cooking", "Sports", "Pets",
    "Art", "Comedy", "Vlogs"
  ];

  // 🔊 Speech synthesis
  function speak(message) {
    let utterance = new SpeechSynthesisUtterance(message);
    window.speechSynthesis.speak(utterance);
  }

  // 🎤 Speech recognition
  const recognitionRef = useRef(null);
  if (!recognitionRef.current && (window.SpeechRecognition || window.webkitSpeechRecognition)) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = false;
    recognitionRef.current.lang = "en-US";

  }

  const handleSearch = async () => {
    if (!recognitionRef.current) {
      showCustomAlert(t("Speech recognition not supported in your browser"));
      return;
    }

    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    setListening(true);
    recognitionRef.current.start();

    recognitionRef.current.onresult = async (e) => {
      const transcript = e.results[0][0].transcript.trim();
      setInput(transcript);
      setListening(false);
      await handleSearchData(transcript);
    };

    recognitionRef.current.onerror = (err) => {
      console.error("Recognition error:", err);
      setListening(false);

      if (err.error === "no-speech") {
        setAlertMessage("No speech detected. Please try again.");
      } else {
        setAlertMessage("Voice search failed. Try again.");
      }
    };

    recognitionRef.current.onend = () => {
      setListening(false);
    };
  };

  const handleSearchData = async (query) => {
    const searchQuery = query.trim();
    if (!searchQuery || loading) return;

    setLoading(true);
    try {
      const result = await axios.post(
        serverUrl + "/api/content/search",
        { input: searchQuery },
        { withCredentials: true }
      );
      setSearchData(result.data);
      console.log(result.data);
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
      console.error(error);
      setPopUp(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSearchData(input);
    }
  };
  const handleCategoryFilter = async (category) => {
    setLoading1(true)
    try {
      const result = await axios.post(
        serverUrl + "/api/content/filter",
        { input: category },
        { withCredentials: true }
      );

      const { videos = [], shorts = [], channels = [] } = result.data;

      // ✅ Channels ke videos aur shorts merge karo
      let channelVideos = [];
      let channelShorts = [];
      channels.forEach((ch) => {
        if (ch.videos?.length) channelVideos.push(...ch.videos);
        if (ch.shorts?.length) channelShorts.push(...ch.shorts);
      });

      setFilterData({
        ...result.data,
        videos: [...videos, ...channelVideos],
        shorts: [...shorts, ...channelShorts],
      });
      setLoading1(false)
      navigate("/")

      console.log("Category filter merged:", {
        ...result.data,
        videos: [...videos, ...channelVideos],
        shorts: [...shorts, ...channelShorts],
      });



      if (
        videos.length > 0 ||
        shorts.length > 0 ||
        channelVideos.length > 0 ||
        channelShorts.length > 0
      ) {
        speak(`Here are some ${category} videos and shorts for you`);
      } else {
        speak("No results found");
      }
    } catch (error) {
      console.error("Category filter error:", error);
      setLoading1(false)

    }
  };

  UseGetSubscribedContent()
  

  return (
    <div className="bg-[#0f0f0f] text-white min-h-screen relative">
      {/* 🎤 Voice Search Popup */}
      {popUp && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-[#1f1f1f]/90 backdrop-blur-md rounded-2xl shadow-2xl w-[90%] max-w-md min-h-[400px] sm:min-h-[480px] p-8 flex flex-col items-center justify-between gap-8 relative border border-gray-700 transition-all duration-300">

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

              {/* Show recognized text */}
              {input && (
                <span className="text-center text-lg sm:text-xl text-gray-200 px-4 py-2 rounded-lg bg-[#2a2a2a]/60">
                  {input}
                </span>
              )}

              {/* Input + Search button (mobile only) */}
              <div className="flex w-full gap-2 sm:hidden mt-4">
                <input
                  type="text"
                  placeholder={t("Type your search...")}
                  className="flex-1 px-4 py-2 rounded-full bg-[#2a2a2a] text-white outline-none border border-gray-600 focus:border-orange-400 focus:ring-2 focus:ring-orange-500 transition"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                />
                <button
                  className="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-full text-white font-semibold shadow-md transition disabled:opacity-50"
                  disabled={loading}
                  onClick={() => handleSearchData(input)}
                >
                  {loading ? <ClipLoader size={18} color="white" /> : <FaSearch />}
                </button>
              </div>
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
              onClick={() => setSidebarWidth((width) => width >= 160 ? 72 : 240)}
              className="text-xl bg-[#272727] p-2 rounded-full md:inline hidden"
              aria-label={sidebarOpen ? t("Collapse sidebar") : t("Expand sidebar")}
            >
              <FaBars />
            </button>
            <div className="flex items-center gap-[5px]">
              <img src={logo} alt={t("Logo")} className="w-[30px]" />
              <span className="text-white font-bold text-xl tracking-tight font-roboto">{t("\n                EduTube\n              ")}</span>
            </div>
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
            <FaSearch className="text-lg md:hidden flex " onClick={() => setPopUp(true)} />
          </div>
        </div>
      </header>

      {/* ---------- SIDEBAR ---------- */}
      <aside
        style={{ width: `${sidebarWidth}px` }}
        className="youtube-sidebar fixed top-[60px] bottom-0 z-40 hidden flex-col overflow-y-auto bg-[#0f0f0f] shadow-xl transition-[width] duration-150 md:flex"
      >
        <nav className="space-y-1 mt-3">
          <SidebarItem icon={<FaHome />} text="Home" open={sidebarOpen} selected={selectedItem === "Home"} onClick={() => { setSelectedItem("Home"); navigate("/"); }} />
          <SidebarItem icon={<SiYoutubeshorts />} text="Shorts" open={sidebarOpen} selected={selectedItem === "Shorts"} onClick={() => { setSelectedItem("Shorts"); navigate("/shorts"); }} />
          <SidebarItem icon={<MdOutlineSubscriptions />} text="Subscriptions" open={sidebarOpen} selected={selectedItem === "Subscriptions"} onClick={() => { setSelectedItem("Subscriptions"); navigate("/subscribepage"); }} />
        </nav>

        <hr className="border-gray-800 my-3" />

        {sidebarOpen && <p className="text-sm text-gray-400 px-2">{t("You")}</p>}
        <nav className="space-y-1 mt-1">
          <SidebarItem icon={<FaHistory />} text="History" open={sidebarOpen} selected={selectedItem === "History"} onClick={() => { setSelectedItem("History"); navigate("/history"); }} />
          <SidebarItem icon={<FaList />} text="Playlists" open={sidebarOpen} selected={selectedItem === "Playlists"} onClick={() => { setSelectedItem("Playlists"); navigate("/saveplaylist"); }} />
          <SidebarItem icon={<GoVideo />} text="Save videos" open={sidebarOpen} selected={selectedItem === "Save videos"} onClick={() => { setSelectedItem("Save videos"); navigate("/savevideos"); }} />
          {userData && !userData.isGuest && <SidebarItem icon={<FaDownload />} text="Downloads" open={sidebarOpen} selected={location.pathname === "/downloads"} onClick={() => { setSelectedItem("Downloads"); navigate("/downloads"); }} />}
          <SidebarItem icon={<FaThumbsUp />} text="Liked videos" open={sidebarOpen} selected={selectedItem === "Liked videos"} onClick={() => { setSelectedItem("Liked videos"); navigate("/likedvideos"); }} />
        </nav>

        <hr className="border-gray-800 my-3" />

        {sidebarOpen && <p className="text-sm text-gray-400 px-2">{t("Subscriptions")}</p>}
        <nav className="space-y-1 mt-1">
          {subscribeChannel?.map((item, index) => (
            <button
              key={index}
              onClick={() => {
                setSelectedItem(item._id);
                navigate(`/channelpage/${item._id}`);
              }}
              className={`sidebar-item flex items-center ${sidebarOpen ? "gap-3 justify-start" : "justify-center"
                } w-full text-left cursor-pointer p-2 rounded-lg transition ${selectedItem === item._id
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
        className="fixed bottom-0 top-[60px] z-40 hidden w-2 cursor-col-resize touch-none bg-transparent outline-none md:flex"
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
        style={sidebarStyle}
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
              {categories.map((cat, idx) => (
                <button
                  key={idx}
                  className="whitespace-nowrap bg-[#272727] px-4 py-1 rounded-lg text-sm hover:bg-gray-700" disabled={loading1}
                  onClick={() => handleCategoryFilter(cat)}  // 👈 yaha call hoga 
                >
                  {t(cat)}

                </button>

              ))}

            </div>


            {/* Search + All Videos */}
            <div className="mt-6">
              <div className="w-full items-center flex justify-center ">{loading1 ? <ClipLoader size={50} color="white" /> : ""}</div>
              {searchData && <SearchResults searchResults={searchData} />}
              {filterData && <FilterResults filterResults={filterData} />}

              {userData ? (
                <RecommendationContent />
              ) : (
                <>
                  <AllVideosPage />
                  <ShortsPage />
                </>
              )}
            </div>
          </>
        )}

        {open && <Profile onClose={() => setOpen(false)} />}
        <div className="mt-4">
          <Outlet />
        </div>
      </main>

      {/* ---------- BOTTOM NAV (MOBILE) ---------- */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#0f0f0f] border-t border-gray-800 flex justify-around py-2 z-10">
        <MobileNavItem onClick={() => navigate("/")} icon={<FaHome />} text="Home" />
        <MobileNavItem onClick={() => navigate("/shorts")} icon={<SiYoutubeshorts />} text="Shorts" />
        {!userData?.isAgentReview && <MobileNavItem onClick={() => navigate("/createpage")} icon={<IoIosAddCircle className="fill-gray-500 text-4xl w-9 h-9" />} />}
        <MobileNavItem onClick={() => navigate("/subscribepage")} icon={<MdOutlineSubscriptions />} text="Subscriptions" />
        {!userData?.isAgentReview && (
          <MobileNavItem
            onClick={() => navigate("/mobileprofile")}
            icon={<NameAvatar src={userData?.photoUrl} name={userData?.username || userData?.name} alt={t("Profile")} className="h-8 w-8 border border-gray-700 text-xs" />}
            text="You"
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
      className={`flex flex-col items-center justify-center gap-1 px-2 sm:px-3 py-2 rounded-lg transition-all duration-300 ${active ? "text-white" : "text-gray-400"} hover:scale-105`}
    >
      <span className="text-xl sm:text-2xl">{icon}</span>
      {text && <span className="text-[10px] sm:text-xs">{t(text)}</span>}
    </button>
  );
}

export default Home;
