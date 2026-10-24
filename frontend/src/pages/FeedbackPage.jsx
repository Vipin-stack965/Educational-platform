import React, { useState } from "react";
import { FaArrowLeft } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { serverUrl } from "../config";
import { showCustomAlert } from "../component/CustomAlert";

function FeedbackPage() {
  const navigate = useNavigate();
  const [category, setCategory] = useState("general");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (!message.trim()) {
      showCustomAlert("Please enter your feedback.");
      return;
    }

    setLoading(true);
    try {
      const { data } = await axios.post(
        `${serverUrl}/api/user/feedback`,
        { category, message },
        { withCredentials: true }
      );
      showCustomAlert(data.message);
      setMessage("");
      navigate(-1);
    } catch (error) {
      showCustomAlert(error.response?.data?.message || "Could not submit feedback");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mx-auto min-h-screen w-full max-w-3xl px-4 py-8 text-white sm:px-6">
      <button type="button" onClick={() => navigate(-1)} className="mb-5 flex items-center gap-2 rounded-lg px-3 py-2 text-gray-300 hover:bg-[#272727]">
        <FaArrowLeft aria-hidden="true" /> Back
      </button>
      <h1 className="mb-2 text-3xl font-bold">Send feedback</h1>
      <p className="mb-6 text-gray-400">Your feedback is saved and sent to the configured support email.</p>
      <form onSubmit={submit} className="space-y-4 rounded-xl bg-[#212121] p-5">
        <label className="block">
          <span className="mb-2 block font-medium">Feedback type</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)} className="w-full rounded-lg border border-gray-600 bg-[#121212] p-3 text-white">
            <option value="general">General feedback</option>
            <option value="bug">Report a problem</option>
            <option value="feature">Suggest a feature</option>
            <option value="account">Account help</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-2 block font-medium">Your message</span>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={5000}
            rows={7}
            required
            placeholder="Tell us what happened or how we can improve..."
            className="w-full rounded-lg border border-gray-600 bg-[#121212] p-3 text-white"
          />
          <span className="mt-1 block text-right text-xs text-gray-400">{message.length}/5000</span>
        </label>
        <button type="submit" disabled={loading} className="rounded-lg bg-blue-600 px-5 py-3 font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {loading ? "Sending..." : "Submit feedback"}
        </button>
      </form>
    </section>
  );
}

export default FeedbackPage;
