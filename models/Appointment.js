const mongoose = require("mongoose");

const appointmentSchema = new mongoose.Schema(
  {
    appointmentId: {
      type: String,
      required: true,
      trim: true,
    },
    company: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    visitor: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    mobile: {
      type: String,
      required: true,
      trim: true,
      match: /^\+?[0-9]{10,15}$/,
    },
    purpose: {
      type: String,
      required: true,
      trim: true,
      maxlength: 250,
    },
    visitType: {
      type: String,
      required: true,
      trim: true,
    },
    movementType: {
      type: String,
      enum: ["visitor", "material", "courier"],
      default: "visitor",
      trim: true,
    },
    courierStatus: {
      type: String,
      enum: ["Pending", "Received"],
      default: "Pending",
      trim: true,
    },
    date: {
      type: String,
      required: true,
      trim: true,
    },
    time: {
      type: String,
      required: true,
      trim: true,
    },
    photo: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending",
    },
    qrCode: {
      type: String,
      default: null,
    },
    passPageId: {
      type: String,
      default: null,
      trim: true,
    },
    approvedBy: {
      type: String,
      default: null,
      trim: true,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    securityStatus: {
      type: String,
      enum: ["Not Checked", "In", "Out"],
      default: "Not Checked",
      trim: true,
    },
    securityCheckedAt: {
      type: Date,
      default: null,
    },
    securityInAt: {
      type: Date,
      default: null,
    },
    securityInTimeText: {
      type: String,
      default: null,
      trim: true,
    },
    securityOutAt: {
      type: Date,
      default: null,
    },
    securityOutTimeText: {
      type: String,
      default: null,
      trim: true,
    },
    securityCheckedBy: {
      type: String,
      default: null,
      trim: true,
    },
    createdBy: {
      type: String,
      default: null,
      trim: true,
    },
    createdByRole: {
      type: String,
      default: null,
      trim: true,
    },
  },
  { timestamps: true }
);

appointmentSchema.index({ appointmentId: 1 }, { unique: true, sparse: true });
appointmentSchema.index({ createdAt: -1 });


module.exports = mongoose.model("Appointment", appointmentSchema);
