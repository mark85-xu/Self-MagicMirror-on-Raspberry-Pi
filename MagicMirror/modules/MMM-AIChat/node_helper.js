"use strict";

/* eslint-disable jsdoc/require-returns, jsdoc/require-param-description, jsdoc/require-param-type */

const path = require("node:path");
const NodeHelper = require("node_helper");
const Log = require("logger");
const { ConversationManager } = require("./lib/conversation-manager");
const { DeepSeekClient } = require("./lib/deepseek-client");
const { loadEnvFile } = require("./lib/env-loader");
const { buildUserError, normalizeConfig, redact, validateUserContent } = require("./lib/validation");
const { VoiceChatController } = require("./lib/voice-chat-controller");
const { GreetingSpeaker } = require("./lib/greeting-speaker");
const { WebSearchClient, shouldSearch, buildSearchContextMessage } = require("./lib/web-search-client");

module.exports = NodeHelper.create({
	start () {
		Log.log(`Starting module helper: ${this.name}`);
		this.configs = new Map();
		this.managers = new Map();
		this.activeRequests = new Map();
		this.voiceControllers = new Map();
		this.greetingSpeaker = new GreetingSpeaker();
		this.localEnv = loadEnvFile(path.join(__dirname, ".env"));
	},

	socketNotificationReceived (notification, payload = {}) {
		if (notification === "AI_CHAT_INIT") {
			this.handleInit(payload);
		} else if (notification === "AI_CHAT_REQUEST") {
			this.handleRequest(payload).catch((error) => this.sendError(payload, normalizeHelperError(error)));
		} else if (notification === "AI_CHAT_ABORT") {
			this.abortRequest(payload);
		} else if (notification === "AI_CHAT_CLEAR") {
			this.clearSession(payload);
		} else if (notification === "AI_CHAT_DESTROY_SESSION") {
			this.destroySession(payload);
		} else if (notification === "VOICE_CHAT_START") {
			this.startVoiceChat(payload).catch((error) => this.sendVoiceError(payload, normalizeHelperError(error)));
		} else if (notification === "VOICE_CHAT_STOP") {
			this.stopVoiceChat(payload);
		} else if (notification === "VOICE_CHAT_CANCEL_TURN") {
			this.cancelVoiceTurn(payload);
		} else if (notification === "VOICE_CHAT_SET_VOLUME") {
			this.setVoiceVolume(payload);
		} else if (notification === "VOICE_CHAT_SET_SPEAK_ENABLED") {
			this.setVoiceSpeakEnabled(payload);
		} else if (notification === "AI_CHAT_GREETING") {
			this.speakGreeting(payload);
		} else if (notification === "AI_CHAT_GREETING_CANCEL") {
			if (this.greetingSpeaker.active?.sessionId === payload.sessionId) this.greetingSpeaker.stop();
		}
	},

	async speakGreeting (payload) {
		const response = { sessionId: payload.sessionId, eventId: payload.eventId };
		try {
			if (!this.configs.has(payload.sessionId)) throw new Error("AI 助手尚未就绪");
			const voiceBusy = [...this.voiceControllers.values()].some((controller) => controller.enabled);
			if (voiceBusy || this.activeRequests.size) {
				this.sendSocketNotification("AI_CHAT_GREETING_RESULT", { ...response, status: "busy" });
				return;
			}
			const config = this.getConfig(payload.sessionId);
			const status = await this.greetingSpeaker.speak({ eventId: payload.eventId, text: payload.text, sessionId: payload.sessionId, config });
			if (["spoken", "muted"].includes(status)) this.getManager(payload.sessionId, config).addAssistantMessage(payload.sessionId, payload.text);
			this.sendSocketNotification("AI_CHAT_GREETING_RESULT", { ...response, status });
		} catch {
			this.sendSocketNotification("AI_CHAT_GREETING_RESULT", { ...response, status: "error", message: "问候语音播放失败，请检查语音模型与输出设备。" });
		}
	},

	stop () {
		this.greetingSpeaker?.stop();
		return Promise.all([...this.voiceControllers.values()].map((controller) => controller.stop()));
	},

	handleInit (payload) {
		const { config, errors } = normalizeConfig(payload.config || {});
		this.configs.set(payload.sessionId, config);
		this.managers.set(payload.sessionId, new ConversationManager(config));

		if (errors.length > 0) {
			this.sendError(payload, buildUserError("INVALID_CONFIGURATION", { technicalMessage: errors.join("; ") }));
			return;
		}

		const hasApiKey = Boolean(this.getApiKey(config));
		this.sendSocketNotification("AI_CHAT_READY", {
			sessionId: payload.sessionId,
			hasApiKey,
			config: sanitizeConfigForClient(config)
		});
	},

	async handleRequest (payload, callbacks = {}) {
		this.greetingSpeaker?.stop();
		const sessionId = payload.sessionId;
		const requestId = payload.requestId;
		const config = this.getConfig(sessionId);
		const manager = this.getManager(sessionId, config);
		const requestKey = this.getRequestKey(sessionId);

		if (this.activeRequests.has(requestKey)) {
			this.sendError(payload, buildUserError("REQUEST_IN_PROGRESS"));
			return null;
		}

		const validation = validateUserContent(payload.content, config);
		if (!validation.ok) {
			this.sendError(payload, buildUserError(validation.code));
			return null;
		}

		const apiKey = this.getApiKey(config);
		if (!apiKey) {
			this.sendError(payload, buildUserError("MISSING_API_KEY"));
			return null;
		}

		const controller = new AbortController();
		this.activeRequests.set(requestKey, { requestId, controller, partial: "" });

		const client = new DeepSeekClient(config, {
			apiKey
		});

		try {
			manager.addUserMessage(sessionId, validation.content);
			const messages = await this.buildMessagesForRequest(sessionId, validation.content, config, manager, controller.signal);
			const result = await client.createChatCompletion({
				requestId,
				messages,
				signal: controller.signal,
				onStart: () => {
					this.sendSocketNotification("AI_CHAT_STREAM_START", { sessionId, requestId });
					callbacks.onStart?.();
				},
				onDelta: (delta) => {
					const active = this.activeRequests.get(requestKey);
					if (!active || active.requestId !== requestId) return;
					active.partial += delta;
					this.sendSocketNotification("AI_CHAT_STREAM_CHUNK", { sessionId, requestId, delta });
					callbacks.onDelta?.(delta);
				}
			});

			if (controller.signal.aborted) {
				this.sendSocketNotification("AI_CHAT_ABORTED", { sessionId, requestId });
				return null;
			}

			if (result.content) {
				manager.addAssistantMessage(sessionId, result.content);
			}

			this.sendSocketNotification("AI_CHAT_STREAM_END", {
				sessionId,
				requestId,
				content: result.content,
				usage: result.usage || {},
				finishReason: result.finishReason || "stop"
			});
			callbacks.onEnd?.(result);
			return result;
		} catch (error) {
			const normalized = normalizeHelperError(error);
			if (normalized.code === "REQUEST_ABORTED") {
				this.sendSocketNotification("AI_CHAT_ABORTED", { sessionId, requestId });
			} else {
				this.sendError(payload, normalized);
			}
			callbacks.onError?.(normalized);
			return null;
		} finally {
			const active = this.activeRequests.get(requestKey);
			if (active?.requestId === requestId) {
				this.activeRequests.delete(requestKey);
			}
		}
	},

	abortRequest (payload) {
		const requestKey = this.getRequestKey(payload.sessionId);
		const active = this.activeRequests.get(requestKey);
		if (!active) {
			this.sendSocketNotification("AI_CHAT_ABORTED", {
				sessionId: payload.sessionId,
				requestId: payload.requestId
			});
			return;
		}

		active.controller.abort();
		this.activeRequests.delete(requestKey);
		this.sendSocketNotification("AI_CHAT_ABORTED", {
			sessionId: payload.sessionId,
			requestId: active.requestId
		});
	},

	clearSession (payload) {
		this.abortRequest(payload);
		this.cancelVoiceTurn(payload);
		const config = this.getConfig(payload.sessionId);
		this.getManager(payload.sessionId, config).clear(payload.sessionId);
		this.sendSocketNotification("AI_CHAT_CLEARED", {
			sessionId: payload.sessionId,
			requestId: payload.requestId
		});
	},

	destroySession (payload) {
		if (this.greetingSpeaker.active?.sessionId === payload.sessionId) this.greetingSpeaker.stop();
		this.abortRequest(payload);
		this.stopVoiceChat(payload);
		this.managers.delete(payload.sessionId);
		this.configs.delete(payload.sessionId);
	},

	async startVoiceChat (payload) {
		this.greetingSpeaker?.stop();
		const config = this.getConfig(payload.sessionId);
		if (config.voiceChat?.enabled === false) {
			this.sendVoiceError(payload, buildUserError("INVALID_CONFIGURATION", { technicalMessage: "voiceChat is disabled" }));
			return;
		}

		let controller = this.voiceControllers.get(payload.sessionId);
		if (!controller) {
			controller = new VoiceChatController({
				helper: this,
				sessionId: payload.sessionId,
				config,
				logger: Log
			});
			this.voiceControllers.set(payload.sessionId, controller);
		}
		await controller.start();
	},

	stopVoiceChat (payload) {
		const controller = this.voiceControllers.get(payload.sessionId);
		if (!controller) {
			this.sendVoiceDisabled(payload.sessionId);
			return;
		}
		controller.stop()
			.catch((error) => {
				Log.warn(`${this.name} voice stop failed: ${redact(error?.message || error)}`);
			})
			.finally(() => {
				this.voiceControllers.delete(payload.sessionId);
				this.sendVoiceDisabled(payload.sessionId);
			});
	},

	cancelVoiceTurn (payload) {
		const controller = this.voiceControllers.get(payload.sessionId);
		if (controller) {
			controller.cancelCurrentTurn();
		}
	},

	setVoiceVolume (payload) {
		const controller = this.voiceControllers.get(payload.sessionId);
		const config = this.getConfig(payload.sessionId);
		const volume = clampVolume(payload.volume, config.voiceChat.initialVolume);
		config.voiceChat.initialVolume = volume;
		if (controller) {
			controller.setVolume(volume);
		}
		this.sendVoiceSettings(payload.sessionId, { volume });
	},

	setVoiceSpeakEnabled (payload) {
		const controller = this.voiceControllers.get(payload.sessionId);
		const config = this.getConfig(payload.sessionId);
		const speakEnabled = Boolean(payload.enabled);
		config.voiceChat.speakEnabled = speakEnabled;
		if (!speakEnabled) this.greetingSpeaker?.stop();
		if (controller) {
			controller.setSpeakEnabled(speakEnabled);
		}
		this.sendVoiceSettings(payload.sessionId, { speakEnabled });
	},

	async buildMessagesForRequest (sessionId, content, config, manager, signal) {
		const messages = manager.getMessagesForRequest(sessionId);
		if (!shouldSearch(content, config.webSearch)) {
			return messages;
		}

		try {
			const searchClient = new WebSearchClient(config.webSearch);
			const results = await searchClient.search(content, signal);
			if (!results.length) return messages;
			return injectSystemContext(messages, buildSearchContextMessage(content, results));
		} catch (error) {
			Log.warn(`${this.name} web search failed: ${redact(error?.message || error)}`);
			return messages;
		}
	},

	getConfig (sessionId) {
		return this.configs.get(sessionId) || normalizeConfig({}).config;
	},

	getManager (sessionId, config) {
		if (!this.managers.has(sessionId)) {
			this.managers.set(sessionId, new ConversationManager(config));
		}
		return this.managers.get(sessionId);
	},

	getRequestKey (sessionId) {
		return `${this.name}:${sessionId}`;
	},

	getApiKey (config) {
		return process.env[config.apiKeyEnvName] || this.localEnv[config.apiKeyEnvName] || "";
	},

	sendError (payload, error) {
		const response = {
			sessionId: payload.sessionId,
			requestId: payload.requestId,
			code: error.code || "UNKNOWN_ERROR",
			message: error.message || "AI 请求失败，请稍后重试。",
			retryable: Boolean(error.retryable)
		};

		Log.warn(`${this.name}: ${response.code}${error.technicalMessage ? ` - ${redact(error.technicalMessage)}` : ""}`);
		this.sendSocketNotification("AI_CHAT_ERROR", response);
	},

	sendVoiceError (payload, error) {
		const response = {
			sessionId: payload.sessionId,
			requestId: payload.requestId,
			code: error.code || "UNKNOWN_ERROR",
			message: error.message || "语音聊天出错，请稍后重试。",
			retryable: Boolean(error.retryable)
		};
		Log.warn(`${this.name} voice: ${response.code}${error.technicalMessage ? ` - ${redact(error.technicalMessage)}` : ""}`);
		this.sendSocketNotification("VOICE_ERROR", response);
	},

	sendVoiceDisabled (sessionId) {
		this.sendSocketNotification("VOICE_STATE_CHANGED", {
			sessionId,
			state: "disabled",
			message: "语音聊天已关闭"
		});
	},

	sendVoiceSettings (sessionId, settings) {
		this.sendSocketNotification("VOICE_SETTINGS_CHANGED", {
			sessionId,
			...settings
		});
	}
});

/**
 *
 * @param config
 */
function sanitizeConfigForClient (config) {
	return {
		title: config.title,
		model: config.model,
		maxInputCharacters: config.maxInputCharacters,
		showHeader: config.showHeader,
		showClearButton: config.showClearButton,
		showStopButton: config.showStopButton,
		autoFocus: config.autoFocus,
		debug: config.debug
	};
}

/**
 *
 * @param error
 */
function normalizeHelperError (error) {
	if (error?.code && error?.message) {
		return error;
	}
	return buildUserError("UNKNOWN_ERROR", { technicalMessage: error?.message });
}

/**
 *
 * @param value
 * @param fallback
 */
function clampVolume (value, fallback = 0.22) {
	const number = Number.parseFloat(value);
	if (!Number.isFinite(number)) return fallback;
	return Math.min(1, Math.max(0, number));
}

/**
 *
 * @param messages
 * @param contextMessage
 */
function injectSystemContext (messages, contextMessage) {
	const copied = messages.map((message) => ({ ...message }));
	const lastUserIndex = copied.map((message) => message.role).lastIndexOf("user");
	const insertIndex = lastUserIndex >= 0 ? lastUserIndex : copied.length;
	copied.splice(insertIndex, 0, { role: "system", content: contextMessage });
	return copied;
}
