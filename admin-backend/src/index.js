const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static file serving for uploads
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Placeholder routes - to be implemented
app.use("/api/auth", require("./routes/auth"));
app.use("/api/batches", require("./routes/batches"));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Admin backend running on http://localhost:${PORT}`);
});