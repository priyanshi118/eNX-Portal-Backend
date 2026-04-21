const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Appointment = require("../models/Appointment");
const PassPage = require("../models/PassPage");
const { generateQRCode } = require("../utils/qrGenerator");
const { sendWhatsAppMessage } = require("../utils/messaging");

const ALLOWED_STATUS = new Set(["Pending", "Approved", "Rejected"]);
const ALLOWED_SECURITY_STATUS = new Set(["In", "Out"]);
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

function normalizeMobile(value = "") {
  return String(value).replace(/\s+/g, "").trim();
}

function normalizeMovementType(value = "visitor") {
  const normalized = String(value || "visitor").trim().toLowerCase();
  if (["visitor", "material", "courier"].includes(normalized)) {
    return normalized;
  }

  return "visitor";
}

function normalizeCourierStatus(value = "Pending") {
  const normalized = String(value || "Pending").trim().toLowerCase();
  return normalized === "received" ? "Received" : "Pending";
}

function buildPassPageId(appointmentId) {
  const safeAppointmentId = String(appointmentId || "")
    .trim()
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  // Keep pass IDs human-readable for tracking while preserving uniqueness.
  return safeAppointmentId
    ? `PASS-${safeAppointmentId}`
    : `PASS-${Date.now()}`;
}

async function findAppointmentByIdentifier(identifier) {
  if (mongoose.isValidObjectId(identifier)) {
    const byId = await Appointment.findById(identifier);
    if (byId) return byId;
  }

  return Appointment.findOne({ appointmentId: identifier });
}

function validateCreatePayload(payload) {
  const requiredFields = ["company", "visitor", "mobile", "purpose", "visitType", "date", "time"];
  const missingFields = requiredFields.filter((field) => !payload[field]);

  if (missingFields.length > 0) {
    return `Missing required fields: ${missingFields.join(", ")}`;
  }

  const validMobile = /^\+?[0-9]{10,15}$/.test(payload.mobile);
  if (!validMobile) {
    return "Invalid mobile format. Use 10-15 digits with optional + prefix.";
  }

  return null;
}

function validateUpdatePayload(payload) {
  const requiredFields = ["company", "visitor", "mobile", "purpose"];
  const missingFields = requiredFields.filter((field) => !payload[field]);

  if (missingFields.length > 0) {
    return `Missing required fields: ${missingFields.join(", ")}`;
  }

  const validMobile = /^\+?[0-9]{10,15}$/.test(payload.mobile);
  if (!validMobile) {
    return "Invalid mobile format. Use 10-15 digits with optional + prefix.";
  }

  return null;
}

/* ================= TEST WHATSAPP ================= */
router.post("/test-whatsapp", async (req, res) => {
  try {
    if (!INTERNAL_API_KEY) {
      return res.status(503).json({ error: "Internal API key is not configured" });
    }

    const requestKey = req.headers["x-internal-key"];
    if (requestKey !== INTERNAL_API_KEY) {
      return res.status(401).json({ error: "Unauthorized test endpoint access" });
    }

    const { mobile, message } = req.body;

    if (!mobile) {
      return res.status(400).json({ error: "mobile is required" });
    }

    const formattedMobile = normalizeMobile(mobile);
    const validMobile = /^\+?[0-9]{10,15}$/.test(formattedMobile);

    if (!validMobile) {
      return res.status(400).json({ error: "Invalid mobile format. Use 10-15 digits with optional + prefix." });
    }

    const testMessage =
      message ||
      "Test message from eNX Portal using WhatsApp Business Cloud API.";

    await sendWhatsAppMessage(
      formattedMobile,
      "TEST-APPOINTMENT",
      "Test User",
      null,
      testMessage
    );

    return res.json({
      message: "Test WhatsApp request submitted",
      mobile: formattedMobile,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/* ================= CREATE APPOINTMENT ================= */
router.post("/create", async (req, res) => {
  try {
    const payload = {
      ...req.body,
      appointmentId: req.body.appointmentId || `APT-${Date.now()}`,
      mobile: normalizeMobile(req.body.mobile),
      movementType: normalizeMovementType(req.body.movementType),
      courierStatus:
        normalizeMovementType(req.body.movementType) === "courier"
          ? normalizeCourierStatus(req.body.courierStatus)
          : "Pending",
    };

    const validationError = validateCreatePayload(payload);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const appointment = new Appointment(payload);
    const savedAppointment = await appointment.save();

    const phoneNumber = savedAppointment.mobile;

    if (phoneNumber) {
      const confirmationMessage = `Your appointment has been registered!

Appointment ID: ${savedAppointment.appointmentId}
Visitor: ${savedAppointment.visitor}
Date: ${savedAppointment.date}
Time: ${savedAppointment.time}

Waiting for admin approval...`;

      try {
        await sendWhatsAppMessage(
          phoneNumber,
          savedAppointment.appointmentId,
          savedAppointment.visitor,
          null,
          confirmationMessage,
          {
            useTemplate: false,
          }
        );
        console.log(" Confirmation WhatsApp sent");
      } catch (err) {
        console.log(" WhatsApp confirmation failed:", err.message);
      }
    }

    res.status(201).json({
      message: "Appointment Saved",
      id: savedAppointment._id,
    });

  } catch (error) {
    console.error(" Error creating appointment:", error.message);
    res.status(500).json({ error: error.message });
  }
});


/* ================= UPDATE STATUS ================= */
router.put("/status/:id", async (req, res) => {
  try {
    const { status } = req.body;

    if (!ALLOWED_STATUS.has(status)) {
      return res.status(400).json({ error: "Invalid status. Allowed: Pending, Approved, Rejected" });
    }

    const appointment = await Appointment.findByIdAndUpdate(
      req.params.id,
      {
        status,
        approvedBy: status === "Approved" ? "Admin" : null,
        approvedAt: status === "Approved" ? new Date() : null,
      },
      { new: true }
    );

    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    if (status === "Approved" && !appointment.passPageId) {
      let whatsappSent = false;
      let whatsappError = null;

      const passPageId = buildPassPageId(appointment.appointmentId);

      // Fallback in case BASE_URL missing
      const baseURL = process.env.BASE_URL || "http://localhost:3000";

      const passURL = `${baseURL}/pass/${passPageId}`;

      const qrCodeImage = await generateQRCode(passURL);

      const passPage = new PassPage({
        passPageId,
        appointmentId: appointment.appointmentId,
        visitorName: appointment.visitor,
        company: appointment.company,
        date: appointment.date,
        time: appointment.time,
        qrCode: qrCodeImage,
        status: "Active",
      });

      await passPage.save();

      appointment.passPageId = passPageId;
      appointment.qrCode = qrCodeImage;
      await appointment.save();

      if (appointment.mobile) {
        const message = `Your appointment is APPROVED! 

Appointment ID: ${appointment.appointmentId}
Visitor: ${appointment.visitor}
Date: ${appointment.date}
Time: ${appointment.time}

Your ePass:
${passURL}

Please show this QR at the gate.`;

        const parsedDate = appointment.date ? new Date(`${appointment.date}T00:00:00`) : null;
        const formattedDate = parsedDate && !Number.isNaN(parsedDate.getTime())
          ? parsedDate.toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })
          : String(appointment.date || "");

        try {
          await sendWhatsAppMessage(
            appointment.mobile,
            appointment.appointmentId,
            appointment.visitor,
            qrCodeImage,
            message,
            {
              templateParams: [
                appointment.visitor,
                appointment.visitor,
                appointment.purpose || "Visit",
                formattedDate,
                passURL,
              ],
              strictTemplate: true,
            }
          );
          whatsappSent = true;
          console.log(" Approval WhatsApp sent");
        } catch (err) {
          whatsappError = err.message;
          console.log(" WhatsApp approval failed:", err.message);
        }

        appointment.whatsappSent = whatsappSent;
        appointment.whatsappError = whatsappError;
      }

      console.log(" QR + PassPage created successfully");

      const responseAppointment = appointment.toObject();
      responseAppointment.whatsappSent = whatsappSent;
      responseAppointment.whatsappError = whatsappError;

      return res.json({ message: "Status updated", appointment: responseAppointment });
    }

    res.json({ message: "Status updated", appointment });

  } catch (error) {
    console.error(" Error updating status:", error.message);
    res.status(500).json({ error: error.message });
  }
});

/* ================= SECURITY CHECK IN/OUT ================= */
router.put("/security-check/:id", async (req, res) => {
  try {
    const securityStatus = String(req.body.securityStatus || "").trim();
    const securityCheckedBy = String(req.body.securityCheckedBy || "Security").trim();
    const inTime = req.body.inTime;
    const outTime = req.body.outTime;

    if (!ALLOWED_SECURITY_STATUS.has(securityStatus)) {
      return res.status(400).json({ error: "Invalid securityStatus. Allowed: In, Out" });
    }

    const appointment = await findAppointmentByIdentifier(req.params.id);

    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    if (appointment.status === "Rejected") {
      return res.status(400).json({ error: "Rejected appointments cannot be marked In/Out" });
    }

    const now = new Date();
    appointment.securityStatus = securityStatus;
    appointment.securityCheckedBy = securityCheckedBy || "Security";
    appointment.securityCheckedAt = now;

    // Helper function to convert HH:MM to Date object for today
    const timeToDate = (timeStr) => {
      if (!timeStr) return null;
      const [hours, minutes] = timeStr.split(":").map(Number);
      if (isNaN(hours) || isNaN(minutes)) return null;
      const dt = new Date();
      dt.setHours(hours, minutes, 0, 0);
      return dt;
    };

    if (securityStatus === "In") {
      appointment.securityInAt = inTime ? timeToDate(inTime) : now;
      appointment.securityInTimeText = inTime ? String(inTime).trim() : null;
      appointment.securityOutAt = null;
      appointment.securityOutTimeText = null;
    }

    if (securityStatus === "Out") {
      if (!appointment.securityInAt) {
        appointment.securityInAt = now;
      }
      appointment.securityOutAt = outTime ? timeToDate(outTime) : now;
      appointment.securityOutTimeText = outTime ? String(outTime).trim() : null;
    }

    if (appointment.movementType === "courier" && securityStatus === "In") {
      appointment.courierStatus = "Received";
    }

    await appointment.save();

    return res.json({ message: `Marked ${securityStatus} successfully`, appointment });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/* ================= UPDATE APPOINTMENT DETAILS ================= */
router.put("/:id", async (req, res) => {
  try {
    const appointment = await findAppointmentByIdentifier(req.params.id);
    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    const pick = (incoming, existing) => {
      if (incoming === undefined || incoming === null) return existing;
      if (typeof incoming === "string" && incoming.trim() === "") return existing;
      return incoming;
    };

    const payload = {
      company: pick(req.body.company, appointment.company),
      visitor: pick(req.body.visitor, appointment.visitor),
      mobile: normalizeMobile(pick(req.body.mobile, appointment.mobile)),
      purpose: pick(req.body.purpose, appointment.purpose),
      visitType: pick(req.body.visitType, appointment.visitType),
      movementType: normalizeMovementType(pick(req.body.movementType, appointment.movementType)),
      courierStatus: normalizeCourierStatus(pick(req.body.courierStatus, appointment.courierStatus)),
      date: pick(req.body.date, appointment.date),
      time: pick(req.body.time, appointment.time),
      photo: pick(req.body.photo, appointment.photo),
    };

    if (payload.movementType !== "courier") {
      payload.courierStatus = "Pending";
    }

    const validationError = validateUpdatePayload(payload);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    appointment.company = payload.company;
    appointment.visitor = payload.visitor;
    appointment.mobile = payload.mobile;
    appointment.purpose = payload.purpose;
    appointment.visitType = payload.visitType;
    appointment.movementType = payload.movementType;
    appointment.courierStatus = payload.courierStatus;
    appointment.date = payload.date;
    appointment.time = payload.time;
    appointment.photo = payload.photo;

    await appointment.save();

    return res.json({ message: "Appointment updated", appointment });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/* ================= DELETE APPOINTMENT ================= */
router.delete("/:id", async (req, res) => {
  try {
    const appointment = await findAppointmentByIdentifier(req.params.id);

    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    if (appointment.status === "Approved") {
      return res.status(400).json({ error: "Approved appointments cannot be deleted" });
    }

    await appointment.deleteOne();

    return res.json({ message: "Appointment deleted" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});


/* ================= GET ALL ================= */
router.get("/", async (req, res) => {
  try {
    const data = await Appointment.find().sort({ createdAt: -1 });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


/* ================= GET PASS BY PASS ID ================= */
router.get("/pass/:passPageId", async (req, res) => {
  try {
    const passPage = await PassPage.findOne({
      passPageId: req.params.passPageId,
    });

    if (!passPage) {
      return res.status(404).json({ error: "PassPage not found" });
    }

    res.json(passPage);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


/* ================= GET SINGLE APPOINTMENT ================= */
router.get("/:id", async (req, res) => {
  try {
    const appointment = await findAppointmentByIdentifier(req.params.id);

    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    res.json(appointment);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;