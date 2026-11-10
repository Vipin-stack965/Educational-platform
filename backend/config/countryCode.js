const getCountryCode = (req) => {
  const headerName = (process.env.EDUTUBE_COUNTRY_HEADER || "cf-ipcountry").trim().toLowerCase();
  const suppliedCountry = req.get(headerName)?.trim().toUpperCase() || "";
  return /^[A-Z]{2}$/.test(suppliedCountry) && suppliedCountry !== "XX"
    ? suppliedCountry
    : undefined;
};

export default getCountryCode;
