"use strict";

/* eslint-disable jsdoc/require-returns, jsdoc/require-param-description, jsdoc/require-param-type, jsdoc/reject-any-type */

const { StreamParser } = require("./stream-parser");
const { buildUserError, isRetryableError, mapHttpError } = require("./validation");

class DeepSeekClient {
	constructor (config, options = {}) {
		this.config = config;
		this.fetchImpl = options.fetchImpl || fetch;
		this.apiKey = options.apiKey;
	}

	async createChatCompletion ({ messages, requestId, signal, onStart, onDelta }) {
		if (!this.apiKey) {
			throw buildUserError("MISSING_API_KEY");
		}

		let attempt = 0;
		let producedContent = false;
		let lastError;

		while (attempt <= this.config.retryAttempts) {
			try {
				return await this.performRequest({
					messages,
					requestId,
					signal,
					onStart,
					onDelta: (delta) => {
						if (delta) producedContent = true;
						onDelta(delta);
					}
				});
			} catch (error) {
				lastError = normalizeError(error);
				if (producedContent || signal?.aborted || !isRetryableError(lastError) || attempt >= this.config.retryAttempts) {
					throw lastError;
				}
				await delay(this.config.retryBaseDelayMs * 2 ** attempt, signal);
				attempt += 1;
			}
		}

		throw lastError || buildUserError("UNKNOWN_ERROR");
	}

	async performRequest ({ messages, signal, onStart, onDelta }) {
		const timeoutController = new AbortController();
		let timeout = null;
		const resetTimeout = () => {
			clearTimeout(timeout);
			timeout = setTimeout(() => timeoutController.abort(), this.config.requestTimeoutMs);
		};
		resetTimeout();
		const combinedSignal = combineSignals(signal, timeoutController.signal);

		try {
			const response = await this.fetchImpl(`${this.config.baseUrl}/chat/completions`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.apiKey}`,
					"Content-Type": "application/json"
				},
				body: JSON.stringify({
					model: this.config.model,
					messages,
					stream: this.config.stream,
					temperature: this.config.temperature,
					max_tokens: this.config.maxTokens
				}),
				signal: combinedSignal
			});

			if (!response.ok) {
				const bodyText = await readErrorBody(response);
				throw mapHttpError(response.status, bodyText);
			}

			onStart();

			if (!this.config.stream) {
				const json = await response.json();
				const content = json.choices?.[0]?.message?.content || "";
				if (!content) throw buildUserError("EMPTY_RESPONSE");
				onDelta(content);
				return { content, usage: json.usage || {}, finishReason: json.choices?.[0]?.finish_reason || "stop" };
			}

			return await this.readStream(response, combinedSignal, onDelta, resetTimeout);
		} catch (error) {
			if (timeoutController.signal.aborted) {
				throw buildUserError("REQUEST_TIMEOUT", { retryable: true });
			}
			if (combinedSignal.aborted || error?.name === "AbortError") {
				throw buildUserError("REQUEST_ABORTED");
			}
			throw normalizeError(error);
		} finally {
			clearTimeout(timeout);
		}
	}

	async readStream (response, signal, onDelta, resetTimeout) {
		if (!response.body?.getReader) {
			throw buildUserError("STREAM_PARSE_ERROR");
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		const parser = new StreamParser();
		let content = "";
		let usage = {};
		let finishReason = null;

		while (true) {
			if (signal?.aborted) throw buildUserError("REQUEST_ABORTED");
			const { done, value } = await reader.read();
			if (done) break;
			resetTimeout();
			const text = decoder.decode(value, { stream: true });
			const events = parser.push(text);
			for (const event of events) {
				if (event.done) {
					return { content, usage, finishReason: finishReason || "stop" };
				}
				if (event.delta) {
					content += event.delta;
					onDelta(event.delta);
				}
				if (event.usage) usage = event.usage;
				if (event.finishReason) finishReason = event.finishReason;
			}
		}

		for (const event of parser.flush()) {
			if (event.delta) {
				content += event.delta;
				onDelta(event.delta);
			}
			if (event.usage) usage = event.usage;
			if (event.finishReason) finishReason = event.finishReason;
		}

		if (!content) throw buildUserError("EMPTY_RESPONSE");
		return { content, usage, finishReason: finishReason || "stop" };
	}
}

/**
 *
 * @param {...any} signals
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

/**
 *
 * @param response
 */
async function readErrorBody (response) {
	try {
		return await response.text();
	} catch (error) {
		return "";
	}
}

/**
 *
 * @param error
 */
function normalizeError (error) {
	if (error?.code === "STREAM_PARSE_ERROR") return buildUserError("STREAM_PARSE_ERROR", { technicalMessage: error.data });
	if (error?.code && error?.message) return error;
	if (error?.name === "AbortError") return buildUserError("REQUEST_ABORTED");
	return buildUserError("NETWORK_ERROR", { retryable: true, technicalMessage: error?.message });
}

/**
 *
 * @param ms
 * @param signal
 */
function delay (ms, signal) {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(resolve, ms);
		if (signal) {
			signal.addEventListener("abort", () => {
				clearTimeout(timeout);
				reject(buildUserError("REQUEST_ABORTED"));
			}, { once: true });
		}
	});
}

module.exports = {
	DeepSeekClient,
	combineSignals
};
