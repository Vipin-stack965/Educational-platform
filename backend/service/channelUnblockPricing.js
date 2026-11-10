import ChannelUnblockConfig from "../model/channelUnblockConfigModel.js";

const currencyDigits = (currency) => ({
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  JPY: 0, KRW: 0, VND: 0,
}[currency] ?? 2);

const allowedCurrencies = () => {
  const configured = process.env.RAZORPAY_ALLOWED_CURRENCIES
    ?.split(",").map((currency) => currency.trim().toUpperCase()).filter(Boolean);
  return configured?.length ? [...new Set(configured)] : ["INR"];
};

const fetchJson = async (url, label) => {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 8000);
  try {
    const response = await fetch(url, { signal: abortController.signal });
    if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}.`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
};

const currencyForCountry = async (countryCode) => {
  if (!countryCode) return "INR";
  const data = await fetchJson(
    `https://restcountries.com/v3.1/alpha/${encodeURIComponent(countryCode)}?fields=currencies`,
    "Country currency lookup",
  );
  const country = Array.isArray(data) ? data[0] : data;
  const currency = Object.keys(country?.currencies || {})[0];
  if (!currency) throw new Error(`No currency is configured for country ${countryCode}.`);
  return currency.toUpperCase();
};

const exchangeRateFromInr = async (currency) => {
  if (currency === "INR") return 1;
  const data = await fetchJson(
    "https://open.er-api.com/v6/latest/INR",
    "Currency conversion service",
  );
  const rate = data.result === "success" ? data.rates?.[currency] : null;
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
    throw new Error(`No live INR exchange rate is available for ${currency}.`);
  }
  return rate;
};

export const getChannelUnblockPrice = async (countryCode) => {
  const config = await ChannelUnblockConfig.findOne({ key: "channel-permanent-unblock" }).lean();
  if (!config?.baseAmount) {
    const error = new Error("Permanent channel unblock pricing has not been configured by an administrator.");
    error.status = 503;
    throw error;
  }
  const currency = await currencyForCountry(countryCode);
  if (!allowedCurrencies().includes(currency)) {
    const error = new Error(`EduTube payments are not enabled for ${currency}.`);
    error.status = 503;
    throw error;
  }
  const rate = await exchangeRateFromInr(currency);
  const majorAmount = (config.baseAmount / 100) * rate;
  const amount = Math.round(majorAmount * (10 ** currencyDigits(currency)));
  if (!Number.isSafeInteger(amount) || amount < 1) {
    throw new Error(`The converted unblock fee is invalid for ${currency}.`);
  }
  return {
    amount,
    currency,
    baseAmount: config.baseAmount,
    baseCurrency: "INR",
    exchangeRate: rate,
  };
};

export const toMajorCurrencyAmount = (amount, currency) => (
  amount / (10 ** currencyDigits(currency))
);
