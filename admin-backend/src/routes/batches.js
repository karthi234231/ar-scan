const express = require("express");
const router = express.Router();

// Batch CRUD - placeholders
router.get("/", (req, res) => {
  res.json({ message: "List batches placeholder" });
});

router.post("/", (req, res) => {
  res.json({ message: "Create batch placeholder" });
});

module.exports = router;