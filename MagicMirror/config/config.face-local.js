// Local development: use a local camera and local speech, keeping device paths in config.js.
const fs = require("node:fs");
const path = require("node:path");
const base = require("./config.js");
const localEspeak = path.join(__dirname, "../.local-tools/espeak-ng/usr/bin/espeak-ng");

module.exports = {
	...base,
	port: 8082,
	modules: base.modules.map((module) => {
		if (module.module === "MMM-FaceRecognition") {
			return { ...module, config: { ...module.config, runtime: "python", source: process.env.FACE_LOCAL_SOURCE || "0" } };
		}
		if (module.module === "MMM-AIChat") {
			return { ...module, config: { ...module.config, voiceChat: {
				...module.config.voiceChat,
				ttsProvider: "espeak-ng",
				espeakBinary: process.env.FACE_LOCAL_TTS_BINARY || (fs.existsSync(localEspeak) ? localEspeak : "espeak-ng"),
				espeakVoice: "zh",
				espeakSpeed: 150,
				outputDevice: process.env.FACE_LOCAL_AUDIO_DEVICE || "default"
			} } };
		}
		// Keep local weather on its original path; QWeather credentials live on the Pi.
		if (module.module === "weather") return { ...module, disabled: false };
		if (module.module === "MMM-WeatherCard") return { ...module, config: { ...module.config, useWeatherService: false } };
		return module;
	})
};
