"use strict";

/* eslint-disable jsdoc/require-returns, jsdoc/require-param-description, jsdoc/require-param-type */

class StreamParser {
	constructor () {
		this.buffer = "";
		this.done = false;
	}

	push (chunk) {
		this.buffer += chunk;
		const events = [];
		let boundary = findBoundary(this.buffer);

		while (boundary.index !== -1) {
			const rawEvent = this.buffer.slice(0, boundary.index);
			this.buffer = this.buffer.slice(boundary.index + boundary.length);
			const event = parseEvent(rawEvent);
			if (event) {
				events.push(event);
				if (event.done) {
					this.done = true;
				}
			}
			boundary = findBoundary(this.buffer);
		}

		return events;
	}

	flush () {
		if (!this.buffer.trim()) {
			this.buffer = "";
			return [];
		}

		const event = parseEvent(this.buffer);
		this.buffer = "";
		return event ? [event] : [];
	}
}

/**
 *
 * @param buffer
 */
function findBoundary (buffer) {
	const boundaries = ["\n\n", "\r\n\r\n"];
	let best = { index: -1, length: 0 };

	for (const boundary of boundaries) {
		const index = buffer.indexOf(boundary);
		if (index !== -1 && (best.index === -1 || index < best.index)) {
			best = { index, length: boundary.length };
		}
	}

	return best;
}

/**
 *
 * @param rawEvent
 */
function parseEvent (rawEvent) {
	const dataLines = rawEvent
		.split(/\r?\n/)
		.filter((line) => line.startsWith("data:"))
		.map((line) => line.slice(5).trimStart());

	if (!dataLines.length) {
		return null;
	}

	const data = dataLines.join("\n").trim();
	if (data === "[DONE]") {
		return { done: true };
	}

	try {
		const json = JSON.parse(data);
		const choice = json.choices?.[0] || {};
		return {
			done: false,
			delta: choice.delta?.content || "",
			finishReason: choice.finish_reason || null,
			usage: json.usage || null,
			raw: json
		};
	} catch (error) {
		const parseError = new Error("Invalid SSE JSON");
		parseError.code = "STREAM_PARSE_ERROR";
		parseError.cause = error;
		parseError.data = data.slice(0, 300);
		throw parseError;
	}
}

module.exports = {
	StreamParser,
	parseEvent
};
