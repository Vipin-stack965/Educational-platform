import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { setVideoHistory, setShortHistory } from "../redux/userSlice"; 
import axios from "axios";
import { serverUrl } from "../config";

const UseGetHistory = () => {
  const dispatch = useDispatch();
  const isAuthLoading = useSelector(state => state.user.isAuthLoading);
  const userId = useSelector(state => state.user.userData?._id);

  useEffect(() => {
    if (isAuthLoading || !userId) return;
    const fetchHistory = async () => {
      try {
        const result = await axios.get(serverUrl + "/api/user/gethistory", {
          withCredentials: true,
        });

        const history = result.data || [];

        // ✅ Split videos & shorts
        const videos = history.filter(item => item.contentType === "Video");
        const shorts = history.filter(item => item.contentType === "Short");

        // Redux dispatch
        dispatch(setVideoHistory(videos));
        dispatch(setShortHistory(shorts));

        console.log("📺 History fetched:", { videos, shorts });
      } catch (error) {
        console.error("❌ Error fetching history:", error);

        // Agar error ho to empty history
        dispatch(setVideoHistory([]));
        dispatch(setShortHistory([]));
      }
    };

    fetchHistory();
  }, [dispatch, isAuthLoading, userId]);
};

export default UseGetHistory;  