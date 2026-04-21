const express = require("express");
const mongoose = require("mongoose");
const MaterialRequest = require("../models/MaterialRequest");

const router = express.Router();

const defaultSlaHours = Number(process.env.MATERIAL_INWARD_SLA_HOURS || 48);

function generateChallanNumber() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `R${yy}${mm}${dd}${rand}`;
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      itemCode: String(item.itemCode || "").trim(),
      description: String(item.description || "").trim(),
      uom: String(item.uom || "Number").trim(),
      qty: Number(item.qty || 0),
      receivedQty: Number(item.receivedQty || 0),
      approxValue: Number(item.approxValue || 0),
    }))
    .filter((item) => item.itemCode && item.description && item.qty > 0);
}

async function findMaterialByIdentifier(identifier) {
  if (mongoose.isValidObjectId(identifier)) {
    const byId = await MaterialRequest.findById(identifier);
    if (byId) return byId;
  }

  return MaterialRequest.findOne({ challanNumber: identifier });
}

function computeInwardDueAt(baseDate, slaHours) {
  const dueAt = new Date(baseDate);
  dueAt.setHours(dueAt.getHours() + Number(slaHours || defaultSlaHours));
  return dueAt;
}

function isOpenForInward(record) {
  return record.status === "Outward Cleared";
}

function isExceptionStatus(status) {
  return [
    "Exception - Partial Return",
    "Exception - Damaged Return",
    "Exception - Not Returned",
  ].includes(status);
}

function isOverdue(record) {
  return Boolean(record.inwardDueAt) && isOpenForInward(record) && new Date(record.inwardDueAt).getTime() < Date.now();
}

function appendAudit(record, entry) {
  if (!Array.isArray(record.auditTrail)) {
    record.auditTrail = [];
  }

  record.auditTrail.push({
    action: String(entry.action || "Action").trim(),
    actorRole: String(entry.actorRole || "system").trim(),
    actorName: String(entry.actorName || "system").trim(),
    fromStatus: String(entry.fromStatus || "").trim(),
    toStatus: String(entry.toStatus || "").trim(),
    remark: String(entry.remark || "").trim(),
    at: new Date(),
  });
}

router.post("/create", async (req, res) => {
  try {
    const items = normalizeItems(req.body.items);
    if (items.length === 0) {
      return res.status(400).json({ error: "At least one valid material row is required" });
    }

    const payload = {
      challanNumber: req.body.challanNumber || generateChallanNumber(),
      materialType: String(req.body.materialType || "").trim(),
      requestDate: String(req.body.requestDate || "").trim(),
      requestBy: String(req.body.requestBy || "").trim(),
      department: String(req.body.department || "").trim(),
      mobileExtension: String(req.body.mobileExtension || "").trim(),
      outFrom: String(req.body.outFrom || "").trim(),
      description: String(req.body.description || "").trim(),
      supplierName: String(req.body.supplierName || "").trim(),
      supplierAddress: String(req.body.supplierAddress || "").trim(),
      gstNo: String(req.body.gstNo || "").trim(),
      contactPerson: String(req.body.contactPerson || "").trim(),
      contactNo: String(req.body.contactNo || "").trim(),
      modeOfTransport: String(req.body.modeOfTransport || "").trim(),
      visitorCompany: String(req.body.visitorCompany || "").trim(),
      visitorName: String(req.body.visitorName || "").trim(),
      status: String(req.body.status || "Pending at Security").trim(),
      createdBy: req.body.createdBy || null,
      createdByRole: req.body.createdByRole || null,
      items,
    };

    const missing = ["materialType", "requestDate", "requestBy", "department", "supplierName"].filter(
      (field) => !payload[field]
    );

    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(", ")}` });
    }

    const doc = new MaterialRequest(payload);
    appendAudit(doc, {
      action: "Created Material Request",
      actorRole: payload.createdByRole || "employee",
      actorName: payload.createdBy || payload.requestBy || "employee",
      fromStatus: "",
      toStatus: payload.status,
      remark: payload.description || "",
    });
    const saved = await doc.save();

    return res.status(201).json({ message: "Material request created", id: saved._id, challanNumber: saved.challanNumber });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const data = await MaterialRequest.find().sort({ createdAt: -1 });
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get("/admin/sla/summary", async (req, res) => {
  try {
    const data = await MaterialRequest.find().sort({ createdAt: -1 });
    const outwardOpen = data.filter((row) => isOpenForInward(row));
    const overdueOpen = outwardOpen.filter((row) => isOverdue(row));
    const escalatedOpen = outwardOpen.filter((row) => row.isEscalated);
    const exceptionOpen = data.filter((row) => isExceptionStatus(row.status));

    return res.json({
      totalRequests: data.length,
      outwardOpen: outwardOpen.length,
      overdueOpen: overdueOpen.length,
      escalatedOpen: escalatedOpen.length,
      exceptionOpen: exceptionOpen.length,
      onTimeOpen: Math.max(0, outwardOpen.length - overdueOpen.length),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.put("/admin/escalate/:id", async (req, res) => {
  try {
    const record = await findMaterialByIdentifier(req.params.id);
    if (!record) {
      return res.status(404).json({ error: "Material request not found" });
    }

    if (!isOpenForInward(record)) {
      return res.status(400).json({ error: `Escalation is allowed only for 'Outward Cleared' requests. Current status: ${record.status}` });
    }

    if (!isOverdue(record)) {
      return res.status(400).json({ error: "This request is not overdue yet" });
    }

    const fromStatus = record.status;
    const escalationRemark = String(req.body.escalationRemark || "").trim();
    record.isEscalated = true;
    record.escalatedAt = new Date();
    record.escalatedBy = String(req.body.adminName || "Admin").trim();
    record.escalationRemark = escalationRemark;
    appendAudit(record, {
      action: "Escalated Overdue Inward",
      actorRole: "admin",
      actorName: record.escalatedBy,
      fromStatus,
      toStatus: record.status,
      remark: escalationRemark,
    });
    await record.save();

    return res.json({ message: "Request escalated successfully", record });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.put("/admin/exception/resolve/:id", async (req, res) => {
  try {
    const record = await findMaterialByIdentifier(req.params.id);
    if (!record) {
      return res.status(404).json({ error: "Material request not found" });
    }

    if (!isExceptionStatus(record.status)) {
      return res.status(400).json({ error: `This request is not in exception state. Current status: ${record.status}` });
    }

    const fromStatus = record.status;
    const resolutionRemark = String(req.body.resolutionRemark || "").trim();
    record.status = "Closed";
    record.exceptionResolvedAt = new Date();
    record.exceptionResolvedBy = String(req.body.adminName || "Admin").trim();
    record.exceptionResolutionRemark = resolutionRemark;
    record.isEscalated = false;
    appendAudit(record, {
      action: "Resolved Exception",
      actorRole: "admin",
      actorName: record.exceptionResolvedBy,
      fromStatus,
      toStatus: record.status,
      remark: resolutionRemark,
    });
    await record.save();

    return res.json({ message: "Exception resolved and request closed", record });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.put("/admin/approve/:id", async (req, res) => {
  try {
    const record = await findMaterialByIdentifier(req.params.id);
    if (!record) {
      return res.status(404).json({ error: "Material request not found" });
    }

    if (record.status !== "Pending Admin Approval") {
      return res.status(400).json({ error: `Only pending admin requests can be approved. Current status: ${record.status}` });
    }

    const fromStatus = record.status;
    record.status = "Pending at Security";
    record.adminApprovedBy = String(req.body.adminName || "Admin").trim();
    record.adminApprovedAt = new Date();
    record.adminRejectedBy = null;
    record.adminRejectedAt = null;
    record.adminRemark = String(req.body.adminRemark || "").trim();
    appendAudit(record, {
      action: "Approved by Admin",
      actorRole: "admin",
      actorName: record.adminApprovedBy,
      fromStatus,
      toStatus: record.status,
      remark: record.adminRemark,
    });
    await record.save();

    return res.json({ message: "Request approved and moved to security queue", record });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.put("/admin/reject/:id", async (req, res) => {
  try {
    const record = await findMaterialByIdentifier(req.params.id);
    if (!record) {
      return res.status(404).json({ error: "Material request not found" });
    }

    if (record.status !== "Pending Admin Approval") {
      return res.status(400).json({ error: `Only pending admin requests can be rejected. Current status: ${record.status}` });
    }

    const fromStatus = record.status;
    record.status = "Rejected by Admin";
    record.adminRejectedBy = String(req.body.adminName || "Admin").trim();
    record.adminRejectedAt = new Date();
    record.adminApprovedBy = null;
    record.adminApprovedAt = null;
    record.adminRemark = String(req.body.adminRemark || "").trim();
    appendAudit(record, {
      action: "Rejected by Admin",
      actorRole: "admin",
      actorName: record.adminRejectedBy,
      fromStatus,
      toStatus: record.status,
      remark: record.adminRemark,
    });
    await record.save();

    return res.json({ message: "Request rejected by admin", record });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.put("/security/outward/:id", async (req, res) => {
  try {
    const record = await findMaterialByIdentifier(req.params.id);
    if (!record) {
      return res.status(404).json({ error: "Material request not found" });
    }

    if (record.status !== "Pending at Security") {
      return res.status(400).json({ error: `Only pending requests can be cleared. Current status: ${record.status}` });
    }

    const fromStatus = record.status;
    record.status = "Outward Cleared";
    record.inwardSlaHours = Number(record.inwardSlaHours || defaultSlaHours);
    record.outwardClearedBy = String(req.body.securityName || "Security").trim();
    record.outwardClearedAt = new Date();
    record.inwardDueAt = computeInwardDueAt(record.outwardClearedAt, record.inwardSlaHours);
    record.isEscalated = false;
    record.escalatedAt = null;
    record.escalatedBy = null;
    record.escalationRemark = "";
    record.exceptionType = "";
    record.exceptionRaisedAt = null;
    record.exceptionRaisedBy = null;
    record.exceptionRemark = "";
    record.exceptionResolvedAt = null;
    record.exceptionResolvedBy = null;
    record.exceptionResolutionRemark = "";
    record.employeeReceivedBy = null;
    record.employeeReceivedAt = null;
    appendAudit(record, {
      action: "Outward Cleared by Security",
      actorRole: "security",
      actorName: record.outwardClearedBy,
      fromStatus,
      toStatus: record.status,
      remark: `Inward due by ${record.inwardDueAt.toISOString()}`,
    });
    await record.save();

    return res.json({ message: "Outward cleared by security", record });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.put("/security/inward/:id", async (req, res) => {
  try {
    const record = await findMaterialByIdentifier(req.params.id);
    if (!record) {
      return res.status(404).json({ error: "Material request not found" });
    }

    if (record.status !== "Outward Cleared") {
      return res.status(400).json({ error: `Inward processing is allowed only for 'Outward Cleared' requests. Current status: ${record.status}` });
    }

    const receivedItems = Array.isArray(req.body.items) ? req.body.items : [];
    record.items = (record.items || []).map((item) => {
      const match = receivedItems.find((incoming) => String(incoming.itemCode || "").trim() === item.itemCode);
      const receivedQty = Number(match?.receivedQty || 0);
      const normalizedReceivedQty = Math.max(0, Math.min(receivedQty, Number(item.qty) || 0));
      return {
        itemCode: item.itemCode,
        description: item.description,
        uom: item.uom,
        qty: item.qty,
        approxValue: item.approxValue,
        receivedQty: normalizedReceivedQty,
      };
    });

    const totalQty = (record.items || []).reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
    const totalReceivedQty = (record.items || []).reduce((sum, item) => sum + (Number(item.receivedQty) || 0), 0);
    const requestedExceptionType = String(req.body.exceptionType || "").trim();
    const exceptionRemark = String(req.body.exceptionRemark || "").trim();
    const hasShortfall = totalReceivedQty < totalQty;

    if (hasShortfall || requestedExceptionType === "Damaged Return") {
      const fromStatus = record.status;
      const normalizedExceptionType = requestedExceptionType === "Damaged Return" ? "Damaged Return" : "Partial Return";
      record.status = normalizedExceptionType === "Damaged Return" ? "Exception - Damaged Return" : "Exception - Partial Return";
      record.exceptionType = normalizedExceptionType;
      record.exceptionRaisedAt = new Date();
      record.exceptionRaisedBy = String(req.body.securityName || "Security").trim();
      record.exceptionRemark = exceptionRemark;
      record.exceptionResolvedAt = null;
      record.exceptionResolvedBy = null;
      record.exceptionResolutionRemark = "";
      record.inwardProcessedBy = String(req.body.securityName || "Security").trim();
      record.inwardProcessedAt = new Date();
      appendAudit(record, {
        action: "Inward Exception Raised",
        actorRole: "security",
        actorName: record.inwardProcessedBy,
        fromStatus,
        toStatus: record.status,
        remark: record.exceptionRemark || record.exceptionType,
      });
      await record.save();

      return res.json({ message: "Inward recorded with exception. Admin resolution required", record });
    }

    const fromStatus = record.status;
    record.status = "Returned Inward";
    record.exceptionType = "";
    record.exceptionRaisedAt = null;
    record.exceptionRaisedBy = null;
    record.exceptionRemark = "";
    record.exceptionResolvedAt = null;
    record.exceptionResolvedBy = null;
    record.exceptionResolutionRemark = "";
    record.inwardProcessedBy = String(req.body.securityName || "Security").trim();
    record.inwardProcessedAt = new Date();
    record.employeeReceivedBy = null;
    record.employeeReceivedAt = null;
    appendAudit(record, {
      action: "Inward Processed by Security",
      actorRole: "security",
      actorName: record.inwardProcessedBy,
      fromStatus,
      toStatus: record.status,
      remark: `Received ${totalReceivedQty}/${totalQty}`,
    });
    await record.save();

    return res.json({ message: "Inward processed. Employee receipt pending", record });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.put("/employee/received/:id", async (req, res) => {
  try {
    const record = await findMaterialByIdentifier(req.params.id);
    if (!record) {
      return res.status(404).json({ error: "Material request not found" });
    }

    if (record.status !== "Returned Inward") {
      return res.status(400).json({ error: `Employee receipt is allowed only for 'Returned Inward' requests. Current status: ${record.status}` });
    }

    const fromStatus = record.status;
    record.status = "Closed";
    record.employeeReceivedBy = String(req.body.employeeName || record.requestBy || "employee").trim();
    record.employeeReceivedAt = new Date();
    appendAudit(record, {
      action: "Received by Employee",
      actorRole: "employee",
      actorName: record.employeeReceivedBy,
      fromStatus,
      toStatus: record.status,
      remark: String(req.body.remark || "Material received by requester").trim(),
    });
    await record.save();

    return res.json({ message: "Material marked as received and request closed", record });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.put("/security/exception/not-returned/:id", async (req, res) => {
  try {
    const record = await findMaterialByIdentifier(req.params.id);
    if (!record) {
      return res.status(404).json({ error: "Material request not found" });
    }

    if (record.status !== "Outward Cleared") {
      return res.status(400).json({ error: `Not-returned exception can be raised only from 'Outward Cleared'. Current status: ${record.status}` });
    }

    const fromStatus = record.status;
    record.status = "Exception - Not Returned";
    record.exceptionType = "Not Returned";
    record.exceptionRaisedAt = new Date();
    record.exceptionRaisedBy = String(req.body.securityName || "Security").trim();
    record.exceptionRemark = String(req.body.exceptionRemark || "").trim();
    record.exceptionResolvedAt = null;
    record.exceptionResolvedBy = null;
    record.exceptionResolutionRemark = "";
    appendAudit(record, {
      action: "Not Returned Exception Raised",
      actorRole: "security",
      actorName: record.exceptionRaisedBy,
      fromStatus,
      toStatus: record.status,
      remark: record.exceptionRemark,
    });
    await record.save();

    return res.json({ message: "Not-returned exception raised. Admin resolution required", record });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get("/admin/reports", async (req, res) => {
  try {
    const filter = {};

    if (req.query.dateFrom || req.query.dateTo) {
      filter.createdAt = {};
      if (req.query.dateFrom) {
        filter.createdAt.$gte = new Date(req.query.dateFrom);
      }
      if (req.query.dateTo) {
        const end = new Date(req.query.dateTo);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    if (req.query.department) {
      filter.department = new RegExp(
        req.query.department.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i"
      );
    }

    if (req.query.supplier) {
      filter.supplierName = new RegExp(
        req.query.supplier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i"
      );
    }

    if (req.query.materialType) {
      filter.materialType = req.query.materialType;
    }

    if (req.query.exceptionType) {
      filter.exceptionType = req.query.exceptionType;
    }

    if (req.query.status) {
      const statuses = req.query.status.split(",").map((s) => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        filter.status = statuses[0];
      } else if (statuses.length > 1) {
        filter.status = { $in: statuses };
      }
    }

    const data = await MaterialRequest.find(filter).sort({ createdAt: -1 });

    const closedRecords = data.filter((r) => r.status === "Closed");
    const exceptionRecords = data.filter((r) => isExceptionStatus(r.status));
    const outwardOpen = data.filter((r) => isOpenForInward(r));
    const overdueRecords = outwardOpen.filter((r) => isOverdue(r));
    const escalatedRecords = data.filter((r) => r.isEscalated);

    const closedWithSla = closedRecords.filter((r) => r.inwardDueAt && r.inwardProcessedAt);
    const onTime = closedWithSla.filter(
      (r) => new Date(r.inwardProcessedAt) <= new Date(r.inwardDueAt)
    );
    const slaCompliancePct =
      closedWithSla.length > 0
        ? Math.round((onTime.length / closedWithSla.length) * 100)
        : null;

    return res.json({
      total: data.length,
      closed: closedRecords.length,
      exceptions: exceptionRecords.length,
      outwardOpen: outwardOpen.length,
      overdue: overdueRecords.length,
      escalated: escalatedRecords.length,
      slaCompliancePct,
      records: data,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const record = await findMaterialByIdentifier(req.params.id);
    if (!record) {
      return res.status(404).json({ error: "Material request not found" });
    }
    return res.json(record);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
