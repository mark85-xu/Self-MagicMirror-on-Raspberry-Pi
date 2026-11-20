const { execFile } = require("child_process");
const fs = require("fs/promises");
const NodeHelper = require("node_helper");

module.exports = NodeHelper.create({
	socketNotificationReceived (notification, payload) {
		if (notification === "PI_STATUS_REQUEST") {
			this.collectStatus(payload).then((status) => {
				this.sendSocketNotification("PI_STATUS_RESPONSE", status);
			});
		}
	},

	async collectStatus (payload = {}) {
		try {
			const [temperature, throttled, frequency, memory, disk, ip] = await Promise.all([
				this.getTemperature(),
				this.getThrottled(),
				this.getFrequency(),
				this.getMemory(),
				this.getDisk(),
				payload.showIp ? this.run("hostname -I | awk '{print $1}'") : Promise.resolve("")
			]);

			return {
				temperature: temperature.text,
				temperatureClass: temperature.className,
				voltage: throttled.voltage,
				voltageClass: throttled.voltageClass,
				throttle: throttled.throttle,
				throttleClass: throttled.throttleClass,
				frequency,
				memory,
				disk,
				ip: ip.trim()
			};
		} catch (error) {
			return {
				error: "状态读取失败"
			};
		}
	},

	async getTemperature () {
		const output = await this.run("vcgencmd measure_temp 2>/dev/null || awk '{printf \"temp=%.1f\\\\047C\", $1/1000}' /sys/class/thermal/thermal_zone0/temp");
		const match = output.match(/temp=([0-9.]+)'C/);
		const value = match ? Number.parseFloat(match[1]) : null;

		return {
			text: value === null ? "--" : `${value.toFixed(1)}°C`,
			className: value !== null && value >= 70 ? "hot" : ""
		};
	},

	async getThrottled () {
		const output = await this.run("vcgencmd get_throttled 2>/dev/null || echo throttled=0x0");
		const match = output.match(/0x([0-9a-f]+)/i);
		const flags = match ? Number.parseInt(match[1], 16) : 0;
		const undervoltageNow = Boolean(flags & 0x1);
		const frequencyCappedNow = Boolean(flags & 0x2);
		const throttledNow = Boolean(flags & 0x4) || frequencyCappedNow;

		return {
			voltage: undervoltageNow ? "当前欠压" : "正常",
			voltageClass: undervoltageNow ? "warn" : "",
			throttle: throttledNow ? "正在降频" : "正常",
			throttleClass: throttledNow ? "warn" : ""
		};
	},

	async getFrequency () {
		const output = await this.run("vcgencmd measure_clock arm 2>/dev/null || cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq 2>/dev/null || echo 0");
		const raw = output.includes("=") ? output.split("=").pop() : output;
		const hz = Number.parseInt(raw.trim(), 10);

		if (!hz) {
			return "--";
		}

		const mhz = hz > 10000000 ? hz / 1000000 : hz / 1000;
		return `${Math.round(mhz)} MHz`;
	},

	async getMemory () {
		const meminfo = await fs.readFile("/proc/meminfo", "utf8");
		const total = Number.parseInt(meminfo.match(/^MemTotal:\s+(\d+)/m)?.[1] || "0", 10);
		const available = Number.parseInt(meminfo.match(/^MemAvailable:\s+(\d+)/m)?.[1] || "0", 10);

		if (!total || !available) {
			return "--";
		}

		const used = total - available;
		return `${Math.round((used / total) * 100)}%`;
	},

	async getDisk () {
		const output = await this.run("df -h / | awk 'NR==2 {print $5 \" / \" $2}'");
		return output.trim() || "--";
	},

	run (command) {
		return new Promise((resolve, reject) => {
			execFile("sh", ["-lc", command], { timeout: 5000 }, (error, stdout) => {
				if (error) {
					reject(error);
					return;
				}

				resolve(stdout.trim());
			});
		});
	}
});
