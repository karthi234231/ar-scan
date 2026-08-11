const express = require("express");
const router = express.Router();

// Admin login - placeholder
router.post("/login", (req, res) => {
  res.json({ message: "Login endpoint placeholder" });
});

module.exports = router;