import { setUserData } from "../redux/userSlice";
import { clearOfflineUser } from "./offlineStorage";

const handlePublishingBlock = (error, dispatch, navigate) => {
  const response = error.response?.data;
  if (!response?.blockType && !response?.violationCount) return false;

  clearOfflineUser();
  dispatch(setUserData(null));
  navigate("/signin", { replace: true });
  return true;
};

export default handlePublishingBlock;
