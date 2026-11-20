const crypto = require("node:crypto");
const { WeatherService } = require("../../../modules/MMM-WeatherCard/weather-service");

const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
const now = Date.parse("2026-11-13T11:00:00Z");

/** @returns {object} A complete combined Open-Meteo response. */
function primaryData () {
	return {
		current_weather: { temperature: 17.7, weathercode: 3, is_day: 0 },
		daily: {
			time: Array.from({ length: 7 }, (_, i) => `2026-11-${13 + i}`),
			temperature_2m_min: Array(7).fill(12),
			temperature_2m_max: Array(7).fill(20),
			weathercode: Array(7).fill(3)
		}
	};
}

/** @returns {object} A seven-day QWeather response. */
function forecastData () {
	return {
		metadata: { attributions: ["https://developer.qweather.com/attribution.html"] },
		days: Array.from({ length: 7 }, (_, i) => ({
			forecastStartTime: `2026-11-${13 + i}T00:00:00+08:00`,
			temperatureMin: { value: 12 },
			temperatureMax: { value: 20 },
			daytime: { condition: { code: "100" } }
		}))
	};
}

/**
 * @param {object} data JSON response body.
 * @param {number} status HTTP response status.
 * @returns {object} A minimal fetch response.
 */
function response (data, status = 200) {
	return { ok: status >= 200 && status < 300, status, json: async () => data };
}

/**
 * @param {string} url Requested endpoint.
 * @param {object} options Fetch options, including an abort signal.
 * @param {AbortSignal} options.signal Signal used to stop the request.
 * @returns {Promise} A request that stalls until aborted.
 */
function timeoutRequest (url, { signal }) {
	return new Promise((resolve, reject) => {
		signal.addEventListener("abort", () => reject(signal.reason), { once: true });
	});
}

describe("weather primary and JWT fallback", () => {
	let settings;
	let fetch;
	let clock;
	let readFile;
	let fallback;

	beforeEach(() => {
		jest.useFakeTimers();
		settings = {
			apiHost: "example.re.qweatherapi.com",
			keyId: "credential-id",
			developerId: "developer-id",
			projectId: "project-id",
			privateKeyPath: "/private/weather.pem",
			primaryTimeoutMs: 8000
		};
		fetch = jest.fn();
		clock = jest.fn(() => now);
		readFile = jest.fn(() => privateKey.export({ type: "pkcs8", format: "pem" }));
		fallback = jest.fn();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	/** @returns {WeatherService} A service with isolated network and signing dependencies. */
	function service () {
		return new WeatherService(settings, { fetch, now: clock, readFile, onFallback: fallback });
	}

	/** Queue the two successful fallback responses. */
	function queueFallback () {
		fetch.mockResolvedValueOnce(response({ temperature: { value: 17.73 }, condition: { code: "100" } }));
		fetch.mockResolvedValueOnce(response(forecastData()));
	}

	it("uses Open-Meteo first without reading the private key or contacting QWeather", async () => {
		fetch.mockResolvedValue(response(primaryData()));
		const result = await service().getWeather();
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(fetch.mock.calls[0][0]).toMatch(/^https:\/\/api.open-meteo.com\/v1\/forecast\?/);
		expect(readFile).not.toHaveBeenCalled();
		expect(fallback).not.toHaveBeenCalled();
		expect(result.providerName).toBe("Open-Meteo");
		expect(result.currentWeather.temperature).toBe(17.7);
		expect(result.forecastArray).toHaveLength(7);
	});

	it("aborts a slow primary after 8 seconds, then returns seven QWeather days", async () => {
		fetch.mockImplementationOnce(timeoutRequest);
		queueFallback();
		const pending = service().getWeather();
		await jest.advanceTimersByTimeAsync(7999);
		expect(fetch).toHaveBeenCalledTimes(1);
		await jest.advanceTimersByTimeAsync(1);
		const result = await pending;
		expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
		expect(fallback).toHaveBeenCalledTimes(1);
		expect(result.providerName).toBe("和风天气");
		expect(result.currentWeather).toEqual({ temperature: 17.73, weatherType: "night-clear" });
		expect(result.forecastArray).toHaveLength(7);
		expect(result.forecastArray[0].weatherType).toBe("day-sunny");
		expect(result.attributions).toEqual(["https://developer.qweather.com/attribution.html"]);
		expect(fetch.mock.calls[1][0]).toContain("/weather/v1/current/30.27/120.16?");
		expect(fetch.mock.calls[2][0]).toContain("/weather/v1/daily/30.27/120.16?days=7");
		expect(JSON.stringify(result)).not.toMatch(/Bearer|private-key|credential-id/);
	});

	it("falls back on an upstream connection timeout", async () => {
		fetch.mockRejectedValueOnce(Object.assign(new Error("fetch failed"), { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } }));
		queueFallback();
		expect((await service().getWeather()).providerName).toBe("和风天气");
	});

	it("does not use the fallback for HTTP errors or invalid primary data", async () => {
		fetch.mockResolvedValueOnce(response({}, 429));
		await expect(service().getWeather()).rejects.toThrow("Open-Meteo HTTP 429");
		expect(fetch).toHaveBeenCalledTimes(1);
		fetch.mockResolvedValueOnce(response({}));
		await expect(service().getWeather()).rejects.toThrow("不完整");
		expect(readFile).not.toHaveBeenCalled();
	});

	it("coalesces simultaneous requests, caches successes, and tries primary again after expiry", async () => {
		fetch.mockImplementationOnce(timeoutRequest);
		queueFallback();
		const weather = service();
		const first = weather.getWeather();
		const second = weather.getWeather();
		await jest.advanceTimersByTimeAsync(8000);
		await expect(first).resolves.toEqual(await second);
		await weather.getWeather();
		expect(fetch).toHaveBeenCalledTimes(3);
		clock.mockReturnValue(now + 600001);
		fetch.mockResolvedValueOnce(response(primaryData()));
		await expect(weather.getWeather()).resolves.toMatchObject({ providerName: "Open-Meteo" });
		expect(fetch.mock.calls[3][0]).toContain("api.open-meteo.com");
	});

	it("signs JWT with Ed25519 and the required identities, then refreshes it before expiration", () => {
		const weather = service();
		const token = weather.getToken();
		const [header, payload, signature] = token.split(".");
		expect(JSON.parse(Buffer.from(header, "base64url"))).toEqual({ alg: "EdDSA", kid: "credential-id" });
		const claims = JSON.parse(Buffer.from(payload, "base64url"));
		expect(claims).toEqual({ iss: "developer-id", sub: "project-id", iat: now / 1000 - 30, exp: now / 1000 + 900 });
		expect(crypto.verify(null, Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, "base64url"))).toBe(true);
		expect(weather.getToken()).toBe(token);
		clock.mockReturnValue(now + 850000);
		expect(weather.getToken()).not.toBe(token);
		expect(readFile).toHaveBeenCalledTimes(1);
	});

	it("bounds the fallback request and retries primary on the next attempt after a failure", async () => {
		const timeout = Object.assign(new Error("timeout"), { name: "TimeoutError" });
		fetch.mockRejectedValueOnce(timeout).mockImplementationOnce(timeoutRequest).mockImplementationOnce(timeoutRequest);
		const weather = service();
		const pending = weather.getWeather();
		const check = pending.catch((error) => error);
		await jest.advanceTimersByTimeAsync(10000);
		await expect(check).resolves.toMatchObject({ name: "TimeoutError", message: "和风实时天气 请求超时" });
		fetch.mockResolvedValueOnce(response(primaryData()));
		await expect(weather.getWeather()).resolves.toMatchObject({ providerName: "Open-Meteo" });
	});

	it("does not cache authentication failures or return missing temperatures as zero", async () => {
		fetch.mockRejectedValueOnce(Object.assign(new Error("timeout"), { name: "TimeoutError" }));
		fetch.mockResolvedValueOnce(response({}, 401)).mockResolvedValueOnce(response(forecastData()));
		await expect(service().getWeather()).rejects.toThrow("和风实时天气 HTTP 401");
		const data = primaryData();
		data.current_weather.temperature = null;
		fetch.mockResolvedValueOnce(response(data));
		await expect(service().getWeather()).rejects.toThrow("无效的温度");
	});
});
