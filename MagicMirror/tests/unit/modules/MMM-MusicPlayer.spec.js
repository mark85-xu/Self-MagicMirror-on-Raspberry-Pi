const path = require("node:path");
const { JSDOM } = require("jsdom");

describe("MMM-MusicPlayer compact hover card", () => {
	let dom;
	let definition;
	let player;

	class AudioStub {
		constructor () {
			this.currentTime = 0;
			this.duration = 0;
			this.paused = true;
			this.volume = 0.22;
			this.listeners = new Map();
		}

		addEventListener (name, listener) {
			this.listeners.set(name, listener);
		}

		load () {}

		play () {
			return Promise.resolve();
		}

		pause () {
			this.paused = true;
		}

		emit (name) {
			this.listeners.get(name)?.();
		}
	}

	beforeEach(() => {
		dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost:8080/" });
		global.window = dom.window;
		global.document = dom.window.document;
		global.Audio = AudioStub;
		global.Module = {
			register: jest.fn((name, moduleDefinition) => {
				definition = moduleDefinition;
			})
		};

		jest.isolateModules(() => {
			require(path.resolve(__dirname, "../../../modules/MMM-MusicPlayer/MMM-MusicPlayer.js"));
		});

		player = Object.assign(Object.create(definition), {
			config: { initialVolume: 0.22, autoplay: false },
			tracks: [{ title: "解析歌名", fileName: "file-name.mp3", url: "/music/file-name.mp3" }],
			currentIndex: 0,
			isPlaying: false,
			isExpanded: false,
			isPinned: false,
			pointerInside: false,
			volume: 0.22,
			audio: null,
			sendNotification: jest.fn()
		});
	});

	afterEach(() => {
		dom.window.close();
		delete global.window;
		delete global.document;
		delete global.Audio;
		delete global.Module;
	});

	/**
	 * Render the current module DOM inside a MagicMirror module root.
	 * @returns {HTMLElement} The root element used in the test document.
	 */
	function render () {
		const root = document.createElement("div");
		root.className = "MMM-MusicPlayer";
		root.appendChild(player.getDom());
		document.body.appendChild(root);
		return root;
	}

	it("shows the parsed title and does not render lyric text", () => {
		const root = render();

		expect(root.querySelector(".music-title-toggle").textContent).toBe("解析歌名");
		expect(root.querySelector(".music-lyrics")).toBeNull();
		expect(root.textContent).not.toContain("LRC");
	});

	it("falls back to the filename when the parsed title is missing or blank", () => {
		player.tracks[0].title = "  ";
		let root = render();
		expect(root.querySelector(".music-title-toggle").textContent).toBe("file-name");

		player.tracks[0].fileName = "untitled.MP3";
		player.tracks[0].title = undefined;
		root = render();
		expect(root.querySelector(".music-title-toggle").textContent).toBe("untitled");
	});

	it("exposes a read-only progress value and fill, including unknown duration", () => {
		player.audio = new AudioStub();
		player.audio.duration = 200;
		player.audio.currentTime = 50;
		let root = render();
		let progress = root.querySelector("[role=\"progressbar\"]");

		expect(progress.getAttribute("aria-label")).toBe("播放进度");
		expect(progress.getAttribute("aria-valuenow")).toBe("25");
		expect(progress.style.getPropertyValue("--progress-fill")).toBe("25%");
		expect(root.querySelector("input[type=\"range\"].music-progress-slider").hidden).toBe(true);
		player.seekToProgress = jest.fn();
		progress.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
		expect(player.seekToProgress).not.toHaveBeenCalled();

		player.audio.duration = 0;
		player.audio.currentTime = 5;
		root = render();
		progress = root.querySelector("[role=\"progressbar\"]");
		expect(progress.getAttribute("aria-valuenow")).toBe("0");
		expect(progress.style.getPropertyValue("--progress-fill")).toBe("0%");
	});

	it("makes the progress bar seekable only while expanded", () => {
		player.audio = new AudioStub();
		player.audio.duration = 100;
		const root = render();
		const card = root.querySelector(".music-player");
		const progressBar = root.querySelector(".music-progress-indicator");
		const slider = root.querySelector(".music-progress-slider");

		expect(progressBar.hidden).toBe(false);
		expect(slider.hidden).toBe(true);
		card.dispatchEvent(new dom.window.Event("pointerenter"));
		expect(progressBar.hidden).toBe(true);
		expect(slider.hidden).toBe(false);
		expect(slider.getAttribute("role")).toBe("slider");

		slider.value = "40";
		slider.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
		expect(player.audio.currentTime).toBe(40);
		expect(slider.getAttribute("aria-valuenow")).toBe("40");
	});

	it("keeps seeking disabled until track duration is available", () => {
		player.audio = new AudioStub();
		const root = render();
		root.querySelector(".music-player").dispatchEvent(new dom.window.Event("pointerenter"));
		const slider = root.querySelector(".music-progress-slider");

		expect(slider.disabled).toBe(true);
		player.audio.duration = 80;
		player.updateProgressFill();
		expect(slider.disabled).toBe(false);
		expect(slider.getAttribute("aria-valuenow")).toBe("0");
	});

	it("expands on pointer hover and stays open while a control has focus", () => {
		const root = render();
		const card = root.querySelector(".music-player");
		const titleButton = root.querySelector(".music-title-toggle");
		const controls = root.querySelector(".music-expanded-controls");

		expect(titleButton.getAttribute("aria-expanded")).toBe("false");
		expect(controls.hidden).toBe(true);
		card.dispatchEvent(new dom.window.Event("pointerenter"));
		expect(titleButton.getAttribute("aria-expanded")).toBe("true");
		expect(controls.hidden).toBe(false);
		card.dispatchEvent(new dom.window.Event("pointerleave"));
		expect(titleButton.getAttribute("aria-expanded")).toBe("false");

		card.dispatchEvent(new dom.window.Event("pointerenter"));
		expect(titleButton.getAttribute("aria-expanded")).toBe("true");

		root.querySelector(".music-control-button").focus();
		card.dispatchEvent(new dom.window.Event("pointerleave"));
		expect(titleButton.getAttribute("aria-expanded")).toBe("true");
	});

	it("supports a persistent touch or keyboard toggle and removes collapsed controls from tab order", () => {
		const root = render();
		const card = root.querySelector(".music-player");
		const titleButton = root.querySelector(".music-title-toggle");
		const controls = root.querySelector(".music-expanded-controls");

		card.dispatchEvent(new dom.window.Event("pointerenter"));
		titleButton.click();
		expect(titleButton.getAttribute("aria-expanded")).toBe("true");
		expect(controls.hasAttribute("inert")).toBe(false);

		card.dispatchEvent(new dom.window.Event("pointerleave"));
		expect(titleButton.getAttribute("aria-expanded")).toBe("true");

		titleButton.click();
		expect(titleButton.getAttribute("aria-expanded")).toBe("false");
		expect(controls.hidden).toBe(true);
		expect(controls.hasAttribute("inert")).toBe(true);
	});

	it("updates the mounted card after getDom returns an identical detached candidate", () => {
		const root = render();
		const visibleCard = root.querySelector(".music-player");

		// MagicMirror may compare the new HTML and retain the existing mounted DOM.
		player.getDom();
		player.setExpanded(true);

		expect(visibleCard.classList.contains("is-expanded")).toBe(true);
		expect(root.querySelector(".music-title-toggle").getAttribute("aria-expanded")).toBe("true");
		expect(root.querySelector(".music-expanded-controls").hidden).toBe(false);
	});

	it("updates playback state in place without replacing the focused control", () => {
		const root = render();
		player.loadTrack(false);
		root.querySelector(".music-player").dispatchEvent(new dom.window.Event("pointerenter"));
		const playButton = root.querySelector(".music-play-button");
		playButton.focus();
		player.audio.paused = false;
		player.audio.emit("play");

		expect(document.activeElement).toBe(playButton);
		expect(playButton.textContent).toBe("⏸");
		expect(playButton.getAttribute("aria-label")).toBe("暂停");
	});

	it("refreshes the title when voice playback restores an earlier track without losing focus", () => {
		player.tracks = [
			{ title: "曲目 A", fileName: "a.mp3", url: "/music/a.mp3" },
			{ title: "曲目 B", fileName: "b.mp3", url: "/music/b.mp3" }
		];
		const root = render();
		player.loadTrack(false);
		player.playNext();
		root.querySelector(".music-player").dispatchEvent(new dom.window.Event("pointerenter"));
		const playButton = root.querySelector(".music-play-button");
		playButton.focus();

		player.resumeAfterVoice({ wasPlaying: true, trackIndex: 0, currentTime: 12 });

		expect(root.querySelector(".music-title-toggle").textContent).toBe("曲目 A");
		expect(player.audio.src).toBe("/music/a.mp3");
		expect(document.activeElement).toBe(playButton);
	});
});
