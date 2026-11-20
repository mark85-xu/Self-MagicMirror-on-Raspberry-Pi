Module.register("MMM-AIChat", {
	defaults: {
		title: "AI 助手",
		baseUrl: "https://api.deepseek.com",
		model: "deepseek-v4-flash",
		systemPrompt: "你是运行在智能魔镜中的AI助手。",
		stream: true,
		temperature: 0.7,
		maxTokens: 2048,
		maxContextMessages: 20,
		maxInputCharacters: 4000,
		requestTimeoutMs: 180000,
		apiKeyEnvName: "DEEPSEEK_API_KEY",
		showHeader: true,
		showClearButton: true,
		showStopButton: true,
		autoFocus: false,
		persistConversation: false,
		debug: false,
		webSearch: {
			enabled: true,
			triggerMode: "auto",
			provider: "bing-rss",
			maxResults: 4,
			timeoutMs: 8000,
			locale: "zh-CN"
		},
		voiceChat: {
			enabled: true,
			inputDevice: "default",
			outputDevice: "default",
			initialVolume: 0.22,
			speakEnabled: true,
			mixerDevice: "default",
			mixerControl: "Master",
			startupListeningDelayMs: 1200,
			recordingWarmupMs: 450,
			sampleRate: 16000,
			channels: 1,
			language: "zh",
			vadThreshold: 0.018,
			silenceDurationMs: 1200,
			minSpeechDurationMs: 500,
			maxRecordingDurationMs: 30000,
			sttProvider: "whisper.cpp",
			sttTimeoutMs: 90000,
			whisperBinary: "",
			whisperModel: "",
			whisperPrompt: "",
			whisperThreads: 4,
			ttsProvider: "piper",
			ttsTimeoutMs: 90000,
			piperBinary: "",
			piperModel: "",
			piperConfig: "",
			ttsLengthScale: 1.0,
			espeakBinary: "",
			espeakVoice: "zh",
			espeakSpeed: 150,
			resumeMusicAfterSpeech: true,
			temporaryAudioDirectory: "/tmp/mmm-aichat-voice",
			maxSpeechCharacters: 600,
			debug: false
		}
	},

	start () {
		this.sessionId = `session-${this.identifier}-${Date.now()}`;
		this.isExpanded = false;
		this.activeRequestId = null;
		this.state = "INITIALIZING";
		this.messages = [];
		this.error = null;
		this.pendingDelta = "";
		this.flushTimer = null;
		this.messageListEl = null;
		this.inputEl = null;
		this.activeAssistantEl = null;
		this.petController = null;
		this.petState = "idle";
		this.hasStreamingDelta = false;
		this.voiceEnabled = false;
		this.voiceState = "disabled";
		this.voiceStatusText = "语音聊天已关闭";
		this.voiceError = null;
		this.voiceMusicState = null;
		this.voiceMusicRequestId = null;
		this.voiceStopFallbackTimer = null;
		this.voiceVolume = this.clampVoiceVolume(this.config.voiceChat?.initialVolume);
		this.voiceSpeakEnabled = this.config.voiceChat?.speakEnabled !== false;
		this.faceGreetingQueue = [];
		this.faceGreetingIds = new Set();
		this.faceGreetingReady = false;
		this.sendSocketNotification("AI_CHAT_INIT", {
			sessionId: this.sessionId,
			config: this.config
		});
	},

	getStyles () {
		return ["MMM-AIChat.css"];
	},

	getScripts () {
		return ["PetController.js"];
	},

	socketNotificationReceived (notification, payload) {
		if (!payload || payload.sessionId !== this.sessionId) return;

		if (notification === "AI_CHAT_READY") {
			this.faceGreetingReady = true;
			this.state = payload.hasApiKey ? "IDLE" : "ERROR";
			this.error = payload.hasApiKey ? null : "未配置 DeepSeek API Key。";
			this.petState = payload.hasApiKey ? "idle" : "error";
			this.updateDom(300);
		} else if (notification === "AI_CHAT_STREAM_START") {
			if (payload.requestId !== this.activeRequestId) return;
			this.state = "STREAMING";
			this.hasStreamingDelta = false;
			this.appendAssistantMessage("");
			this.updateStatus();
		} else if (notification === "AI_CHAT_STREAM_CHUNK") {
			if (payload.requestId !== this.activeRequestId) return;
			if (!this.hasStreamingDelta) {
				this.hasStreamingDelta = true;
				this.setPetState("generating");
			}
			this.pendingDelta += payload.delta || "";
			this.scheduleDeltaFlush();
		} else if (notification === "AI_CHAT_STREAM_END") {
			if (payload.requestId !== this.activeRequestId) return;
			this.flushDelta();
			this.state = "IDLE";
			this.activeRequestId = null;
			this.activeAssistantEl = null;
			this.hasStreamingDelta = false;
			this.setPetState("success");
			this.updateStatus();
			this.updateActionButtonsDom();
			this.updateDom(100);
		} else if (notification === "AI_CHAT_ABORTED") {
			if (payload.requestId && payload.requestId !== this.activeRequestId) return;
			this.state = "IDLE";
			this.activeRequestId = null;
			this.pendingDelta = "";
			this.activeAssistantEl = null;
			this.hasStreamingDelta = false;
			this.setPetState("error");
			this.updateStatus("已停止生成。");
			this.updateActionButtonsDom();
			this.updateDom(100);
		} else if (notification === "AI_CHAT_CLEARED") {
			this.messages = [];
			this.activeRequestId = null;
			this.state = "IDLE";
			this.error = null;
			this.petState = "idle";
			this.updateDom(200);
		} else if (notification === "AI_CHAT_ERROR") {
			if (payload.requestId && payload.requestId !== this.activeRequestId) return;
			this.state = "ERROR";
			this.activeRequestId = null;
			this.error = payload.message || "AI 请求失败，请稍后重试。";
			this.hasStreamingDelta = false;
			this.petState = "error";
			this.updateDom(200);
		} else if (notification === "VOICE_STATE_CHANGED") {
			this.handleVoiceState(payload);
		} else if (notification === "VOICE_TRANSCRIPT_FINAL") {
			this.handleVoiceTranscriptFinal(payload);
		} else if (notification === "VOICE_ERROR") {
			this.handleVoiceError(payload);
		} else if (notification === "VOICE_SETTINGS_CHANGED") {
			this.handleVoiceSettings(payload);
		} else if (notification === "AI_CHAT_GREETING_RESULT") {
			this.finishFaceGreeting(payload);
		}
	},

	notificationReceived (notification, payload) {
		if (notification === "FACE_RECOGNIZED_GREETING") {
			this.queueFaceGreeting(payload);
		} else if (notification === "AI_CHAT_SHOW") {
			this.show();
		} else if (notification === "AI_CHAT_HIDE") {
			this.hide();
		} else if (notification === "AI_CHAT_FOCUS") {
			this.focusInput();
		} else if (notification === "AI_CHAT_SUBMIT") {
			const text = typeof payload === "string" ? payload : payload?.text;
			this.submitText(text || "");
		} else if (notification === "AI_CHAT_CLEAR") {
			this.clearConversation();
		} else if (notification === "AI_CHAT_ABORT") {
			this.abortRequest();
		} else if (notification === "MUSIC_PAUSE_CONFIRMED") {
			if (payload?.requestId === this.greetingMusicRequestId) {
				this.greetingMusicState = payload;
				this.sendFaceGreetingSpeech();
			}
			if (payload?.requestId === this.voiceMusicRequestId) {
				this.voiceMusicState = payload;
				this.sendSocketNotification("VOICE_CHAT_MUSIC_PAUSED", {
					sessionId: this.sessionId,
					requestId: payload.requestId,
					musicState: payload
				});
			}
		} else if (notification === "MUSIC_STATE_RESPONSE") {
			if (payload?.requestId === this.voiceMusicRequestId) {
				this.voiceMusicState = payload;
			}
		}
	},

	queueFaceGreeting (payload) {
		if (!payload || typeof payload.eventId !== "string" || typeof payload.text !== "string" || payload.text.length > 200) return;
		this.faceGreetingIds ||= new Set();
		this.faceGreetingQueue ||= [];
		if (this.faceGreetingIds.has(payload.eventId)) return;
		this.faceGreetingIds.add(payload.eventId);
		this.faceGreetingQueue.push({ ...payload });
		this.tryFaceGreeting();
	},

	tryFaceGreeting () {
		clearTimeout(this.faceGreetingTimer);
		if (!this.faceGreetingQueue?.length || this.currentFaceGreeting) return;
		if (!this.faceGreetingReady || this.isBusy() || this.voiceEnabled) {
			this.faceGreetingTimer = setTimeout(() => this.tryFaceGreeting(), 1000);
			return;
		}
		const greeting = this.faceGreetingQueue.shift();
		this.currentFaceGreeting = greeting;
		if (!greeting.displayed) {
			this.messages.push({ role: "assistant", content: greeting.text });
			greeting.displayed = true;
			this.isExpanded = true;
			this.updateDom(100);
		}
		this.greetingSpeechSent = false;
		if (this.voiceSpeakEnabled === false) {
			this.sendFaceGreetingSpeech();
			return;
		}
		this.greetingMusicRequestId = `greeting-${greeting.eventId}`;
		this.sendNotification("MUSIC_PAUSE_FOR_VOICE", { requestId: this.greetingMusicRequestId });
		if (!this.greetingSpeechSent) this.greetingPauseTimer = setTimeout(() => this.sendFaceGreetingSpeech(), 500);
	},

	sendFaceGreetingSpeech () {
		if (!this.currentFaceGreeting || this.greetingSpeechSent) return;
		clearTimeout(this.greetingPauseTimer);
		this.greetingSpeechSent = true;
		this.sendSocketNotification("AI_CHAT_GREETING", { sessionId: this.sessionId, eventId: this.currentFaceGreeting.eventId, text: this.currentFaceGreeting.text });
		this.greetingResultTimer = setTimeout(() => this.finishFaceGreeting({ eventId: this.currentFaceGreeting?.eventId, status: "error", message: "问候语音响应超时。" }), 100000);
	},

	finishFaceGreeting (payload) {
		if (!this.currentFaceGreeting || payload.eventId !== this.currentFaceGreeting.eventId) return;
		clearTimeout(this.greetingResultTimer);
		clearTimeout(this.greetingPauseTimer);
		if (payload.status === "busy") this.faceGreetingQueue.unshift(this.currentFaceGreeting);
		if (this.voiceEnabled && this.greetingMusicState?.wasPlaying) {
			this.voiceMusicState = { ...this.voiceMusicState, ...this.greetingMusicState };
		}
		if (this.greetingMusicState?.wasPlaying && !this.voiceEnabled && this.config.voiceChat?.resumeMusicAfterSpeech !== false) {
			this.sendNotification("MUSIC_RESUME_AFTER_VOICE", { ...this.greetingMusicState, requestId: this.greetingMusicRequestId });
		}
		if (payload.status === "error") {
			this.voiceError = payload.message;
			this.voiceStatusText = payload.message;
			this.updateVoiceStatusDom();
		}
		this.greetingMusicState = null;
		this.greetingMusicRequestId = null;
		this.currentFaceGreeting = null;
		if (this.faceGreetingQueue.length) this.faceGreetingTimer = setTimeout(() => this.tryFaceGreeting(), 1000);
	},

	getDom () {
		const assistantWrapper = document.createElement("div");
		assistantWrapper.className = `ai-assistant-wrapper ${this.isExpanded ? "is-expanded" : "is-collapsed"}`;

		if (!this.isExpanded) {
			this.inputEl = null;
			this.messageListEl = null;
			const toggle = document.createElement("button");
			toggle.className = "ai-chat-toggle";
			toggle.type = "button";
			toggle.textContent = this.config.title || "AI 助手";
			toggle.setAttribute("aria-label", "打开 AI 助手");
			toggle.setAttribute("aria-expanded", "false");
			toggle.addEventListener("click", () => this.setExpanded(true));
			assistantWrapper.appendChild(toggle);
			return assistantWrapper;
		}

		const petContainer = document.createElement("div");
		petContainer.className = "ai-pet-container";
		assistantWrapper.appendChild(petContainer);
		this.initPetController(petContainer);

		const wrapper = document.createElement("div");
		wrapper.className = "ai-chat";
		wrapper.addEventListener("click", (event) => this.handleActionClick(event));
		assistantWrapper.appendChild(wrapper);

		const header = document.createElement("div");
		header.className = "ai-chat-header";
		if (this.config.showHeader) {
			const title = document.createElement("div");
			title.className = "ai-chat-title";
			title.textContent = this.config.title;
			header.appendChild(title);

			const status = document.createElement("div");
			status.className = "ai-chat-status";
			status.textContent = this.getStatusText();
			header.appendChild(status);
		}

		const headerActions = document.createElement("div");
		headerActions.className = "ai-chat-header-actions";
		const collapse = document.createElement("button");
		collapse.className = "ai-chat-button ai-chat-collapse";
		collapse.type = "button";
		collapse.dataset.aiAction = "collapse";
		collapse.textContent = "收起";
		collapse.setAttribute("aria-label", "收起 AI 助手");
		headerActions.appendChild(collapse);

		header.appendChild(headerActions);
		wrapper.appendChild(header);

		const messages = document.createElement("div");
		messages.className = "ai-chat-messages";
		this.messageListEl = messages;

		if (!this.messages.length) {
			const empty = document.createElement("div");
			empty.className = "ai-chat-empty";
			empty.textContent = "可以在这里与魔镜 AI 助手对话。";
			messages.appendChild(empty);
		} else {
			for (const message of this.messages) {
				messages.appendChild(this.createMessageNode(message));
			}
		}
		wrapper.appendChild(messages);

		if (this.error) {
			const error = document.createElement("div");
			error.className = "ai-chat-error";
			error.textContent = this.error;
			wrapper.appendChild(error);
		}

		const controls = document.createElement("div");
		controls.className = "ai-chat-controls";

		const input = document.createElement("textarea");
		input.className = "ai-chat-input";
		input.rows = 2;
		input.maxLength = this.config.maxInputCharacters;
		input.placeholder = this.state === "INITIALIZING" ? "AI 初始化中..." : "输入问题...";
		input.disabled = this.state === "INITIALIZING" || this.state === "ABORTING";
		input.addEventListener("keydown", (event) => this.handleKeyDown(event));
		input.addEventListener("focus", () => this.handleInputActivity());
		input.addEventListener("input", () => this.handleInputActivity());
		input.addEventListener("blur", () => {
			if (!this.isBusy() && !input.value.trim() && !this.error) {
				this.setPetState("idle");
			}
		});
		this.inputEl = input;
		controls.appendChild(input);

		const actions = document.createElement("div");
		actions.className = "ai-chat-actions";
		const send = document.createElement("button");
		send.className = "ai-chat-button primary";
		send.type = "button";
		send.dataset.aiAction = "send";
		send.textContent = this.isBusy() ? "停止" : "发送";
		actions.appendChild(send);

		if (this.config.voiceChat?.enabled !== false) {
			const voice = document.createElement("button");
			voice.className = `ai-chat-button voice ${this.voiceEnabled ? "active" : ""}`.trim();
			voice.type = "button";
			voice.dataset.aiAction = "voice";
			voice.disabled = ["initializing", "stopping"].includes(this.voiceState);
			voice.textContent = this.voiceEnabled ? "关闭实时聊天" : "打开实时聊天";
			actions.appendChild(voice);
		}

		if (this.config.showClearButton) {
			const clear = document.createElement("button");
			clear.className = "ai-chat-button";
			clear.type = "button";
			clear.dataset.aiAction = "clear";
			clear.textContent = "清空";
			actions.appendChild(clear);
		}

		controls.appendChild(actions);
		if (this.config.voiceChat?.enabled !== false) {
			const voiceStatus = document.createElement("div");
			voiceStatus.className = `ai-voice-status ${this.voiceState}`.trim();
			const dot = document.createElement("span");
			dot.className = "ai-voice-dot";
			const text = document.createElement("span");
			text.className = "ai-voice-text";
			text.textContent = this.voiceError || this.voiceStatusText;
			voiceStatus.append(dot, text);
			controls.appendChild(voiceStatus);
			controls.appendChild(this.createVoiceSettingsControl());
		}
		wrapper.appendChild(controls);

		setTimeout(() => {
			if (this.config.autoFocus) this.focusInput();
			this.scrollToBottom();
		}, 0);

		return assistantWrapper;
	},

	setExpanded (expanded) {
		this.isExpanded = Boolean(expanded);
		if (!this.isExpanded && this.petController) {
			this.petController.destroy();
			this.petController = null;
		}
		this.updateDom(100);
		setTimeout(() => {
			if (this.isExpanded) {
				this.focusInput();
			} else {
				document.querySelector(".MMM-AIChat .ai-chat-toggle")?.focus();
			}
		}, 0);
	},

	createVoiceSettingsControl () {
		const row = document.createElement("div");
		row.className = "ai-voice-settings";

		const toggleLabel = document.createElement("label");
		toggleLabel.className = "ai-voice-switch";
		const toggleInput = document.createElement("input");
		toggleInput.type = "checkbox";
		toggleInput.checked = this.voiceSpeakEnabled;
		toggleInput.addEventListener("change", (event) => this.setVoiceSpeakEnabled(event.target.checked));
		const toggleTrack = document.createElement("span");
		toggleTrack.className = "ai-voice-switch-track";
		const toggleText = document.createElement("span");
		toggleText.className = "ai-voice-switch-text";
		toggleText.textContent = this.voiceSpeakEnabled ? "朗读开" : "朗读关";
		toggleLabel.append(toggleInput, toggleTrack, toggleText);

		const volumeGroup = document.createElement("div");
		volumeGroup.className = "ai-voice-volume";
		const icon = document.createElement("span");
		icon.className = "ai-voice-volume-icon";
		icon.textContent = "♪";
		volumeGroup.appendChild(icon);

		const slider = document.createElement("input");
		slider.className = "ai-voice-volume-slider";
		slider.type = "range";
		slider.min = "0";
		slider.max = "1";
		slider.step = "0.01";
		slider.value = String(this.voiceVolume);
		slider.title = "朗读音量";
		slider.setAttribute("aria-label", "朗读音量");
		slider.style.setProperty("--voice-volume-fill", `${this.voiceVolume * 100}%`);
		slider.addEventListener("input", (event) => this.setVoiceVolume(event.target.value));
		volumeGroup.appendChild(slider);

		const value = document.createElement("span");
		value.className = "ai-voice-volume-value";
		value.textContent = `${Math.round(this.voiceVolume * 100)}%`;
		volumeGroup.appendChild(value);

		row.append(toggleLabel, volumeGroup);
		return row;
	},

	handleKeyDown (event) {
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			this.submitText(event.target.value);
		}
	},

	handleActionClick (event) {
		const button = event.target.closest("[data-ai-action]");
		if (!button || button.disabled) return;
		event.preventDefault();
		const action = button.dataset.aiAction;
		if (action === "collapse") {
			this.setExpanded(false);
		} else if (action === "send") {
			if (this.isBusy()) {
				this.abortRequest();
			} else {
				this.submitText(this.inputEl?.value || "");
			}
		} else if (action === "voice") {
			this.toggleVoiceChat();
		} else if (action === "clear") {
			this.clearConversation();
		}
	},

	submitText (text) {
		if (this.isBusy()) return;
		const content = String(text || "").trim();
		if (!content) {
			this.error = "请输入内容后再发送。";
			this.petState = "error";
			this.updateDom(100);
			return;
		}
		if (content.length > this.config.maxInputCharacters) {
			this.error = "输入内容太长，请缩短后重试。";
			this.petState = "error";
			this.updateDom(100);
			return;
		}

		this.error = null;
		this.state = "REQUESTING";
		this.activeRequestId = `request-${Date.now()}-${Math.random().toString(16).slice(2)}`;
		this.petState = "thinking";
		this.hasStreamingDelta = false;
		this.messages.push({ role: "user", content });
		this.updateDom(100);
		this.sendSocketNotification("AI_CHAT_REQUEST", {
			sessionId: this.sessionId,
			requestId: this.activeRequestId,
			content,
			timestamp: Date.now()
		});
	},

	abortRequest () {
		if (!this.activeRequestId) {
			this.state = "IDLE";
			this.pendingDelta = "";
			this.activeAssistantEl = null;
			this.hasStreamingDelta = false;
			this.updateStatus();
			this.updateActionButtonsDom();
			return;
		}
		this.state = "ABORTING";
		this.updateStatus("正在停止...");
		this.updateActionButtonsDom();
		this.sendSocketNotification("AI_CHAT_ABORT", {
			sessionId: this.sessionId,
			requestId: this.activeRequestId
		});
	},

	clearConversation () {
		if (this.activeRequestId) this.abortRequest();
		if (this.voiceEnabled) {
			this.sendSocketNotification("VOICE_CHAT_CANCEL_TURN", {
				sessionId: this.sessionId,
				requestId: `voice-cancel-${Date.now()}`
			});
		}
		this.setPetState("idle");
		const requestId = `clear-${Date.now()}`;
		this.sendSocketNotification("AI_CHAT_CLEAR", {
			sessionId: this.sessionId,
			requestId
		});
	},

	appendAssistantMessage (content) {
		const message = { role: "assistant", content };
		this.messages.push(message);
		if (this.messageListEl) {
			const node = this.createMessageNode(message);
			this.messageListEl.appendChild(node);
			this.activeAssistantEl = node.querySelector(".ai-chat-message-content");
			this.scrollToBottom();
		}
	},

	scheduleDeltaFlush () {
		if (this.flushTimer) return;
		this.flushTimer = setTimeout(() => this.flushDelta(), 50);
	},

	flushDelta () {
		if (!this.pendingDelta) {
			this.flushTimer = null;
			return;
		}
		const delta = this.pendingDelta;
		this.pendingDelta = "";
		this.flushTimer = null;
		const last = this.messages[this.messages.length - 1];
		if (last?.role === "assistant") {
			last.content += delta;
		}
		if (this.activeAssistantEl) {
			this.activeAssistantEl.textContent += delta;
			this.scrollToBottom();
		}
	},

	createMessageNode (message) {
		const item = document.createElement("div");
		item.className = `ai-chat-message ${message.role}`;

		const label = document.createElement("div");
		label.className = "ai-chat-message-label";
		label.textContent = message.role === "user" ? "你" : "AI";
		item.appendChild(label);

		const content = document.createElement("div");
		content.className = "ai-chat-message-content";
		content.textContent = message.content;
		item.appendChild(content);

		return item;
	},

	updateStatus (overrideText) {
		const root = document.getElementById(this.identifier);
		const status = root?.querySelector(".ai-chat-status");
		if (status) status.textContent = overrideText || this.getStatusText();
	},

	updateActionButtonsDom () {
		const root = document.getElementById(this.identifier);
		const send = root?.querySelector(".ai-chat-button.primary");
		const voice = root?.querySelector(".ai-chat-button.voice");
		if (send) {
			send.textContent = this.isBusy() ? "停止" : "发送";
		}
		if (voice) {
			voice.disabled = ["initializing", "stopping"].includes(this.voiceState);
			voice.textContent = this.voiceEnabled ? "关闭实时聊天" : "打开实时聊天";
			voice.className = `ai-chat-button voice ${this.voiceEnabled ? "active" : ""}`.trim();
		}
	},

	initPetController (petContainer) {
		if (this.petController) {
			this.petController.destroy();
			this.petController = null;
		}
		if (!window.MMM_AIChatPetController) return;

		this.petController = new window.MMM_AIChatPetController(petContainer, {
			focusInput: () => this.focusInput(),
			onStateChange: (state) => {
				this.petState = state;
			}
		});
		this.petController.setState(this.petState || "idle");
	},

	setPetState (state) {
		this.petState = state;
		if (this.petController) {
			this.petController.setState(state);
		}
	},

	handleInputActivity () {
		if (!this.isBusy()) {
			this.setPetState("input");
		}
	},

	toggleVoiceChat () {
		if (this.voiceEnabled) {
			this.stopVoiceChat();
		} else {
			this.startVoiceChat();
		}
	},

	startVoiceChat () {
		if (this.voiceEnabled || ["initializing", "stopping"].includes(this.voiceState)) return;
		this.voiceEnabled = true;
		this.voiceState = "initializing";
		this.voiceStatusText = "正在初始化麦克风";
		this.voiceError = null;
		this.voiceMusicRequestId = `music-voice-${Date.now()}`;
		this.sendNotification("MUSIC_PAUSE_FOR_VOICE", {
			requestId: this.voiceMusicRequestId
		});
		this.sendSocketNotification("VOICE_CHAT_START", {
			sessionId: this.sessionId,
			requestId: `voice-start-${Date.now()}`,
			config: this.config
		});
		this.setPetState("thinking");
		this.updateDom(100);
	},

	stopVoiceChat () {
		if (!this.voiceEnabled && this.voiceState === "disabled") return;
		this.voiceState = "stopping";
		this.voiceStatusText = "正在关闭";
		if (this.voiceStopFallbackTimer) {
			clearTimeout(this.voiceStopFallbackTimer);
		}
		this.voiceStopFallbackTimer = setTimeout(() => {
			if (this.voiceState !== "stopping") return;
			this.voiceEnabled = false;
			this.voiceState = "disabled";
			this.voiceStatusText = "语音聊天已关闭";
			this.voiceError = null;
			this.setPetState("idle");
			this.updateDom(100);
		}, 8000);
		this.sendSocketNotification("VOICE_CHAT_STOP", {
			sessionId: this.sessionId,
			requestId: `voice-stop-${Date.now()}`
		});
		this.updateDom(100);
	},

	setVoiceVolume (value) {
		this.voiceVolume = this.clampVoiceVolume(value);
		this.updateVoiceVolumeDom();
		this.sendSocketNotification("VOICE_CHAT_SET_VOLUME", {
			sessionId: this.sessionId,
			requestId: `voice-volume-${Date.now()}`,
			volume: this.voiceVolume
		});
	},

	setVoiceSpeakEnabled (enabled) {
		this.voiceSpeakEnabled = Boolean(enabled);
		this.updateVoiceSettingsDom();
		this.sendSocketNotification("VOICE_CHAT_SET_SPEAK_ENABLED", {
			sessionId: this.sessionId,
			requestId: `voice-speak-${Date.now()}`,
			enabled: this.voiceSpeakEnabled
		});
		if (!this.voiceSpeakEnabled && this.voiceState === "speaking") {
			this.voiceStatusText = "朗读已关闭，2秒后继续聆听";
			this.updateVoiceStatusDom();
		}
	},

	handleVoiceState (payload) {
		if (this.voiceStopFallbackTimer) {
			clearTimeout(this.voiceStopFallbackTimer);
			this.voiceStopFallbackTimer = null;
		}
		this.voiceState = payload.state || "disabled";
		this.voiceStatusText = payload.message || this.getVoiceStatusText(this.voiceState);
		if (Number.isFinite(payload.volume)) {
			this.voiceVolume = this.clampVoiceVolume(payload.volume);
		}
		if (typeof payload.speakEnabled === "boolean") {
			this.voiceSpeakEnabled = payload.speakEnabled;
		}
		if (this.voiceState !== "disabled") {
			this.voiceError = null;
		}
		this.voiceEnabled = this.voiceState !== "disabled";
		this.updateVoiceStatusDom();
		this.updateVoiceSettingsDom();
		this.updateActionButtonsDom();
		this.updateVoicePetState();

		if (this.voiceState === "disabled" && this.voiceMusicState?.wasPlaying && this.config.voiceChat?.resumeMusicAfterSpeech !== false) {
			this.sendNotification("MUSIC_RESUME_AFTER_VOICE", {
				...this.voiceMusicState,
				requestId: `music-resume-${Date.now()}`
			});
			this.voiceMusicState = null;
		}
		if (this.voiceState === "disabled" || this.voiceState === "stopping") {
			this.updateDom(100);
		}
	},

	handleVoiceSettings (payload) {
		if (Number.isFinite(payload.volume)) {
			this.voiceVolume = this.clampVoiceVolume(payload.volume);
		}
		if (typeof payload.speakEnabled === "boolean") {
			this.voiceSpeakEnabled = payload.speakEnabled;
		}
		this.updateVoiceSettingsDom();
	},

	handleVoiceTranscriptFinal (payload) {
		const content = String(payload.content || "").trim();
		if (!content) return;
		this.error = null;
		this.state = "REQUESTING";
		this.activeRequestId = payload.requestId;
		this.messages.push({ role: "user", content });
		this.petState = "thinking";
		this.updateDom(100);
	},

	handleVoiceError (payload) {
		this.voiceState = "error";
		this.voiceError = payload.message || "语音聊天出错。";
		this.voiceStatusText = this.voiceError;
		this.setPetState("error");
		this.updateDom(100);
	},

	updateVoiceStatusDom () {
		const root = document.getElementById(this.identifier);
		const status = root?.querySelector(".ai-voice-status");
		const text = root?.querySelector(".ai-voice-text");
		if (status) {
			status.className = `ai-voice-status ${this.voiceState}`.trim();
		}
		if (text) {
			text.textContent = this.voiceError || this.voiceStatusText;
		}
	},

	updateVoiceSettingsDom () {
		this.updateVoiceVolumeDom();
		const root = document.getElementById(this.identifier);
		const switchInput = root?.querySelector(".ai-voice-switch input");
		const switchText = root?.querySelector(".ai-voice-switch-text");
		if (switchInput) {
			switchInput.checked = this.voiceSpeakEnabled;
		}
		if (switchText) {
			switchText.textContent = this.voiceSpeakEnabled ? "朗读开" : "朗读关";
		}
	},

	updateVoiceVolumeDom () {
		const root = document.getElementById(this.identifier);
		const slider = root?.querySelector(".ai-voice-volume-slider");
		const value = root?.querySelector(".ai-voice-volume-value");
		if (slider) {
			slider.value = String(this.voiceVolume);
			slider.style.setProperty("--voice-volume-fill", `${this.voiceVolume * 100}%`);
		}
		if (value) {
			value.textContent = `${Math.round(this.voiceVolume * 100)}%`;
		}
	},

	updateVoicePetState () {
		const map = {
			initializing: "thinking",
			listening: "input",
			speech_detected: "input",
			recognizing: "thinking",
			thinking: "thinking",
			generating: "generating",
			speaking: "speaking",
			error: "error",
			stopping: "idle",
			disabled: "idle"
		};
		this.setPetState(map[this.voiceState] || "idle");
	},

	getVoiceStatusText (state) {
		const map = {
			disabled: "语音聊天已关闭",
			initializing: "正在初始化麦克风",
			listening: "正在聆听",
			speech_detected: "检测到语音",
			recognizing: "正在识别",
			thinking: "正在思考",
			generating: "正在生成回答",
			speaking: "正在朗读",
			error: "语音错误",
			stopping: "正在关闭"
		};
		return map[state] || "语音聊天";
	},

	scrollToBottom () {
		if (this.messageListEl) {
			this.messageListEl.scrollTop = this.messageListEl.scrollHeight;
		}
	},

	focusInput () {
		if (!this.isExpanded) {
			this.setExpanded(true);
			return;
		}
		if (this.inputEl && !this.inputEl.disabled) {
			this.inputEl.focus();
		}
	},

	isBusy () {
		return ["REQUESTING", "STREAMING", "ABORTING"].includes(this.state);
	},

	clampVoiceVolume (value) {
		const number = Number.parseFloat(value);
		if (!Number.isFinite(number)) return 0.22;
		return Math.min(1, Math.max(0, number));
	},

	getStatusText () {
		const map = {
			INITIALIZING: "初始化中",
			IDLE: "就绪",
			REQUESTING: "请求中",
			STREAMING: "生成中",
			ABORTING: "停止中",
			ERROR: "需要处理"
		};
		return map[this.state] || "就绪";
	},

	suspend () {
		this.setPetState("idle");
		if (this.voiceEnabled) this.stopVoiceChat();
		this.abortRequest();
	},

	destroy () {
		clearTimeout(this.faceGreetingTimer);
		clearTimeout(this.greetingPauseTimer);
		clearTimeout(this.greetingResultTimer);
		this.faceGreetingQueue = [];
		if (this.currentFaceGreeting) {
			this.sendSocketNotification("AI_CHAT_GREETING_CANCEL", { sessionId: this.sessionId });
			this.finishFaceGreeting({ eventId: this.currentFaceGreeting.eventId, status: "cancelled" });
		}
		if (this.flushTimer) clearTimeout(this.flushTimer);
		if (this.voiceStopFallbackTimer) clearTimeout(this.voiceStopFallbackTimer);
		if (this.petController) {
			this.petController.destroy();
			this.petController = null;
		}
		this.sendSocketNotification("AI_CHAT_DESTROY_SESSION", {
			sessionId: this.sessionId,
			requestId: this.activeRequestId
		});
	}
});
