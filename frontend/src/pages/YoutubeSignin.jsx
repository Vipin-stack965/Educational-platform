import React, { useState } from "react";
import youtubeLogo from "../assets/playtube1.png";
import { FaArrowLeft, FaUserCircle } from "react-icons/fa";
import { showCustomAlert } from "../component/CustomAlert";
import { useNavigate } from "react-router-dom";
import { ClipLoader } from "react-spinners";
import axios from "axios";
import { serverUrl } from "../config";
import { useDispatch } from "react-redux";
import { setUserData } from "../redux/userSlice";

function YoutubeSignin() {
    const [step, setStep] = useState(1);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading,setLoading] = useState(false)
    const navigate = useNavigate();

    const dispatch= useDispatch()
   
  const handleSignIn = async () => {
    try {
        const result = await axios.post(serverUrl + "/api/auth/signin", {email , password} , {withCredentials:true})
        console.log(result.data)
        setLoading(false)
        navigate("/")
        dispatch(setUserData(result.data))
        showCustomAlert("SignIn Successfully ")
    } catch (error) {
        console.log(error)
        setLoading(false)
        showCustomAlert(error.response.data.message)
    }
  }
   const handleNext = () => {
    if (step === 1) {
      if (!email) {
        showCustomAlert("Please fill all fields");
        return;
      }
    }
    if (step === 2) {
      if (!password) {
        showCustomAlert("Please fill password field");
        return;
      }
    }
    setStep(step + 1);
  };

    return (
        <div className="flex items-center justify-center min-h-screen bg-[#181818]">
            <div className="bg-[#202124] rounded-2xl p-10 w-full max-w-md shadow-lg">
                
                {/* Logo & Back Arrow */}
                <div className="flex items-center mb-6">
                    <button
                        onClick={() => step === 1 ? navigate("/") : setStep(step - 1)}
                        className="text-gray-300 mr-3 hover:text-white"
                    >
                        <FaArrowLeft size={20} />
                    </button>
                    <img src={youtubeLogo} alt="YouTube" className="w-8 h-8 mr-2" />
                    <span className="text-white text-2xl font-medium">PlayTube</span>
                </div>

                {/* Step 1: Email */}
                {step === 1 && (
                    <>
                        <h1 className="text-3xl font-normal text-white mb-2">Sign in</h1>
                        <p className="text-gray-400 text-sm mb-6">
                            with your Account to continue to PlayTube.
                        </p>

                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="Email"
                            required
                            className="w-full bg-transparent border border-gray-500 rounded-md px-3 py-3 text-white focus:outline-none focus:border-blue-500"
                        />

                        <div className="flex justify-between items-center mt-10">
                            <button className="text-blue-400 text-sm hover:underline" onClick={()=>navigate("/signup")}>
                                Create account
                            </button>
                            <button
                                onClick={handleNext}
                                className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-full"
                            >
                                Next
                            </button>
                        </div>
                    </>
                )}

                {/* Step 2: Password */}
                {step === 2 && (
                    <>
                        <h1 className="text-3xl font-normal text-white mb-6">Welcome</h1>

                        <div className="flex items-center bg-[#3c4043] text-white px-3 py-2 rounded-full w-fit mb-6">
                            <FaUserCircle className="mr-2" size={20} />
                            {email}
                        </div>

                        <input
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter your password"
                            required
                            className="w-full bg-transparent border border-gray-500 rounded-md px-3 py-3 text-white focus:outline-none focus:border-blue-500"
                        />

                        <div className="flex items-center mt-3 space-x-2">
                            <input
                                type="checkbox"
                                id="showPassword"
                                checked={showPassword}
                                onChange={(e) => setShowPassword(e.target.checked)}
                                className="accent-blue-500"
                            />
                            <label htmlFor="showPassword" className="text-gray-400 text-sm">
                                Show password
                            </label>
                        </div>

                        <div className="flex justify-between mt-10">
                            <button className="text-blue-400 text-sm hover:underline" onClick={()=>navigate("/forgetpassword")}>
                                Forgot password?
                            </button>
                            <button
                                
                                className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-full"
                                onClick={handleSignIn}
                            >
                              {loading ? <ClipLoader size={20} color="white"/>: " SignIn"}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

export default YoutubeSignin;
