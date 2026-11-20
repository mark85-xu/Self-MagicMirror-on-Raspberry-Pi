"use strict";

/* eslint-disable jsdoc/require-param-description, jsdoc/require-param-type, jsdoc/require-returns */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { buildUserError } = require("../validation");

class WhisperCppSTT {
	constructor (config) {
		this.config = config;
		this.process = null;
	}

	async transcribe (audioPath, signal) {
		const voiceConfig = this.config.voiceChat;
		const binary = resolveBinary(voiceConfig.whisperBinary, [
			"/home/lhx/Desktop/MagicMirror2/voice/whisper.cpp/build/bin/whisper-cli",
			"/home/lhx/Desktop/MagicMirror2/voice/whisper.cpp/main",
			"whisper-cli",
			"main"
		]);

		if (!binary) {
			throw buildUserError("VOICE_STT_NOT_CONFIGURED", { technicalMessage: "whisper.cpp binary not found" });
		}
		if (!voiceConfig.whisperModel || !fs.existsSync(voiceConfig.whisperModel)) {
			throw buildUserError("VOICE_STT_NOT_CONFIGURED", { technicalMessage: "whisper.cpp model is missing" });
		}

		const outputBase = path.join(voiceConfig.temporaryAudioDirectory, `whisper-${Date.now()}-${Math.random().toString(16).slice(2)}`);
		const args = [
			"-m",
			voiceConfig.whisperModel,
			"-f",
			audioPath,
			"-l",
			voiceConfig.language,
			"-t",
			String(voiceConfig.whisperThreads),
			"-nt",
			"-otxt",
			"-of",
			outputBase
		];
		if (voiceConfig.whisperPrompt) {
			args.push("--prompt", voiceConfig.whisperPrompt);
		}

		const result = await runProcess(binary, args, {
			timeoutMs: voiceConfig.sttTimeoutMs,
			signal,
			onProcess: (child) => {
				this.process = child;
			}
		});

		this.process = null;
		const txtPath = `${outputBase}.txt`;
		let text = "";
		if (fs.existsSync(txtPath)) {
			text = await fs.promises.readFile(txtPath, "utf8");
			await removeFile(txtPath);
		}
		if (!text.trim()) {
			text = result.stdout;
		}

		return text
			.split(/\r?\n/)
			.map((line) => line.replace(/^\[[^\]]+\]\s*/, "").trim())
			.filter(Boolean)
			.join("\n")
			.trim();
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
 * @param options
 */
function runProcess (command, args, options = {}) {
	return new Promise((resolve, reject) => {
		let stdout = "";
		let stderr = "";
		let settled = false;
		const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
		options.onProcess?.(child);

		const finish = (error, result) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			if (options.signal) {
				options.signal.removeEventListener("abort", abortHandler);
			}
			if (error) reject(error);
			else resolve(result);
		};

		const abortHandler = () => {
			if (!child.killed) child.kill("SIGTERM");
			finish(buildUserError("REQUEST_ABORTED"));
		};

		const timer = setTimeout(() => {
			if (!child.killed) child.kill("SIGTERM");
			finish(buildUserError("VOICE_STT_TIMEOUT", { technicalMessage: `${command} timed out` }));
		}, options.timeoutMs || 60000);

		if (options.signal) {
			if (options.signal.aborted) {
				abortHandler();
				return;
			}
			options.signal.addEventListener("abort", abortHandler, { once: true });
		}

		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		child.on("error", (error) => {
			finish(buildUserError("VOICE_STT_FAILED", { technicalMessage: error.message }));
		});
		child.on("close", (code) => {
			if (settled) return;
			if (code === 0) {
				finish(null, { stdout, stderr });
			} else {
				finish(buildUserError("VOICE_STT_FAILED", { technicalMessage: stderr || `${command} exited with code ${code}` }));
			}
		});
	});
}

/**
 *
 * @param filePath
 */
async function removeFile (filePath) {
	try {
		await fs.promises.unlink(filePath);
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
	}
}

module.exports = {
	WhisperCppSTT
};
