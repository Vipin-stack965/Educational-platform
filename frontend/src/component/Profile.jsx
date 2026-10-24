import React from "react";
import { FaUserCircle } from "react-icons/fa";

import { FiLogOut } from "react-icons/fi";
import { MdOutlineSwitchAccount } from "react-icons/md";
import { FcGoogle } from "react-icons/fc";
import { TiUserAddOutline } from "react-icons/ti";
import img from "../assets/youtube.png"
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { serverUrl } from "../config";
import { showCustomAlert } from "./CustomAlert";
import { useDispatch, useSelector } from "react-redux";
import { setUserData } from "../redux/userSlice";
import { auth, provider } from "../../utils/firebase";
import { signInWithPopup } from "firebase/auth";
import { SiYoutubestudio } from "react-icons/si";
import { FaCog, FaQuestionCircle, FaCommentAlt } from "react-icons/fa";

const Profile = ({ onClose }) => {
 const navigate = useNavigate()
 const {userData} = useSelector(state=>state.user)
 const dispatch = useDispatch()
  const navigateAndClose = (path) => {
    onClose?.()
    navigate(path)
  }
  const handleSignOut = async () => {
        try {
            const result = await axios.get(serverUrl + "/api/auth/signout" , {withCredentials:true})
            console.log(result.data)
            dispatch(setUserData(null))
            showCustomAlert("Signout Successfully")


        } catch (error) {
            console.log(error)
            showCustomAlert(error.response.data.message)

        }
    }
   const googleSignIn = async () => {
      try {
        const response = await signInWithPopup(auth,provider)
       console.log(response)
        let user = response.user
        let username = user.displayName
        let email = user.email
        let photoUrl = user.photoURL
        
        const result = await axios.post(serverUrl + "/api/auth/google-auth" , {username , email ,photoUrl} , {withCredentials:true})
        dispatch(setUserData(result.data))

            navigate("/")
            showCustomAlert("SignIn with Google Successfully")
      } catch (error) {
        console.log(error)
        showCustomAlert("SignIn with Google Error")
      }
    }

  return (
    <>
      <button
        type="button"
        aria-label="Close profile menu"
        className="fixed inset-0 z-[55] cursor-default"
        onClick={onClose}
      />
      <div
        className="fixed right-5 top-14 z-[60] w-72 rounded-xl bg-[#212121] text-white shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
          {/* Profile Info */}
          {userData && <div className="flex items-center gap-3 p-4 border-b border-gray-700">
              
<img
  src={userData?.photoUrl || img}
  alt="Profile"
  className="w-12 h-12 flex items-center justify-center rounded-full object-cover border-1 border-gray-700"
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
  {userData?.channel ? "View Channel" : "Create Channel"}
</p>
            </div>
          </div>}

          {/* Options */}
          <div className="flex flex-col py-2">
            <button className="flex items-center gap-3 px-4 py-2 hover:bg-gray-700" onClick={googleSignIn}>
              <FcGoogle className="text-xl" />SignIn with Google Account
            </button>
            <button className="flex items-center gap-3 px-4 py-2 hover:bg-gray-700" onClick={()=>navigate("/signup")}>
              <TiUserAddOutline className="text-xl" />
              Create new account
            </button>
            <button className="flex items-center gap-3 px-4 py-2 hover:bg-gray-700" onClick={()=>navigate("/signin")}>
              <MdOutlineSwitchAccount className="text-xl" /> SignIn with other account
            </button>
            {userData?.channel && <button className="flex items-center gap-3 px-4 py-2 hover:bg-gray-700" onClick={()=>navigate("/ptstudio/dashboard")}>
              <SiYoutubestudio className="w-5 h-5 text-orange-400" /> PT Studio
            </button>}
            <button className="flex items-center gap-3 px-4 py-2 hover:bg-gray-700" onClick={() => navigateAndClose("/settings")}>
              <FaCog className="text-lg" /> Settings
            </button>
            <button className="flex items-center gap-3 px-4 py-2 hover:bg-gray-700" onClick={() => navigateAndClose("/help")}>
              <FaQuestionCircle className="text-lg" /> Help
            </button>
            <button className="flex items-center gap-3 px-4 py-2 hover:bg-gray-700" onClick={() => navigateAndClose("/send-feedback")}>
              <FaCommentAlt className="text-lg" /> Send feedback
            </button>
            
            {userData && <button className="flex items-center gap-3 px-4 py-2 hover:bg-gray-700" onClick={handleSignOut}>
              <FiLogOut className="text-xl" /> Sign out
            </button>}
          </div>
      </div>
    </>
  );
};

export default Profile;
