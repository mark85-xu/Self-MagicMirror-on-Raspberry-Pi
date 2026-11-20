const path = require("node:path");
const { JSDOM } = require("jsdom");

describe("MMM-QuoteDisplay", () => {
	let dom;
	let definition;
	let module;

	beforeEach(() => {
		dom = new JSDOM("<!doctype html><html><body></body></html>");
		global.window = dom.window;
		global.document = dom.window.document;
		global.Module = {
			register: jest.fn((name, moduleDefinition) => {
				definition = moduleDefinition;
			})
		};
		jest.isolateModules(() => {
			require(path.resolve(__dirname, "../../../modules/MMM-QuoteDisplay/MMM-QuoteDisplay.js"));
		});
		module = Object.assign(Object.create(definition), {
			config: {
				updateInterval: 1000,
				quotes: [
					{ text: "The unexamined life is not worth living.", translation: "未经审视的人生不值得过。", source: "Plato, Apology 38a" },
					{ text: "No man is an island.", translation: "没有人是一座孤岛。", source: "John Donne, Meditation XVII" }
				]
			},
			quoteIndex: 0,
			updateDom: jest.fn()
		});
	});

	afterEach(() => {
		module?.stop();
		dom.window.close();
		delete global.window;
		delete global.document;
		delete global.Module;
	});

	it("defaults to refreshing bilingual quotes every five minutes", () => {
		expect(definition.defaults.updateInterval).toBe(5 * 60 * 1000);
		expect(definition.defaults.quotes.length).toBeGreaterThan(1);
		expect(definition.defaults.quotes.every((quote) => quote.translation && quote.source)).toBe(true);
	});

	it("renders the English quote, Chinese translation, and attribution as text", () => {
		const root = module.getDom();

		expect(root.querySelector("blockquote").textContent).toBe("The unexamined life is not worth living.");
		expect(root.querySelector(".quote-display-translation").textContent).toBe("未经审视的人生不值得过。");
		expect(root.querySelector("cite").textContent).toBe("Plato, Apology 38a");
	});

	it("cycles through configured quotes and wraps at the end", () => {
		module.advanceQuote();
		expect(module.quoteIndex).toBe(1);
		module.advanceQuote();
		expect(module.quoteIndex).toBe(0);
		expect(module.updateDom).toHaveBeenCalledTimes(2);
	});

	it("renders an empty module when the configured list has no valid quotes", () => {
		module.config.quotes = [];
		const root = module.getDom();

		expect(root.querySelector("blockquote")).toBeNull();
		expect(root.textContent).toBe("");
	});

	it("starts and clears its rotation timer", () => {
		jest.useFakeTimers();
		const intervalSpy = jest.spyOn(global, "setInterval");
		const clearSpy = jest.spyOn(global, "clearInterval");

		module.start();
		expect(intervalSpy).toHaveBeenCalledWith(expect.any(Function), 1000);
		const timer = module.quoteTimer;
		module.stop();
		expect(clearSpy).toHaveBeenCalledWith(timer);

		intervalSpy.mockRestore();
		clearSpy.mockRestore();
		jest.useRealTimers();
	});
});
