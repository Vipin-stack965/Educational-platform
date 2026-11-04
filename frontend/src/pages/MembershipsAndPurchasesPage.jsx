import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { FaCreditCard } from "react-icons/fa";
import { useSelector } from "react-redux";
import { serverUrl } from "../config";

const api = `${serverUrl}/api/payments`;
const digitsFor = (currency) => ({
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  JPY: 0, KRW: 0, VND: 0,
}[currency] ?? 2);

const formatPrice = (minor, currency) => {
  const amount = Number(minor) / (10 ** digitsFor(currency));
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(digitsFor(currency))}`;
  }
};

const dateText = (date) => date ? new Date(date).toLocaleString() : "Not available";

const loadCheckout = () => new Promise((resolve, reject) => {
  if (window.Razorpay) return resolve();
  const script = document.createElement("script");
  script.src = "https://checkout.razorpay.com/v1/checkout.js";
  script.onload = () => resolve();
  script.onerror = () => reject(new Error("Razorpay Checkout could not be loaded."));
  document.body.appendChild(script);
});

const MembershipsAndPurchasesPage = () => {
  const userData = useSelector((state) => state.user.userData);
  const [config, setConfig] = useState({ enabled: false, keyId: "", currencies: ["INR"] });
  const [offers, setOffers] = useState([]);
  const [history, setHistory] = useState({ transactions: [], memberships: [] });
  const [platformHistory, setPlatformHistory] = useState({ purchases: [], memberships: [] });
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const [paymentConfig, catalog, purchases, platformPurchases] = await Promise.all([
      axios.get(`${api}/config`),
      axios.get(`${api}/offerings`),
      axios.get(`${api}/history`, { withCredentials: true }),
      axios.get(`${api}/platform-history`, { withCredentials: true }),
    ]);
    setConfig(paymentConfig.data);
    setOffers(catalog.data);
    setHistory(purchases.data);
    setPlatformHistory(platformPurchases.data);
  }, []);

  useEffect(() => {
    refresh().catch((requestError) => {
      setError(requestError.response?.data?.message || "Unable to load payment information.");
    });
  }, [refresh]);

  const cancelMembership = async (membership, platform = false) => {
    if (!window.confirm("Cancel this membership at the end of the current billing period?")) return;
    setBusy(String(membership.id));
    setError("");
    setMessage("");
    try {
      const path = platform
        ? `${api}/platform-memberships/${membership.id}/cancel`
        : `${api}/memberships/${membership.id}/cancel`;
      const response = await axios.post(path, {}, { withCredentials: true });
      setMessage(response.data.message);
      await refresh();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to cancel this membership.");
    } finally {
      setBusy("");
    }
  };

  const checkout = async (offer) => {
    setBusy(String(offer.id));
    setError("");
    setMessage("");
    try {
      if (!config.enabled || !config.keyId) throw new Error("Razorpay is not configured for this platform yet.");
      await loadCheckout();
      const isSubscription = offer.billingType === "subscription";
      const response = await axios.post(
        `${api}/${isSubscription ? "platform-subscriptions" : "platform-orders"}`,
        { offeringId: offer.id },
        { withCredentials: true },
      );
      const checkoutData = response.data;
      const options = {
        key: checkoutData.keyId || config.keyId,
        name: checkoutData.name || "EduTube",
        description: checkoutData.description || offer.title,
        ...(isSubscription
          ? { subscription_id: checkoutData.subscriptionId }
          : { order_id: checkoutData.orderId, amount: checkoutData.amount, currency: checkoutData.currency }),
        prefill: { email: userData?.email || "" },
        theme: { color: "#2563eb" },
        handler: async (result) => {
          setBusy(String(offer.id));
          try {
            const body = isSubscription
              ? {
                  subscriptionId: result.razorpay_subscription_id,
                  paymentId: result.razorpay_payment_id,
                  signature: result.razorpay_signature,
                }
              : {
                  orderId: result.razorpay_order_id,
                  paymentId: result.razorpay_payment_id,
                  signature: result.razorpay_signature,
                };
            const verification = await axios.post(
              `${api}/${isSubscription ? "verify-platform-subscription" : "verify-platform-order"}`,
              body,
              { withCredentials: true },
            );
            setMessage(verification.data.message || "Offer activated.");
            await refresh();
          } catch (verifyError) {
            setError(verifyError.response?.data?.message || "Payment could not be confirmed. Check your purchase history before retrying.");
          } finally {
            setBusy("");
          }
        },
        modal: { ondismiss: () => setBusy("") },
      };
      const paymentWindow = new window.Razorpay(options);
      paymentWindow.on("payment.failed", (failure) => {
        setError(failure.error?.description || "Payment was not completed.");
        setBusy("");
      });
      paymentWindow.open();
      setBusy("");
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || "Unable to start checkout.");
      setBusy("");
    }
  };

  const adFreePurchases = platformHistory.purchases.filter((purchase) => purchase.status === "paid");
  const adFreeMemberships = platformHistory.memberships;

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-5xl flex-col px-5 py-10 text-white sm:px-6">
      <h1 className="text-3xl font-bold">Memberships &amp; purchases</h1>
      <p className="mt-2 text-gray-400">
        Choose an available EduTube plan or account/channel offer. Purchases apply to the selected scope and validity period, not to an individual video.
      </p>
      <p className="mt-2 text-sm text-amber-200">
        EduTube ad serving is not connected yet. Your purchase records timed ad-free access for the selected scope, ready for the ad provider integration.
      </p>
      {!config.enabled && (
        <p className="mt-5 rounded-xl border border-amber-700 bg-amber-950/40 p-4 text-sm text-amber-200">
          Checkout is unavailable until the platform configures its Razorpay merchant credentials.
        </p>
      )}
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-950/60 p-3 text-sm text-red-200">{error}</p>}
      {message && <p role="status" className="mt-4 rounded-lg bg-green-950/60 p-3 text-sm text-green-200">{message}</p>}

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Available offers</h2>
        {offers.length ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {offers.map((offer) => {
              const isSubscription = offer.billingType === "subscription";
              const planTitle = {
                individual: "Individual",
                student: "Student",
              }[offer.planType];
              return (
                <article key={offer.id} className={`rounded-2xl border bg-[#181818] p-5 ${planTitle ? "border-blue-500/60" : "border-gray-700"}`}>
                  <p className="text-xs uppercase tracking-wide text-blue-300">
                    {planTitle || (offer.scope === "account" ? "Account-wide" : `Channel · ${offer.channelName || "EduTube channel"}`)}
                    {" · "}{isSubscription ? `${offer.interval} plan` : `Prepaid · ${offer.durationDays} days`}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold">{planTitle || offer.title}</h3>
                  <p className="mt-2 min-h-10 text-sm text-gray-400">
                    {offer.planType === "student"
                      ? "Available to every EduTube user. The plan applies to the purchasing account."
                      : offer.description || "Access applies to the purchasing EduTube account."}
                  </p>
                  {offer.planType === "student" && (
                    <p className="mt-2 text-xs text-gray-400">No separate student verification is required.</p>
                  )}
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <strong>
                      {formatPrice(offer.amount, offer.currency)}
                      {isSubscription ? ` / ${offer.interval === "yearly" ? "year" : "month"}` : ""}
                    </strong>
                    <button
                      type="button"
                      onClick={() => checkout(offer)}
                      disabled={Boolean(busy) || !config.enabled}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busy === String(offer.id) ? "Working…" : isSubscription ? "Join" : "Buy"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-gray-700 bg-[#181818] p-6 text-sm text-gray-400">
            No active EduTube offers are available right now.
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="flex items-center gap-2 text-xl font-semibold"><FaCreditCard aria-hidden="true" /> Your EduTube offers</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {adFreeMemberships.map((membership) => {
            const expired = membership.currentPeriodEnd && new Date(membership.currentPeriodEnd) <= new Date();
            const active = membership.status === "active" && !expired;
            return (
              <article key={membership.id} className="rounded-xl border border-gray-700 bg-[#181818] p-4">
                <div className="flex items-center justify-between gap-3">
                  <strong>{membership.title}{membership.channelName ? ` · ${membership.channelName}` : ""}</strong>
                  <span className="capitalize text-sm text-gray-300">{expired ? "expired" : membership.status}</span>
                </div>
                <p className="mt-2 text-sm text-gray-400">
                  {membership.scope === "account" ? "All channels" : membership.channelName || "Selected channel"}
                  {" · "}
                  {formatPrice(membership.amount, membership.currency)} / {membership.interval || "billing period"}
                  {membership.currentPeriodEnd ? ` · access until ${dateText(membership.currentPeriodEnd)}` : ""}
                </p>
                {active && !membership.cancelAtPeriodEnd && (
                  <button
                    type="button"
                    onClick={() => cancelMembership(membership, true)}
                    disabled={Boolean(busy)}
                    className="mt-3 rounded-lg border border-gray-600 px-3 py-2 text-sm hover:bg-gray-700 disabled:opacity-50"
                  >
                    {busy === String(membership.id) ? "Cancelling…" : "Cancel membership"}
                  </button>
                )}
                {membership.cancelAtPeriodEnd && <p className="mt-2 text-sm text-amber-200">Cancellation scheduled; access continues until the current period ends.</p>}
              </article>
            );
          })}
          {adFreePurchases.map((purchase) => {
            const expired = purchase.validUntil && new Date(purchase.validUntil) <= new Date();
            return (
              <article key={purchase.id} className="rounded-xl border border-gray-700 bg-[#181818] p-4">
                <div className="flex items-center justify-between gap-3">
                  <strong>{purchase.title}{purchase.channelName ? ` · ${purchase.channelName}` : ""}</strong>
                  <span className={`text-sm ${expired ? "text-gray-400" : "text-green-300"}`}>{expired ? "Expired" : "Active"}</span>
                </div>
                <p className="mt-2 text-sm text-gray-400">
                  {purchase.scope === "account" ? "All channels" : purchase.channelName || "Selected channel"}
                  {" · "}
                  {formatPrice(purchase.amount, purchase.currency)}
                  {" · "}
                  {purchase.validUntil ? `access until ${dateText(purchase.validUntil)}` : "validity unavailable"}
                </p>
              </article>
            );
          })}
          {!adFreeMemberships.length && !adFreePurchases.length && (
            <p className="text-sm text-gray-400">You have not purchased any EduTube offers yet.</p>
          )}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Previous content purchases and channel memberships</h2>
        <p className="mt-1 text-sm text-gray-400">Earlier purchases remain in your history and keep their original video-access rules.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {history.memberships.map((membership) => (
            <article key={membership.id} className="rounded-xl border border-gray-700 bg-[#181818] p-4">
              <div className="flex items-center justify-between gap-3">
                <strong>{membership.title}{membership.channelName ? ` · ${membership.channelName}` : ""}</strong>
                <span className="capitalize text-sm text-gray-300">{membership.status}</span>
              </div>
              <p className="mt-2 text-sm text-gray-400">
                {formatPrice(membership.amount, membership.currency)} / {membership.interval || "billing period"}
                {membership.currentPeriodEnd ? ` · ${membership.cancelAtPeriodEnd ? "ends" : "renews"} ${dateText(membership.currentPeriodEnd)}` : ""}
              </p>
              {membership.status === "active" && !membership.cancelAtPeriodEnd && (
                <button
                  type="button"
                  onClick={() => cancelMembership(membership)}
                  disabled={Boolean(busy)}
                  className="mt-3 rounded-lg border border-gray-600 px-3 py-2 text-sm hover:bg-gray-700 disabled:opacity-50"
                >
                  {busy === String(membership.id) ? "Cancelling…" : "Cancel membership"}
                </button>
              )}
            </article>
          ))}
          {history.transactions.map((transaction) => (
            <article key={transaction.id} className="rounded-xl border border-gray-700 bg-[#181818] p-4">
              <div className="flex items-center justify-between gap-3">
                <strong>{transaction.title}{transaction.channelName ? ` · ${transaction.channelName}` : ""}</strong>
                <span className="capitalize text-sm text-gray-300">{transaction.status}</span>
              </div>
              <p className="mt-2 text-sm text-gray-400">
                {formatPrice(transaction.amount, transaction.currency)} · {dateText(transaction.paidAt || transaction.createdAt)}
              </p>
            </article>
          ))}
          {!history.memberships.length && !history.transactions.length && (
            <p className="text-sm text-gray-400">No previous content purchases or channel memberships.</p>
          )}
        </div>
      </section>
    </main>
  );
};

export default MembershipsAndPurchasesPage;
