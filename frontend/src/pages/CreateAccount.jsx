import { t } from '../../utils/i18n.js';
/* Add these at top imports if not already added */
import { useState, useRef } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { FaArrowLeft, FaUserCircle } from "react-icons/fa";
import { showCustomAlert } from "../component/CustomAlert";
import { ClipLoader } from "react-spinners";
import { serverUrl } from "../config";
import brandLogo from "../assets/edutube-logo.svg";
import { useDispatch } from "react-redux";
import { setUserData } from "../redux/userSlice";
import { saveOfflineUser } from "../utils/offlineStorage";

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
        showCustomAlert(t("Please fill all fields"));
        return;
      }
    }
    if (step === 2) {
      if (!password || !confirmPassword) {
        showCustomAlert(t("Please fill password fields"));
        return;
      }
      if (password !== confirmPassword) {
        showCustomAlert(t("Passwords do not match"));
        return;
      }
    }
    setStep(step + 1);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (loading) return;
    if (step < 3) {
      handleNext();
    } else {
      handleCreateAccount();
    }
  };

  const handleCreateAccount = async () => {
    setLoading(true);
    const formData = new FormData();
    formData.append("username", userName);
    formData.append("email", email);
    formData.append("password", password);
    formData.append("photoUrl", backendAvatar);

    try {
      const result = await axios.post(serverUrl + "/api/auth/signup", formData, { withCredentials: true });
      saveOfflineUser(result.data.user);
      dispatch(setUserData(result.data.user));
      navigate("/");
      showCustomAlert(result.data.warning || "Account created");
    } catch (error) {
      const message = error.response?.data?.message || "Could not connect to the server. Please try again.";
      showCustomAlert(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-y-3 right-3 z-[100] w-[calc(100%-1.5rem)] overflow-y-auto rounded-2xl border border-gray-700 bg-[#202124] shadow-2xl sm:inset-y-0 sm:right-0 sm:w-full sm:max-w-md sm:rounded-none sm:border-y-0 sm:border-r-0">
      <div className="mx-auto w-full max-w-md p-6 sm:p-10">
        {/* Back Button */}
        <div className="flex items-center mb-6">
          <button
            type="button"
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
          <span className="text-white text-2xl font-medium">{t("Create Account")}</span>
        </div>

        <form onSubmit={handleSubmit}>
        {/* Step 1 */}
        {step === 1 && (
          <>
            <h1 className="text-3xl font-normal text-white mb-2 flex items-center gap-2">
              <img src={brandLogo} alt={t("EduTube")} className="w-8 h-8" />{t("\n              Basic Info\n            ")}</h1>
            <input
              type="text"
              required
              placeholder={t("UserName")}
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              className="w-full bg-transparent border border-gray-500 rounded-md px-3 py-3 text-white focus:outline-none focus:border-blue-500 mb-4"
            />
            <input
              type="email"
              required
              placeholder={t("Email")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-transparent border border-gray-500 rounded-md px-3 py-3 text-white focus:outline-none focus:border-blue-500"
            />
            <div className="flex justify-end mt-10">
              <button
                type="submit"
                className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-full"
              >{t("\n                Next\n              ")}</button>
            </div>
          </>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <>
            <h1 className="text-3xl font-normal text-white mb-6 flex items-center gap-2">
              <img src={brandLogo} alt={t("EduTube")} className="w-8 h-8" />{t("\n              Security\n            ")}</h1>
            <div className="flex items-center bg-[#3c4043] text-white px-3 py-2 rounded-full w-fit mb-6">
              <FaUserCircle className="mr-2" size={20} />
              {email}
            </div>
            <input
              type={showPassword ? "text" : "password"}
              required
              placeholder={t("Password")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-transparent border border-gray-500 rounded-md px-3 py-3 text-white focus:outline-none focus:border-blue-500 mb-4"
            />
            <input
              type={showPassword ? "text" : "password"}
              required
              placeholder={t("Confirm Password")}
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
              <label htmlFor="showPass" className="text-gray-300 cursor-pointer">{t("\n                Show Password\n              ")}</label>
            </div>
            <div className="flex justify-end mt-10">
              <button
                type="submit"
                className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-full"
              >{t("\n                Next\n              ")}</button>
            </div>
          </>
        )}

        {/* Step 3 (same as before) */}
        {step === 3 && (
          <>
            <h1 className="text-3xl font-normal text-white mb-6 flex items-center gap-2">
              <img src={brandLogo} alt={t("EduTube")} className="w-8 h-8" />{t("\n              Choose Avatar\n            ")}</h1>

            <div className="flex items-center gap-6 mb-6">
              <div className="relative w-28 h-28 rounded-full border-4 border-gray-500 overflow-hidden shadow-lg">
                {frontendAvatar ? (
                  <img src={frontendAvatar} alt={t("avatar preview")} className="w-full h-full object-cover" />
                ) : (
                  <FaUserCircle className="text-gray-500 w-full h-full p-2" />
                )}
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-gray-300 font-medium">{t("Profile Picture (optional)")}</label>
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
                type="submit"
                disabled={loading}
                className="bg-green-500 hover:bg-green-600 text-white px-6 py-2 rounded-full"
              >
                {loading ? <ClipLoader size={20} color="white" /> : t("Create Account")}
              </button>
            </div>
          </>
        )}
        </form>
      </div>
    </div>
  );
};

export default CreateAccount;
