const {
  sendWhatsAppMessage: sendTextViaCloudApi,
  sendWhatsAppTemplateMessage,
  getWhatsAppConfig,
} = require("./whatsapp");

const waConfig = getWhatsAppConfig();
if (waConfig.configured) {
  console.log("WhatsApp Cloud API configured");
} else {
  console.warn("WhatsApp Cloud API not configured properly");
}

async function sendWhatsAppMessage(
  visitorPhone,
  appointmentId,
  visitorName,
  qrImageUrl,
  customMessage,
  options = {}
) {
  try {
    const messageBody =
      customMessage ||
      `Your appointment is confirmed.\n\nID: ${appointmentId}\nVisitor: ${visitorName}`;

    if (options.useTemplate === false) {
      const textResult = await sendTextViaCloudApi(visitorPhone, messageBody);
      const textMessageId = textResult?.messageId || "unknown";
      console.log("WhatsApp text sent:", textMessageId);
      return;
    }

    const templateOptions = {
      templateName: options.templateName || process.env.WHATSAPP_TEMPLATE_NAME || "entry_pass",
      languageCode: options.templateLanguage || process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en",
      bodyParams:
        options.templateParams || [visitorName || "Visitor", appointmentId || "N/A", "", ""],
      buttonUrl: options.buttonUrl || "",
      strictMode: options.strictTemplate ?? true,
    };

    const templateResult = await sendWhatsAppTemplateMessage(visitorPhone, templateOptions);
    const templateMessageId = templateResult?.messageId || "unknown";
    console.log("WhatsApp template sent:", templateMessageId, templateOptions.templateName);

    if (qrImageUrl) {
      // Placeholder for future media message flow if required.
    }
  } catch (error) {
    console.error("WhatsApp sending failed:", error.message);
    throw error;
  }
}

module.exports = {
  sendWhatsAppMessage,
};