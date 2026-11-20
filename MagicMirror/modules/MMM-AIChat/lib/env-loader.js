"use strict";

/* eslint-disable jsdoc/check-types */

const fs = require("node:fs");

/**
 * @param {string} filePath Path to the .env file.
 * @returns {Object<string, string>} Parsed environment values.
 */
function loadEnvFile (filePath) {
	if (!filePath || !fs.existsSync(filePath)) {
		return {};
	}

	const values = {};
	const content = fs.readFileSync(filePath, "utf8");
	for (const rawLine of content.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;

		const separatorIndex = line.indexOf("=");
		if (separatorIndex <= 0) continue;

		const key = line.slice(0, separatorIndex).trim();
		const rawValue = line.slice(separatorIndex + 1).trim();
		if (!(/^[A-Z0-9_]+$/i).test(key)) continue;

		values[key] = stripQuotes(rawValue);
	}

	return values;
}

/**
 * @param {string} value Raw .env value.
 * @returns {string} Value without matching single or double quotes.
 */
function stripQuotes (value) {
	if (value.length < 2) return value;

	const first = value[0];
	const last = value[value.length - 1];
	if ((first === "\"" && last === "\"") || (first === "'" && last === "'")) {
		return value.slice(1, -1);
	}
	return value;
}

module.exports = { loadEnvFile };
