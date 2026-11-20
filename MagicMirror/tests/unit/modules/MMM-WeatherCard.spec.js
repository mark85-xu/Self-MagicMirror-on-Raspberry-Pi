const path = require("node:path");
const { JSDOM } = require("jsdom");

describe("MMM-WeatherCard", () => {
	let dom;
	let definition;
	let card;

	beforeEach(() => {
		dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost:8080/" });
		global.window = dom.window;
		global.document = dom.window.document;
		global.Module = {
			register: jest.fn((name, moduleDefinition) => {
				definition = moduleDefinition;
			})
		};

		jest.isolateModules(() => {
			require(path.resolve(__dirname, "../../../modules/MMM-WeatherCard/MMM-WeatherCard.js"));
		});

		card = Object.assign(Object.create(definition), {
			config: { maxForecastDays: 7, roundTemp: false, language: "zh-CN" },
			currentWeather: null,
			forecast: [],
			locationName: "",
			isExpanded: false,
			isPinned: false,
			pointerInside: false,
			updateDom: jest.fn()
		});
	});

	afterEach(() => {
		dom.window.close();
		delete global.window;
		delete global.document;
		delete global.Module;
	});

	/**
	 * Render the weather card in the test document.
	 * @returns {HTMLElement} The test root containing the mounted card.
	 */
	function render () {
		const root = document.createElement("div");
		root.className = "MMM-WeatherCard";
		root.appendChild(card.getDom());
		document.body.appendChild(root);
		return root;
	}

	/**
	 * Create representative forecast data for a full week.
	 * @returns {Array<object>} Seven weather forecast records.
	 */
	function forecastForSevenDays () {
		return Array.from({ length: 7 }, (_, index) => ({
			date: Date.UTC(2026, 9, 26 + index),
			weatherType: "cloudy",
			maxTemperature: 24 + index,
			minTemperature: 15 + index
		}));
	}

	it("merges current and forecast notifications in either arrival order", () => {
		card.notificationReceived("WEATHER_UPDATED", { forecastArray: forecastForSevenDays(), locationName: "杭州市" });
		card.notificationReceived("WEATHER_UPDATED", { currentWeather: { temperature: 16.6, weatherType: "cloudy" }, locationName: "杭州市" });
		const root = render();

		expect(root.querySelector(".weather-title-toggle")).not.toBeNull();
		expect(root.querySelector(".weather-title-toggle").textContent).toBe("杭州市");
		expect(root.querySelector(".weather-current-temperature").textContent).toBe("16.6°");
		expect(root.querySelectorAll(".weather-forecast-day")).toHaveLength(7);
		expect(root.textContent).toContain("24.0°");
		expect(root.textContent).toContain("15.0°");
	});

	it("displays the weather source and required attribution without rendering it as HTML", () => {
		card.notificationReceived("WEATHER_UPDATED", {
			providerName: "和风天气",
			attributions: ["https://developer.qweather.com/attribution.html", "<script>unsafe</script>"]
		});
		const root = render();
		expect(root.querySelector(".weather-source").textContent).toContain("和风天气");
		expect(root.querySelector("a[href='https://developer.qweather.com/attribution.html']")).not.toBeNull();
		expect(root.querySelector("script")).toBeNull();
	});

	it("preserves weather on failures and retries without polling while suspended", () => {
		jest.useFakeTimers();
		card.config = { ...card.config, useWeatherService: true, retryDelay: 60000, updateInterval: 600000 };
		card.sendSocketNotification = jest.fn();
		card.start();
		expect(card.sendSocketNotification).toHaveBeenCalledWith("WEATHER_REQUEST");
		card.socketNotificationReceived("WEATHER_RESPONSE", { currentWeather: { temperature: 17.7 }, forecastArray: forecastForSevenDays() });
		card.socketNotificationReceived("WEATHER_RESPONSE", { error: "timeout" });
		expect(card.currentWeather.temperature).toBe(17.7);
		expect(card.forecast).toHaveLength(7);
		expect(render().querySelector("[role=status]").textContent).toContain("稍后重试");
		jest.advanceTimersByTime(60000);
		expect(card.sendSocketNotification).toHaveBeenCalledTimes(2);
		card.suspend();
		jest.advanceTimersByTime(600000);
		expect(card.sendSocketNotification).toHaveBeenCalledTimes(2);
		card.resume();
		expect(card.sendSocketNotification).toHaveBeenCalledTimes(3);
		card.suspend();
		jest.useRealTimers();
	});

	it("keeps forecast content hidden and inert until expanded", () => {
		card.forecast = forecastForSevenDays();
		const root = render();
		const toggle = root.querySelector(".weather-title-toggle");
		const forecast = root.querySelector(".weather-forecast");

		expect(toggle.getAttribute("aria-expanded")).toBe("false");
		expect(forecast.hidden).toBe(true);
		expect(forecast.hasAttribute("inert")).toBe(true);
	});

	it("expands on hover and stays open while forecast content has focus", () => {
		const root = render();
		const panel = root.querySelector(".weather-card");
		const toggle = root.querySelector(".weather-title-toggle");
		const forecast = root.querySelector(".weather-forecast");

		panel.dispatchEvent(new dom.window.Event("pointerenter"));
		expect(toggle.getAttribute("aria-expanded")).toBe("true");
		expect(forecast.hidden).toBe(false);
		root.querySelector(".weather-forecast").focus();
		panel.dispatchEvent(new dom.window.Event("pointerleave"));
		expect(toggle.getAttribute("aria-expanded")).toBe("true");
	});

	it("supports a persistent keyboard or touch toggle and collapses on the next toggle", () => {
		const root = render();
		const toggle = root.querySelector(".weather-title-toggle");
		const forecast = root.querySelector(".weather-forecast");

		toggle.click();
		expect(toggle.getAttribute("aria-expanded")).toBe("true");
		root.querySelector(".weather-card").dispatchEvent(new dom.window.Event("pointerleave"));
		expect(toggle.getAttribute("aria-expanded")).toBe("true");
		toggle.click();
		expect(toggle.getAttribute("aria-expanded")).toBe("false");
		expect(forecast.hidden).toBe(true);
		expect(forecast.hasAttribute("inert")).toBe(true);
	});

	it("handles empty weather data and long place names without invalid values", () => {
		card.locationName = "一个很长的测试城市名称用于检查卡片宽度";
		const root = render();

		expect(root.querySelector(".weather-title-toggle").textContent).toContain(card.locationName);
		expect(root.querySelector(".weather-current-temperature").textContent).toBe("--°");
		expect(root.querySelectorAll(".weather-forecast-day")).toHaveLength(0);
		expect(root.textContent).not.toContain("NaN");
	});

	it("does not turn an unknown temperature into zero degrees", () => {
		card.currentWeather = { temperature: null, weatherType: "cloudy" };
		const root = render();

		expect(root.querySelector(".weather-current-temperature").textContent).toBe("--°");
	});
});
