import React, { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { setVideoData } from '../redux/contentSlice';
import { serverUrl } from '../config';
import axios from 'axios';

const UsegetChannelContent = () => {
  const dispatch = useDispatch()
  const channelId = useSelector(state => state.user.channelData?._id)
  useEffect(() => {
      const fetchChannelVideos = async () => {
        if (!channelId) return;
        
        try {
          const res = await axios.post(
            `${serverUrl}/api/content/get-videos`,
            { channelId },
            { withCredentials: true }
          );
          dispatch(setVideoData(res.data.videos || []));
        } catch (err) {
          console.error("Unable to load channel videos:", err);
        }
      };
      fetchChannelVideos();
    }, [channelId, dispatch]);
  
}

export default UsegetChannelContent
