const requireAccount = (req, res, next) => {
  if (req.isGuest) {
    return res.status(403).json({ message: "Create an account or sign in to use this feature" });
  }
  return next();
};

export default requireAccount;
