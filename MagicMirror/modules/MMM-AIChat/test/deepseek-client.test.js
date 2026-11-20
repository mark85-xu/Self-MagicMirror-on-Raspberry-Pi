"use strict";

/* eslint-disable jsdoc/require-returns, jsdoc/require-param-description, jsdoc/require-param-type */

const test = require("node:test");
const assert = require("node:assert/strict");
const { ReadableStream } = require("node:stream/web");
const { DeepSeekClient } = require("../lib/deepseek-client");
const { normalizeConfig } = require("../lib/validation");

/**
 *
 * @param overrides
 */
function config (overrides = {}) {
	return normalizeConfig({
		baseUrl: "https://api.deepseek.com",
		model: "deepseek-v4-flash",
		requestTimeoutMs: 20,
		retryAttempts: 0,
		...overrides
	}).config;
}

test("throws MISSING_API_KEY when no api key is supplied", async () => {
	const client = new DeepSeekClient(config(), { fetchImpl: async () => ({ ok: true }) });
	await assert.rejects(
		() => client.createChatCompletion({ messages: [], onStart () {}, onDelta () {} }),
		(error) => error.code === "MISSING_API_KEY"
	);
});

test("constructs request and concatenates streaming deltas", async () => {
	let requestBody;
	const stream = new ReadableStream({
		start (controller) {
			controller.enqueue(Buffer.from("data: {\"choices\":[{\"delta\":{\"content\":\"你\"}}]}\n\n"));
			controller.enqueue(Buffer.from("data: {\"choices\":[{\"delta\":{\"content\":\"好\"},\"finish_reason\":\"stop\"}]}\n\n"));
			controller.enqueue(Buffer.from("data: [DONE]\n\n"));
			controller.close();
		}
	});
	const client = new DeepSeekClient(config(), {
		apiKey: "secret",
		fetchImpl: async (url, options) => {
			assert.equal(url, "https://api.deepseek.com/chat/completions");
			requestBody = JSON.parse(options.body);
			assert.equal(options.headers.Authorization, "Bearer secret");
			return { ok: true, body: stream };
		}
	});
	let deltas = "";
	const result = await client.createChatCompletion({
		messages: [{ role: "user", content: "hi" }],
		onStart () {},
		onDelta (delta) {
			deltas += delta;
		}
	});
	assert.equal(requestBody.model, "deepseek-v4-flash");
	assert.equal(requestBody.stream, true);
	assert.equal(deltas, "你好");
	assert.equal(result.content, "你好");
});

test("maps HTTP errors", async () => {
	const client = new DeepSeekClient(config(), {
		apiKey: "secret",
		fetchImpl: async () => ({
			ok: false,
			status: 429,
			text: async () => "rate limited"
		})
	});
	await assert.rejects(
		() => client.createChatCompletion({ messages: [], onStart () {}, onDelta () {} }),
		(error) => error.code === "RATE_LIMIT" && error.retryable
	);
});

test("times out requests", async () => {
	const client = new DeepSeekClient(config({ requestTimeoutMs: 5 }), {
		apiKey: "secret",
		fetchImpl: async (url, options) => new Promise((resolve, reject) => {
			options.signal.addEventListener("abort", () => {
				const error = new Error("aborted");
				error.name = "AbortError";
				reject(error);
			});
		})
	});
	await assert.rejects(
		() => client.createChatCompletion({ messages: [], onStart () {}, onDelta () {} }),
		(error) => error.code === "REQUEST_TIMEOUT"
	);
});

test("keeps long active streams alive while chunks are arriving", async () => {
	const stream = new ReadableStream({
		async start (controller) {
			await delay(10);
			controller.enqueue(Buffer.from("data: {\"choices\":[{\"delta\":{\"content\":\"a\"}}]}\n\n"));
			await delay(20);
			controller.enqueue(Buffer.from("data: {\"choices\":[{\"delta\":{\"content\":\"b\"}}]}\n\n"));
			await delay(20);
			controller.enqueue(Buffer.from("data: [DONE]\n\n"));
			controller.close();
		}
	});
	const client = new DeepSeekClient(config({ requestTimeoutMs: 30 }), {
		apiKey: "secret",
		fetchImpl: async () => ({ ok: true, body: stream })
	});
	const result = await client.createChatCompletion({
		messages: [{ role: "user", content: "hi" }],
		onStart () {},
		onDelta () {}
	});
	assert.equal(result.content, "ab");
});

/**
 *
 * @param ms
 */
function delay (ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}
