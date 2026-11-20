"use strict";

/* eslint-disable jsdoc/require-returns, jsdoc/require-param-description, jsdoc/require-param-type */

const DEFAULT_CONFIG = {
	title: "AI 助手",
	baseUrl: "https://api.deepseek.com",
	model: "deepseek-v4-flash",
	systemPrompt: "你是运行在智能魔镜中的AI助手。",
	stream: true,
	temperature: 0.7,
	maxTokens: 2048,
	maxContextMessages: 20,
	maxInputCharacters: 4000,
	maxEstimatedContextCharacters: 16000,
	requestTimeoutMs: 180000,
	apiKeyEnvName: "DEEPSEEK_API_KEY",
	showHeader: true,
	showClearButton: true,
	showStopButton: true,
	autoFocus: false,
	persistConversation: false,
	debug: false,
	allowInsecureLocalBaseUrl: false,
	retryAttempts: 1,
	retryBaseDelayMs: 800,
	webSearch: {
		enabled: true,
		triggerMode: "auto",
		provider: "bing-rss",
		maxResults: 4,
		timeoutMs: 8000,
		locale: "zh-CN"
	},
	voiceChat: {
		enabled: true,
		inputDevice: "default",
		outputDevice: "default",
		initialVolume: 0.22,
		speakEnabled: true,
		mixerDevice: "default",
		mixerControl: "Master",
		startupListeningDelayMs: 1200,
		recordingWarmupMs: 450,
		sampleRate: 16000,
		channels: 1,
		language: "zh",
		vadThreshold: 0.018,
		silenceDurationMs: 1200,
		minSpeechDurationMs: 500,
		maxRecordingDurationMs: 30000,
		sttProvider: "whisper.cpp",
		sttTimeoutMs: 90000,
		whisperBinary: "",
		whisperModel: "",
		whisperPrompt: "",
		whisperThreads: 4,
		ttsProvider: "piper",
		ttsTimeoutMs: 90000,
		piperBinary: "",
		piperModel: "",
		piperConfig: "",
		ttsLengthScale: 1.0,
		espeakBinary: "",
		espeakVoice: "zh",
		espeakSpeed: 150,
		resumeMusicAfterSpeech: true,
		temporaryAudioDirectory: "/tmp/mmm-aichat-voice",
		maxSpeechCharacters: 600,
		debug: false
	}
};

const USER_ERROR_MESSAGES = {
	MODULE_NOT_READY: "AI 模块尚未准备好。",
	EMPTY_INPUT: "请输入内容后再发送。",
	INPUT_TOO_LONG: "输入内容太长，请缩短后重试。",
	REQUEST_IN_PROGRESS: "当前回复尚未完成，请先停止或等待完成。",
	MISSING_API_KEY: "未配置 DeepSeek API Key。",
	INVALID_CONFIGURATION: "AI 模块配置有误。",
	NETWORK_ERROR: "网络连接失败，请稍后重试。",
	REQUEST_TIMEOUT: "请求超时，请稍后重试。",
	REQUEST_ABORTED: "已停止生成。",
	AUTH_FAILED: "DeepSeek API Key 无效或无权限。",
	INSUFFICIENT_BALANCE: "DeepSeek 账户余额不足。",
	RATE_LIMIT: "请求过于频繁，请稍后重试。",
	INVALID_API_REQUEST: "请求参数无效，请检查模型配置。",
	SERVICE_UNAVAILABLE: "DeepSeek 服务暂时不可用。",
	STREAM_PARSE_ERROR: "流式响应解析失败，回复可能不完整。",
	EMPTY_RESPONSE: "AI 没有返回内容。",
	UNKNOWN_ERROR: "AI 请求失败，请稍后重试。",
	VOICE_RECORDING_FAILED: "麦克风录音失败，请检查设备或权限。",
	VOICE_STT_NOT_CONFIGURED: "语音识别组件还没有配置好。",
	VOICE_STT_FAILED: "语音识别失败，请再试一次。",
	VOICE_STT_TIMEOUT: "语音识别超时，请说短一点。",
	VOICE_TTS_NOT_CONFIGURED: "语音朗读组件还没有配置好。",
	VOICE_TTS_FAILED: "语音合成失败，文字回答已显示在屏幕上。",
	VOICE_TTS_TIMEOUT: "语音合成超时，文字回答已显示在屏幕上。",
	VOICE_PLAYBACK_FAILED: "扬声器播放失败，请检查输出设备。",
	VOICE_INPUT_TOO_LONG: "识别到的语音太长，请说短一点。"
};

/**
 *
 * @param config
 */
function normalizeConfig (config = {}) {
	const merged = { ...DEFAULT_CONFIG, ...config };
	const errors = [];

	merged.title = toStringValue(merged.title, DEFAULT_CONFIG.title);
	merged.baseUrl = toStringValue(merged.baseUrl, DEFAULT_CONFIG.baseUrl).replace(/\/+$/, "");
	merged.model = toStringValue(merged.model, DEFAULT_CONFIG.model);
	merged.systemPrompt = toStringValue(merged.systemPrompt, DEFAULT_CONFIG.systemPrompt);
	merged.apiKeyEnvName = toStringValue(merged.apiKeyEnvName, DEFAULT_CONFIG.apiKeyEnvName);
	merged.stream = Boolean(merged.stream);
	merged.showHeader = Boolean(merged.showHeader);
	merged.showClearButton = Boolean(merged.showClearButton);
	merged.showStopButton = Boolean(merged.showStopButton);
	merged.autoFocus = Boolean(merged.autoFocus);
	merged.persistConversation = Boolean(merged.persistConversation);
	merged.debug = Boolean(merged.debug);
	merged.allowInsecureLocalBaseUrl = Boolean(merged.allowInsecureLocalBaseUrl);
	merged.temperature = clampNumber(merged.temperature, 0, 2, DEFAULT_CONFIG.temperature);
	merged.maxTokens = clampInteger(merged.maxTokens, 1, 8192, DEFAULT_CONFIG.maxTokens);
	merged.maxContextMessages = clampInteger(merged.maxContextMessages, 2, 100, DEFAULT_CONFIG.maxContextMessages);
	merged.maxInputCharacters = clampInteger(merged.maxInputCharacters, 1, 20000, DEFAULT_CONFIG.maxInputCharacters);
	merged.maxEstimatedContextCharacters = clampInteger(merged.maxEstimatedContextCharacters, 1000, 100000, DEFAULT_CONFIG.maxEstimatedContextCharacters);
	merged.requestTimeoutMs = clampInteger(merged.requestTimeoutMs, 5000, 300000, DEFAULT_CONFIG.requestTimeoutMs);
	merged.retryAttempts = clampInteger(merged.retryAttempts, 0, 3, DEFAULT_CONFIG.retryAttempts);
	merged.retryBaseDelayMs = clampInteger(merged.retryBaseDelayMs, 100, 10000, DEFAULT_CONFIG.retryBaseDelayMs);
	merged.webSearch = normalizeWebSearchConfig(merged.webSearch || {});
	merged.voiceChat = normalizeVoiceConfig(merged.voiceChat || {});

	if (!merged.model) {
		errors.push("model is required");
	}

	if (!isValidBaseUrl(merged.baseUrl, merged.allowInsecureLocalBaseUrl)) {
		errors.push("baseUrl must be a valid HTTPS URL, or an explicit local HTTP URL");
	}

	if (!(/^[A-Z0-9_]+$/i).test(merged.apiKeyEnvName)) {
		errors.push("apiKeyEnvName must be an environment variable name");
	}

	return { config: merged, errors };
}

/**
 *
 * @param content
 * @param config
 */
function validateUserContent (content, config) {
	if (typeof content !== "string") {
		return { ok: false, code: "EMPTY_INPUT", content: "" };
	}

	const trimmed = content.trim();
	if (!trimmed) {
		return { ok: false, code: "EMPTY_INPUT", content: "" };
	}

	if (trimmed.length > config.maxInputCharacters) {
		return { ok: false, code: "INPUT_TOO_LONG", content: trimmed };
	}

	return { ok: true, content: trimmed };
}

/**
 *
 * @param code
 * @param detail
 */
function buildUserError (code, detail = {}) {
	return {
		code,
		message: USER_ERROR_MESSAGES[code] || USER_ERROR_MESSAGES.UNKNOWN_ERROR,
		retryable: Boolean(detail.retryable),
		technicalMessage: detail.technicalMessage
	};
}

/**
 *
 * @param voiceConfig
 */
function normalizeVoiceConfig (voiceConfig = {}) {
	const defaults = DEFAULT_CONFIG.voiceChat;
	const merged = { ...defaults, ...voiceConfig };

	merged.enabled = Boolean(merged.enabled);
	merged.inputDevice = toStringValue(merged.inputDevice, defaults.inputDevice);
	merged.outputDevice = toStringValue(merged.outputDevice, defaults.outputDevice);
	merged.mixerDevice = toStringValue(merged.mixerDevice, defaults.mixerDevice);
	merged.mixerControl = toStringValue(merged.mixerControl, defaults.mixerControl);
	merged.language = toStringValue(merged.language, defaults.language);
	merged.sttProvider = toStringValue(merged.sttProvider, defaults.sttProvider);
	merged.whisperBinary = toStringValue(merged.whisperBinary, defaults.whisperBinary);
	merged.whisperModel = toStringValue(merged.whisperModel, defaults.whisperModel);
	merged.whisperPrompt = toStringValue(merged.whisperPrompt, defaults.whisperPrompt);
	merged.ttsProvider = toStringValue(merged.ttsProvider, defaults.ttsProvider);
	merged.piperBinary = toStringValue(merged.piperBinary, defaults.piperBinary);
	merged.piperModel = toStringValue(merged.piperModel, defaults.piperModel);
	merged.piperConfig = toStringValue(merged.piperConfig, defaults.piperConfig);
	merged.espeakBinary = toStringValue(merged.espeakBinary, defaults.espeakBinary);
	merged.espeakVoice = toStringValue(merged.espeakVoice, defaults.espeakVoice);
	merged.temporaryAudioDirectory = toStringValue(merged.temporaryAudioDirectory, defaults.temporaryAudioDirectory);
	merged.sampleRate = clampInteger(merged.sampleRate, 8000, 48000, defaults.sampleRate);
	merged.channels = clampInteger(merged.channels, 1, 2, defaults.channels);
	merged.initialVolume = clampNumber(merged.initialVolume, 0, 1, defaults.initialVolume);
	merged.speakEnabled = Boolean(merged.speakEnabled);
	merged.startupListeningDelayMs = clampInteger(merged.startupListeningDelayMs, 0, 5000, defaults.startupListeningDelayMs);
	merged.recordingWarmupMs = clampInteger(merged.recordingWarmupMs, 0, 3000, defaults.recordingWarmupMs);
	merged.vadThreshold = clampNumber(merged.vadThreshold, 0.001, 0.2, defaults.vadThreshold);
	merged.silenceDurationMs = clampInteger(merged.silenceDurationMs, 300, 5000, defaults.silenceDurationMs);
	merged.minSpeechDurationMs = clampInteger(merged.minSpeechDurationMs, 100, 5000, defaults.minSpeechDurationMs);
	merged.maxRecordingDurationMs = clampInteger(merged.maxRecordingDurationMs, 3000, 120000, defaults.maxRecordingDurationMs);
	merged.sttTimeoutMs = clampInteger(merged.sttTimeoutMs, 5000, 300000, defaults.sttTimeoutMs);
	merged.whisperThreads = clampInteger(merged.whisperThreads, 1, 8, defaults.whisperThreads);
	merged.ttsTimeoutMs = clampInteger(merged.ttsTimeoutMs, 5000, 300000, defaults.ttsTimeoutMs);
	merged.ttsLengthScale = clampNumber(merged.ttsLengthScale, 0.5, 2.0, defaults.ttsLengthScale);
	merged.espeakSpeed = clampInteger(merged.espeakSpeed, 80, 260, defaults.espeakSpeed);
	merged.resumeMusicAfterSpeech = Boolean(merged.resumeMusicAfterSpeech);
	merged.maxSpeechCharacters = clampInteger(merged.maxSpeechCharacters, 50, 4000, defaults.maxSpeechCharacters);
	merged.debug = Boolean(merged.debug);

	return merged;
}

/**
 *
 * @param webSearchConfig
 */
function normalizeWebSearchConfig (webSearchConfig = {}) {
	const defaults = DEFAULT_CONFIG.webSearch;
	const merged = { ...defaults, ...webSearchConfig };

	merged.enabled = Boolean(merged.enabled);
	merged.triggerMode = ["always", "auto", "manual"].includes(merged.triggerMode) ? merged.triggerMode : defaults.triggerMode;
	merged.provider = toStringValue(merged.provider, defaults.provider);
	merged.locale = toStringValue(merged.locale, defaults.locale);
	merged.maxResults = clampInteger(merged.maxResults, 1, 8, defaults.maxResults);
	merged.timeoutMs = clampInteger(merged.timeoutMs, 2000, 30000, defaults.timeoutMs);

	return merged;
}

/**
 *
 * @param status
 * @param bodyText
 */
function mapHttpError (status, bodyText = "") {
	if (status === 401 || status === 403) return buildUserError("AUTH_FAILED");
	if (status === 402) return buildUserError("INSUFFICIENT_BALANCE");
	if (status === 400 || status === 422) return buildUserError("INVALID_API_REQUEST", { technicalMessage: safeSnippet(bodyText) });
	if (status === 408) return buildUserError("REQUEST_TIMEOUT", { retryable: true });
	if (status === 429) return buildUserError("RATE_LIMIT", { retryable: true });
	if (status >= 500) return buildUserError("SERVICE_UNAVAILABLE", { retryable: true });
	return buildUserError("UNKNOWN_ERROR", { technicalMessage: `HTTP ${status}` });
}

/**
 *
 * @param error
 */
function isRetryableError (error) {
	return Boolean(error && error.retryable);
}

/**
 *
 * @param value
 */
function redact (value) {
	return String(value || "").replace(/Bearer\s+[\w.-]+/gi, "Bearer [REDACTED]");
}

/**
 *
 * @param value
 */
function safeSnippet (value) {
	return redact(value).slice(0, 300);
}

/**
 *
 * @param value
 * @param fallback
 */
function toStringValue (value, fallback) {
	return typeof value === "string" ? value.trim() : fallback;
}

/**
 *
 * @param value
 * @param min
 * @param max
 * @param fallback
 */
function clampNumber (value, min, max, fallback) {
	const number = Number(value);
	if (!Number.isFinite(number)) return fallback;
	return Math.min(max, Math.max(min, number));
}

/**
 *
 * @param value
 * @param min
 * @param max
 * @param fallback
 */
function clampInteger (value, min, max, fallback) {
	const number = Math.trunc(Number(value));
	if (!Number.isFinite(number)) return fallback;
	return Math.min(max, Math.max(min, number));
}

/**
 *
 * @param baseUrl
 * @param allowInsecureLocalBaseUrl
 */
function isValidBaseUrl (baseUrl, allowInsecureLocalBaseUrl) {
	try {
		const url = new URL(baseUrl);
		if (url.protocol === "https:") return true;
		if (!allowInsecureLocalBaseUrl || url.protocol !== "http:") return false;
		return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
	} catch (error) {
		return false;
	}
}

module.exports = {
	DEFAULT_CONFIG,
	USER_ERROR_MESSAGES,
	buildUserError,
	isRetryableError,
	mapHttpError,
	normalizeConfig,
	redact,
	validateUserContent
};
