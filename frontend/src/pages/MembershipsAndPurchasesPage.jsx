import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { io } from "socket.io-client";
import { FaCreditCard } from "react-icons/fa";
import { serverUrl } from "../config";
import brandLogo from "../assets/edutube-logo.svg";
import "./MembershipsAndPurchasesPage.css";

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
const prepaidPlanTerms = [
  { durationDays: 365, months: 12, label: "12-month" },
  { durationDays: 90, months: 3, label: "3-month" },
  { durationDays: 30, months: 1, label: "1-month" },
];
const demoPlanPrices = {
  individual: {
    365: 149000,
    90: 45900,
    30: 15900,
  },
  student: {},
};

const demoOffer = ({ id, planType, title, amount, billingType, durationDays, interval }) => ({
  id,
  planType,
  title,
  description: "Demo price only. No payment will be taken.",
  scope: "account",
  billingType,
  durationDays,
  interval,
  amount,
  currency: "INR",
  demoOnly: true,
});

const MembershipsAndPurchasesPage = () => {
  const [config, setConfig] = useState({ enabled: false, keyId: "", currencies: ["INR"] });
  const [offers, setOffers] = useState([]);
  const [adminOffers, setAdminOffers] = useState(null);
  const [adminChannels, setAdminChannels] = useState([]);
  const [unblockBaseAmount, setUnblockBaseAmount] = useState("");
  const [unblockPriceBusy, setUnblockPriceBusy] = useState(false);
  const [customOfferForm, setCustomOfferForm] = useState({
    title: "",
    description: "",
    scope: "account",
    channelId: "",
    billingType: "one-time",
    durationDays: "30",
    interval: "monthly",
    amount: "",
    currency: "INR",
  });
  const [history, setHistory] = useState({ transactions: [], memberships: [] });
  const [platformHistory, setPlatformHistory] = useState({ purchases: [], memberships: [] });
  const [planChooserOpen, setPlanChooserOpen] = useState(false);
  const [planChooserType, setPlanChooserType] = useState("individual");
  const [selectedPlanOfferId, setSelectedPlanOfferId] = useState("");
  const [demoCheckoutOfferId, setDemoCheckoutOfferId] = useState("");
  const [demoPaymentMethod, setDemoPaymentMethod] = useState("upi");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [publishedPlanRefreshError, setPublishedPlanRefreshError] = useState("");
  const hasLoaded = useRef(false);

  const refresh = useCallback(async () => {
    if (!hasLoaded.current) setLoading(true);
    try {
      const [paymentConfig, catalog, purchases, platformPurchases, adminCatalog, adminChannelCatalog, unblockConfig] = await Promise.all([
        axios.get(`${api}/config`),
        axios.get(`${api}/offerings`),
        axios.get(`${api}/history`, { withCredentials: true }),
        axios.get(`${api}/platform-history`, { withCredentials: true }),
        axios.get(`${api}/admin/offers`, { withCredentials: true }).catch((requestError) => {
          if (requestError.response?.status === 403) return null;
          throw requestError;
        }),
        axios.get(`${api}/admin/channels`, { withCredentials: true }).catch((requestError) => {
          if (requestError.response?.status === 403) return null;
          throw requestError;
        }),
        axios.get(`${api}/admin/channel-unblock-config`, { withCredentials: true }).catch((requestError) => {
          if (requestError.response?.status === 403) return null;
          throw requestError;
        }),
      ]);
      setConfig(paymentConfig.data);
      setOffers(catalog.data);
      setAdminOffers(adminCatalog?.data.offers || null);
      setAdminChannels(adminChannelCatalog?.data.channels || []);
      if (unblockConfig) setUnblockBaseAmount(String(unblockConfig.data.baseAmount));
      setHistory(purchases.data);
      setPlatformHistory(platformPurchases.data);
      setError("");
      setPublishedPlanRefreshError("");
    } finally {
      hasLoaded.current = true;
      setLoading(false);
    }
  }, []);

  const refreshPublishedPlans = useCallback(async () => {
    const [paymentConfig, catalog] = await Promise.all([
      axios.get(`${api}/config`),
      axios.get(`${api}/offerings`),
    ]);
    setConfig(paymentConfig.data);
    setOffers(catalog.data);
    setPublishedPlanRefreshError("");
  }, []);

  useEffect(() => {
    refresh().catch((requestError) => {
      setError(requestError.response?.data?.message || "Unable to load payment information.");
    });
  }, [refresh]);

  useEffect(() => {
    const refreshIfReady = () => {
      if (!hasLoaded.current) return;
      refreshPublishedPlans().catch((requestError) => {
        setPublishedPlanRefreshError(
          requestError.response?.data?.message || "Unable to refresh published membership plans.",
        );
      });
    };
    const socket = io(serverUrl, { withCredentials: true });
    socket.on("live:payment-data-changed", refreshIfReady);
    socket.on("connect", refreshIfReady);
    socket.on("connect_error", (connectionError) => {
      console.error("EduTube live updates are unavailable:", connectionError.message);
    });
    window.addEventListener("focus", refreshIfReady);
    return () => {
      socket.off("live:payment-data-changed", refreshIfReady);
      socket.off("connect", refreshIfReady);
      socket.disconnect();
      window.removeEventListener("focus", refreshIfReady);
    };
  }, [refreshPublishedPlans]);

  useEffect(() => {
    if (!planChooserOpen && !demoCheckoutOfferId) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setPlanChooserOpen(false);
        setDemoCheckoutOfferId("");
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [planChooserOpen, demoCheckoutOfferId]);

  const retryRefresh = () => {
    hasLoaded.current = false;
    refresh().catch((requestError) => {
      setError(requestError.response?.data?.message || "Unable to load payment information.");
    });
  };

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

  const toggleOffer = async (offer) => {
    setBusy(String(offer.id));
    setError("");
    setMessage("");
    try {
      await axios.patch(`${api}/admin/offers/${offer.id}`, { active: !offer.active }, { withCredentials: true });
      setMessage(offer.active ? "Offer hidden." : "Offer published.");
      await refresh();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to update this offer.");
    } finally {
      setBusy("");
    }
  };

  const saveUnblockPricing = async (event) => {
    event.preventDefault();
    setUnblockPriceBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await axios.patch(
        `${api}/admin/channel-unblock-config`,
        { baseAmount: unblockBaseAmount },
        { withCredentials: true },
      );
      setUnblockBaseAmount(String(response.data.baseAmount));
      setMessage("Channel unblock fee saved.");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to save channel unblock fee.");
    } finally {
      setUnblockPriceBusy(false);
    }
  };

  const createCustomOffer = async (event) => {
    event.preventDefault();
    setBusy("creating-custom-offer");
    setError("");
    setMessage("");
    try {
      await axios.post(`${api}/admin/offers`, {
        ...customOfferForm,
        durationDays: customOfferForm.billingType === "one-time"
          ? Number(customOfferForm.durationDays)
          : undefined,
      }, { withCredentials: true });
      setMessage("Custom offer published.");
      setCustomOfferForm((current) => ({
        ...current,
        title: "",
        description: "",
        channelId: "",
        amount: "",
      }));
      await refresh();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to publish this offer.");
    } finally {
      setBusy("");
    }
  };

  const checkout = (offer) => {
    setError("");
    setMessage("");
    setDemoCheckoutOfferId(String(offer.id));
  };

  const adFreePurchases = platformHistory.purchases.filter((purchase) => purchase.status === "paid");
  const adFreeMemberships = platformHistory.memberships;
  const individualPrepaidOffers = prepaidPlanTerms.map((term) => ({
    ...term,
    offer: offers.find((offer) => (
      offer.planType === "individual" &&
      offer.scope === "account" &&
      offer.billingType === "one-time" &&
      offer.durationDays === term.durationDays
    )) || demoOffer({
      id: `demo-individual-prepaid-${term.durationDays}`,
      planType: "individual",
      title: `Individual ${term.months}-month prepaid`,
      amount: demoPlanPrices.individual[term.durationDays],
      billingType: "one-time",
      durationDays: term.durationDays,
    }),
  }));
  const studentPrepaidPlanOptions = prepaidPlanTerms.map((term) => ({
    ...term,
    offer: offers.find((offer) => (
      offer.planType === "student" &&
      offer.scope === "account" &&
      offer.billingType === "one-time" &&
      offer.durationDays === term.durationDays
    )),
  }));
  const selectablePlanOffers = planChooserType === "student"
    ? studentPrepaidPlanOptions.map(({ offer }) => offer).filter(Boolean)
    : individualPrepaidOffers.map(({ offer }) => offer).filter(Boolean);
  const selectedPlanOffer = selectablePlanOffers.find((offer) => String(offer.id) === selectedPlanOfferId);
  const demoCheckoutOffer = selectablePlanOffers.find((offer) => String(offer.id) === demoCheckoutOfferId) ||
    offers.find((offer) => String(offer.id) === demoCheckoutOfferId);
  const selectedIndividualOffer = selectedPlanOffer?.planType === "individual" &&
    selectedPlanOffer.scope === "account"
    ? selectedPlanOffer
    : null;
  const selectedStudentOffer = selectedPlanOffer?.planType === "student" &&
    selectedPlanOffer.scope === "account"
    ? selectedPlanOffer
    : null;
  const openPlanChooser = (planType) => {
    setPlanChooserType(planType);
    setSelectedPlanOfferId("");
    setPlanChooserOpen(true);
  };

  return (
    <main className="membership-page mx-auto flex min-h-[60vh] w-full max-w-6xl flex-col px-5 py-8 text-white sm:px-6">
      <section className="membership-hero">
        <div className="membership-hero-copy">
          <span className="membership-eyebrow">EDUTUBE MEMBERSHIPS</span>
          <h1>More of what you love, on your terms.</h1>
          <a className="membership-primary-link" href="#membership-plans">Explore plans <span aria-hidden="true">↓</span></a>
        </div>
        <div className="membership-hero-art" aria-hidden="true">
          <img className="membership-play-mark" src={brandLogo} alt="" />
          <span>YOUR WAY</span>
        </div>
      </section>

      <div className="membership-page-heading">
      </div>

      {error && (
        <div className="membership-alert membership-alert-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={retryRefresh} disabled={loading}>Try again</button>
        </div>
      )}
      {publishedPlanRefreshError && (
        <p className="membership-alert membership-alert-error" role="alert">
          {publishedPlanRefreshError}
        </p>
      )}
      {message && <p className="membership-alert membership-alert-success" role="status">{message}</p>}

      {planChooserOpen && (
        <div
          className="membership-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPlanChooserOpen(false);
          }}
        >
          <section className="membership-plan-dialog" role="dialog" aria-modal="true" aria-labelledby="membership-dialog-title">
            <header className="membership-dialog-header">
              <div>
                <p className="membership-eyebrow">EDUTUBE MEMBERSHIPS</p>
                <h2 id="membership-dialog-title">Choose {planChooserType === "student" ? "Student" : "Individual"} plan</h2>
                <p>Pick prepaid access or a monthly membership. Review the price before confirming.</p>
              </div>
              <button type="button" className="membership-dialog-close" aria-label="Close plan chooser" onClick={() => setPlanChooserOpen(false)}>×</button>
            </header>

            <div className="membership-dialog-content">
              <section className="membership-choice-section" aria-labelledby="prepaid-plans-title">
                <div className="membership-choice-heading">
                  <div>
                    <h3 id="prepaid-plans-title">Prepaid plans</h3>
                    <p>One-time payment. Doesn't automatically renew.</p>
                  </div>
                  <span className="membership-restrictions">Restrictions apply.</span>
                </div>
                <div className="membership-prepaid-options">
                  {(planChooserType === "student" ? studentPrepaidPlanOptions : individualPrepaidOffers).map(({ durationDays, label, months, offer }) => (
                    <button
                      type="button"
                      key={`${planChooserType}-${durationDays}`}
                      className={`membership-prepaid-option ${selectedPlanOfferId === String(offer?.id) ? "selected" : ""} ${months === 12 ? "best-value" : ""}`}
                      aria-pressed={selectedPlanOfferId === String(offer?.id)}
                      onClick={() => offer && setSelectedPlanOfferId(String(offer.id))}
                      disabled={!offer}
                    >
                      {months === 12 && <span className="membership-best-value">BEST VALUE</span>}
                      <span className="membership-prepaid-term">{planChooserType === "student" ? `${label} Student` : label}</span>
                      <strong>{offer ? formatPrice(offer.amount, offer.currency) : "Not available"}</strong>
                      <span className="membership-prepaid-caption">
                        {offer?.demoOnly ? "Demo price · no charge" : "One-time payment"}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

            </div>

            <footer className="membership-dialog-footer">
              <p>
                {selectedPlanOffer
                  ? `Selected: ${selectedPlanOffer.title} · ${formatPrice(selectedPlanOffer.amount, selectedPlanOffer.currency)}${selectedPlanOffer.billingType === "subscription" ? ` / ${selectedPlanOffer.interval}` : ` · ${selectedPlanOffer.durationDays} days`}`
                  : "Select one plan to continue."}
              </p>
              <span>Demo checkout only · no real payment.</span>
              <div>
                <button type="button" className="membership-cancel-button" onClick={() => setPlanChooserOpen(false)}>Cancel</button>
                <button
                  type="button"
                  className="membership-confirm-button"
                  disabled={!selectedPlanOffer || Boolean(busy)}
                  onClick={() => {
                    if (!selectedPlanOffer) return;
                    setPlanChooserOpen(false);
                    setDemoCheckoutOfferId(String(selectedPlanOffer.id));
                  }}
                >
                  {busy ? "Please wait…" : "Confirm"}
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}

      {demoCheckoutOffer && (
        <div className="membership-dialog-backdrop">
          <section className="membership-plan-dialog demo-checkout-dialog" role="dialog" aria-modal="true" aria-labelledby="demo-checkout-title">
            <header className="membership-dialog-header">
              <div>
                <p className="membership-eyebrow">DEMO · NO REAL PAYMENT</p>
                <h2 id="demo-checkout-title">Complete your demo checkout</h2>
                <p>This is a preview only. No payment details are collected and no membership is activated.</p>
              </div>
              <button type="button" className="membership-dialog-close" aria-label="Close demo checkout" onClick={() => setDemoCheckoutOfferId("")}>×</button>
            </header>
            <div className="membership-dialog-content">
              <div className="membership-demo-summary">
                <div>
                  <span>{demoCheckoutOffer.title}</span>
                  <strong>{formatPrice(demoCheckoutOffer.amount, demoCheckoutOffer.currency)}{demoCheckoutOffer.billingType === "subscription" ? ` / ${demoCheckoutOffer.interval}` : ` · ${demoCheckoutOffer.durationDays} days`}</strong>
                </div>
                <p>{demoCheckoutOffer.demoOnly ? "Sample price (admin has not published this plan)." : "Current price from the published Agent Panel offer."}</p>
              </div>
              <fieldset className="membership-demo-methods">
                <legend>Choose a demo payment method</legend>
                {[
                  ["upi", "UPI"],
                  ["card", "Credit or debit card"],
                  ["netbanking", "Net banking"],
                ].map(([method, label]) => (
                  <label key={method} className={demoPaymentMethod === method ? "selected" : ""}>
                    <input
                      type="radio"
                      name="demo-payment-method"
                      value={method}
                      checked={demoPaymentMethod === method}
                      onChange={() => setDemoPaymentMethod(method)}
                    />
                    <span>{label}</span>
                    <small>Demo only</small>
                  </label>
                ))}
              </fieldset>
            </div>
            <footer className="membership-dialog-footer">
              <p>No money will be charged.</p>
              <div>
                <button type="button" className="membership-cancel-button" onClick={() => setDemoCheckoutOfferId("")}>Back</button>
                <button
                  type="button"
                  className="membership-confirm-button"
                  onClick={() => {
                    setDemoCheckoutOfferId("");
                    setMessage("Demo checkout completed. No payment was made and no membership was activated.");
                  }}
                >
                  Complete demo checkout
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}

      <section className="membership-plans-section" id="membership-plans">
        <div className="membership-section-heading">
          <div>
            <h2>Available memberships</h2>
          </div>
        </div>

        {loading ? (
          <div className="membership-loading" role="status"><span className="membership-spinner" /> Loading plans and membership status…</div>
        ) : (
        <div className="membership-plan-grid">
            {[
              ["individual", "Individual"],
              ["student", "Student"],
            ].map(([planType, title]) => {
              const selectedCardOffer = planType === "individual"
                ? selectedIndividualOffer
                : selectedStudentOffer;
              const prepaidOptions = planType === "individual" ? individualPrepaidOffers : studentPrepaidPlanOptions;
              return (
                <article key={planType} className={`membership-plan-card ${planType === "individual" ? "membership-plan-featured" : ""} ${selectedCardOffer ? "membership-plan-selected" : ""}`}>
                  <div className="membership-plan-topline">
                    <span className="membership-plan-icon" aria-hidden="true">{planType === "individual" ? "◉" : "✦"}</span>
                    <span className="membership-plan-label">{planType === "individual" ? "MOST FLEXIBLE" : "SPECIAL PRICING"}</span>
                  </div>
                  <h3>{title}</h3>
                  <div className="membership-plan-price">
                    {prepaidOptions.map(({ durationDays, label, months, offer }) => (
                      <div
                        key={`${planType}-${durationDays}`}
                        className={`membership-price-choice ${selectedCardOffer?.durationDays === durationDays ? "is-selected" : ""}`}
                      >
                        <span>{planType === "student" ? `${months}-month Student` : label}</span>
                        <strong>{offer ? formatPrice(offer.amount, offer.currency) : "Not published"}</strong>
                      </div>
                    ))}
                  </div>
                  {selectedCardOffer?.demoOnly && (
                    <p className="membership-plan-description">Demo plan selection only. No payment will be taken.</p>
                  )}
                  {planType === "individual" ? (
                    <button
                      type="button"
                      onClick={() => openPlanChooser(planType)}
                      disabled={Boolean(busy)}
                      className="membership-buy-button"
                    >
                      Choose plan
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openPlanChooser(planType)}
                      disabled={Boolean(busy)}
                      className="membership-buy-button"
                    >
                      Choose plan
                    </button>
                  )}
                </article>
              );
            })}
        </div>
        )}
        {adminOffers !== null && (
        <div className="mt-5 rounded-2xl border border-gray-700 bg-[#181818] p-5 sm:p-6">
          <details className="mt-6 rounded-xl border border-gray-700 bg-[#202020] p-4">
            <summary className="cursor-pointer font-semibold text-blue-300">Create a custom account or channel offer</summary>
            <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={createCustomOffer}>
              <label className="text-sm text-gray-300">Offer title
                <input
                  required
                  maxLength="120"
                  value={customOfferForm.title}
                  onChange={(event) => setCustomOfferForm((current) => ({ ...current, title: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-600 bg-[#161616] px-3 py-2 text-white"
                />
              </label>
              <label className="text-sm text-gray-300">Price
                <input
                  required
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="any"
                  value={customOfferForm.amount}
                  onChange={(event) => setCustomOfferForm((current) => ({ ...current, amount: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-600 bg-[#161616] px-3 py-2 text-white"
                />
              </label>
              <label className="text-sm text-gray-300">Currency
                <select
                  value={customOfferForm.currency}
                  onChange={(event) => setCustomOfferForm((current) => ({ ...current, currency: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-600 bg-[#161616] px-3 py-2 text-white"
                >
                  {config.currencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                </select>
              </label>
              <label className="text-sm text-gray-300">Viewing scope
                <select
                  value={customOfferForm.scope}
                  onChange={(event) => setCustomOfferForm((current) => ({ ...current, scope: event.target.value, channelId: "" }))}
                  className="mt-1 w-full rounded-lg border border-gray-600 bg-[#161616] px-3 py-2 text-white"
                >
                  <option value="account">Entire user account · all channels</option>
                  <option value="channel">Selected channel only</option>
                </select>
              </label>
              {customOfferForm.scope === "channel" && (
                <label className="text-sm text-gray-300">Channel
                  <select
                    required
                    value={customOfferForm.channelId}
                    onChange={(event) => setCustomOfferForm((current) => ({ ...current, channelId: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-gray-600 bg-[#161616] px-3 py-2 text-white"
                  >
                    <option value="">Select a channel</option>
                    {adminChannels.map((channel) => <option key={channel._id} value={channel._id}>{channel.name}</option>)}
                  </select>
                </label>
              )}
              <label className="text-sm text-gray-300">Payment type
                <select
                  value={customOfferForm.billingType}
                  onChange={(event) => setCustomOfferForm((current) => ({ ...current, billingType: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-600 bg-[#161616] px-3 py-2 text-white"
                >
                  <option value="one-time">One-time purchase · fixed validity</option>
                  <option value="subscription">Recurring membership</option>
                </select>
              </label>
              {customOfferForm.billingType === "one-time" ? (
                <label className="text-sm text-gray-300">Validity in days
                  <input
                    required
                    type="number"
                    min="1"
                    max="3650"
                    step="1"
                    value={customOfferForm.durationDays}
                    onChange={(event) => setCustomOfferForm((current) => ({ ...current, durationDays: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-gray-600 bg-[#161616] px-3 py-2 text-white"
                  />
                </label>
              ) : (
                <label className="text-sm text-gray-300">Renewal interval
                  <select
                    value={customOfferForm.interval}
                    onChange={(event) => setCustomOfferForm((current) => ({ ...current, interval: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-gray-600 bg-[#161616] px-3 py-2 text-white"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </label>
              )}
              <label className="text-sm text-gray-300 sm:col-span-2">Offer details
                <textarea
                  rows="3"
                  maxLength="2000"
                  value={customOfferForm.description}
                  onChange={(event) => setCustomOfferForm((current) => ({ ...current, description: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-600 bg-[#161616] px-3 py-2 text-white"
                />
              </label>
              <button
                type="submit"
                disabled={Boolean(busy)}
                className="w-fit rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === "creating-custom-offer" ? "Publishing…" : "Publish offer"}
              </button>
            </form>
          </details>
          <div className="mt-6 border-t border-gray-700 pt-5">
            <h3 className="text-lg font-semibold">Published and unpublished offers</h3>
            <div className="mt-3 grid gap-3">
              {adminOffers.map((offer) => (
                <article key={offer.id} className="flex flex-col justify-between gap-3 rounded-lg border border-gray-700 bg-[#202020] p-3 sm:flex-row sm:items-center">
                  <div>
                    <strong>{offer.planType ? `${offer.planType === "student" ? "Student" : "Individual"} · ` : ""}{offer.title}</strong>
                    <p className="mt-1 text-sm text-gray-400">
                      {offer.scope === "account" ? "Account-wide" : `Channel · ${offer.channelName || "Unavailable channel"}`}
                      {" · "}{formatPrice(offer.amount, offer.currency)}
                      {offer.billingType === "subscription" ? ` / ${offer.interval}` : ` · ${offer.durationDays} days`}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <span className={`text-sm ${offer.retired ? "text-red-300" : offer.active ? "text-green-300" : "text-gray-400"}`}>
                      {offer.retired ? "Unavailable" : offer.active ? "Published" : "Hidden"}
                    </span>
                    {!offer.retired && (
                      <button
                        type="button"
                        onClick={() => toggleOffer(offer)}
                        disabled={Boolean(busy)}
                        className="rounded-lg border border-gray-600 px-3 py-2 text-sm hover:bg-gray-700 disabled:opacity-50"
                      >
                        {busy === String(offer.id) ? "Saving…" : offer.active ? "Hide offer" : "Publish"}
                      </button>
                    )}
                  </div>
                </article>
              ))}
              {!adminOffers.length && <p className="text-sm text-gray-400">No offers created yet.</p>}
            </div>
          </div>
        </div>
      )}
        {offers.some((offer) => !offer.planType) ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {offers.filter((offer) => !offer.planType).map((offer) => {
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
                      disabled={Boolean(busy)}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSubscription ? "Try demo checkout" : "Try demo purchase"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>

      {adminOffers !== null && (
        <form
          className="mt-8 grid gap-4 rounded-2xl border border-gray-700 bg-[#181818] p-5 sm:grid-cols-[minmax(0,1fr)_220px_auto] sm:items-end sm:p-6"
          onSubmit={saveUnblockPricing}
        >
          <div>
            <p className="membership-eyebrow">CHANNEL ACCESS</p>
            <h2 className="text-xl font-semibold">Set channel unblock fee</h2>
            <p className="mt-2 text-sm text-gray-400">
              Set the base amount EduTube charges when a channel owner requests an admin unblock.
            </p>
          </div>
          <label className="grid gap-2 text-sm text-gray-300">
            Base fee (INR)
            <input
              required
              type="number"
              min="1"
              max="1000000"
              step="0.01"
              value={unblockBaseAmount}
              onChange={(event) => setUnblockBaseAmount(event.target.value)}
              className="w-full rounded-lg border border-gray-600 bg-[#161616] px-3 py-2 text-white"
            />
          </label>
          <button
            type="submit"
            disabled={unblockPriceBusy || unblockBaseAmount === ""}
            className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {unblockPriceBusy ? "Saving…" : "Save fee"}
          </button>
        </form>
      )}

      <section className="membership-faq" aria-labelledby="membership-faq-title">
        <h2 id="membership-faq-title">Membership questions</h2>
        <details>
          <summary>How are plan prices and options decided?</summary>
          <p>The plan cards use the active prices and billing options configured for EduTube. The amount and billing period are shown before checkout.</p>
        </details>
        <details>
          <summary>What happens when I choose prepaid?</summary>
          <p>Prepaid offers are one-time purchases. Their account or channel access ends on the validity date shown on the offer.</p>
        </details>
        <details>
          <summary>Can I cancel a monthly membership?</summary>
          <p>You can schedule cancellation from your active membership below. Access continues until the current billing period ends.</p>
        </details>
        <details>
          <summary>Does this currently include offline downloads or background playback?</summary>
          <p>No. Those features are not part of EduTube memberships at this time. The page shows which account or channel access is recorded for each purchase.</p>
        </details>
      </section>

      <section className="membership-owned-section">
        <div className="membership-section-heading">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold"><FaCreditCard aria-hidden="true" /> Your memberships</h2>
          </div>
        </div>
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
