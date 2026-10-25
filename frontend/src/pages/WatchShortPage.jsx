import { t } from '../../utils/i18n.js';
import axios from "axios";
import React, { useRef, useState, useEffect } from "react";
import {
  FaThumbsUp,
  FaThumbsDown,
  FaComment,
  FaPlay,
  FaDownload,
  FaBookmark,
  FaArrowDown, // for closing comment section
} from "react-icons/fa";
import { useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import { serverUrl } from "../config";
import { ClipLoader } from "react-spinners";
import { showCustomAlert } from "../component/CustomAlert";
import NameAvatar from "../component/NameAvatar";

const WatchShortPage = () => {
  const { shortId } = useParams();
  const { userData } = useSelector((state) => state.user);
  const navigate = useNavigate();
  const { allShortData } = useSelector((state) => state.content);
  

  const selectedShort = allShortData?.find((s) => s._id === shortId);
  const [shortsList, setShortsList] = useState([]);

  const [pausedIndex, setPausedIndex] = useState(0);


  const [openCommentShortId, setOpenCommentShortId] = useState(null);
  const [comments, setComments] = useState({}); // store per-short comments
  const [newComment, setNewComment] = useState("");
  const [replyText, setReplyText] = useState({}); // reply state for each comment
  const [viewedShorts, setViewedShorts] = useState([]);
   const [loading,setLoading] = useState(false)
   const [downloadLoadingId, setDownloadLoadingId] = useState(null)


  const videoRefs = useRef([]);

  // Arrange shorts
  useEffect(() => {
    if (!allShortData || allShortData.length === 0) return;

    if (selectedShort) {
      const selected = allShortData.find(
        (short) => short._id === selectedShort._id
      );

      const remaining = allShortData.filter(
        (short) => short._id !== selectedShort._id
      );

      if (selected) {
        setShortsList([selected, ...remaining]);
      } else {
        setShortsList(allShortData);
      }
    } else {
      setShortsList(allShortData);
    }
  }, [selectedShort, allShortData]);

  // Auto play/pause
  // Already exists in your code
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const index = Number(entry.target.dataset.index);
          const video = videoRefs.current[index];
          if (video) {
            if (entry.isIntersecting) {
              video.muted = false;
              video.play().catch((error) => {
                console.error("Short playback failed:", error);
                setPausedIndex(index);
              });
              const currentShortId = shortsList[index]?._id;

              if (currentShortId && !viewedShorts.includes(currentShortId)) {
                handleAddView(currentShortId);
                setViewedShorts((prev) => [...prev, currentShortId]); // ✅ ab sahi id add hogi
              }
            } else {
              video.pause();
              video.muted = true;
            }
          }
        });
      },
      { threshold: 0.7 }
    );

    videoRefs.current.forEach((video) => {
      if (video) observer.observe(video);
    });

    return () => observer.disconnect();
  }, [shortsList, viewedShorts]);


  // Toggle play/pause
  const togglePlayPause = (index) => {
    const video = videoRefs.current[index];
    if (video) {
      if (video.paused) {
        video.play().catch((error) => {
          console.error("Short playback failed:", error);
          setPausedIndex(index);
        });
      } else {
        video.pause();
      }
    }
  };

  const handleDownload = async (e, short) => {
    e.stopPropagation();
    if (!userData || userData.isGuest) {
      showCustomAlert(t("Sign in to save Shorts to your account Downloads."));
      navigate("/signin");
      return;
    }
    if (short.downloadedBy?.some((id) => id.toString() === userData._id.toString())) {
      showCustomAlert(t("This Short is already in your account Downloads."));
      return;
    }

    setDownloadLoadingId(short._id);
    try {
      const response = await axios.put(
        `${serverUrl}/api/content/short/${short._id}/download`,
        {},
        { withCredentials: true }
      );
      setShortsList((current) => current.map((item) => item._id === short._id ? response.data : item));
      showCustomAlert(t("Saved to your account Downloads. You can watch it on any signed-in device."));
    } catch (error) {
      console.error("Unable to save Short to account downloads:", error);
      showCustomAlert(error.response?.data?.message || t("Unable to save this Short to your account Downloads."));
    } finally {
      setDownloadLoadingId(null);
    }
  };


  // Add this function inside WatchShortPage
  const handleAddView = async (shortId) => {
    try {
      await axios.put(`${serverUrl}/api/content/short/${shortId}/add-view`, {}, { withCredentials: true });
      console.log("✅ View added for:", shortId);
    } catch (err) {
      console.error("View error:", err);
    }
  };



  const handleLike = async (shortId) => {
    try {
      const res = await axios.put(
        `${serverUrl}/api/content/short/${shortId}/toggle-like`,
        {},
        { withCredentials: true }
      );

      const updatedShort = res.data;
      const updatedShortList = shortsList.map((s) =>
        s._id === updatedShort._id ? updatedShort : s
      );
      setShortsList(updatedShortList);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDislike = async (shortId) => {
    try {
      const res = await axios.put(
        `${serverUrl}/api/content/short/${shortId}/toggle-dislike`,
        {},
        { withCredentials: true }
      );
      const updatedShort = res.data;
      const updatedShortList = shortsList.map((s) =>
        s._id === updatedShort._id ? updatedShort : s
      );
      setShortsList(updatedShortList);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSave = async (shortId) => {
    try {
      const res = await axios.put(
        `${serverUrl}/api/content/short/${shortId}/toggle-save`,
        {},
        { withCredentials: true }
      );
      const updatedShort = res.data;
      const updatedShortList = shortsList.map((s) =>
        s._id === updatedShort._id ? updatedShort : s
      );
      setShortsList(updatedShortList);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubscribe = async (channelId) => {
    setLoading(true)
    try {
      const res = await axios.post(
        `${serverUrl}/api/user/subscribe`,
        { channelId },
        { withCredentials: true }
      );
      setLoading(false)
      console.log(res.data)
      const updatedChannel = res.data;

      // ✅ shortsList ke andar jis short ka channel match hua hai sirf usko update karo
      setShortsList((prev) =>
        prev.map((short) =>
          short.channel._id === channelId
            ? { ...short, channel: updatedChannel }
            : short
        )
      );
    } catch (error) {
      console.log(error);
      setLoading(false)
    }
  };

  const handleAddComment = async (shortId) => {
    if (!newComment.trim()) return;
    try {
      const res = await axios.post(
        `${serverUrl}/api/content/short/${shortId}/comment`,
        { message: newComment },
        { withCredentials: true }
      );

      // Use full comments array returned by backend
      setComments((prev) => ({
        ...prev,
        [shortId]: res.data.comments || [],
      }));

      setNewComment("");
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddReply = async (shortId, commentId, replyTextValue) => {
    if (!replyTextValue.trim()) return;
    try {
      const res = await axios.post(
        `${serverUrl}/api/content/short/${shortId}/${commentId}/reply`,
        { message: replyTextValue },
        { withCredentials: true }
      );

      setComments((prev) => ({
        ...prev,
        [shortId]: res.data.comments, // refresh full comments for this short
      }));
      setReplyText((prev) => ({ ...prev, [commentId]: "" }));
    } catch (err) {
      console.error(err);
    }
  };

useEffect(() => {
  const addHistory = async () => {
    try {
     const res= await axios.post(
        `${serverUrl}/api/user/addhistory`,
        { contentId: shortId, contentType: "Short" },  // 👈 change
        { withCredentials: true }
      );
      console.log(res.data)
    } catch (err) {
      console.error("Error adding short history:", err);
    }
  };

  if (shortId) addHistory();
}, [shortId]);
  return (
    <div
      className="mt-0 h-[calc(100dvh-160px)] w-full snap-y snap-mandatory overflow-y-auto bg-black md:h-[calc(100dvh-100px)]"
    >
      {shortsList.length === 0 ? (
        <div className="flex h-full items-center justify-center px-6 text-center text-gray-300">
          {allShortData == null ? t("Loading Shorts...") : t("No shorts available yet.")}
        </div>
      ) : shortsList.map((short, index) => (
        <div
          key={short._id}
          className="h-full w-full px-2 flex items-center justify-center snap-start relative"
        >
          <div className="relative flex h-full max-w-full items-center gap-2">
            <div
              className="relative h-full max-h-full w-auto max-w-[calc(100vw-88px)] aspect-[9/16] cursor-pointer rounded-2xl border border-gray-700 bg-black shadow-xl"
              onClick={() => togglePlayPause(index)}
            >
            <video
              ref={(el) => (videoRefs.current[index] = el)}
              data-index={index}
              src={short.shortUrl}
              className="w-full h-full rounded-2xl object-cover"
              loop
              playsInline
              onPlay={() => setPausedIndex((current) => current === index ? null : current)}
              onPause={() => setPausedIndex(index)}
            />

            {pausedIndex === index && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="rounded-full bg-black/55 p-4 shadow-lg backdrop-blur-sm">
                  <FaPlay className="text-2xl text-white" />
                </div>
              </div>
            )}

            {/* Bottom Info */}
            <div className="absolute bottom-0 left-0 right-0 space-y-2 rounded-b-2xl bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3 text-white sm:p-4">
              <div className="flex min-w-0 items-center gap-2">
                <NameAvatar
                  src={short.channel?.avatar}
                  name={short.channel?.name}
                  alt={short.channel?.name}
                  className="h-8 w-8 border border-gray-700 text-xs"
                  onClick={() => navigate(`/channelpage/${short?.channel._id}`)}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-gray-200" onClick={() => navigate(`/channelpage/${short?.channel._id}`)}>
                  @{short.channel?.name || t("Unknown Channel")}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSubscribe(short.channel?._id);
                  }}
                  className={`${short?.channel?.subscribers?.includes(userData?._id)
                      ? "bg-[#000000a1] text-white border-1 border-gray-700"
                      : "bg-white text-black"
                    } shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-xs font-semibold cursor-pointer disabled:cursor-not-allowed`} disabled={loading}
                >
                  {loading?<ClipLoader size={16} color="gray"/>:short?.channel?.subscribers?.includes(userData?._id)
                    ? t("Subscribed")
                    : t("Subscribe")}
                </button>

              </div>
              <div className="flex min-w-0 items-center gap-3">
                <h2 className="line-clamp-2 break-words text-base font-bold sm:text-lg">{short.title}</h2>
              </div>
            </div>

            </div>

            {/* Short actions stay beside the video frame. */}
            <div className="z-10 flex shrink-0 flex-col items-center gap-3 text-white sm:gap-4">
              {/* Like */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleLike(short._id);
                }}
                aria-label={t("Like")}
                className="flex min-w-11 flex-col items-center gap-1 rounded-lg text-center"
              >
                <div
                  className={`${short?.likes?.includes(userData?._id)
                      ? "bg-white"
                      : "bg-[#00000065] border border-gray-700"
                    } flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-gray-700`}
                >
                  <FaThumbsUp
                    size={20}
                    className={`${short?.likes?.includes(userData?._id)
                        ? "text-black"
                        : "text-white"
                      }`}
                  />
                </div>
                <span className="max-w-12 text-[11px] leading-tight">{short?.likes?.length || 0}</span>
              </button>

              {/* Dislike */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDislike(short._id);
                }}
                aria-label={t("Dislike")}
                className="flex min-w-11 flex-col items-center gap-1 rounded-lg text-center"
              >
                <div
                  className={`${short?.dislikes?.includes(userData?._id)
                      ? "bg-white"
                      : "bg-[#00000065] border border-gray-700"
                    } flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-gray-700`}
                >
                  <FaThumbsDown
                    size={20}
                    className={`${short?.dislikes?.includes(userData?._id)
                        ? "text-black"
                        : "text-white"
                      }`}
                  />
                </div>
                <span className="max-w-12 text-[11px] leading-tight">{short?.dislikes?.length || 0}</span>
              </button>

              {/* Comment */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (openCommentShortId === short._id) {
                    setOpenCommentShortId(null); // close if same
                  } else {
                    setOpenCommentShortId(short._id); // open drawer for this short
                    setComments((prev) => ({
                      ...prev,
                      [short._id]: short.comments || [] // preload old comments if not already loaded
                    }));
                  }
                }}
                aria-label={t("Comment")}
                className="flex min-w-11 flex-col items-center gap-1 rounded-lg text-center"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-700 bg-[#00000065] transition-colors hover:bg-gray-700">
                  <FaComment size={20} className="text-white" />
                </div>
                <span className="max-w-12 text-[10px] leading-tight">{t("Comment")}</span>
              </button>


              {/* Download */}
              <button
                onClick={(e) => handleDownload(e, short)}
                aria-label={t("Download")}
                className="flex min-w-11 flex-col items-center gap-1 rounded-lg text-center"
              >
                <div className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-gray-700 ${short.downloadedBy?.some((id) => id.toString() === userData?._id?.toString()) ? "bg-white" : "border border-gray-700 bg-[#00000065]"}`}>
                  <FaDownload size={20} className={short.downloadedBy?.some((id) => id.toString() === userData?._id?.toString()) ? "text-black" : "text-white"} />
                </div>
                <span className="max-w-12 text-[10px] leading-tight">{downloadLoadingId === short._id ? t("Saving...") : short.downloadedBy?.some((id) => id.toString() === userData?._id?.toString()) ? t("In Downloads") : t("Download")}</span>
              </button>

              {/* Save */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleSave(short._id);
                }}
                aria-label={t("Save")}
                className="flex min-w-11 flex-col items-center gap-1 rounded-lg text-center"
              >
                <div
                  className={`${short?.saveBy?.includes(userData?._id)
                      ? "bg-white"
                      : "bg-[#00000065] border border-gray-700"
                    } flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-gray-700`}
                >
                  <FaBookmark
                    size={20}
                    className={`${short?.saveBy?.includes(userData?._id)
                        ? "text-black"
                        : "text-white"
                      }`}
                  />
                </div>
                <span className="max-w-12 text-[11px] leading-tight">{short?.saveBy?.length || 0}</span>
              </button>
            </div>

            {/* Comment Section Drawer */}
            {openCommentShortId === short._id && (
              <div className="absolute bottom-0 left-0 right-0 h-[60%] bg-black/95 text-white p-4 rounded-t-2xl overflow-y-auto">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-bold text-lg">{t("Comments")}</h3>
                  <button onClick={() => setOpenCommentShortId(null)}>
                    <FaArrowDown size={20} />
                  </button>
                </div>

                {/* Comment input */}
                <div className="mt-4 flex gap-2">
                  <input
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder={t("Add a comment...")}
                    className="flex-1 bg-gray-900 text-white p-2 rounded"
                  />
                  <button
                    onClick={() => handleAddComment(short._id)}
                    className="bg-black px-4 py-2  border-1 border-gray-700 rounded-xl"
                  >{t("\n                    Post\n                  ")}</button>
                </div>

                {/* Comments list */}
                <div className="space-y-3 mt-4">
                  {comments[short._id]?.length > 0 ? (
                    comments[short._id]
                      .filter((c) => c && c.message)
                      .map((comment) => (
                        <div key={comment._id || Math.random()} className="bg-gray-800/40 p-2 rounded-lg">
                          {/* Author info */}
                          <div className="flex items-center gap-2 mb-1">
                            <NameAvatar
                              src={comment?.author?.photoUrl}
                              name={comment?.author?.username}
                              alt={t("avatar")}
                              className="h-6 w-6 text-[9px]"
                            />
                            <span className="text-sm font-semibold">
                              {comment?.author?.username || t("Unknown")}
                            </span>
                          </div>

                          {/* Comment message */}
                          <p className="text-sm ml-8">{comment.message}</p>

                          {/* Reply input */}
                          <div className="mt-2 ml-8">
                            <input
                              type="text"
                              value={replyText[comment._id] || ""}
                              onChange={(e) =>
                                setReplyText((prev) => ({
                                  ...prev,
                                  [comment._id]: e.target.value,
                                }))
                              }
                              placeholder={t("Write a reply...")}
                              className="w-full bg-gray-900 text-white text-sm p-2 rounded"
                            />
                            <button
                              onClick={() => {
                                handleAddReply(short._id, comment._id, replyText[comment._id]);
                                setReplyText((prev) => ({ ...prev, [comment._id]: "" })); // clear input
                              }}
                              className="mt-1 bg-red-500 px-3 py-1 rounded text-xs"
                            >{t("\n                              Reply\n                            ")}</button>
                          </div>

                          {/* Replies list */}
                          {comment?.replies?.length > 0 && (
                            <div className="ml-12 mt-2 space-y-2">
                              {comment.replies
                                .filter((r) => r && r.message)
                                .map((r) => (
                                  <div key={r._id || Math.random()} className="flex items-start gap-2">
                                    <NameAvatar
                                      src={r?.author?.photoUrl}
                                      name={r?.author?.username}
                                      alt={t("avatar")}
                                      className="h-5 w-5 text-[8px]"
                                    />
                                    <div>
                                      <span className="text-xs font-semibold">
                                        {r?.author?.username || t("Unknown")}
                                      </span>
                                      <p className="text-xs text-gray-300 bg-gray-700 p-1 rounded mt-1">
                                        {r.message}
                                      </p>
                                    </div>



                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      ))
                  ) : (
                    <p className="text-sm text-gray-400">{t("No comments yet.")}</p>
                  )}
                </div>

              </div>
            )}
          </div>



        </div>

      ))}
    </div>
  );
};

export default WatchShortPage;
