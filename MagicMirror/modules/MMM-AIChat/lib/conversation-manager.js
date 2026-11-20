"use strict";

/* eslint-disable jsdoc/require-returns, jsdoc/require-param-description, jsdoc/require-param-type */

class ConversationManager {
	constructor (config) {
		this.config = config;
		this.sessions = new Map();
	}

	getSession (sessionId) {
		if (!this.sessions.has(sessionId)) {
			this.sessions.set(sessionId, {
				sessionId,
				messages: [{ role: "system", content: this.config.systemPrompt }],
				createdAt: Date.now(),
				updatedAt: Date.now()
			});
		}

		return this.sessions.get(sessionId);
	}

	clear (sessionId) {
		this.sessions.set(sessionId, {
			sessionId,
			messages: [{ role: "system", content: this.config.systemPrompt }],
			createdAt: Date.now(),
			updatedAt: Date.now()
		});
	}

	destroy (sessionId) {
		this.sessions.delete(sessionId);
	}

	addUserMessage (sessionId, content) {
		return this.addMessage(sessionId, "user", content);
	}

	addAssistantMessage (sessionId, content) {
		return this.addMessage(sessionId, "assistant", content);
	}

	addMessage (sessionId, role, content) {
		const session = this.getSession(sessionId);
		session.messages.push({ role, content });
		session.updatedAt = Date.now();
		this.trim(session);
		return session.messages;
	}

	getMessagesForRequest (sessionId) {
		const session = this.getSession(sessionId);
		this.trim(session);
		return session.messages.map((message) => ({ ...message }));
	}

	trim (session) {
		const system = session.messages.find((message) => message.role === "system") || { role: "system", content: this.config.systemPrompt };
		let nonSystem = session.messages.filter((message) => message.role !== "system");
		const maxNonSystem = Math.max(0, this.config.maxContextMessages - 1);

		while (nonSystem.length > maxNonSystem) {
			nonSystem = dropOldestTurn(nonSystem);
		}

		while (estimateMessagesLength([system, ...nonSystem]) > this.config.maxEstimatedContextCharacters && nonSystem.length > 0) {
			nonSystem = dropOldestTurn(nonSystem);
		}

		session.messages = [system, ...nonSystem];
	}
}

/**
 *
 * @param messages
 */
function dropOldestTurn (messages) {
	if (messages.length <= 1) return [];
	const dropCount = messages[0]?.role === "user" && messages[1]?.role === "assistant" ? 2 : 1;
	return messages.slice(dropCount);
}

/**
 *
 * @param messages
 */
function estimateMessagesLength (messages) {
	return messages.reduce((total, message) => total + String(message.content || "").length + 20, 0);
}

module.exports = {
	ConversationManager,
	estimateMessagesLength
};
