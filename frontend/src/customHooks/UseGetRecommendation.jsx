import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";

import { serverUrl } from "../config";
import axios from "axios";
import { setRecommendationData } from "../redux/contentSlice";

const UseGetRecommendation = () => {
  const dispatch = useDispatch();
  const isAuthLoading = useSelector(state => state.user.isAuthLoading);
  const userId = useSelector(state => state.user.userData?._id);

  useEffect(() => {
    if (isAuthLoading || !userId) return;
    const fetchRecommendation = async () => {
      try {
        const res = await axios.get(
          `${serverUrl}/api/user/getrecommendation`,
          { withCredentials: true }
        );
        dispatch(setRecommendationData(res.data))
        console.log("Recommendation data:", res.data);
      } catch (err) {
        console.error("Recommendation fetch error:", err);
      }
    };

    fetchRecommendation();
  }, [dispatch, isAuthLoading, userId]);

  return null; // hook kuch render nahi karega
};

export default UseGetRecommendation;
