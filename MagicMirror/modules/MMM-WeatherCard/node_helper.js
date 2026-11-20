const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const NodeHelper = require("node_helper");
const Log = require("logger");
const { WeatherService } = require("./weather-service");

module.exports = NodeHelper.create({
	async socketNotificationReceived (notification) {
		if (notification !== "WEATHER_REQUEST") return;
		try {
			if (!this.weatherService) {
				const configFile = process.env.MM_WEATHER_CONFIG || path.join(os.homedir(), ".config/magicmirror/weather.json");
				let settings;
				try {
					settings = JSON.parse(fs.readFileSync(configFile, "utf8"));
				} catch {
					throw new Error("无法读取服务端天气配置 ~/.config/magicmirror/weather.json");
				}
				this.weatherService = new WeatherService(settings, {
					onFallback: () => Log.warn("[MMM-WeatherCard] Open-Meteo 请求超时，切换到和风天气。")
				});
			}
			const weather = await this.weatherService.getWeather();
			this.sendSocketNotification("WEATHER_RESPONSE", weather);
		} catch (error) {
			Log.error(`[MMM-WeatherCard] ${error.message}`);
			this.sendSocketNotification("WEATHER_RESPONSE", { error: error.message });
		}
	}
});
