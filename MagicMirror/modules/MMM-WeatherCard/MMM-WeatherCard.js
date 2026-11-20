Module.register("MMM-WeatherCard", {
	defaults: {
		maxForecastDays: 7,
		roundTemp: false,
		useWeatherService: false,
		updateInterval: 10 * 60 * 1000,
		retryDelay: 60 * 1000
	},

	start () {
		this.currentWeather = null;
		this.forecast = [];
		this.locationName = "";
		this.isExpanded = false;
		this.isPinned = false;
		this.pointerInside = false;
		this.providerName = "";
		this.attributions = [];
		this.weatherError = "";
		this.isSuspended = false;
		if (this.config.useWeatherService) this.requestWeather();
	},

	getStyles () {
		return ["weather-icons.css", "MMM-WeatherCard.css"];
	},

	requestWeather () {
		clearTimeout(this.weatherTimer);
		if (this.isSuspended) return;
		this.sendSocketNotification("WEATHER_REQUEST");
		// Retry if the socket response is lost, including after a server restart.
		this.weatherTimer = setTimeout(() => this.requestWeather(), this.config.retryDelay);
	},

	socketNotificationReceived (notification, payload = {}) {
		if (!this.config.useWeatherService || notification !== "WEATHER_RESPONSE") return;
		clearTimeout(this.weatherTimer);
		if (payload.error) {
			this.weatherError = "天气暂时无法更新，稍后重试";
			this.updateDom(150);
		} else {
			this.weatherError = "";
			this.notificationReceived("WEATHER_UPDATED", payload);
		}
		if (!this.isSuspended) {
			this.weatherTimer = setTimeout(() => this.requestWeather(), payload.error ? this.config.retryDelay : this.config.updateInterval);
		}
	},

	suspend () {
		this.isSuspended = true;
		clearTimeout(this.weatherTimer);
	},

	resume () {
		this.isSuspended = false;
		if (this.config.useWeatherService) this.requestWeather();
	},

	notificationReceived (notification, payload = {}) {
		if (notification !== "WEATHER_UPDATED") {
			return;
		}

		if (payload.currentWeather) {
			this.currentWeather = payload.currentWeather;
		}
		if (Array.isArray(payload.forecastArray) && payload.forecastArray.length > 0) {
			this.forecast = payload.forecastArray;
		}
		if (typeof payload.locationName === "string" && payload.locationName.trim()) {
			this.locationName = payload.locationName.trim();
		}
		if (typeof payload.providerName === "string") this.providerName = payload.providerName;
		this.attributions = Array.isArray(payload.attributions) ? payload.attributions.filter((value) => typeof value === "string") : [];

		this.updateDom(150);
	},

	getMountedCard () {
		return document.querySelector(".MMM-WeatherCard .weather-card");
	},

	formatTemperature (value) {
		if (value === null || value === undefined || value === "") {
			return "--°";
		}

		const temperature = Number(value);
		if (!Number.isFinite(temperature)) {
			return "--°";
		}

		return `${this.config.roundTemp ? Math.round(temperature) : temperature.toFixed(1)}°`;
	},

	getWeatherIcon (weatherType) {
		const icon = typeof weatherType === "string" ? weatherType.toLowerCase().replace(/[^a-z0-9_-]/g, "") : "";
		return icon || "cloud";
	},

	getDayLabel (dateValue, index) {
		if (dateValue === null || dateValue === undefined || dateValue === "") {
			return "--";
		}

		if (index === 0) {
			return "今天";
		}
		if (index === 1) {
			return "明天";
		}

		const date = new Date(dateValue);
		if (Number.isNaN(date.getTime())) {
			return "--";
		}

		return new Intl.DateTimeFormat(this.config.language || "zh-CN", { weekday: "short" }).format(date);
	},

	getDom () {
		const wrapper = document.createElement("div");
		wrapper.className = `weather-card${this.isExpanded ? " is-expanded" : ""}`;

		const summary = document.createElement("div");
		summary.className = "weather-summary";

		const titleButton = document.createElement("button");
		titleButton.className = "weather-title-toggle";
		titleButton.type = "button";
		titleButton.textContent = this.locationName || "天气";
		titleButton.title = `${titleButton.textContent}，切换一周天气预报`;
		titleButton.setAttribute("aria-expanded", String(this.isExpanded));
		titleButton.setAttribute("aria-label", `${titleButton.textContent}，切换一周天气预报`);
		titleButton.addEventListener("click", () => {
			const expand = !this.isPinned;
			this.setExpanded(expand, expand);
		});
		summary.appendChild(titleButton);

		const current = document.createElement("div");
		current.className = "weather-current";
		const currentIcon = document.createElement("span");
		currentIcon.className = `wi wi-${this.getWeatherIcon(this.currentWeather?.weatherType)}`;
		currentIcon.setAttribute("aria-hidden", "true");
		current.appendChild(currentIcon);

		const currentTemperature = document.createElement("span");
		currentTemperature.className = "weather-current-temperature";
		currentTemperature.textContent = this.formatTemperature(this.currentWeather?.temperature);
		current.appendChild(currentTemperature);
		summary.appendChild(current);
		wrapper.appendChild(summary);

		const forecast = document.createElement("div");
		forecast.className = "weather-forecast";
		forecast.setAttribute("role", "region");
		forecast.setAttribute("aria-label", "一周天气预报");
		forecast.tabIndex = -1;
		forecast.hidden = !this.isExpanded;
		if (!this.isExpanded) {
			forecast.setAttribute("inert", "");
		}

		const days = this.forecast.slice(0, Math.min(7, this.config.maxForecastDays));
		days.forEach((day, index) => {
			const row = document.createElement("div");
			row.className = "weather-forecast-day";

			const dayName = document.createElement("span");
			dayName.className = "weather-day-name";
			dayName.textContent = this.getDayLabel(day.date, index);
			row.appendChild(dayName);

			const icon = document.createElement("span");
			icon.className = `wi wi-${this.getWeatherIcon(day.weatherType)}`;
			icon.setAttribute("aria-hidden", "true");
			row.appendChild(icon);

			const high = document.createElement("span");
			high.className = "weather-day-high";
			high.textContent = this.formatTemperature(day.maxTemperature);
			row.appendChild(high);

			const low = document.createElement("span");
			low.className = "weather-day-low";
			low.textContent = this.formatTemperature(day.minTemperature);
			row.appendChild(low);
			forecast.appendChild(row);
		});
		wrapper.appendChild(forecast);

		if (this.providerName) {
			const source = document.createElement("div");
			source.className = "weather-source";
			const link = document.createElement("a");
			link.textContent = `天气来源：${this.providerName}`;
			link.href = this.providerName === "和风天气" ? "https://www.qweather.com/" : "https://open-meteo.com/";
			link.target = "_blank";
			link.rel = "noopener noreferrer";
			source.appendChild(link);
			this.attributions.forEach((attribution) => {
				const item = document.createElement("span");
				item.className = "weather-attribution";
				if (/^https:\/\//i.test(attribution)) {
					const details = document.createElement("a");
					details.textContent = "数据归因";
					details.href = attribution;
					details.target = "_blank";
					details.rel = "noopener noreferrer";
					item.appendChild(details);
				} else {
					item.textContent = attribution;
				}
				source.appendChild(item);
			});
			wrapper.appendChild(source);
		}
		if (this.weatherError) {
			const status = document.createElement("div");
			status.className = "weather-status";
			status.setAttribute("role", "status");
			status.textContent = this.weatherError;
			wrapper.appendChild(status);
		}

		wrapper.addEventListener("pointerenter", () => {
			this.pointerInside = true;
			if (!this.isPinned) {
				this.setExpanded(true);
			}
		});
		wrapper.addEventListener("pointerleave", () => {
			this.pointerInside = false;
			if (!this.isPinned && !wrapper.contains(document.activeElement)) {
				this.setExpanded(false);
			}
		});
		wrapper.addEventListener("focusin", () => this.setExpanded(true));
		wrapper.addEventListener("focusout", () => {
			window.setTimeout(() => {
				if (!this.isPinned && !this.pointerInside && !wrapper.contains(document.activeElement)) {
					this.setExpanded(false);
				}
			}, 0);
		});

		return wrapper;
	},

	setExpanded (expanded, pinned = this.isPinned) {
		this.isExpanded = Boolean(expanded);
		this.isPinned = this.isExpanded && Boolean(pinned);

		const card = this.getMountedCard();
		if (!card) {
			return;
		}

		const toggle = card.querySelector(".weather-title-toggle");
		const forecast = card.querySelector(".weather-forecast");
		card.classList.toggle("is-expanded", this.isExpanded);
		if (toggle) {
			toggle.setAttribute("aria-expanded", String(this.isExpanded));
		}
		if (forecast) {
			forecast.hidden = !this.isExpanded;
			if (this.isExpanded) {
				forecast.removeAttribute("inert");
			} else {
				forecast.setAttribute("inert", "");
			}
		}
	}
});
