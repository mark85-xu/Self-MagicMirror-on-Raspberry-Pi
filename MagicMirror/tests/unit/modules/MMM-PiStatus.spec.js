const path = require("node:path");
const { JSDOM } = require("jsdom");

describe("MMM-PiStatus in-place refresh", () => {
	let dom;
	let definition;
	let statusModule;

	beforeEach(() => {
		jest.useFakeTimers();
		dom = new JSDOM("<!doctype html><html><body></body></html>");
		global.window = dom.window;
		global.document = dom.window.document;
		global.Module = {
			register: jest.fn((name, moduleDefinition) => {
				definition = moduleDefinition;
			})
		};

		jest.isolateModules(() => {
			require(path.resolve(__dirname, "../../../modules/MMM-PiStatus/MMM-PiStatus.js"));
		});

		statusModule = Object.assign(Object.create(definition), {
			config: { updateInterval: 5000, animationSpeed: 500, showIp: true },
			status: null,
			loaded: false,
			sendSocketNotification: jest.fn(),
			updateDom: jest.fn()
		});
	});

	afterEach(() => {
		jest.clearAllTimers();
		jest.useRealTimers();
		dom.window.close();
		delete global.window;
		delete global.document;
		delete global.Module;
	});

	/**
	 * Render the status module in a MagicMirror module container.
	 * @returns {HTMLElement} The module root in the test document.
	 */
	function render () {
		const root = document.createElement("div");
		root.className = "MMM-PiStatus";
		root.appendChild(statusModule.getDom());
		document.body.appendChild(root);
		return root;
	}

	/**
	 * Build a representative system status response.
	 * @param {object} overrides Values to replace in the default response.
	 * @returns {object} A response shaped like the Pi status helper output.
	 */
	function status (overrides = {}) {
		return {
			temperature: "42.0°C",
			temperatureClass: "",
			voltage: "正常",
			voltageClass: "",
			throttle: "正常",
			throttleClass: "",
			frequency: "1200 MHz",
			memory: "38%",
			disk: "32% / 274G",
			ip: "192.0.2.10",
			...overrides
		};
	}

	it("requests a sample immediately and then every five seconds", () => {
		statusModule.start();

		expect(definition.defaults.updateInterval).toBe(5000);
		expect(statusModule.sendSocketNotification).toHaveBeenCalledTimes(1);
		jest.advanceTimersByTime(15000);
		expect(statusModule.sendSocketNotification).toHaveBeenCalledTimes(4);
		statusModule.suspend();
		jest.advanceTimersByTime(5000);
		expect(statusModule.sendSocketNotification).toHaveBeenCalledTimes(4);
	});

	it("renders the first response and updates later values without replacing DOM nodes", () => {
		statusModule.socketNotificationReceived("PI_STATUS_RESPONSE", status());
		expect(statusModule.updateDom).toHaveBeenCalledTimes(1);

		const root = render();
		const grid = root.querySelector(".pi-status-grid");
		const row = root.querySelector("[data-status=\"temperature\"]");
		const value = row.querySelector(".value");

		statusModule.socketNotificationReceived("PI_STATUS_RESPONSE", status({
			temperature: "72.0°C",
			temperatureClass: "hot",
			memory: "41%"
		}));

		expect(statusModule.updateDom).toHaveBeenCalledTimes(1);
		expect(root.querySelector(".pi-status-grid")).toBe(grid);
		expect(root.querySelector("[data-status=\"temperature\"]")).toBe(row);
		expect(row.querySelector(".value")).toBe(value);
		expect(value.textContent).toBe("72.0°C");
		expect(value.classList.contains("hot")).toBe(true);
		expect(root.querySelector("[data-status=\"memory\"] .value").textContent).toBe("41%");
	});

	it("updates the existing rows in place when sampling reports an error", () => {
		statusModule.socketNotificationReceived("PI_STATUS_RESPONSE", status());
		const root = render();
		const grid = root.querySelector(".pi-status-grid");

		statusModule.socketNotificationReceived("PI_STATUS_RESPONSE", { error: "状态读取失败" });

		expect(root.querySelector(".pi-status-grid")).toBe(grid);
		expect(root.querySelector("[data-status=\"temperature\"] .value").textContent).toBe("状态读取失败");
		expect(root.querySelector("[data-status=\"memory\"] .value").textContent).toBe("--");
	});
});
