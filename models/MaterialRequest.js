const mongoose = require("mongoose");

const materialItemSchema = new mongoose.Schema(
  {
    itemCode: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    uom: { type: String, default: "Number", trim: true },
    qty: { type: Number, required: true, min: 1 },
    receivedQty: { type: Number, default: 0, min: 0 },
    approxValue: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const materialAuditSchema = new mongoose.Schema(
  {
    action: { type: String, required: true, trim: true },
    actorRole: { type: String, default: "system", trim: true },
    actorName: { type: String, default: "system", trim: true },
    fromStatus: { type: String, default: "", trim: true },
    toStatus: { type: String, default: "", trim: true },
    remark: { type: String, default: "", trim: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const materialRequestSchema = new mongoose.Schema(
  {
    challanNumber: { type: String, required: true, trim: true },
    materialType: { type: String, required: true, trim: true },
    requestDate: { type: String, required: true, trim: true },
    requestBy: { type: String, required: true, trim: true },
    department: { type: String, required: true, trim: true },
    mobileExtension: { type: String, default: "", trim: true },
    outFrom: { type: String, default: "", trim: true },
    description: { type: String, default: "", trim: true },

    supplierName: { type: String, required: true, trim: true },
    supplierAddress: { type: String, default: "", trim: true },
    gstNo: { type: String, default: "", trim: true },
    contactPerson: { type: String, default: "", trim: true },
    contactNo: { type: String, default: "", trim: true },

    modeOfTransport: { type: String, default: "", trim: true },
    visitorCompany: { type: String, default: "", trim: true },
    visitorName: { type: String, default: "", trim: true },

    items: {
      type: [materialItemSchema],
      default: [],
    },

    auditTrail: {
      type: [materialAuditSchema],
      default: [],
    },

    status: {
      type: String,
      enum: [
        "Pending Admin Approval",
        "Pending at Security",
        "Outward Cleared",
        "Returned Inward",
        "Exception - Partial Return",
        "Exception - Damaged Return",
        "Exception - Not Returned",
        "Closed",
        "Rejected by Admin",
      ],
      default: "Pending at Security",
    },

    adminApprovedBy: { type: String, default: null, trim: true },
    adminApprovedAt: { type: Date, default: null },
    adminRejectedBy: { type: String, default: null, trim: true },
    adminRejectedAt: { type: Date, default: null },
    adminRemark: { type: String, default: "", trim: true },

    inwardSlaHours: { type: Number, default: 48, min: 1 },
    inwardDueAt: { type: Date, default: null },
    isEscalated: { type: Boolean, default: false },
    escalatedAt: { type: Date, default: null },
    escalatedBy: { type: String, default: null, trim: true },
    escalationRemark: { type: String, default: "", trim: true },

    exceptionType: { type: String, default: "", trim: true },
    exceptionRaisedAt: { type: Date, default: null },
    exceptionRaisedBy: { type: String, default: null, trim: true },
    exceptionRemark: { type: String, default: "", trim: true },
    exceptionResolvedAt: { type: Date, default: null },
    exceptionResolvedBy: { type: String, default: null, trim: true },
    exceptionResolutionRemark: { type: String, default: "", trim: true },

    outwardClearedBy: { type: String, default: null, trim: true },
    outwardClearedAt: { type: Date, default: null },
    inwardProcessedBy: { type: String, default: null, trim: true },
    inwardProcessedAt: { type: Date, default: null },
    employeeReceivedBy: { type: String, default: null, trim: true },
    employeeReceivedAt: { type: Date, default: null },

    createdBy: { type: String, default: null, trim: true },
    createdByRole: { type: String, default: null, trim: true },
  },
  { timestamps: true }
);

materialRequestSchema.index({ challanNumber: 1 }, { unique: true, sparse: true });
materialRequestSchema.index({ createdAt: -1 });

module.exports = mongoose.model("MaterialRequest", materialRequestSchema);
