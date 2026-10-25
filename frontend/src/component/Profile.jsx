import { t } from '../../utils/i18n.js';
import React from "react";
import { FiLogOut } from "react-icons/fi";
import { MdOutlineSwitchAccount } from "react-icons/md";
import { FcGoogle } from "react-icons/fc";
import { TiUserAddOutline } from "react-icons/ti";
import NameAvatar from "./NameAvatar";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { serverUrl } from "../config";
import { showCustomAlert } from "./CustomAlert";
import { useDispatch, useSelector } from "react-redux";
import { setUserData } from "../redux/userSlice";
import { clearOfflineUser, saveOfflineUser } from "../utils/offlineStorage";
import { auth, getGoogleAuthErrorMessage, isFirebaseConfigured, provider } from "../../utils/firebase";
import { signInWithPopup } from "firebase/auth";
import { SiYoutubestudio } from "react-icons/si";
import { FaCog, FaQuestionCircle, FaCommentAlt } from "react-icons/fa";

const Profile = ({ onClose }) => {
 const navigate = useNavigate()
 const {userData} = useSelector(state=>state.user)
 const dispatch = useDispatch()
  const [accountMenu, setAccountMenu] = React.useState("")
  const navigateAndClose = (path) => {
    onClose?.()
    navigate(path)
  }
  const handleSignOut = async () => {
        try {
            const result = await axios.get(serverUrl + "/api/auth/signout" , {withCredentials:true})
            console.log(result.data)
            clearOfflineUser()
            dispatch(setUserData(null))
            showCustomAlert(t("Signout Successfully"))


        } catch (error) {
            console.log(error)
            showCustomAlert(error.response.data.message)

        }
    }
   const googleAuthentication = async (intent) => {
       if (!isFirebaseConfigured) {
         showCustomAlert("Firebase API key is missing or invalid. Set VITE_FIREBASE_APIKEY in frontend/.env and restart the frontend.");
         return;
       }

       try {
         const response = await signInWithPopup(auth,provider)
         let user = response.user
        let username = user.displayName
        let email = user.email
        let photoUrl = user.photoURL
        
        const result = await axios.post(serverUrl + "/api/auth/google-auth" , {username , email ,photoUrl, intent} , {withCredentials:true})
        saveOfflineUser(result.data)
        dispatch(setUserData(result.data))

        onClose?.()
        navigate("/")
        showCustomAlert(intent === "signup" ? t("Signed up with Google successfully") : t("Signed in with Google successfully"))
      } catch (error) {
        console.log(error)
        showCustomAlert(getGoogleAuthErrorMessage(error))
      }
    }

  return (
    <>
      <button
        type="button"
        aria-label={t("Close profile menu")}
        className="fixed inset-0 z-[55] cursor-default"
        onClick={onClose}
      />
      <div
        className="fixed right-5 top-14 z-[60] w-72 rounded-xl bg-[#212121] text-white shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
          {/* Profile Info */}
          {userData && <div className="flex items-center gap-3 p-4 border-b border-gray-700">
              
<NameAvatar
  src={userData?.photoUrl}
  name={userData?.username || userData?.name}
  alt={t("Profile")}
  className="h-12 w-12 border border-gray-700"
/>
            <div>
              {!userData?.isGuest && (
                <>
                  <h4 className="font-semibold">{userData?.username}</h4>
                  <p className="text-sm text-gray-400">{userData?.email}</p>
                </>
              )}
              <p
  className="text-sm text-blue-400 cursor-pointer hover:underline"
  onClick={() => {
    if (userData?.channel) {
      // Go to channel page
      navigateAndClose("/viewchannel")
      // navigate(`/channel/${userData.channel._id}`);
    } else {
      // Go to create channel flow
      navigateAndClose("/createchannel");
    }
  }}
>
  {userData?.channel ? t("View Channel") : t("Create Channel")}
</p>
            </div>
          </div>}

          {/* Options */}
          <div className="flex flex-col py-2">
            <button
              type="button"
              aria-expanded={accountMenu === "signup"}
              className="flex items-center gap-3 px-4 py-2 hover:bg-gray-700"
              onClick={() => setAccountMenu((current) => current === "signup" ? "" : "signup")}
            >
              <TiUserAddOutline className="text-xl" />{t("Create new account")}
            </button>
            {accountMenu === "signup" && (
              <div className="flex flex-col border-l border-gray-700 ml-9">
                <button className="flex items-center gap-3 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700" onClick={() => navigateAndClose("/signup")}>
                  <TiUserAddOutline className="text-lg" />{t("Sign up with email")}
                </button>
                <button className="flex items-center gap-3 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700" onClick={() => googleAuthentication("signup")}>
                  <FcGoogle className="text-xl" />{t("Sign up with Google")}
                </button>
              </div>
            )}
            <button
              type="button"
              aria-expanded={accountMenu === "signin"}
              className="flex items-center gap-3 px-4 py-2 hover:bg-gray-700"
              onClick={() => setAccountMenu((current) => current === "signin" ? "" : "signin")}
            >
              <MdOutlineSwitchAccount className="text-xl" />{t("Sign in with other account")}
            </button>
            {accountMenu === "signin" && (
              <div className="flex flex-col border-l border-gray-700 ml-9">
                <button className="flex items-center gap-3 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700" onClick={() => navigateAndClose("/signin")}>
                  <MdOutlineSwitchAccount className="text-lg" />{t("Sign in with email")}
                </button>
                <button className="flex items-center gap-3 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700" onClick={() => googleAuthentication("signin")}>
                  <FcGoogle className="text-xl" />{t("Sign in with Google")}
                </button>
              </div>
            )}
            {userData?.channel && <button className="flex items-center gap-3 px-4 py-2 hover:bg-gray-700" onClick={()=>navigate("/ptstudio/dashboard")}>
              <SiYoutubestudio className="w-5 h-5 text-orange-400" />{t(" PT Studio\n            ")}</button>}
            <button className="flex items-center gap-3 px-4 py-2 hover:bg-gray-700" onClick={() => navigateAndClose("/settings")}>
              <FaCog className="text-lg" />{t(" Settings\n            ")}</button>
            <button className="flex items-center gap-3 px-4 py-2 hover:bg-gray-700" onClick={() => navigateAndClose("/help")}>
              <FaQuestionCircle className="text-lg" />{t(" Help\n            ")}</button>
            <button className="flex items-center gap-3 px-4 py-2 hover:bg-gray-700" onClick={() => navigateAndClose("/send-feedback")}>
              <FaCommentAlt className="text-lg" />{t(" Send feedback\n            ")}</button>
            
            {userData && <button className="flex items-center gap-3 px-4 py-2 hover:bg-gray-700" onClick={handleSignOut}>
              <FiLogOut className="text-xl" />{t(" Sign out\n            ")}</button>}
          </div>
      </div>
    </>
  );
};

export default Profile;
