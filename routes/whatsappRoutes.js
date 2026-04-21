const express = require("express");
const {
  sendWhatsAppMessage,
  sendWhatsAppTemplateMessage,
  getWhatsAppConfig,
} = require("../utils/whatsapp");

const router = express.Router();
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

function validateInternalKey(req, res, next) {
  if (!INTERNAL_API_KEY) {
    return res.status(503).json({ error: "Internal API key is not configured" });
  }

  const requestKey = req.headers["x-internal-key"];
  if (requestKey !== INTERNAL_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  return next();
}

router.get("/config", validateInternalKey, (req, res) => {
  const config = getWhatsAppConfig();
  return res.json({
    configured: config.configured,
    graphApiVersion: config.graphApiVersion,
    phoneNumberId: config.phoneNumberId || null,
    businessAccountId: config.businessAccountId || null,
    templateName: config.templateName || null,
    templateLanguage: config.templateLanguage || null,
  });
});

router.post("/send", validateInternalKey, async (req, res) => {
  try {
    const { to, message } = req.body;

    if (!to || !message) {
      return res.status(400).json({ error: "to and message are required" });
    }

    const result = await sendWhatsAppMessage(to, message);
    return res.json({
      message: "WhatsApp message sent successfully",
      to: result.to,
      messageId: result.messageId,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post("/send-template", validateInternalKey, async (req, res) => {
  try {
    const { to, templateName, languageCode, bodyParams, buttonUrl } = req.body;

    if (!to) {
      return res.status(400).json({ error: "to is required" });
    }

    const result = await sendWhatsAppTemplateMessage(to, {
      templateName,
      languageCode,
      bodyParams,
      buttonUrl,
    });

    return res.json({
      message: "WhatsApp template sent successfully",
      to: result.to,
      messageId: result.messageId,
      templateName: templateName || process.env.WHATSAPP_TEMPLATE_NAME || "entry_pass",
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;