const mongoose = require("mongoose");

const passPageSchema = new mongoose.Schema(
  {
    passPageId: {
      type: String,
      required: true,
      unique: true,
    },
    appointmentId: {
      type: String,
      required: true,
    },
    visitorName: String,
    company: String,
    date: String,
    time: String,
    qrCode: String,
    status: {
      type: String,
      default: "Active",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PassPage", passPageSchema);