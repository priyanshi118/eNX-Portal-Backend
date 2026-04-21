const QRCode = require("qrcode");

/**
 * Generate QR code from appointment data
 * Returns Base64 encoded PNG image
 */
async function generateQRCode(appointmentId, visitorName, date, time) {
  try {
    const qrData = {
      appointmentId,
      visitorName,
      date,
      time,
      generatedAt: new Date().toISOString(),
    };

    // Generate QR code as Data URL (Base64)
    const qrCodeImage = await QRCode.toDataURL(JSON.stringify(qrData), {
      errorCorrectionLevel: "H",
      type: "image/png",
      quality: 0.95,
      margin: 1,
      width: 300,
    });

    return qrCodeImage; // This is a Base64 string
  } catch (error) {
    console.error("Error generating QR code:", error);
    throw error;
  }
}

module.exports = {
  generateQRCode,
};
