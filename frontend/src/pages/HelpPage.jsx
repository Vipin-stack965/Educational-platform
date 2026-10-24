import React, { useEffect, useState } from "react";
import { FaArrowLeft, FaEnvelope } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { serverUrl } from "../config";

function HelpPage() {
  const navigate = useNavigate();
  const [supportEmail, setSupportEmail] = useState("");
  const [supportError, setSupportError] = useState("");

  useEffect(() => {
    axios.get(`${serverUrl}/api/user/help`)
      .then(({ data }) => setSupportEmail(data.supportEmail || ""))
      .catch((error) => {
        console.error("Could not load support contact:", error);
        setSupportError(error.response?.data?.message || "Could not load the support contact.");
      });
  }, []);

  return (
    <section className="mx-auto min-h-screen w-full max-w-4xl px-4 py-8 text-white sm:px-6">
      <button type="button" onClick={() => navigate(-1)} className="mb-5 flex items-center gap-2 rounded-lg px-3 py-2 text-gray-300 hover:bg-[#272727]">
        <FaArrowLeft aria-hidden="true" /> Back
      </button>
      <h1 className="mb-2 text-3xl font-bold">Help</h1>
      <p className="mb-8 text-gray-400">Quick answers and ways to get support.</p>
      <div className="space-y-4">
        <details className="rounded-xl bg-[#212121] p-5" open>
          <summary className="cursor-pointer font-semibold">How do I create a channel?</summary>
          <p className="mt-3 text-sm text-gray-300">Open your profile menu, choose Create Channel, and complete the setup steps.</p>
        </details>
        <details className="rounded-xl bg-[#212121] p-5">
          <summary className="cursor-pointer font-semibold">How do I upload a video or short?</summary>
          <p className="mt-3 text-sm text-gray-300">Choose Create, select Upload Video or Create Short, add the required details, then publish.</p>
        </details>
        <details className="rounded-xl bg-[#212121] p-5">
          <summary className="cursor-pointer font-semibold">Where can I change appearance and privacy settings?</summary>
          <p className="mt-3 text-sm text-gray-300">Open Settings from the profile menu. Your preferences are saved to your account and follow you across devices.</p>
        </details>
      </div>
      <div className="mt-6 rounded-xl bg-[#212121] p-5">
        <h2 className="mb-2 font-semibold">Contact support</h2>
        {supportError ? (
          <p className="text-sm text-amber-300">{supportError}</p>
        ) : supportEmail ? (
          <a className="flex items-center gap-2 text-blue-400 hover:underline" href={`mailto:${supportEmail}`}>
            <FaEnvelope aria-hidden="true" /> {supportEmail}
          </a>
        ) : (
          <p className="text-sm text-amber-300">Support contact is not configured. Use Send feedback to report an issue.</p>
        )}
        <button type="button" onClick={() => navigate("/send-feedback")} className="mt-4 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700">
          Send feedback
        </button>
      </div>
    </section>
  );
}

export default HelpPage;
