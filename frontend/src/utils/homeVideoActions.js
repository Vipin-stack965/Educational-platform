import { useEffect, useState } from "react";

const PREFERENCES_KEY = "edutube-home-video-preferences";
const QUEUE_KEY = "edutube-video-queue";
const CHANGE_EVENT = "edutube-home-video-actions-changed";

const readStoredValue = (key, fallback) => {
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch (error) {
    console.error(`Unable to read ${key} from local storage:`, error);
    return fallback;
  }
};

const notifyChange = () => window.dispatchEvent(new Event(CHANGE_EVENT));

export const getHomeVideoPreferences = () => readStoredValue(PREFERENCES_KEY, {
  dismissedVideoIds: [],
  dismissedChannelIds: [],
});

export const updateHomeVideoPreferences = (update) => {
  const current = getHomeVideoPreferences();
  const next = update(current);
  window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(next));
  notifyChange();
  return next;
};

export const useHomeVideoPreferences = () => {
  const [preferences, setPreferences] = useState(getHomeVideoPreferences);

  useEffect(() => {
    const refresh = () => setPreferences(getHomeVideoPreferences());
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return preferences;
};

export const getVideoQueue = () => readStoredValue(QUEUE_KEY, []);

export const enqueueVideo = (video) => {
  const queue = getVideoQueue().filter((queuedVideo) => queuedVideo?._id !== video?._id);
  queue.push({
    _id: video._id,
    title: video.title,
    videoUrl: video.videoUrl,
    thumbnail: video.thumbnail,
    channel: video.channel,
  });
  window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  notifyChange();
};

export const dequeueVideo = () => {
  const [nextVideo, ...remainingVideos] = getVideoQueue();
  window.localStorage.setItem(QUEUE_KEY, JSON.stringify(remainingVideos));
  notifyChange();
  return nextVideo || null;
};
