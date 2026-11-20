"use strict";

/* eslint-disable jsdoc/require-param-description, jsdoc/require-param-type, jsdoc/require-returns */

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { buildUserError } = require("../validation");

class PiperTTS {
	constructor (config) {
		this.config = config;
		this.process = null;
	}

	async synthesize (text, outputPath, signal) {
		const voiceConfig = this.config.voiceChat;
		const binary = resolveBinary(voiceConfig.piperBinary, [
			"/home/lhx/Desktop/MagicMirror2/voice/piper-venv/bin/piper",
			"piper"
		]);

		if (!binary) {
			throw buildUserError("VOICE_TTS_NOT_CONFIGURED", { technicalMessage: "piper binary not found" });
		}
		if (!voiceConfig.piperModel || !fs.existsSync(voiceConfig.piperModel)) {
			throw buildUserError("VOICE_TTS_NOT_CONFIGURED", { technicalMessage: "piper model is missing" });
		}

		const args = [
			"--model",
			voiceConfig.piperModel,
			"--output_file",
			outputPath
		];

		if (voiceConfig.piperConfig && fs.existsSync(voiceConfig.piperConfig)) {
			args.push("--config", voiceConfig.piperConfig);
		}
		if (Number.isFinite(voiceConfig.ttsLengthScale)) {
			args.push("--length_scale", String(voiceConfig.ttsLengthScale));
		}

		await runProcessWithInput(binary, args, `${text}\n`, {
			timeoutMs: voiceConfig.ttsTimeoutMs,
			signal,
			onProcess: (child) => {
				this.process = child;
			}
		});
		this.process = null;
		return outputPath;
	}

	stop () {
		if (this.process && !this.process.killed) {
			this.process.kill("SIGTERM");
		}
		this.process = null;
	}
}

class EspeakTTS {
	constructor (config) {
		this.config = config;
		this.process = null;
	}

	async synthesize (text, outputPath, signal) {
		const voiceConfig = this.config.voiceChat;
		const args = ["-v", voiceConfig.espeakVoice || "zh", "-s", String(voiceConfig.espeakSpeed || 150), "-w", outputPath, text];
		await runProcessWithInput(voiceConfig.espeakBinary || "espeak-ng", args, "", {
			timeoutMs: voiceConfig.ttsTimeoutMs,
			signal,
			onProcess: (child) => {
				this.process = child;
			}
		});
		this.process = null;
		return outputPath;
	}

	stop () {
		if (this.process && !this.process.killed) {
			this.process.kill("SIGTERM");
		}
		this.process = null;
	}
}

/**
 *
 * @param config
 */
function createTTSProvider (config) {
	if (config.voiceChat.ttsProvider === "espeak-ng") {
		return new EspeakTTS(config);
	}
	return new PiperTTS(config);
}

/**
 *
 * @param configured
 * @param fallbacks
 */
function resolveBinary (configured, fallbacks) {
	if (configured) {
		if (path.isAbsolute(configured) && fs.existsSync(configured)) return configured;
		return configured;
	}
	for (const candidate of fallbacks) {
		if (path.isAbsolute(candidate)) {
			if (fs.existsSync(candidate)) return candidate;
		} else {
			return candidate;
		}
	}
	return "";
}

/**
 *
 * @param command
 * @param args
 * @param input
 * @param options
 */
function runProcessWithInput (command, args, input, options = {}) {
	return new Promise((resolve, reject) => {
		let stderr = "";
		let settled = false;
		const child = spawn(command, args, { stdio: ["pipe", "ignore", "pipe"] });
		options.onProcess?.(child);

		const finish = (error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			if (options.signal) {
				options.signal.removeEventListener("abort", abortHandler);
			}
			if (error) reject(error);
			else resolve();
		};

		const abortHandler = () => {
			if (!child.killed) child.kill("SIGTERM");
			finish(buildUserError("REQUEST_ABORTED"));
		};

		const timer = setTimeout(() => {
			if (!child.killed) child.kill("SIGTERM");
			finish(buildUserError("VOICE_TTS_TIMEOUT", { technicalMessage: `${command} timed out` }));
		}, options.timeoutMs || 60000);

		if (options.signal) {
			if (options.signal.aborted) {
				abortHandler();
				return;
			}
			options.signal.addEventListener("abort", abortHandler, { once: true });
		}

		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		child.on("error", (error) => {
			finish(buildUserError("VOICE_TTS_FAILED", { technicalMessage: error.message }));
		});
		child.on("close", (code) => {
			if (settled) return;
			if (code === 0) {
				finish();
			} else {
				finish(buildUserError("VOICE_TTS_FAILED", { technicalMessage: stderr || `${command} exited with code ${code}` }));
			}
		});
		child.stdin.end(input);
	});
}

module.exports = {
	EspeakTTS,
	PiperTTS,
	createTTSProvider
};
