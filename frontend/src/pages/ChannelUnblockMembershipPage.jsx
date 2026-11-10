import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { serverUrl } from "../config";

const api = `${serverUrl}/api/auth/channel-unblock`;

const formatPrice = (amount, currency) => new Intl.NumberFormat(undefined, {
  style: "currency",
  currency,
}).format(amount);

function ChannelUnblockMembershipPage() {
  const [unblockToken] = useState(() => new URLSearchParams(window.location.search).get("channelUnblock") || "");
  const [search, setSearch] = useState("");
  const [channels, setChannels] = useState([]);
  const [accountEmail, setAccountEmail] = useState("");
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [quote, setQuote] = useState(null);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [paying, setPaying] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const searchRequestId = useRef(0);

  useEffect(() => {
    if (!unblockToken) {
      setError("Sign in with the blocked channel owner account to find eligible channels.");
      return undefined;
    }

    const requestId = ++searchRequestId.current;
    const timer = window.setTimeout(async () => {
      setLoadingChannels(true);
      setError("");
      try {
        const response = await axios.post(`${api}/channels`, {
          unblockToken,
          search,
        });
        if (requestId !== searchRequestId.current) return;
        setChannels(response.data.channels);
        setAccountEmail(response.data.email);
        if (selectedChannel && !response.data.channels.some((channel) => channel.id === selectedChannel.id)) {
          setSelectedChannel(null);
          setQuote(null);
        }
      } catch (requestError) {
        if (requestId === searchRequestId.current) {
          setChannels([]);
          setError(requestError.response?.data?.message || "Unable to search eligible blocked channels.");
        }
      } finally {
        if (requestId === searchRequestId.current) setLoadingChannels(false);
      }
    }, 200);

    return () => window.clearTimeout(timer);
  }, [unblockToken, search, selectedChannel]);

  useEffect(() => {
    if (!unblockToken || !selectedChannel) {
      setQuote(null);
      return undefined;
    }
    let active = true;
    setLoadingQuote(true);
    setError("");
    axios.post(`${api}/quote`, { unblockToken, channelId: selectedChannel.id })
      .then((response) => {
        if (active) setQuote(response.data);
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.message || "Unable to calculate the channel unblock fee.");
      })
      .finally(() => {
        if (active) setLoadingQuote(false);
      });
    return () => { active = false; };
  }, [unblockToken, selectedChannel]);

  const startPayment = async () => {
    if (!unblockToken || !selectedChannel || !acceptedTerms || paying) return;
    setPaying(true);
    setError("");
    setMessage("");
    try {
      const orderResponse = await axios.post(`${api}/order`, {
        unblockToken,
        channelId: selectedChannel.id,
        acceptedTerms: true,
      });
      if (!window.Razorpay) {
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://checkout.razorpay.com/v1/checkout.js";
          script.onload = resolve;
          script.onerror = () => reject(new Error("Razorpay checkout could not be loaded."));
          document.body.appendChild(script);
        });
      }
      if (!window.Razorpay) throw new Error("Razorpay checkout is unavailable.");

      const checkout = new window.Razorpay({
        key: orderResponse.data.keyId,
        amount: orderResponse.data.amount,
        currency: orderResponse.data.currency,
        name: orderResponse.data.name,
        description: orderResponse.data.description,
        order_id: orderResponse.data.orderId,
        prefill: { email: accountEmail },
        handler: async (paymentResponse) => {
          try {
            await axios.post(`${api}/verify`, {
              unblockToken,
              channelId: selectedChannel.id,
              orderId: paymentResponse.razorpay_order_id,
              paymentId: paymentResponse.razorpay_payment_id,
              signature: paymentResponse.razorpay_signature,
            });
            setChannels((current) => current.filter((channel) => channel.id !== selectedChannel.id));
            setSelectedChannel(null);
            setQuote(null);
            setAcceptedTerms(false);
            setMessage("Payment confirmed. The channel is unblocked and removed from the blocked-channel list. Sign in again to continue.");
          } catch (verificationError) {
            setError(verificationError.response?.data?.message || "Payment verification failed. Contact EduTube support before retrying.");
          } finally {
            setPaying(false);
          }
        },
        modal: { ondismiss: () => setPaying(false) },
        theme: { color: "#3b82f6" },
      });
      checkout.on("payment.failed", (paymentError) => {
        setPaying(false);
        setError(paymentError.error?.description || "Payment was not completed.");
      });
      checkout.open();
    } catch (requestError) {
      setPaying(false);
      setError(requestError.response?.data?.message || requestError.message || "Unable to start channel unblock payment.");
    }
  };

  return (
    <main className="min-h-screen bg-[#0f0f0f] px-4 py-10 text-white sm:px-6">
      <section className="mx-auto w-full max-w-3xl">
        <Link to="/signin" className="text-sm text-blue-300 hover:text-blue-200">← Back to sign in</Link>
        <h1 className="mt-5 text-2xl font-semibold">Memberships &amp; purchases</h1>
        <section className="mt-6 rounded-2xl border border-gray-700 bg-[#181818] p-5 sm:p-6">
          <h2 className="text-xl font-semibold">Unblock your channel</h2>
          <p className="mt-2 text-sm text-gray-400">
            Search only channels owned by {accountEmail || "the signed-in account"}. Eligible permanently blocked channels can be unblocked once after verified payment.
          </p>
          <label className="mt-5 grid gap-2 text-sm text-gray-300">
            Search by channel name or account email
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSelectedChannel(null);
                setQuote(null);
                setSearch(event.target.value);
              }}
              placeholder="Enter channel name or email"
              className="w-full rounded-lg border border-gray-600 bg-[#161616] px-3 py-2 text-white"
            />
          </label>

          {loadingChannels ? (
            <p className="mt-4 text-sm text-gray-400">Searching eligible channels…</p>
          ) : channels.length ? (
            <div className="mt-4 grid gap-3">
              {channels.map((channel) => (
                <button
                  type="button"
                  key={channel.id}
                  onClick={() => {
                    setSelectedChannel(channel);
                    setAcceptedTerms(false);
                    setError("");
                  }}
                  className={`rounded-xl border p-4 text-left ${selectedChannel?.id === channel.id ? "border-blue-400 bg-blue-950/40" : "border-gray-700 bg-[#202020] hover:border-gray-500"}`}
                  aria-pressed={selectedChannel?.id === channel.id}
                >
                  <span className="block font-semibold">{channel.name}</span>
                  <span className="mt-1 block text-sm text-gray-400">{accountEmail}</span>
                  {channel.blockedAt && (
                    <span className="mt-1 block text-xs text-gray-500">
                      Blocked {new Date(channel.blockedAt).toLocaleDateString()}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-gray-400">
              {error ? "" : "No eligible blocked channels found for this account."}
            </p>
          )}

          {selectedChannel && (
            <div className="mt-5 rounded-xl border border-gray-700 bg-[#202020] p-4">
              <div className="flex items-center justify-between gap-4">
                <span className="text-gray-300">{selectedChannel.name} unblock fee</span>
                <strong className="text-lg">
                  {loadingQuote ? "Loading…" : quote ? formatPrice(quote.amountMajor, quote.currency) : "Unavailable"}
                </strong>
              </div>
              {quote && (
                <p className="mt-2 text-xs text-gray-400">
                  Converted from {formatPrice(quote.baseAmount, "INR")} INR using the latest available exchange rate.
                </p>
              )}
              <label className="mt-4 flex items-start gap-3 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(event) => setAcceptedTerms(event.target.checked)}
                  className="mt-1 accent-blue-500"
                />
                <span>I agree to publish only genuinely educational content. I understand this channel cannot be self-unblocked again if permanently blocked later.</span>
              </label>
              <button
                type="button"
                onClick={startPayment}
                disabled={paying || loadingQuote || !quote || !acceptedTerms}
                className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {paying ? "Opening payment…" : "Pay and unblock channel"}
              </button>
            </div>
          )}
          {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
          {message && (
            <div role="status" className="mt-4 rounded-lg border border-green-800 bg-green-950/40 p-3 text-sm text-green-200">
              {message} <Link to="/signin" className="underline">Sign in</Link>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

export default ChannelUnblockMembershipPage;
