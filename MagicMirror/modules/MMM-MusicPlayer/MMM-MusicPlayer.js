Module.register("MMM-MusicPlayer", {
	defaults: {
		musicDir: "/home/lhx/Desktop/music_library",
		initialVolume: 0.22,
		autoplay: false
	},

	start () {
		this.tracks = [];
		this.currentIndex = 0;
		this.isPlaying = false;
		this.isExpanded = false;
		this.isPinned = false;
		this.pointerInside = false;
		this.volume = this.clampVolume(this.config.initialVolume);
		this.audio = null;
		this.sendSocketNotification("MUSIC_LIBRARY_REQUEST", {
			musicDir: this.config.musicDir
		});
	},

	getStyles () {
		return ["MMM-MusicPlayer.css"];
	},

	socketNotificationReceived (notification, payload) {
		if (notification !== "MUSIC_LIBRARY_RESPONSE") {
			return;
		}

		this.tracks = payload.tracks || [];
		this.currentIndex = 0;
		this.loadTrack();
	},

	notificationReceived (notification, payload) {
		if (notification === "MUSIC_GET_STATE") {
			this.sendMusicState(payload?.requestId);
		} else if (notification === "MUSIC_PAUSE_FOR_VOICE") {
			this.pauseForVoice(payload);
		} else if (notification === "MUSIC_RESUME_AFTER_VOICE") {
			this.resumeAfterVoice(payload);
		}
	},

	sendMusicState (requestId) {
		this.sendNotification("MUSIC_STATE_RESPONSE", {
			requestId,
			trackIndex: this.currentIndex,
			currentTime: this.audio?.currentTime || 0,
			isPlaying: Boolean(this.audio && !this.audio.paused),
			volume: this.volume
		});
	},

	pauseForVoice (payload = {}) {
		const state = {
			requestId: payload.requestId,
			trackIndex: this.currentIndex,
			currentTime: this.audio?.currentTime || 0,
			wasPlaying: Boolean(this.audio && !this.audio.paused),
			volume: this.volume
		};

		if (state.wasPlaying) {
			this.audio.pause();
		}

		this.sendNotification("MUSIC_PAUSE_CONFIRMED", state);
	},

	resumeAfterVoice (payload = {}) {
		if (!payload.wasPlaying || !this.audio) {
			this.sendMusicState(payload.requestId);
			return;
		}

		if (Number.isInteger(payload.trackIndex) && payload.trackIndex >= 0 && payload.trackIndex < this.tracks.length) {
			this.currentIndex = payload.trackIndex;
		}

		if (this.getCurrentTrack() && this.audio.src !== new URL(this.getCurrentTrack().url, window.location.href).href) {
			this.loadTrack(false);
		}

		if (Number.isFinite(payload.currentTime)) {
			this.audio.currentTime = Math.max(0, payload.currentTime);
		}

		this.audio.play().catch(() => {
			this.isPlaying = false;
			this.updatePlayButton();
		});
		this.sendMusicState(payload.requestId);
	},

	getCurrentTrack () {
		return this.tracks[this.currentIndex];
	},

	getCurrentTrackTitle () {
		const track = this.getCurrentTrack();
		const title = typeof track?.title === "string" ? track.title.trim() : "";
		if (title) {
			return title;
		}

		const fileName = typeof track?.fileName === "string" ? track.fileName.trim() : "";
		const fallback = fileName.replace(/\.mp3$/i, "").trim();
		return fallback || "音乐播放器";
	},

	loadTrack (shouldPlay = this.config.autoplay) {
		const track = this.getCurrentTrack();
		this.updateCurrentTrackTitle();
		if (!track) {
			this.updateProgressFill();
			return;
		}

		if (!this.audio) {
			this.audio = new Audio();
			this.audio.volume = this.volume;
			this.audio.addEventListener("timeupdate", () => this.updateProgressFill());
			this.audio.addEventListener("loadedmetadata", () => this.updateProgressFill());
			this.audio.addEventListener("durationchange", () => this.updateProgressFill());
			this.audio.addEventListener("ended", () => this.playNext());
			this.audio.addEventListener("play", () => {
				this.isPlaying = true;
				this.updatePlayButton();
			});
			this.audio.addEventListener("pause", () => {
				this.isPlaying = false;
				this.updatePlayButton();
			});
		}

		this.audio.volume = this.volume;
		this.audio.src = track.url;
		this.audio.load();
		this.updateProgressFill();

		if (shouldPlay) {
			this.audio.play().catch(() => {
				this.isPlaying = false;
				this.updatePlayButton();
			});
		}
	},

	playPrevious () {
		if (!this.tracks.length) {
			return;
		}

		this.currentIndex = (this.currentIndex - 1 + this.tracks.length) % this.tracks.length;
		this.loadTrack(true);
	},

	togglePlay () {
		if (!this.audio) {
			this.loadTrack(false);
		}

		if (!this.audio) {
			return;
		}

		if (this.audio.paused) {
			this.audio.play().catch(() => {
				this.isPlaying = false;
				this.updatePlayButton();
			});
		} else {
			this.audio.pause();
		}
	},

	playNext () {
		if (!this.tracks.length) {
			return;
		}

		this.currentIndex = (this.currentIndex + 1) % this.tracks.length;
		this.loadTrack(true);
	},

	getProgressRatio () {
		if (!this.audio || !Number.isFinite(this.audio.duration) || this.audio.duration <= 0) {
			return 0;
		}

		return Math.min(1, Math.max(0, this.audio.currentTime / this.audio.duration));
	},

	updateProgressFill () {
		const ratio = this.getProgressRatio();
		const card = this.getMountedCard();
		const progress = card?.querySelector(".music-progress-indicator");
		if (progress) {
			progress.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
			progress.style.setProperty("--progress-fill", `${ratio * 100}%`);
		}
		const slider = card?.querySelector(".music-progress-slider");
		if (slider) {
			slider.disabled = !this.audio || !Number.isFinite(this.audio.duration) || this.audio.duration <= 0;
			slider.value = String(Math.round(ratio * 100));
			slider.setAttribute("aria-valuenow", slider.value);
			slider.style.setProperty("--progress-fill", `${ratio * 100}%`);
		}

		const elapsed = card?.querySelector(".music-progress-elapsed");
		if (elapsed) {
			elapsed.textContent = `+${this.formatTime(this.getElapsedSeconds())}`;
		}

		const remaining = card?.querySelector(".music-progress-remaining");
		if (remaining) {
			remaining.textContent = `-${this.formatTime(this.getRemainingSeconds())}`;
		}
	},

	seekToProgress (value) {
		if (!this.audio || !Number.isFinite(this.audio.duration) || this.audio.duration <= 0) {
			return;
		}

		const percentage = Math.min(100, Math.max(0, Number.parseFloat(value)));
		if (!Number.isFinite(percentage)) {
			return;
		}

		this.audio.currentTime = (percentage / 100) * this.audio.duration;
		this.updateProgressFill();
	},

	getMountedCard () {
		return document.querySelector(".MMM-MusicPlayer .music-player");
	},

	updateCurrentTrackTitle () {
		const title = this.getCurrentTrackTitle();
		const button = this.getMountedCard()?.querySelector(".music-title-toggle");
		if (button) {
			button.textContent = title;
			button.setAttribute("aria-label", `${title}，切换播放器展开状态`);
			button.title = `${title}，切换播放器展开状态`;
		}
	},

	updatePlayButton () {
		const button = this.getMountedCard()?.querySelector(".music-play-button");
		if (button) {
			const label = this.isPlaying ? "暂停" : "播放";
			button.textContent = this.isPlaying ? "⏸" : "▶";
			button.title = label;
			button.setAttribute("aria-label", label);
		}
	},

	getElapsedSeconds () {
		if (!this.audio || !Number.isFinite(this.audio.currentTime)) {
			return 0;
		}

		return Math.max(0, this.audio.currentTime);
	},

	getRemainingSeconds () {
		if (!this.audio || !Number.isFinite(this.audio.duration) || this.audio.duration <= 0) {
			return 0;
		}

		return Math.max(0, this.audio.duration - this.getElapsedSeconds());
	},

	formatTime (seconds) {
		const totalSeconds = Math.floor(Math.max(0, seconds));
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const remainingSeconds = totalSeconds % 60;

		if (hours > 0) {
			return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
		}

		return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
	},

	setVolume (value) {
		this.volume = this.clampVolume(Number.parseFloat(value));
		if (this.audio) {
			this.audio.volume = this.volume;
		}
		this.updateVolumeFill();
	},

	clampVolume (value) {
		if (!Number.isFinite(value)) {
			return 0.22;
		}
		return Math.min(1, Math.max(0, value));
	},

	updateVolumeFill () {
		const slider = document.querySelector(".MMM-MusicPlayer .music-volume-slider");
		if (slider) {
			slider.style.setProperty("--volume-fill", `${this.volume * 100}%`);
		}

		const value = document.querySelector(".MMM-MusicPlayer .music-volume-value");
		if (value) {
			value.textContent = `${Math.round(this.volume * 100)}%`;
		}
	},

	getDom () {
		const wrapper = document.createElement("div");
		wrapper.className = `music-player${this.isExpanded ? " is-expanded" : ""}`;

		const titleButton = document.createElement("button");
		titleButton.className = "music-title-toggle";
		titleButton.type = "button";
		titleButton.textContent = this.getCurrentTrackTitle();
		titleButton.title = `${this.getCurrentTrackTitle()}，切换播放器展开状态`;
		titleButton.setAttribute("aria-expanded", String(this.isExpanded));
		titleButton.setAttribute("aria-label", `${this.getCurrentTrackTitle()}，切换播放器展开状态`);
		titleButton.addEventListener("click", () => {
			const expand = !this.isPinned;
			this.setExpanded(expand, expand);
		});
		wrapper.appendChild(titleButton);

		wrapper.appendChild(this.createProgressControl());

		const expandedControls = document.createElement("div");
		expandedControls.className = "music-expanded-controls";
		expandedControls.hidden = !this.isExpanded;
		if (!this.isExpanded) {
			expandedControls.setAttribute("inert", "");
		}

		const elapsed = document.createElement("span");
		elapsed.className = "music-progress-time music-progress-elapsed";
		elapsed.textContent = `+${this.formatTime(this.getElapsedSeconds())}`;
		expandedControls.appendChild(elapsed);

		const remaining = document.createElement("span");
		remaining.className = "music-progress-time music-progress-remaining";
		remaining.textContent = `-${this.formatTime(this.getRemainingSeconds())}`;
		expandedControls.appendChild(remaining);

		const controls = document.createElement("div");
		controls.className = "music-controls";

		const previousButton = this.createControlButton("⏮", "上一首", () => this.playPrevious());
		const playButton = this.createControlButton(this.isPlaying ? "⏸" : "▶", this.isPlaying ? "暂停" : "播放", () => this.togglePlay());
		playButton.classList.add("music-play-button");
		const nextButton = this.createControlButton("⏭", "下一首", () => this.playNext());

		controls.append(previousButton, playButton, nextButton);
		expandedControls.appendChild(controls);
		expandedControls.appendChild(this.createVolumeControl());
		wrapper.appendChild(expandedControls);

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

		const titleButton = card.querySelector(".music-title-toggle");
		const controls = card.querySelector(".music-expanded-controls");
		const progress = card.querySelector(".music-progress-indicator");
		const progressSlider = card.querySelector(".music-progress-slider");
		card.classList.toggle("is-expanded", this.isExpanded);
		if (titleButton) {
			titleButton.setAttribute("aria-expanded", String(this.isExpanded));
		}
		if (controls) {
			controls.hidden = !this.isExpanded;
			if (this.isExpanded) {
				controls.removeAttribute("inert");
			} else {
				controls.setAttribute("inert", "");
			}
		}
		if (progress) {
			progress.hidden = this.isExpanded;
		}
		if (progressSlider) {
			progressSlider.hidden = !this.isExpanded;
		}
	},

	createProgressControl () {
		const row = document.createElement("div");
		row.className = "music-progress-row";
		const ratio = this.getProgressRatio();
		const progress = document.createElement("div");
		progress.className = "music-progress-indicator";
		progress.setAttribute("role", "progressbar");
		progress.setAttribute("aria-label", "播放进度");
		progress.setAttribute("aria-valuemin", "0");
		progress.setAttribute("aria-valuemax", "100");
		progress.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
		progress.style.setProperty("--progress-fill", `${ratio * 100}%`);
		progress.hidden = this.isExpanded;
		row.appendChild(progress);

		const slider = document.createElement("input");
		slider.className = "music-progress-slider";
		slider.type = "range";
		slider.min = "0";
		slider.max = "100";
		slider.step = "1";
		slider.value = String(Math.round(ratio * 100));
		slider.disabled = !this.audio || !Number.isFinite(this.audio.duration) || this.audio.duration <= 0;
		slider.hidden = !this.isExpanded;
		slider.setAttribute("role", "slider");
		slider.setAttribute("aria-label", "播放进度");
		slider.setAttribute("aria-valuemin", "0");
		slider.setAttribute("aria-valuemax", "100");
		slider.setAttribute("aria-valuenow", slider.value);
		slider.style.setProperty("--progress-fill", `${ratio * 100}%`);
		slider.addEventListener("input", (event) => this.seekToProgress(event.target.value));
		row.appendChild(slider);

		return row;
	},

	createVolumeControl () {
		const row = document.createElement("div");
		row.className = "music-volume-row";

		const icon = document.createElement("span");
		icon.className = "music-volume-icon";
		icon.textContent = "♬";
		row.appendChild(icon);

		const slider = document.createElement("input");
		slider.className = "music-volume-slider";
		slider.type = "range";
		slider.min = "0";
		slider.max = "1";
		slider.step = "0.01";
		slider.value = String(this.volume);
		slider.title = "音量";
		slider.setAttribute("aria-label", "音量");
		slider.style.setProperty("--volume-fill", `${this.volume * 100}%`);
		slider.addEventListener("input", (event) => this.setVolume(event.target.value));
		row.appendChild(slider);

		const value = document.createElement("span");
		value.className = "music-volume-value";
		value.textContent = `${Math.round(this.volume * 100)}%`;
		row.appendChild(value);

		return row;
	},

	createControlButton (icon, label, onClick) {
		const button = document.createElement("button");
		button.className = "music-control-button";
		button.type = "button";
		button.title = label;
		button.setAttribute("aria-label", label);
		button.textContent = icon;
		button.addEventListener("click", onClick);
		return button;
	}
});
