const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createTTSProvider } = require("./providers/piper-tts");
const { AudioPlayer } = require("./audio-player");

// A one-shot announcement never starts the microphone or requests an LLM reply.
class GreetingSpeaker {
	constructor (dependencies = {}) {
		this.makeTTS = dependencies.makeTTS || createTTSProvider;
		this.makePlayer = dependencies.makePlayer || ((config) => new AudioPlayer(config));
		this.seen = new Set();
	}

	async speak ({ eventId, text, config, sessionId }) {
		if (typeof eventId !== "string" || !eventId || typeof text !== "string" || !text.trim() || text.length > 200) throw new Error("问候内容无效");
		if (this.seen.has(eventId)) return "duplicate";
		if (this.active) return "busy";
		if (config.voiceChat.speakEnabled === false) {
			this.seen.add(eventId);
			return "muted";
		}
		const active = { eventId, sessionId, controller: new AbortController(), tts: this.makeTTS(config), player: this.makePlayer(config) };
		this.active = active;
		let directory;
		try {
			directory = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-greeting-"));
			const audio = path.join(directory, "greeting.wav");
			await active.tts.synthesize(text.trim(), audio, active.controller.signal);
			await active.player.play(audio, active.controller.signal);
			this.seen.add(eventId);
			return "spoken";
		} catch (error) {
			if (active.controller.signal.aborted) return "cancelled";
			throw error;
		} finally {
			if (directory) await fs.rm(directory, { recursive: true, force: true });
			if (this.active === active) this.active = null;
		}
	}

	stop () {
		this.active?.controller.abort();
		this.active?.tts.stop();
		this.active?.player.stop();
	}
}

module.exports = { GreetingSpeaker };
