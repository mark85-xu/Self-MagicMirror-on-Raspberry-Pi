"use strict";

/* eslint-disable jsdoc/require-param-description, jsdoc/require-param-type, jsdoc/require-returns */

const SEARCH_TRIGGERS = [
	"今天",
	"现在",
	"目前",
	"最新",
	"新闻",
	"联网",
	"搜索",
	"查一下",
	"帮我查",
	"实时",
	"最近",
	"current",
	"latest",
	"today",
	"news",
	"search"
];

class WebSearchClient {
	constructor (config = {}, options = {}) {
		this.config = config;
		this.fetchImpl = options.fetchImpl || fetch;
	}

	async search (query, signal) {
		if (this.config.provider !== "bing-rss") return [];

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs || 8000);
		const combinedSignal = combineSignals(signal, controller.signal);
		const url = this.buildBingRssUrl(query);

		try {
			const response = await this.fetchImpl(url, {
				headers: {
					"User-Agent": "Mozilla/5.0 MagicMirror AIChat"
				},
				signal: combinedSignal
			});
			if (!response.ok) return [];
			const xml = await response.text();
			return parseBingRss(xml).slice(0, this.config.maxResults || 4);
		} finally {
			clearTimeout(timeout);
		}
	}

	buildBingRssUrl (query) {
		const params = new URLSearchParams({
			q: query,
			format: "rss",
			setlang: this.config.locale || "zh-CN",
			cc: (this.config.locale || "zh-CN").toLowerCase().includes("cn") ? "cn" : "us"
		});
		return `https://www.bing.com/search?${params.toString()}`;
	}
}

/**
 *
 * @param query
 * @param config
 */
function shouldSearch (query, config = {}) {
	if (!config.enabled) return false;
	if (config.triggerMode === "always") return true;
	if (config.triggerMode === "manual") {
		return (/^(联网|搜索|查一下|帮我查)|^search\b/i).test(String(query || "").trim());
	}
	const lower = String(query || "").toLowerCase();
	return SEARCH_TRIGGERS.some((trigger) => lower.includes(trigger.toLowerCase()));
}

/**
 *
 * @param query
 * @param results
 */
function buildSearchContextMessage (query, results) {
	const lines = [
		`以下是针对用户问题“${safeText(query, 120)}”的联网搜索结果。`,
		"请只把这些结果作为可能过期或不完整的参考；如果答案依赖搜索结果，请在回答中简短说明来源。"
	];
	for (const [index, result] of results.entries()) {
		lines.push([
			`${index + 1}. ${safeText(result.title, 120)}`,
			`链接：${safeText(result.link, 240)}`,
			`摘要：${safeText(result.description, 260)}`
		].join("\n"));
	}
	return lines.join("\n\n");
}

/**
 *
 * @param xml
 */
function parseBingRss (xml) {
	const items = [];
	const itemMatches = String(xml || "").matchAll(/<item>([\s\S]*?)<\/item>/gi);
	for (const match of itemMatches) {
		const itemXml = match[1];
		const title = decodeXml(extractTag(itemXml, "title"));
		const link = decodeXml(extractTag(itemXml, "link"));
		const description = stripTags(decodeXml(extractTag(itemXml, "description"))).replace(/\s+/g, " ").trim();
		if (title && link) {
			items.push({ title, link, description });
		}
	}
	return items;
}

/**
 *
 * @param xml
 * @param tagName
 */
function extractTag (xml, tagName) {
	const match = String(xml || "").match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
	return match ? match[1].trim() : "";
}

/**
 *
 * @param value
 */
function stripTags (value) {
	return String(value || "").replace(/<[^>]*>/g, " ");
}

/**
 *
 * @param value
 */
function decodeXml (value) {
	return String(value || "")
		.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, "\"")
		.replace(/&#39;/g, "'")
		.replace(/&#(\d+);/g, (match, code) => String.fromCharCode(Number(code)))
		.replace(/\s+/g, " ")
		.trim();
}

/**
 *
 * @param value
 * @param maxLength
 */
function safeText (value, maxLength) {
	const text = String(value || "").replace(/\s+/g, " ").trim();
	return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

/**
 *
 * @param {...AbortSignal} signals
 */
function combineSignals (...signals) {
	const controller = new AbortController();
	for (const signal of signals) {
		if (!signal) continue;
		if (signal.aborted) {
			controller.abort();
			break;
		}
		signal.addEventListener("abort", () => controller.abort(), { once: true });
	}
	return controller.signal;
}

module.exports = {
	WebSearchClient,
	buildSearchContextMessage,
	parseBingRss,
	shouldSearch
};
