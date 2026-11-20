"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildSearchContextMessage, parseBingRss, shouldSearch, WebSearchClient } = require("../lib/web-search-client");

test("detects search-worthy current queries", () => {
	assert.equal(shouldSearch("今天杭州有什么新闻", { enabled: true, triggerMode: "auto" }), true);
	assert.equal(shouldSearch("背一首古诗", { enabled: true, triggerMode: "auto" }), false);
	assert.equal(shouldSearch("联网查一下树莓派新闻", { enabled: true, triggerMode: "manual" }), true);
	assert.equal(shouldSearch("今天杭州有什么新闻", { enabled: false, triggerMode: "always" }), false);
});

test("parses Bing RSS items", () => {
	const results = parseBingRss(["<rss><channel>", "<item><title>标题 &amp; 新闻</title><link>https://example.com/a</link><description><![CDATA[摘要 <b>内容</b>]]></description></item>", "<item><title>第二条</title><link>https://example.com/b</link><description>更多内容</description></item>", "</channel></rss>"].join(""));
	assert.deepEqual(results, [
		{ title: "标题 & 新闻", link: "https://example.com/a", description: "摘要 内容" },
		{ title: "第二条", link: "https://example.com/b", description: "更多内容" }
	]);
});

test("builds concise search context", () => {
	const context = buildSearchContextMessage("最新科技新闻", [{ title: "新闻一", link: "https://example.com", description: "摘要" }]);
	assert.match(context, /联网搜索结果/);
	assert.match(context, /新闻一/);
	assert.match(context, /https:\/\/example\.com/);
});

test("fetches and limits RSS results through injected fetch", async () => {
	const client = new WebSearchClient({ provider: "bing-rss", maxResults: 1, timeoutMs: 5000, locale: "zh-CN" }, {
		fetchImpl: async (url) => {
			assert.match(url, /^https:\/\/www\.bing\.com\/search\?/);
			return {
				ok: true,
				text: async () => "<rss><channel><item><title>A</title><link>https://a.example</link><description>Alpha</description></item><item><title>B</title><link>https://b.example</link><description>Beta</description></item></channel></rss>"
			};
		}
	});
	const results = await client.search("test");
	assert.deepEqual(results, [{ title: "A", link: "https://a.example", description: "Alpha" }]);
});
