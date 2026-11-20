"use strict";


const { spawn } = require("node:child_process");
const { buildUserError } = require("./validation");

class AudioPlayer {
	constructor (config) {
		this.config = config;
		this.process = null;
		this.mixerProcess = null;
		this.volume = clampVolume(config.voiceChat.initialVolume);
	}

	play (audioPath, signal) {
		const device = this.config.voiceChat.outputDevice || "default";
		this.applyVolume();
		return new Promise((resolve, reject) => {
			let stderr = "";
			let settled = false;
			this.process = spawn("aplay", ["-D", device, audioPath], { stdio: ["ignore", "ignore", "pipe"] });

			const finish = (error) => {
				if (settled) return;
				settled = true;
				if (signal) {
					signal.removeEventListener("abort", abortHandler);
				}
				this.process = null;
				if (error) reject(error);
				else resolve();
			};

			const abortHandler = () => {
				this.stop();
				finish(buildUserError("REQUEST_ABORTED"));
			};

			if (signal) {
				if (signal.aborted) {
					abortHandler();
					return;
				}
				signal.addEventListener("abort", abortHandler, { once: true });
			}

			this.process.stderr.on("data", (chunk) => {
				stderr += chunk.toString();
			});
			this.process.on("error", (error) => {
				finish(buildUserError("VOICE_PLAYBACK_FAILED", { technicalMessage: error.message }));
			});
			this.process.on("close", (code) => {
				if (settled) return;
				if (code === 0) {
					finish();
				} else {
					finish(buildUserError("VOICE_PLAYBACK_FAILED", { technicalMessage: stderr || `aplay exited with code ${code}` }));
				}
			});
		});
	}

	stop () {
		if (this.process && !this.process.killed) {
			this.process.kill("SIGTERM");
		}
		this.process = null;
	}

	setVolume (volume) {
		this.volume = clampVolume(volume);
		this.applyVolume();
	}

	applyVolume () {
		const percent = String(Math.round(this.volume * 100));
		const voiceConfig = this.config.voiceChat;
		const args = [
			"-D",
			voiceConfig.mixerDevice || "default",
			"sset",
			voiceConfig.mixerControl || "Master",
			`${percent}%`
		];
		if (this.mixerProcess && !this.mixerProcess.killed) {
			this.mixerProcess.kill("SIGTERM");
		}
		this.mixerProcess = spawn("amixer", args, { stdio: ["ignore", "ignore", "ignore"] });
		this.mixerProcess.on("close", () => {
			this.mixerProcess = null;
		});
		this.mixerProcess.on("error", () => {
			this.mixerProcess = null;
		});
	}
}

/**
 * Clamp a UI volume value into ALSA's 0-1 range.
 * @param {number|string} value Raw volume value.
 * @returns {number} Safe volume value.
 */
function clampVolume (value) {
	const number = Number.parseFloat(value);
	if (!Number.isFinite(number)) return 0.22;
	return Math.min(1, Math.max(0, number));
}

module.exports = {
	AudioPlayer
};
