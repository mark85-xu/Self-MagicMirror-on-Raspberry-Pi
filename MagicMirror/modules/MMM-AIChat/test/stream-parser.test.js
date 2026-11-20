"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { StreamParser } = require("../lib/stream-parser");

test("parses SSE data split across chunks", () => {
	const parser = new StreamParser();
	assert.deepEqual(parser.push("data: {\"choices\":[{\"delta\":{\"content\":\"he"), []);
	const events = parser.push("llo\"}}]}\n\n");
	assert.equal(events.length, 1);
	assert.equal(events[0].delta, "hello");
});

test("parses multiple SSE events in one chunk and DONE", () => {
	const parser = new StreamParser();
	const events = parser.push([
		"data: {\"choices\":[{\"delta\":{\"content\":\"a\"}}]}",
		"",
		"data: {\"choices\":[{\"delta\":{\"content\":\"b\"}}]}",
		"",
		"data: [DONE]",
		"",
		""
	].join("\n"));
	assert.equal(events.length, 3);
	assert.equal(events[0].delta, "a");
	assert.equal(events[1].delta, "b");
	assert.equal(events[2].done, true);
});

test("throws a classified error for invalid JSON data", () => {
	const parser = new StreamParser();
	assert.throws(() => parser.push("data: {nope}\n\n"), /Invalid SSE JSON/);
});
