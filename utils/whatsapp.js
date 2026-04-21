const graphApiVersion = process.env.WHATSAPP_GRAPH_API_VERSION || "v22.0";
const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
const cloudApiToken = process.env.WHATSAPP_CLOUD_API_TOKEN;
const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
const defaultTemplateName = process.env.WHATSAPP_TEMPLATE_NAME || "entry_pass";
const defaultTemplateLanguage = process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en";
const strictTemplateMode =
	String(process.env.WHATSAPP_TEMPLATE_STRICT || "true").toLowerCase() === "true";
const strictTemplateBodyParamCount = Number(process.env.WHATSAPP_TEMPLATE_BODY_PARAM_COUNT || 4);
const strictTemplateButtonUrlRequired =
	String(process.env.WHATSAPP_TEMPLATE_BUTTON_URL_REQUIRED || "true").toLowerCase() === "true";

function formatToE164IndiaDefault(rawPhone) {
	let formattedPhone = String(rawPhone || "").replace(/\D/g, "");
	if (!formattedPhone) return "";

	// Use India country code by default when user enters 10 digit local number.
	if (formattedPhone.length === 10) {
		formattedPhone = `91${formattedPhone}`;
	}

	return formattedPhone;
}

function getWhatsAppConfig() {
	return {
		graphApiVersion,
		phoneNumberId,
		businessAccountId,
		templateName: defaultTemplateName,
		templateLanguage: defaultTemplateLanguage,
		strictTemplateMode,
		strictTemplateBodyParamCount,
		strictTemplateButtonUrlRequired,
		configured: Boolean(phoneNumberId && cloudApiToken),
	};
}

async function postToCloudApi(payload) {
	const response = await fetch(
		`https://graph.facebook.com/${graphApiVersion}/${phoneNumberId}/messages`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${cloudApiToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
		}
	);

	const result = await response.json();
	if (!response.ok) {
		throw new Error(result?.error?.message || "Cloud API request failed");
	}

	return result;
}

async function sendWhatsAppMessage(toPhone, messageBody) {
	if (!phoneNumberId || !cloudApiToken) {
		throw new Error("WhatsApp Cloud API not configured. Missing token or phone number ID.");
	}

	const to = formatToE164IndiaDefault(toPhone);
	if (!to) {
		throw new Error("Recipient phone number is required");
	}

	const result = await postToCloudApi({
		messaging_product: "whatsapp",
		to,
		type: "text",
		text: {
			body: messageBody,
		},
	});

	return {
		to,
		messageId: result?.messages?.[0]?.id || null,
		raw: result,
	};
}

async function sendWhatsAppTemplateMessage(toPhone, options = {}) {
	if (!phoneNumberId || !cloudApiToken) {
		throw new Error("WhatsApp Cloud API not configured. Missing token or phone number ID.");
	}

	const to = formatToE164IndiaDefault(toPhone);
	if (!to) {
		throw new Error("Recipient phone number is required");
	}

	const templateName = String(options.templateName || defaultTemplateName).trim();
	const languageCode = String(options.languageCode || defaultTemplateLanguage).trim();
	const bodyParams = Array.isArray(options.bodyParams) ? options.bodyParams : [];
	const buttonUrl = options.buttonUrl ? String(options.buttonUrl).trim() : "";
	const useStrictMode = options.strictMode ?? strictTemplateMode;

	if (useStrictMode) {
		if (templateName !== defaultTemplateName) {
			throw new Error(
				`Strict template mode: template name must be '${defaultTemplateName}', got '${templateName}'`
			);
		}

		if (languageCode !== defaultTemplateLanguage) {
			throw new Error(
				`Strict template mode: language must be '${defaultTemplateLanguage}', got '${languageCode}'`
			);
		}

		if (bodyParams.length !== strictTemplateBodyParamCount) {
			throw new Error(
				`Strict template mode: body params count must be ${strictTemplateBodyParamCount}, got ${bodyParams.length}`
			);
		}

		if (strictTemplateButtonUrlRequired && !buttonUrl) {
			throw new Error("Strict template mode: dynamic URL button value is required");
		}
	}

	const components = [];
	if (bodyParams.length > 0) {
		components.push({
			type: "body",
			parameters: bodyParams.map((item) => ({
				type: "text",
				text: String(item ?? ""),
			})),
		});
	}

	if (buttonUrl) {
		components.push({
			type: "button",
			sub_type: "url",
			index: "0",
			parameters: [{ type: "text", text: buttonUrl }],
		});
	}

	const templatePayload = {
		messaging_product: "whatsapp",
		to,
		type: "template",
		template: {
			name: templateName,
			language: { code: languageCode },
		},
	};

	if (components.length > 0) {
		templatePayload.template.components = components;
	}

	const result = await postToCloudApi(templatePayload);

	return {
		to,
		messageId: result?.messages?.[0]?.id || null,
		raw: result,
	};
}

module.exports = {
	getWhatsAppConfig,
	sendWhatsAppMessage,
	sendWhatsAppTemplateMessage,
};
