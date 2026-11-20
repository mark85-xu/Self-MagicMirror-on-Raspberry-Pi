"use strict";

/* eslint-disable jsdoc/require-param-description, jsdoc/require-param-type, jsdoc/require-returns */

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { buildUserError } = require("./validation");

class AudioRecorder {
	constructor (config, logger) {
		this.config = config;
		this.logger = logger;
		this.process = null;
	}

	async recordOnce (sessionId, signal) {
		await fs.promises.mkdir(this.config.voiceChat.temporaryAudioDirectory, { recursive: true });

		const voiceConfig = this.config.voiceChat;
		const sampleRate = voiceConfig.sampleRate;
		const channels = voiceConfig.channels;
		const bytesPerSample = 2;
		const outputPath = path.join(voiceConfig.temporaryAudioDirectory, `${sessionId}-${Date.now()}.wav`);
		const chunks = [];
		const startedAt = Date.now();
		const warmupUntil = startedAt + (voiceConfig.recordingWarmupMs || 0);
		let speechStartedAt = 0;
		let lastSpeechAt = 0;
		let totalBytes = 0;
		let stderr = "";
		let settled = false;

		const args = [
			"-D",
			voiceConfig.inputDevice,
			"-f",
			"S16_LE",
			"-r",
			String(sampleRate),
			"-c",
			String(channels),
			"-t",
			"raw"
		];

		return await new Promise((resolve, reject) => {
			const finish = async (result) => {
				if (settled) return;
				settled = true;
				this.stop();

				try {
					if (!result.empty) {
						const pcm = Buffer.concat(chunks, totalBytes);
						await writeWav(outputPath, pcm, { sampleRate, channels, bytesPerSample });
						resolve({
							audioPath: outputPath,
							durationMs: Date.now() - speechStartedAt,
							empty: false
						});
					} else {
						resolve({ audioPath: "", durationMs: 0, empty: true });
					}
				} catch (error) {
					reject(buildUserError("VOICE_RECORDING_FAILED", { technicalMessage: error.message }));
				}
			};

			const fail = (code, technicalMessage) => {
				if (settled) return;
				settled = true;
				this.stop();
				reject(buildUserError(code, { technicalMessage }));
			};

			this.process = spawn("arecord", args, { stdio: ["ignore", "pipe", "pipe"] });

			const abortHandler = () => finish({ empty: true });
			if (signal) {
				if (signal.aborted) {
					abortHandler();
					return;
				}
				signal.addEventListener("abort", abortHandler, { once: true });
			}

			const maxTimer = setTimeout(() => {
				if (speechStartedAt && Date.now() - speechStartedAt >= voiceConfig.minSpeechDurationMs) {
					finish({ empty: false });
				} else {
					finish({ empty: true });
				}
			}, voiceConfig.maxRecordingDurationMs);

			this.process.stdout.on("data", (chunk) => {
				if (settled) return;

				const level = calculateRms(chunk);
				const now = Date.now();
				const isWarmingUp = now < warmupUntil;
				const isSpeech = !isWarmingUp && level >= voiceConfig.vadThreshold;

				if (isSpeech) {
					if (!speechStartedAt) {
						speechStartedAt = now;
					}
					lastSpeechAt = now;
				}

				if (speechStartedAt) {
					chunks.push(chunk);
					totalBytes += chunk.length;
				}

				if (
					speechStartedAt
					&& now - speechStartedAt >= voiceConfig.minSpeechDurationMs
					&& now - lastSpeechAt >= voiceConfig.silenceDurationMs
				) {
					clearTimeout(maxTimer);
					finish({ empty: false });
				}

				if (!speechStartedAt && now - startedAt >= voiceConfig.maxRecordingDurationMs) {
					clearTimeout(maxTimer);
					finish({ empty: true });
				}
			});

			this.process.stderr.on("data", (chunk) => {
				stderr += chunk.toString();
			});

			this.process.on("error", (error) => {
				clearTimeout(maxTimer);
				fail("VOICE_RECORDING_FAILED", error.message);
			});

			this.process.on("close", (code) => {
				clearTimeout(maxTimer);
				if (settled) return;
				if (code === 0 && speechStartedAt) {
					finish({ empty: false });
				} else if (code === 0) {
					finish({ empty: true });
				} else {
					fail("VOICE_RECORDING_FAILED", stderr || `arecord exited with code ${code}`);
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
}

/**
 *
 * @param buffer
 */
function calculateRms (buffer) {
	if (!buffer.length) return 0;
	let sum = 0;
	let samples = 0;
	for (let index = 0; index + 1 < buffer.length; index += 2) {
		const sample = buffer.readInt16LE(index) / 32768;
		sum += sample * sample;
		samples += 1;
	}
	return samples ? Math.sqrt(sum / samples) : 0;
}

/**
 *
 * @param filePath
 * @param pcmBuffer
 * @param options
 */
async function writeWav (filePath, pcmBuffer, options) {
	const header = createWavHeader(pcmBuffer.length, options);
	await fs.promises.writeFile(filePath, Buffer.concat([header, pcmBuffer]));
}

/**
 *
 * @param dataLength
 * @param root0
 * @param root0.sampleRate
 * @param root0.channels
 * @param root0.bytesPerSample
 */
function createWavHeader (dataLength, { sampleRate, channels, bytesPerSample }) {
	const header = Buffer.alloc(44);
	const byteRate = sampleRate * channels * bytesPerSample;
	const blockAlign = channels * bytesPerSample;

	header.write("RIFF", 0);
	header.writeUInt32LE(36 + dataLength, 4);
	header.write("WAVE", 8);
	header.write("fmt ", 12);
	header.writeUInt32LE(16, 16);
	header.writeUInt16LE(1, 20);
	header.writeUInt16LE(channels, 22);
	header.writeUInt32LE(sampleRate, 24);
	header.writeUInt32LE(byteRate, 28);
	header.writeUInt16LE(blockAlign, 32);
	header.writeUInt16LE(bytesPerSample * 8, 34);
	header.write("data", 36);
	header.writeUInt32LE(dataLength, 40);
	return header;
}

module.exports = {
	AudioRecorder,
	calculateRms
};
