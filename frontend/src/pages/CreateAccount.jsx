/* Add these at top imports if not already added */
import { useState, useRef } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { FaArrowLeft, FaUserCircle } from "react-icons/fa";
import { showCustomAlert } from "../component/CustomAlert";
import { ClipLoader } from "react-spinners";
import { serverUrl } from "../config";
import youtube from "../assets/playtube1.png"; // YouTube logo
import { useDispatch } from "react-redux";
import { setUserData } from "../redux/userSlice";

const CreateAccount = () => {
  const navigate = useNavigate();
  const avatarRef = useRef();
  const [step, setStep] = useState(1);

  const [userName, setUserName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [frontendAvatar, setFrontendAvatar] = useState(null);
  const [backendAvatar, setBackendAvatar] = useState(null);
  const [loading, setLoading] = useState(false);
  const dispatch = useDispatch()

  // Show/Hide Password state
  const [showPassword, setShowPassword] = useState(false);

  const handleAvatar = (e) => {
    const file = e.target.files[0];
    if (file) {
      setBackendAvatar(file);
      setFrontendAvatar(URL.createObjectURL(file));
    }
  };

  const handleNext = () => {
    if (step === 1) {
      if (!userName || !email) {
        showCustomAlert("Please fill all fields");
        return;
      }
    }
    if (step === 2) {
      if (!password || !confirmPassword) {
        showCustomAlert("Please fill password fields");
        return;
      }
      if (password !== confirmPassword) {
        showCustomAlert("Passwords do not match");
        return;
      }
    }
    setStep(step + 1);
  };

  const handleCreateAccount = async () => {
    if (!backendAvatar) {
      showCustomAlert("Please select an avatar");
      return;
    }
    setLoading(true);
    const formData = new FormData();
    formData.append("username", userName);
    formData.append("email", email);
    formData.append("password", password);
    formData.append("photoUrl", backendAvatar);

    try {
      const result = await axios.post(serverUrl + "/api/auth/signup", formData, { withCredentials: true });
      console.log(result.data);
      setLoading(false);
      navigate("/");
       dispatch(setUserData(result.data))
      showCustomAlert("Account Created");
    } catch (error) {
      console.log(error);
      setLoading(false);
      showCustomAlert(error.response.data.message);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#181818]">
      <div className="bg-[#202124] rounded-2xl p-10 w-full max-w-md shadow-lg">
        {/* Back Button */}
        <div className="flex items-center mb-6">
          <button
            onClick={() => {
              if (step > 1) {
                setStep(step - 1);
              } else {
                navigate("/"); // Step 1 → go home
              }
            }}
            className="text-gray-300 mr-3 hover:text-white"
          >
            <FaArrowLeft size={20} />
          </button>
          <span className="text-white text-2xl font-medium">Create Account</span>
        </div>

        {/* Step 1 */}
        {step === 1 && (
          <>
            <h1 className="text-3xl font-normal text-white mb-2 flex items-center gap-2">
              <img src={youtube} alt="Logo" className="w-8 h-8" />
              Basic Info
            </h1>
            <input
              type="text"
              placeholder="UserName"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              className="w-full bg-transparent border border-gray-500 rounded-md px-3 py-3 text-white focus:outline-none focus:border-blue-500 mb-4"
            />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-transparent border border-gray-500 rounded-md px-3 py-3 text-white focus:outline-none focus:border-blue-500"
            />
            <div className="flex justify-end mt-10">
              <button
                onClick={handleNext}
                className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-full"
              >
                Next
              </button>
            </div>
          </>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <>
            <h1 className="text-3xl font-normal text-white mb-6 flex items-center gap-2">
              <img src={youtube} alt="Logo" className="w-8 h-8" />
              Security
            </h1>
            <div className="flex items-center bg-[#3c4043] text-white px-3 py-2 rounded-full w-fit mb-6">
              <FaUserCircle className="mr-2" size={20} />
              {email}
            </div>
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-transparent border border-gray-500 rounded-md px-3 py-3 text-white focus:outline-none focus:border-blue-500 mb-4"
            />
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-transparent border border-gray-500 rounded-md px-3 py-3 text-white focus:outline-none focus:border-blue-500"
            />
            <div className="flex items-center gap-2 mt-3">
              <input
                type="checkbox"
                id="showPass"
                checked={showPassword}
                onChange={() => setShowPassword(!showPassword)}
              />
              <label htmlFor="showPass" className="text-gray-300 cursor-pointer">
                Show Password
              </label>
            </div>
            <div className="flex justify-end mt-10">
              <button
                onClick={handleNext}
                className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-full"
              >
                Next
              </button>
            </div>
          </>
        )}

        {/* Step 3 (same as before) */}
        {step === 3 && (
          <>
            <h1 className="text-3xl font-normal text-white mb-6 flex items-center gap-2">
              <img src={youtube} alt="Logo" className="w-8 h-8" />
              Choose Avatar
            </h1>

            <div className="flex items-center gap-6 mb-6">
              <div className="relative w-28 h-28 rounded-full border-4 border-gray-500 overflow-hidden shadow-lg">
                {frontendAvatar ? (
                  <img src={frontendAvatar} alt="avatar preview" className="w-full h-full object-cover" />
                ) : (
                  <FaUserCircle className="text-gray-500 w-full h-full p-2" />
                )}
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-gray-300 font-medium">Upload Profile Picture</label>
                <input
                  type="file"
                  ref={avatarRef}
                  onChange={handleAvatar}
                  accept="image/*"
                  className="block w-full text-sm text-gray-400 
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-full file:border-0
                    file:text-sm file:font-semibold
                    file:bg-blue-600 file:text-white
                    hover:file:bg-blue-700
                    cursor-pointer"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleCreateAccount}
                disabled={loading}
                className="bg-green-500 hover:bg-green-600 text-white px-6 py-2 rounded-full"
              >
                {loading ? <ClipLoader size={20} color="white" /> : "Create Account"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CreateAccount;
