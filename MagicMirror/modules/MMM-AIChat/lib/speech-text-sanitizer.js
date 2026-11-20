"use strict";

/* eslint-disable jsdoc/require-param-description, jsdoc/require-param-type, jsdoc/require-returns */

/**
 *
 * @param text
 * @param maxCharacters
 */
function sanitizeForSpeech (text, maxCharacters = 600) {
	const source = String(text || "").trim();
	if (!source) return "";

	let cleaned = source
		.replace(/```[\s\S]*?```/g, "回答中包含代码，详细内容请查看屏幕。")
		.replace(/`([^`]+)`/g, "$1")
		.replace(/https?:\/\/\S+/gi, "链接请查看屏幕")
		.replace(/[*_#>|~$[\]{}]/g, "")
		.replace(/\|/g, "，")
		.replace(/\s+/g, " ")
		.trim();

	if (cleaned.length > maxCharacters) {
		cleaned = `${cleaned.slice(0, maxCharacters)}。后续内容请查看屏幕。`;
	}

	return cleaned;
}

module.exports = {
	sanitizeForSpeech
};
