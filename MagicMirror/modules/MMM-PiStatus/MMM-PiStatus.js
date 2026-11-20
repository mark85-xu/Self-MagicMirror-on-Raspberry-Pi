Module.register("MMM-PiStatus", {
	defaults: {
		updateInterval: 5 * 1000,
		animationSpeed: 500,
		showIp: true
	},

	start () {
		this.status = null;
		this.loaded = false;
		this.requestStatus();
		this.timer = setInterval(() => this.requestStatus(), this.config.updateInterval);
	},

	suspend () {
		clearInterval(this.timer);
	},

	getStyles () {
		return ["MMM-PiStatus.css"];
	},

	requestStatus () {
		this.sendSocketNotification("PI_STATUS_REQUEST", {
			showIp: this.config.showIp
		});
	},

	socketNotificationReceived (notification, payload) {
		if (notification !== "PI_STATUS_RESPONSE") {
			return;
		}

		this.status = payload || { error: "状态读取失败" };
		this.loaded = true;
		if (document.querySelector(".MMM-PiStatus .pi-status-grid")) {
			this.updateStatusValues();
		} else {
			this.updateDom(this.config.animationSpeed);
		}
	},

	getDom () {
		const wrapper = document.createElement("div");
		wrapper.className = "pi-status";

		if (!this.loaded) {
			wrapper.className = "pi-status dimmed small";
			wrapper.textContent = "正在读取状态...";
			return wrapper;
		}

		if (this.status.error) {
			wrapper.className = "pi-status dimmed small";
			wrapper.textContent = this.status.error;
			return wrapper;
		}

		const grid = document.createElement("div");
		grid.className = "pi-status-grid";
		wrapper.appendChild(grid);

		this.addRow(grid, "temperature", "CPU 温度", this.status.temperature, this.status.temperatureClass);
		this.addRow(grid, "voltage", "供电", this.status.voltage, this.status.voltageClass);
		this.addRow(grid, "throttle", "降频", this.status.throttle, this.status.throttleClass);
		this.addRow(grid, "frequency", "CPU 频率", this.status.frequency);
		this.addRow(grid, "memory", "内存", this.status.memory);
		this.addRow(grid, "disk", "磁盘", this.status.disk);

		if (this.config.showIp) {
			this.addRow(grid, "ip", "网络", this.status.ip || "未获取");
		}

		return wrapper;
	},

	updateStatusValues () {
		const fields = [
			["temperature", this.status.temperature, this.status.temperatureClass],
			["voltage", this.status.voltage, this.status.voltageClass],
			["throttle", this.status.throttle, this.status.throttleClass],
			["frequency", this.status.frequency, ""],
			["memory", this.status.memory, ""],
			["disk", this.status.disk, ""],
			["ip", this.status.ip || "未获取", ""]
		];
		const hasError = Boolean(this.status.error);

		fields.forEach(([name, text, className]) => {
			const value = document.querySelector(`.MMM-PiStatus [data-status="${name}"] .value`);
			if (!value) {
				return;
			}

			value.textContent = hasError ? (name === "temperature" ? this.status.error : "--") : (text ?? "--");
			value.className = "value";
			if (!hasError && ["hot", "warn"].includes(className)) {
				value.classList.add(className);
			}
		});
	},

	addRow (parent, key, labelText, valueText, valueClass = "") {
		const row = document.createElement("div");
		row.className = "pi-status-row";
		row.dataset.status = key;

		const label = document.createElement("span");
		label.className = "label";
		label.textContent = labelText;

		const value = document.createElement("span");
		value.className = `value ${valueClass}`.trim();
		value.textContent = valueText ?? "--";

		row.append(label, value);
		parent.appendChild(row);
	}
});
