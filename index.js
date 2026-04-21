const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

const requiredEnv = ["MONGO_URI"];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);

if (missingEnv.length > 0) {
  console.error(`Missing required env variables: ${missingEnv.join(", ")}`);
  process.exit(1);
}

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("CORS blocked for this origin"));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })
);
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));
const appointmentRoutes = require("./routes/appointmentRoutes");
const materialRoutes = require("./routes/materialRoutes");
const whatsappWebhookRoutes = require("./routes/whatsappWebhookRoutes");
const whatsappRoutes = require("./routes/whatsappRoutes");

app.use("/api/appointments", appointmentRoutes);
app.use("/api/materials", materialRoutes);
app.use("/api/webhooks", whatsappWebhookRoutes);
app.use("/api/whatsapp", whatsappRoutes);
app.use("/uploads", express.static("uploads"));

app.use((err, req, res, next) => {
  if (err && err.type === "entity.too.large") {
    return res.status(413).json({
      error: "Image is too large. Please upload a smaller photo.",
    });
  }

  return next(err);
});

/* MongoDB Connection */
async function startServer() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log("MongoDB Connected");

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  }
}

/* Test Route */
app.get("/", (req, res) => {
  res.send("eNX Portal Server Running");
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    dbState: mongoose.connection.readyState,
    timestamp: new Date().toISOString(),
  });
});

startServer();
