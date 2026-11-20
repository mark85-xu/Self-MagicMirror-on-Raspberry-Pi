"use strict";

/* eslint-disable jsdoc/require-param-description, jsdoc/require-param-type, jsdoc/require-returns */

const fs = require("node:fs");
const path = require("node:path");
const { AudioPlayer } = require("./audio-player");
const { AudioRecorder } = require("./audio-recorder");
const { WhisperCppSTT } = require("./providers/whisper-cpp-stt");
const { createTTSProvider } = require("./providers/piper-tts");
const { sanitizeForSpeech } = require("./speech-text-sanitizer");
const { buildUserError } = require("./validation");

class VoiceChatController {
	constructor ({ helper, sessionId, config, logger }) {
		this.helper = helper;
		this.sessionId = sessionId;
		this.config = config;
		this.logger = logger;
		this.enabled = false;
		this.state = "disabled";
		this.controller = null;
		this.recorder = new AudioRecorder(config, logger);
		this.stt = new WhisperCppSTT(config);
		this.tts = createTTSProvider(config);
		this.player = new AudioPlayer(config);
		this.tempFiles = new Set();
		this.volume = clampVolume(config.voiceChat.initialVolume);
		this.speakEnabled = config.voiceChat.speakEnabled !== false;
		this.speechSkipRequested = false;
		this.deferListeningUntil = 0;
		this.needsStartupListeningDelay = false;
	}

	async start () {
		if (this.enabled) return;
		this.enabled = true;
		this.controller = new AbortController();
		this.setState("initializing", "正在初始化麦克风");

		try {
			await fs.promises.mkdir(this.config.voiceChat.temporaryAudioDirectory, { recursive: true });
			await this.assertConfigured();
			this.player.setVolume(this.volume);
			this.needsStartupListeningDelay = true;
			this.runLoop(this.controller.signal).catch((error) => this.handleFatalError(error));
		} catch (error) {
			await this.handleFatalError(error);
		}
	}

	async stop () {
		if (!this.enabled && this.state === "disabled") return;
		this.setState("stopping", "正在关闭");
		this.enabled = false;
		this.controller?.abort();
		this.recorder.stop();
		this.stt.stop();
		this.tts.stop();
		this.player.stop();
		this.helper.abortRequest({
			sessionId: this.sessionId,
			requestId: `voice-stop-${Date.now()}`
		});
		await this.cleanupTempFiles();
		this.setState("disabled", "语音聊天已关闭");
	}

	setVolume (volume) {
		this.volume = clampVolume(volume);
		this.player.setVolume(this.volume);
		this.sendSettings();
	}

	setSpeakEnabled (enabled) {
		this.speakEnabled = Boolean(enabled);
		if (!this.speakEnabled && this.state === "speaking") {
			this.speechSkipRequested = true;
			this.deferListeningUntil = Date.now() + 2000;
			this.tts.stop();
			this.player.stop();
			this.setState("speaking", "朗读已关闭，2秒后继续聆听");
		}
		this.sendSettings();
	}

	cancelCurrentTurn () {
		this.controller?.abort();
		this.recorder.stop();
		this.stt.stop();
		this.tts.stop();
		this.player.stop();
		this.controller = new AbortController();
		if (this.enabled) {
			this.setState("listening", "正在聆听");
			this.runLoop(this.controller.signal).catch((error) => this.handleFatalError(error));
		}
	}

	destroy () {
		return this.stop();
	}

	async runLoop (signal) {
		this.setState("listening", "正在聆听");
		if (this.needsStartupListeningDelay) {
			this.needsStartupListeningDelay = false;
			try {
				await wait(this.config.voiceChat.startupListeningDelayMs, signal);
			} catch (error) {
				if (isAbortError(error) || signal.aborted) return;
				throw error;
			}
		}
		while (this.enabled && !signal.aborted) {
			let recorded = null;
			try {
				recorded = await this.recordUtterance(signal);
				if (!recorded || recorded.empty) {
					if (this.enabled && !signal.aborted) this.setState("listening", "正在聆听");
					continue;
				}

				this.setState("recognizing", "正在识别");
				const transcript = await this.stt.transcribe(recorded.audioPath, signal);
				const content = String(transcript || "").trim();
				await this.removeTempFile(recorded.audioPath);

				if (!content) {
					this.setState("listening", "没有听清，请再说一次");
					continue;
				}

				await this.handleRecognizedText(content, signal);
			} catch (error) {
				if (isAbortError(error) || signal.aborted) break;
				await this.reportRecoverableError(error);
			} finally {
				if (recorded?.audioPath) {
					await this.removeTempFile(recorded.audioPath);
				}
			}
		}
	}

	async recordUtterance (signal) {
		this.setState("listening", "正在聆听");
		const result = await this.recorder.recordOnce(this.sessionId, signal);
		if (!result.empty) {
			this.tempFiles.add(result.audioPath);
			this.setState("speech_detected", "检测到语音");
		}
		return result;
	}

	async handleRecognizedText (content, signal) {
		if (content.length > this.config.voiceChat.maxSpeechCharacters) {
			this.sendVoiceError(buildUserError("VOICE_INPUT_TOO_LONG"));
			this.setState("listening", "语音太长，请简短一点");
			return;
		}

		const requestId = `voice-${Date.now()}-${Math.random().toString(16).slice(2)}`;
		this.helper.sendSocketNotification("VOICE_TRANSCRIPT_FINAL", {
			sessionId: this.sessionId,
			requestId,
			content
		});

		this.setState("thinking", "正在思考");
		const result = await this.helper.handleRequest({
			sessionId: this.sessionId,
			requestId,
			content,
			timestamp: Date.now()
		}, {
			onStart: () => this.setState("thinking", "正在思考"),
			onDelta: () => {
				if (this.state !== "generating") this.setState("generating", "正在生成回答");
			}
		});

		if (!result?.content || signal.aborted || !this.enabled) return;

		const speechText = sanitizeForSpeech(result.content, this.config.voiceChat.maxSpeechCharacters);
		if (!speechText || !this.speakEnabled) {
			this.setState("listening", "回答已显示在屏幕上");
			return;
		}

		await this.speak(speechText, signal);
		await this.waitForListeningDelay(signal);
		if (this.enabled && !signal.aborted) {
			this.setState("listening", "正在聆听");
		}
	}

	async speak (text, signal) {
		this.setState("speaking", "正在朗读");
		this.speechSkipRequested = false;
		const audioPath = path.join(this.config.voiceChat.temporaryAudioDirectory, `tts-${this.sessionId}-${Date.now()}.wav`);
		this.tempFiles.add(audioPath);
		try {
			await this.tts.synthesize(text, audioPath, signal);
			if (!this.speechSkipRequested && this.speakEnabled) {
				await this.player.play(audioPath, signal);
			}
		} catch (error) {
			if (!this.speechSkipRequested) throw error;
		} finally {
			await this.removeTempFile(audioPath);
		}
	}

	async assertConfigured () {
		if (this.config.voiceChat.sttProvider !== "whisper.cpp") {
			throw buildUserError("INVALID_CONFIGURATION", { technicalMessage: "Only whisper.cpp STT is supported in this build" });
		}
		if (!["piper", "espeak-ng"].includes(this.config.voiceChat.ttsProvider)) {
			throw buildUserError("INVALID_CONFIGURATION", { technicalMessage: "Unsupported TTS provider" });
		}
	}

	async reportRecoverableError (error) {
		const normalized = normalizeVoiceError(error);
		this.sendVoiceError(normalized);
		if (this.enabled) {
			this.setState("listening", normalized.message);
			await wait(900);
		}
	}

	async handleFatalError (error) {
		const normalized = normalizeVoiceError(error);
		this.sendVoiceError(normalized);
		this.enabled = false;
		this.recorder.stop();
		this.stt.stop();
		this.tts.stop();
		this.player.stop();
		await this.cleanupTempFiles();
		this.setState("disabled", "语音聊天已关闭");
	}

	setState (state, message) {
		this.state = state;
		this.helper.sendSocketNotification("VOICE_STATE_CHANGED", {
			sessionId: this.sessionId,
			state,
			message,
			volume: this.volume,
			speakEnabled: this.speakEnabled
		});
	}

	sendSettings () {
		this.helper.sendSocketNotification("VOICE_SETTINGS_CHANGED", {
			sessionId: this.sessionId,
			volume: this.volume,
			speakEnabled: this.speakEnabled
		});
	}

	async waitForListeningDelay (signal) {
		const waitMs = Math.max(0, this.deferListeningUntil - Date.now());
		this.deferListeningUntil = 0;
		if (waitMs > 0 && this.enabled && !signal.aborted) {
			await wait(waitMs, signal);
		}
	}

	sendVoiceError (error) {
		this.helper.sendSocketNotification("VOICE_ERROR", {
			sessionId: this.sessionId,
			code: error.code || "UNKNOWN_ERROR",
			message: error.message || "语音聊天出错，请稍后重试。",
			retryable: Boolean(error.retryable)
		});
		this.logger.warn(`MMM-AIChat voice: ${error.code || "UNKNOWN_ERROR"}${error.technicalMessage ? ` - ${error.technicalMessage}` : ""}`);
	}

	async cleanupTempFiles () {
		const files = [...this.tempFiles];
		this.tempFiles.clear();
		await Promise.all(files.map((filePath) => this.removeTempFile(filePath)));
	}

	async removeTempFile (filePath) {
		if (!filePath) return;
		this.tempFiles.delete(filePath);
		if (this.config.voiceChat.debug) return;
		try {
			await fs.promises.unlink(filePath);
		} catch (error) {
			if (error.code !== "ENOENT") {
				this.logger.warn(`MMM-AIChat voice cleanup failed: ${error.message}`);
			}
		}
	}
}

/**
 *
 * @param error
 */
function normalizeVoiceError (error) {
	if (error?.code && error?.message) return error;
	return buildUserError("UNKNOWN_ERROR", { technicalMessage: error?.message });
}

/**
 *
 * @param error
 */
function isAbortError (error) {
	return error?.code === "REQUEST_ABORTED" || error?.name === "AbortError";
}

/**
 *
 * @param ms
 * @param signal
 */
function wait (ms, signal) {
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

/**
 *
 * @param value
 */
function clampVolume (value) {
	const number = Number.parseFloat(value);
	if (!Number.isFinite(number)) return 0.22;
	return Math.min(1, Math.max(0, number));
}

module.exports = {
	VoiceChatController
};
