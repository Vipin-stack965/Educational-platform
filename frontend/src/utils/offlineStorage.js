const DATABASE_NAME = "edutube-offline";
const DATABASE_VERSION = 2;
const DOWNLOAD_STORE = "downloads";
const SESSION_STORAGE_KEY = "edutube-offline-user";

const openDatabase = () => {
  if (!("indexedDB" in window)) {
    return Promise.reject(new Error("Offline video storage is not supported by this browser."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DOWNLOAD_STORE)) {
        database.createObjectStore(DOWNLOAD_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to open offline video storage."));
    request.onblocked = () => reject(new Error("Offline video storage is blocked by another tab."));
  });
};

export const saveOfflineUser = (user) => {
  if (!user?._id || user.isGuest) return;
  const offlineUser = {
    _id: user._id,
    username: user.username,
    name: user.name,
    photoUrl: user.photoUrl,
    preferences: user.preferences,
    isGuest: false,
  };
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(offlineUser));
  } catch (error) {
    console.error("Unable to cache the signed-in account for offline access:", error);
  }
};

export const getOfflineUser = () => {
  try {
    const user = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || "null");
    return user?._id && !user.isGuest ? user : null;
  } catch (error) {
    console.error("Unable to read cached EduTube account:", error);
    return null;
  }
};

export const clearOfflineUser = () => {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch (error) {
    console.error("Unable to clear cached EduTube account:", error);
  }
};

export const removeOfflineDownload = async (userId, videoId) => {
  if (!userId || !videoId) return;
  const database = await openDatabase();
  const transaction = database.transaction(DOWNLOAD_STORE, "readwrite");
  const completed = new Promise((resolve, reject) => {
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error || new Error("Unable to remove legacy offline video data."));
    transaction.onabort = () => reject(transaction.error || new Error("Offline video cleanup was interrupted."));
  });
  transaction.objectStore(DOWNLOAD_STORE).delete(`${userId}:${videoId}`);
  await completed;
};

export const saveOfflineVideo = async (userId, video, blob) => {
  if (!userId || !video?._id || !(blob instanceof Blob) || !blob.size) {
    throw new Error("A signed-in user and a valid video file are required for offline storage.");
  }

  const database = await openDatabase();
  const transaction = database.transaction(DOWNLOAD_STORE, "readwrite");
  const completed = new Promise((resolve, reject) => {
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error || new Error("Unable to save the video for offline playback."));
    transaction.onabort = () => reject(transaction.error || new Error("Offline video storage was interrupted."));
  });

  transaction.objectStore(DOWNLOAD_STORE).put({
    key: `${userId}:${video._id}`,
    userId,
    contentId: video._id,
    title: video.title,
    thumbnail: video.thumbnail || "",
    channelName: video.channel?.name || "",
    channelAvatar: video.channel?.avatar || "",
    blob,
    mimeType: blob.type || "video/mp4",
    downloadedAt: Date.now(),
  });
  await completed;
};

export const downloadOfflineVideo = async ({ userId, video, onProgress }) => {
  if (!userId || !video?._id || !video.videoUrl) {
    throw new Error("A signed-in user and a video URL are required to download this video.");
  }

  const response = await fetch(video.videoUrl, { mode: "cors" });
  if (!response.ok || response.type === "opaque") {
    throw new Error(`The video file could not be downloaded (HTTP ${response.status}).`);
  }

  const totalBytes = Number(response.headers.get("content-length")) || 0;
  let blob;
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let downloadedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      downloadedBytes += value.byteLength;
      onProgress?.(totalBytes ? Math.min(99, Math.floor((downloadedBytes / totalBytes) * 100)) : null);
    }

    blob = new Blob(chunks, { type: response.headers.get("content-type") || "video/mp4" });
  } else {
    blob = await response.blob();
    onProgress?.(99);
  }

  if (!blob.size) throw new Error("The downloaded video file is empty.");
  await saveOfflineVideo(userId, video, blob);
  onProgress?.(100);
  return blob;
};

export const getOfflineDownloads = async (userId) => {
  if (!userId) return [];
  const database = await openDatabase();
  const transaction = database.transaction(DOWNLOAD_STORE, "readonly");
  const completed = new Promise((resolve, reject) => {
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error || new Error("Unable to read offline videos."));
    transaction.onabort = () => reject(transaction.error || new Error("Reading offline videos was interrupted."));
  });
  const request = transaction.objectStore(DOWNLOAD_STORE).getAll();
  const records = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to read offline videos."));
  });
  await completed;
  return records.filter((record) => record.userId === userId && record.blob instanceof Blob && !record.removed);
};

export const getOfflineDownload = async (userId, videoId) => {
  if (!userId || !videoId) return null;
  const database = await openDatabase();
  const transaction = database.transaction(DOWNLOAD_STORE, "readonly");
  const request = transaction.objectStore(DOWNLOAD_STORE).get(`${userId}:${videoId}`);
  const record = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error("Unable to check offline video storage."));
  });
  database.close();
  return record?.blob instanceof Blob && !record.removed ? record : null;
};

export const queueOfflineDownloadRemoval = async (userId, videoId) => {
  if (!userId || !videoId) return;
  const database = await openDatabase();
  const transaction = database.transaction(DOWNLOAD_STORE, "readwrite");
  const completed = new Promise((resolve, reject) => {
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error || new Error("Unable to queue offline download removal."));
    transaction.onabort = () => reject(transaction.error || new Error("Offline download removal was interrupted."));
  });
  transaction.objectStore(DOWNLOAD_STORE).put({
    key: `${userId}:${videoId}`,
    userId,
    contentId: videoId,
    removed: true,
  });
  await completed;
};

export const getQueuedDownloadRemovals = async (userId) => {
  if (!userId) return [];
  const database = await openDatabase();
  const transaction = database.transaction(DOWNLOAD_STORE, "readonly");
  const request = transaction.objectStore(DOWNLOAD_STORE).getAll();
  const records = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to read pending download removals."));
  });
  database.close();
  return records.filter((record) => record.userId === userId && record.removed);
};

export const clearQueuedDownloadRemoval = removeOfflineDownload;
