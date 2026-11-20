"use strict";

/* eslint-disable jsdoc/require-returns, jsdoc/require-param-description, jsdoc/require-param-type */

const test = require("node:test");
const assert = require("node:assert/strict");
const { ConversationManager } = require("../lib/conversation-manager");
const { normalizeConfig, validateUserContent } = require("../lib/validation");

/**
 *
 * @param overrides
 */
function testConfig (overrides = {}) {
	return normalizeConfig({
		systemPrompt: "system",
		maxContextMessages: 5,
		maxEstimatedContextCharacters: 10000,
		maxInputCharacters: 8,
		...overrides
	}).config;
}

test("keeps system prompt and adds user/assistant messages", () => {
	const manager = new ConversationManager(testConfig());
	manager.addUserMessage("s1", "hello");
	manager.addAssistantMessage("s1", "world");
	assert.deepEqual(manager.getMessagesForRequest("s1"), [
		{ role: "system", content: "system" },
		{ role: "user", content: "hello" },
		{ role: "assistant", content: "world" }
	]);
});

test("trims old complete turns while preserving system prompt", () => {
	const manager = new ConversationManager(testConfig({ maxContextMessages: 5 }));
	manager.addUserMessage("s1", "u1");
	manager.addAssistantMessage("s1", "a1");
	manager.addUserMessage("s1", "u2");
	manager.addAssistantMessage("s1", "a2");
	manager.addUserMessage("s1", "u3");
	manager.addAssistantMessage("s1", "a3");
	const messages = manager.getMessagesForRequest("s1");
	assert.equal(messages[0].role, "system");
	assert.deepEqual(messages.slice(1), [
		{ role: "user", content: "u2" },
		{ role: "assistant", content: "a2" },
		{ role: "user", content: "u3" },
		{ role: "assistant", content: "a3" }
	]);
});

test("clears session back to system prompt", () => {
	const manager = new ConversationManager(testConfig());
	manager.addUserMessage("s1", "hello");
	manager.clear("s1");
	assert.deepEqual(manager.getMessagesForRequest("s1"), [{ role: "system", content: "system" }]);
});

test("rejects empty and too long input", () => {
	const config = testConfig();
	assert.equal(validateUserContent("   ", config).code, "EMPTY_INPUT");
	assert.equal(validateUserContent("123456789", config).code, "INPUT_TOO_LONG");
	assert.deepEqual(validateUserContent("  hello  ", config), { ok: true, content: "hello" });
});
