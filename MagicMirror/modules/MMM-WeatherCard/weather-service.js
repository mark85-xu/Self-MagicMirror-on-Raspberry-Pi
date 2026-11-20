const crypto = require("node:crypto");
const fs = require("node:fs");

function number (value) {
	if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) {
		throw new Error("天气接口返回了无效的温度");
	}
	return Number(value);
}

function timestamp (value) {
	const time = Date.parse(value);
	if (!Number.isFinite(time)) throw new Error("天气接口返回了无效的日期");
	return time;
}

function openMeteoIcon (code, day = true) {
	const prefix = day ? "day" : "night";
	if (code === 0) return day ? "day-sunny" : "night-clear";
	if ([1, 2].includes(code)) return day ? "day-cloudy" : "night-alt-cloudy";
	if (code === 3) return "cloudy";
	if ([45, 48].includes(code)) return "fog";
	if ([56, 57, 66, 67].includes(code)) return "rain-mix";
	if (code >= 51 && code <= 82) return code >= 71 && code <= 77 ? "snow" : `${prefix}-rain`;
	if ([85, 86].includes(code)) return "snow";
	if (code >= 95 && code <= 99) return "thunderstorm";
	return "na";
}

function qweatherIcon (code, day = true) {
	const value = Number(code);
	if (value === 100 || value === 150) return value === 150 || !day ? "night-clear" : "day-sunny";
	if ([101, 102, 103, 151, 152, 153].includes(value)) return day && value < 150 ? "day-cloudy" : "night-alt-cloudy";
	if (value === 104 || value === 154) return "cloudy";
	if ([302, 303].includes(value)) return "thunderstorm";
	if (value === 304) return "hail";
	if (value === 313 || [404, 405, 406].includes(value)) return "rain-mix";
	if (value >= 300 && value <= 399) return "rain";
	if (value >= 400 && value <= 499) return "snow";
	if ([503, 504, 507, 508].includes(value)) return "dust";
	if ([502, 511, 512, 513].includes(value)) return "smog";
	if (value >= 500 && value <= 515) return "fog";
	if (value === 900) return "hot";
	if (value === 901) return "snowflake-cold";
	return "na";
}

class WeatherService {
	constructor (settings = {}, dependencies = {}) {
		this.settings = {
			latitude: 30.2741,
			longitude: 120.1551,
			locationName: "杭州市",
			timezone: "Asia/Shanghai",
			primaryTimeoutMs: 8000,
			fallbackTimeoutMs: 10000,
			cacheMs: 10 * 60 * 1000,
			...settings
		};
		this.fetch = dependencies.fetch || global.fetch;
		this.now = dependencies.now || Date.now;
		this.readFile = dependencies.readFile || fs.readFileSync;
		this.onFallback = dependencies.onFallback || (() => {});
	}

	async requestJson (url, timeoutMs, label, headers = {}) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const response = await this.fetch(url, { signal: controller.signal, headers, redirect: "error" });
			if (!response.ok) throw new Error(`${label} HTTP ${response.status}`);
			return await response.json();
		} catch (error) {
			if (controller.signal.aborted || error.name === "TimeoutError" || ["ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT"].includes(error.cause?.code || error.code)) {
				const timeout = new Error(`${label} 请求超时`);
				timeout.name = "TimeoutError";
				throw timeout;
			}
			// Never expose fetch request options, authorization headers or token values.
			throw new Error(error.message?.startsWith(`${label} HTTP`) ? error.message : `${label} 请求失败`);
		} finally {
			clearTimeout(timer);
		}
	}

	async loadPrimary () {
		const params = new URLSearchParams({
			latitude: this.settings.latitude,
			longitude: this.settings.longitude,
			current_weather: "true",
			daily: "weathercode,temperature_2m_max,temperature_2m_min",
			timezone: this.settings.timezone,
			forecast_days: "7"
		});
		const data = await this.requestJson(`https://api.open-meteo.com/v1/forecast?${params}`, this.settings.primaryTimeoutMs, "Open-Meteo");
		if (!data.current_weather || !Array.isArray(data.daily?.time) || data.daily.time.length < 7) {
			throw new Error("Open-Meteo 返回的天气数据不完整");
		}
		return {
			providerName: "Open-Meteo",
			providerUrl: "https://open-meteo.com/",
			currentWeather: {
				temperature: number(data.current_weather.temperature),
				weatherType: openMeteoIcon(data.current_weather.weathercode, data.current_weather.is_day === 1)
			},
			forecastArray: data.daily.time.slice(0, 7).map((date, index) => ({
				date: timestamp(date),
				minTemperature: number(data.daily.temperature_2m_min?.[index]),
				maxTemperature: number(data.daily.temperature_2m_max?.[index]),
				weatherType: openMeteoIcon(data.daily.weathercode?.[index])
			}))
		};
	}

	getToken () {
		const now = Math.floor(this.now() / 1000);
		if (this.token && this.tokenExpires > now + 60) return this.token;
		const { keyId, developerId, projectId, privateKeyPath } = this.settings;
		if (![keyId, developerId, projectId, privateKeyPath].every((value) => typeof value === "string" && value.trim())) {
			throw new Error("和风天气 JWT 配置不完整");
		}
		if (!this.privateKey) {
			try {
				this.privateKey = crypto.createPrivateKey(this.readFile(privateKeyPath));
			} catch {
				throw new Error("无法读取和风天气私钥");
			}
			if (this.privateKey.asymmetricKeyType !== "ed25519") throw new Error("和风天气需要 Ed25519 私钥");
		}
		const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
		const expires = now + 900;
		const input = `${encode({ alg: "EdDSA", kid: keyId })}.${encode({ iss: developerId, sub: projectId, iat: now - 30, exp: expires })}`;
		const signature = crypto.sign(null, Buffer.from(input), this.privateKey).toString("base64url");
		this.token = `${input}.${signature}`;
		this.tokenExpires = expires;
		return this.token;
	}

	async loadFallback () {
		const host = this.settings.apiHost || "";
		if (!/^(?:https:\/\/)?[a-z0-9.-]+\.qweatherapi\.com\/?$/i.test(host)) throw new Error("和风天气 API Host 配置无效");
		const base = `https://${host.replace(/^https:\/\//i, "").replace(/\/$/, "")}`;
		const location = `${Number(this.settings.latitude).toFixed(2)}/${Number(this.settings.longitude).toFixed(2)}`;
		const headers = { Authorization: `Bearer ${this.getToken()}` };
		const query = "localTime=true&lang=zh";
		const [current, forecast] = await Promise.all([
			this.requestJson(`${base}/weather/v1/current/${location}?${query}`, this.settings.fallbackTimeoutMs, "和风实时天气", headers),
			this.requestJson(`${base}/weather/v1/daily/${location}?days=7&${query}`, this.settings.fallbackTimeoutMs, "和风七天天气", headers)
		]);
		if (!Array.isArray(forecast.days) || forecast.days.length < 7) throw new Error("和风天气返回的七天预报不完整");
		const localHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: this.settings.timezone, hour: "2-digit", hourCycle: "h23" }).format(this.now()));
		const isDay = localHour >= 7 && localHour < 19;
		return {
			providerName: "和风天气",
			providerUrl: "https://www.qweather.com/",
			attributions: [...new Set([...(current.metadata?.attributions || []), ...(forecast.metadata?.attributions || [])])],
			currentWeather: {
				temperature: number(current.temperature?.value),
				weatherType: qweatherIcon(current.condition?.code, isDay)
			},
			forecastArray: forecast.days.slice(0, 7).map((day) => ({
				date: timestamp(day.forecastStartTime),
				minTemperature: number(day.temperatureMin?.value),
				maxTemperature: number(day.temperatureMax?.value),
				weatherType: qweatherIcon(day.daytime?.condition?.code)
			}))
		};
	}

	async refresh () {
		let weather;
		try {
			weather = await this.loadPrimary();
		} catch (error) {
			if (error.name !== "TimeoutError") throw error;
			this.onFallback();
			weather = await this.loadFallback();
		}
		this.cached = { ...weather, locationName: this.settings.locationName, fetchedAt: this.now() };
		this.expires = this.now() + this.settings.cacheMs;
		return this.cached;
	}

	async getWeather () {
		if (this.cached && this.expires > this.now()) return this.cached;
		if (!this.inflight) {
			this.inflight = this.refresh().finally(() => { this.inflight = null; });
		}
		return this.inflight;
	}
}

module.exports = { WeatherService };
