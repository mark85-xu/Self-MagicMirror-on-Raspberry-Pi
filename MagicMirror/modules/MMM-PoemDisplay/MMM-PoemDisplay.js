Module.register("MMM-PoemDisplay", {
	defaults: {
		updateInterval: 60 * 1000,
		fadeSpeed: 1200,
		randomizeCiLayout: true
	},

	start() {
		this.poems = [];
		this.currentIndex = 0;
		this.currentLines = [];
		this.loaded = false;
		this.sendSocketNotification("POEMS_REQUEST");
	},

	getStyles() {
		return ["MMM-PoemDisplay.css"];
	},

	socketNotificationReceived(notification, payload) {
		if (notification !== "POEMS_RESPONSE") {
			return;
		}

		this.poems = payload || [];
		this.loaded = true;
		this.prepareCurrentLines();
		this.updateDom(this.config.fadeSpeed);
		this.scheduleNextPoem();
	},

	scheduleNextPoem() {
		clearInterval(this.timer);
		this.timer = setInterval(() => this.showNextPoem(), this.config.updateInterval);
	},

	showNextPoem() {
		if (!this.poems.length) {
			return;
		}

		this.currentIndex = (this.currentIndex + 1) % this.poems.length;
		this.prepareCurrentLines();
		this.updateDom(this.config.fadeSpeed);
	},

	showPreviousPoem() {
		if (!this.poems.length) {
			return;
		}

		this.currentIndex = (this.currentIndex - 1 + this.poems.length) % this.poems.length;
		this.prepareCurrentLines();
		this.updateDom(this.config.fadeSpeed);
	},

	showPreviousPoemByClick() {
		this.showPreviousPoem();
		this.scheduleNextPoem();
	},

	showNextPoemByClick() {
		this.showNextPoem();
		this.scheduleNextPoem();
	},

	suspend() {
		clearInterval(this.timer);
	},

	prepareCurrentLines() {
		const poem = this.poems[this.currentIndex];
		if (!poem) {
			this.currentLines = [];
			return;
		}

		this.currentLines = poem.form === "ci" && this.config.randomizeCiLayout
			? this.formatCiLines(poem.lines)
			: poem.lines;
	},

	formatCiLines(lines) {
		const text = lines.join("").replace(/\s+/g, "");
		const parts = text.match(/[^。？！]+[。？！]?/g) || lines;
		const grouped = [];
		let cursor = 0;
		let takeTwo = (Date.now() + this.currentIndex) % 2 === 0;

		while (cursor < parts.length) {
			const size = takeTwo && cursor + 1 < parts.length ? 2 : 1;
			grouped.push(parts.slice(cursor, cursor + size).join(""));
			cursor += size;
			takeTwo = !takeTwo;
		}

		return grouped;
	},

	getDom() {
		const wrapper = document.createElement("div");
		wrapper.className = "poem-display";

		if (!this.loaded) {
			wrapper.classList.add("dimmed");
			wrapper.textContent = "正在载入诗词...";
			return wrapper;
		}

		const poem = this.poems[this.currentIndex];
		if (!poem) {
			wrapper.classList.add("dimmed");
			wrapper.textContent = "暂无诗词";
			return wrapper;
		}

		const title = document.createElement("div");
		title.className = "poem-title";
		title.textContent = `《${poem.title}》`;
		wrapper.appendChild(title);

		const author = document.createElement("div");
		author.className = "poem-author";
		author.textContent = poem.author;
		wrapper.appendChild(author);

		const body = document.createElement("div");
		body.className = `poem-body ${poem.form === "ci" ? "ci" : "verse"}`;
		for (const lineText of this.currentLines) {
			const line = document.createElement("div");
			line.className = "poem-line";
			line.textContent = lineText;
			body.appendChild(line);
		}
		wrapper.appendChild(body);

		const controls = document.createElement("div");
		controls.className = "poem-controls";

		const previousButton = document.createElement("button");
		previousButton.className = "poem-nav-button poem-previous-button";
		previousButton.type = "button";
		previousButton.textContent = "上一首";
		previousButton.addEventListener("click", () => this.showPreviousPoemByClick());
		controls.appendChild(previousButton);

		const nextButton = document.createElement("button");
		nextButton.className = "poem-nav-button poem-next-button";
		nextButton.type = "button";
		nextButton.textContent = "下一首";
		nextButton.addEventListener("click", () => this.showNextPoemByClick());
		controls.appendChild(nextButton);

		wrapper.appendChild(controls);

		return wrapper;
	}
});
