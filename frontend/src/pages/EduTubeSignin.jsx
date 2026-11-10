import { t } from '../../utils/i18n.js';
import React, { useEffect, useState } from "react";
import brandLogo from "../assets/edutube-logo.svg";
import { FaArrowLeft, FaUserCircle } from "react-icons/fa";
import { showCustomAlert } from "../component/CustomAlert";
import { useNavigate } from "react-router-dom";
import { ClipLoader } from "react-spinners";
import axios from "axios";
import { serverUrl } from "../config";
import { useDispatch } from "react-redux";
import { setUserData } from "../redux/userSlice";
import { saveOfflineUser } from "../utils/offlineStorage";

function EduTubeSignin() {
    const [emailRecoveryToken] = useState(
      () => new URLSearchParams(window.location.search).get("channelUnblock") || "",
    );
    const [emailRecoveryExpiresAt] = useState(() => {
      const expiresAt = Number(new URLSearchParams(window.location.search).get("channelUnblockExpiresAt"));
      return Number.isFinite(expiresAt) && expiresAt > 0 ? expiresAt : null;
    });
    const [step, setStep] = useState(1);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading,setLoading] = useState(false)
    const [unblockToken, setUnblockToken] = useState("");
    const [unblockQuote, setUnblockQuote] = useState(null);
    const [acceptedUnblockTerms, setAcceptedUnblockTerms] = useState(false);
    const [unblockError, setUnblockError] = useState("");
    const [clockNow, setClockNow] = useState(Date.now());
    const navigate = useNavigate();

    const dispatch= useDispatch()

    useEffect(() => {
      if (!emailRecoveryToken) return undefined;
      const recoveryUrl = new URLSearchParams({ channelUnblock: emailRecoveryToken });
      if (emailRecoveryExpiresAt) recoveryUrl.set("channelUnblockExpiresAt", String(emailRecoveryExpiresAt));
      navigate(`/memberships-and-purchases/unblock?${recoveryUrl.toString()}`, { replace: true });
      return undefined;
    }, [emailRecoveryToken, emailRecoveryExpiresAt, navigate]);

    useEffect(() => {
      if (!emailRecoveryExpiresAt) return undefined;
      const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
      return () => window.clearInterval(timer);
    }, [emailRecoveryExpiresAt]);

    const recoverySecondsRemaining = emailRecoveryExpiresAt
      ? Math.max(0, Math.ceil((emailRecoveryExpiresAt - clockNow) / 1000))
      : null;
    const handleSubmit = (event) => {
      event.preventDefault()
      if (loading) return
      if (step === 1) {
        handleNext()
      } else {
        handleSignIn()
      }
    }

    const handleSignIn = async () => {
      setLoading(true)
      try {
          const result = await axios.post(serverUrl + "/api/auth/signin", { email: email.trim(), password }, { withCredentials: true })
          saveOfflineUser(result.data)
          navigate("/")
          dispatch(setUserData(result.data))
          showCustomAlert(t("SignIn Successfully "))
      } catch (error) {
          const blockedToken = error.response?.data?.unblockToken;
          if (blockedToken) {
            const recoveryUrl = new URLSearchParams({ channelUnblock: blockedToken });
            navigate(`/memberships-and-purchases/unblock?${recoveryUrl.toString()}`);
          } else {
            showCustomAlert(error.response?.data?.message || "Unable to connect to the server. Please try again.")
          }
      } finally {
          setLoading(false)
      }
    }
    const handlePaidUnblock = async () => {
      if (!acceptedUnblockTerms || loading) return;
      if (emailRecoveryExpiresAt && Date.now() >= emailRecoveryExpiresAt) {
        setUnblockError("This recovery QR code has expired. Sign in again to request a new recovery session.");
        return;
      }
      setLoading(true);
      setUnblockError("");
      try {
        const orderResponse = await axios.post(
          serverUrl + "/api/auth/channel-unblock/order",
          { unblockToken, acceptedTerms: true },
          { withCredentials: true },
        );
        const checkoutScript = await new Promise((resolve, reject) => {
          if (window.Razorpay) {
            resolve(true);
            return;
          }
          const script = document.createElement("script");
          script.src = "https://checkout.razorpay.com/v1/checkout.js";
          script.onload = () => resolve(true);
          script.onerror = () => reject(new Error("Razorpay checkout could not be loaded."));
          document.body.appendChild(script);
        });
        if (!checkoutScript || !window.Razorpay) throw new Error("Razorpay checkout is unavailable.");
        const checkout = new window.Razorpay({
          key: orderResponse.data.keyId,
          amount: orderResponse.data.amount,
          currency: orderResponse.data.currency,
          name: orderResponse.data.name,
          description: orderResponse.data.description,
          order_id: orderResponse.data.orderId,
          prefill: { email: email.trim() },
          handler: async (paymentResponse) => {
            try {
              await axios.post(
                serverUrl + "/api/auth/channel-unblock/verify",
                {
                  unblockToken,
                  orderId: paymentResponse.razorpay_order_id,
                  paymentId: paymentResponse.razorpay_payment_id,
                  signature: paymentResponse.razorpay_signature,
                },
                { withCredentials: true },
              );
              setUnblockToken("");
              setUnblockQuote(null);
              setAcceptedUnblockTerms(false);
              setStep(1);
              setPassword("");
              showCustomAlert("Payment confirmed. Your channel is unblocked. Sign in again to continue.");
            } catch (verifyError) {
              setUnblockError(verifyError.response?.data?.message || "Payment verification failed. Contact EduTube support before retrying.");
            } finally {
              setLoading(false);
            }
          },
          modal: {
            ondismiss: () => setLoading(false),
          },
          theme: { color: "#3b82f6" },
        });
        checkout.on("payment.failed", (paymentError) => {
          setLoading(false);
          setUnblockError(paymentError.error?.description || "Payment was not completed.");
        });
        checkout.open();
      } catch (error) {
        setLoading(false);
        setUnblockError(error.response?.data?.message || error.message || "Unable to start unblock payment.");
      }
    };

    if (unblockToken) {
      const displayedFee = unblockQuote
        ? new Intl.NumberFormat(undefined, { style: "currency", currency: unblockQuote.currency }).format(unblockQuote.amountMajor)
        : "";
      return (
        <div className="flex items-center justify-center min-h-screen bg-[#181818] px-4">
          <section className="bg-[#202124] rounded-2xl p-8 w-full max-w-lg shadow-lg text-white">
            <div className="flex items-center mb-6">
              <button type="button" onClick={() => { setUnblockToken(""); setUnblockQuote(null); }} className="text-gray-300 mr-3 hover:text-white">
                <FaArrowLeft size={20} />
              </button>
              <img src={brandLogo} alt={t("EduTube")} className="w-8 h-8 mr-2" />
              <span className="text-2xl font-medium">{t("EduTube")}</span>
            </div>
            <h1 className="text-2xl mb-3">Permanently blocked channel</h1>
            <p className="text-gray-300 mb-4">
              {unblockQuote?.channelName || "Your channel"} has five confirmed non-educational upload violations.
              One paid self-unblock is available. If this channel is permanently blocked again, it cannot be unblocked again.
            </p>
            <p className="text-xl font-bold mb-4">
              {unblockQuote ? displayedFee : "Calculating country-based fee…"}
            </p>
            {recoverySecondsRemaining !== null && (
              <p className={`text-sm mb-4 ${recoverySecondsRemaining === 0 ? "text-red-300" : "text-amber-200"}`}>
                {recoverySecondsRemaining > 0
                    ? `Complete payment within ${Math.floor(recoverySecondsRemaining / 60)}:${String(recoverySecondsRemaining % 60).padStart(2, "0")}. This recovery QR then expires.`
                  : "This emailed recovery QR has expired. Sign in again to request a new recovery session."}
              </p>
            )}
            {unblockQuote && (
              <p className="text-gray-400 text-sm mb-5">
                Converted from {new Intl.NumberFormat(undefined, { style: "currency", currency: "INR" }).format(unblockQuote.baseAmount)} INR using the latest available exchange rate.
              </p>
            )}
            <label className="flex items-start gap-3 text-sm text-gray-300 mb-5">
              <input
                type="checkbox"
                checked={acceptedUnblockTerms}
                onChange={(event) => setAcceptedUnblockTerms(event.target.checked)}
                className="mt-1 accent-blue-500"
              />
              <span>I agree to publish only content that is genuinely educational. I understand another permanent block cannot be self-unblocked, even by paying again.</span>
            </label>
            {unblockError && <p role="alert" className="text-red-300 text-sm mb-4">{unblockError}</p>}
            <button
              type="button"
              onClick={handlePaidUnblock}
              disabled={loading || !acceptedUnblockTerms || !unblockQuote || recoverySecondsRemaining === 0}
              className="w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-full font-semibold"
            >
              {loading ? "Please wait…" : "Accept terms and pay to unblock"}
            </button>
          </section>
        </div>
      );
    }
   const handleNext = () => {
    if (step === 1) {
      if (!email) {
        showCustomAlert(t("Please fill all fields"));
        return;
      }
    }
    if (step === 2) {
      if (!password) {
        showCustomAlert(t("Please fill password field"));
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
                        type="button"
                        onClick={() => step === 1 ? navigate("/") : setStep(step - 1)}
                        className="text-gray-300 mr-3 hover:text-white"
                    >
                        <FaArrowLeft size={20} />
                    </button>
                    <img src={brandLogo} alt={t("EduTube")} className="w-8 h-8 mr-2" />
                    <span className="text-white text-2xl font-medium">{t("EduTube")}</span>
                </div>

                <form onSubmit={handleSubmit}>
                {/* Step 1: Email */}
                {step === 1 && (
                    <>
                        <h1 className="text-3xl font-normal text-white mb-2">{t("Sign in")}</h1>
                        <p className="text-gray-400 text-sm mb-6">{t("\n                            with your Account to continue to EduTube.\n                        ")}</p>

                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder={t("Email")}
                            required
                            className="w-full bg-transparent border border-gray-500 rounded-md px-3 py-3 text-white focus:outline-none focus:border-blue-500"
                        />

                        <div className="flex justify-between items-center mt-10">
                            <button type="button" className="text-blue-400 text-sm hover:underline" onClick={()=>navigate("/signup")}>{t("\n                                Create account\n                            ")}</button>
                            <button
                                type="submit"
                                className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-full"
                            >{t("\n                                Next\n                            ")}</button>
                        </div>
                    </>
                )}

                {/* Step 2: Password */}
                {step === 2 && (
                    <>
                        <h1 className="text-3xl font-normal text-white mb-6">{t("Welcome")}</h1>

                        <div className="flex items-center bg-[#3c4043] text-white px-3 py-2 rounded-full w-fit mb-6">
                            <FaUserCircle className="mr-2" size={20} />
                            {email}
                        </div>

                        <input
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder={t("Enter your password")}
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
                            <label htmlFor="showPassword" className="text-gray-400 text-sm">{t("\n                                Show password\n                            ")}</label>
                        </div>

                        <div className="flex justify-between mt-10">
                            <button type="button" className="text-blue-400 text-sm hover:underline" onClick={()=>navigate("/forgetpassword")}>{t("\n                                Forgot password?\n                            ")}</button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-full"
                            >
                              {loading ? <ClipLoader size={20} color="white"/>: t(" SignIn")}
                            </button>
                        </div>
                    </>
                )}
                </form>
            </div>
        </div>
    );
}

export default EduTubeSignin;
