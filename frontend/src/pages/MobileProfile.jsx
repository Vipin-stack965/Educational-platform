import { t } from '../../utils/i18n.js';
import { signInWithPopup } from "firebase/auth";
import { FaHistory, FaList, FaClock, FaThumbsUp, FaCog, FaQuestionCircle, FaCommentAlt } from "react-icons/fa";
import { GoVideo } from "react-icons/go";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { auth, getGoogleAuthErrorMessage, isFirebaseConfigured, provider } from "../../utils/firebase";
import { setUserData } from "../redux/userSlice";
import { clearOfflineUser, saveOfflineUser } from "../utils/offlineStorage";
import axios from "axios";
import { serverUrl } from "../config";
import { showCustomAlert } from "../component/CustomAlert";
import { FiLogOut } from "react-icons/fi";
import { MdOutlineSwitchAccount } from "react-icons/md";
import { FcGoogle } from "react-icons/fc";
import { TiUserAddOutline } from "react-icons/ti";
import { SiYoutubestudio } from "react-icons/si";
import NameAvatar from "../component/NameAvatar";
function MobileProfile() {
    const {userData} = useSelector(state=>state.user)
    const navigate = useNavigate()
    const dispatch = useDispatch()

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

    const googleSignIn = async () => {
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
            
            const result = await axios.post(serverUrl + "/api/auth/google-auth" , {username , email ,photoUrl} , {withCredentials:true})
            saveOfflineUser(result.data)
            dispatch(setUserData(result.data))
    
                navigate("/")
                showCustomAlert(t("SignIn with Google Successfully"))
          } catch (error) {
            console.log(error)
            showCustomAlert(getGoogleAuthErrorMessage(error))
          }
        }
  return (
    <div className="bg-[#0f0f0f] text-white h-[100%] w-[100%] top-[3%] flex flex-col pt-[100px] p-[10px] ">
      {/* Top Profile Section */}
      <div className="p-4 flex items-center gap-4 border-b border-gray-800">
        <NameAvatar
          src={userData?.photoUrl}
          name={userData?.username || userData?.name}
          alt={t("profile")}
          className="h-16 w-16 text-2xl"
        />
        <div className="flex flex-col">
          {!userData?.isGuest && (
            <>
              <span className="font-semibold text-lg">{userData?.username}</span>
              <span className="text-gray-400 text-sm">{userData?.email}</span>
            </>
          )}
            <p
  className="text-sm text-blue-400 cursor-pointer hover:underline"
  onClick={() => {
    if (userData?.channel) {
      // Go to channel page
      navigate("/viewchannel")
      // navigate(`/channel/${userData.channel._id}`);
    } else {
      // Go to create channel flow
      navigate("/createchannel");
    }
  }}
>
  {userData?.channel ? t("View Channel") : t("Create Channel")}
</p>
          
        </div>
      
            </div>
         

      

      {/* Auth Buttons */}
      <div className="flex gap-2 p-4 border-b border-gray-800 overflow-auto">
            <button onClick={googleSignIn} className="bg-gray-800 text-nowrap px-3 py-1 rounded-2xl text-sm flex items-center justify-center gap-2"><FcGoogle className="text-xl" />{t("SignIn with Google Account")}</button>
          
            <button onClick={()=>navigate("/signin")} className="bg-gray-800 px-3 py-1 rounded-2xl text-sm text-nowrap flex items-center justify-center gap-2"> <MdOutlineSwitchAccount className="text-xl" />{t(" SignIn with other account")}</button>
            <button onClick={()=>navigate("/signup")} className="bg-gray-800 px-3 text-nowrap py-1 rounded-2xl text-sm flex items-center justify-center gap-2"><TiUserAddOutline className="text-xl" />{t("\n                          Create new account")}</button>
           
          
          {userData && <button onClick={handleSignOut} className="bg-gray-800 text-nowrap px-3 py-1 rounded-2xl text-sm flex items-center justify-center gap-2"><FiLogOut className="text-xl" />{t(" Sign out")}</button>}
     
      </div>

      {/* Menu Items */}
      <div className="flex flex-col">
        <ProfileMenuItem icon={<FaHistory />} text="History" onClick={()=>navigate("/history")}   />
        <ProfileMenuItem icon={<FaList />} text="Playlists" onClick={()=>navigate("/saveplaylist")} />
        <ProfileMenuItem icon={<FaClock />} text="Save Videos" onClick={()=>navigate("/savevideos")} />
        <ProfileMenuItem icon={<FaThumbsUp />} text="Liked Videos" onClick={()=>navigate("/likedvideos")} />
        {userData?.channel && <ProfileMenuItem icon={<SiYoutubestudio className="w-5 h-5 text-orange-400" />} text="PT Studio" onClick={()=>navigate("/ptstudio/dashboard")} />}
        <ProfileMenuItem icon={<FaCog />} text="Settings" onClick={() => navigate("/settings")} />
        <ProfileMenuItem icon={<FaQuestionCircle />} text="Help" onClick={() => navigate("/help")} />
        <ProfileMenuItem icon={<FaCommentAlt />} text="Send feedback" onClick={() => navigate("/send-feedback")} />
      </div>
    </div>
  );
}

function ProfileMenuItem({ icon, text , onClick }) {
  return (
    <button onClick={onClick} className="flex items-center gap-3 p-4 hover:bg-[#272727] text-left " > 
      <span className="text-lg">{icon}</span>
      <span className="text-sm">{t(text)}</span>
    </button>
  );
}

export default MobileProfile;
