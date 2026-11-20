Module.register("MMM-QuoteDisplay", {
	defaults: {
		updateInterval: 5 * 60 * 1000,
		quotes: [
			{ text: "To be, or not to be—that is the question.", translation: "生存还是毁灭，这是一个问题。", source: "William Shakespeare, Hamlet, Act III, Scene I" },
			{ text: "The unexamined life is not worth living.", translation: "未经审视的人生不值得过。", source: "Plato, Apology 38a" },
			{ text: "No man is an island.", translation: "没有人是一座孤岛。", source: "John Donne, Meditation XVII" }
		]
	},

	start () {
		this.quoteIndex = 0;
		this.quoteTimer = null;
		if (this.getQuotes().length > 1) {
			this.quoteTimer = setInterval(() => this.advanceQuote(), this.config.updateInterval);
		}
	},

	getStyles () {
		return ["MMM-QuoteDisplay.css"];
	},

	getQuotes () {
		if (!Array.isArray(this.config.quotes)) {
			return [];
		}
		return this.config.quotes.filter((quote) => quote && typeof quote.text === "string" && quote.text.trim());
	},

	getDom () {
		const wrapper = document.createElement("div");
		wrapper.className = "quote-display";
		const quotes = this.getQuotes();
		if (!quotes.length) {
			return wrapper;
		}

		const quote = quotes[this.quoteIndex % quotes.length];
		const text = document.createElement("blockquote");
		text.className = "quote-display-text";
		text.textContent = quote.text.trim();
		wrapper.appendChild(text);

		if (typeof quote.translation === "string" && quote.translation.trim()) {
			const translation = document.createElement("p");
			translation.className = "quote-display-translation";
			translation.textContent = quote.translation.trim();
			wrapper.appendChild(translation);
		}

		if (typeof quote.source === "string" && quote.source.trim()) {
			const source = document.createElement("cite");
			source.className = "quote-display-source";
			source.textContent = quote.source.trim();
			wrapper.appendChild(source);
		}

		return wrapper;
	},

	advanceQuote () {
		const quotes = this.getQuotes();
		if (quotes.length < 2) {
			return;
		}
		this.quoteIndex = (this.quoteIndex + 1) % quotes.length;
		this.updateDom(300);
	},

	stop () {
		if (this.quoteTimer) {
			clearInterval(this.quoteTimer);
			this.quoteTimer = null;
		}
	}
});
