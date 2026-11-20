(function () {
	"use strict";

	const VALID_STATES = ["idle", "input", "thinking", "generating", "speaking", "success", "error"];

	class AIChatPetController {
		constructor (rootElement, options = {}) {
			this.rootElement = rootElement;
			this.options = options;
			this.state = "idle";
			this.timers = new Set();
			this.listeners = [];
			this.hintIndex = 0;
			this.hints = ["需要帮忙吗？", "我在听。", "问我一个问题吧。"];

			this.render();
			this.bindEvents();
			this.setState("idle");
		}

		render () {
			this.rootElement.classList.add("ai-pet-container");
			this.rootElement.innerHTML = `
				<div class="ai-pet-hint" aria-hidden="true"></div>
				<button class="ai-pet" type="button" data-state="idle" aria-label="聚焦 AI 输入框">
					<svg class="ai-pet-svg" viewBox="0 0 160 210" role="img" aria-label="蜘蛛主题 AI 小英雄">
						<ellipse class="pet-shadow" cx="80" cy="194" rx="42" ry="9"></ellipse>
						<g class="pet-jumper">
							<g class="pet-body">
								<path class="pet-suit" d="M48 77 C58 64 102 64 112 77 C126 100 119 128 101 139 C91 145 69 145 59 139 C41 128 34 100 48 77 Z"></path>
								<path class="pet-red-panel" d="M58 72 C66 66 94 66 102 72 C109 87 106 115 98 131 C88 137 72 137 62 131 C54 115 51 87 58 72 Z"></path>
								<path class="pet-blue-panel pet-blue-left" d="M46 88 C38 106 44 126 60 138 C57 116 60 94 69 76 C58 77 51 81 46 88 Z"></path>
								<path class="pet-blue-panel pet-blue-right" d="M114 88 C122 106 116 126 100 138 C103 116 100 94 91 76 C102 77 109 81 114 88 Z"></path>
								<path class="pet-chest-ridge" d="M80 73 L100 91 L93 126 L80 137 L67 126 L60 91 Z"></path>
								<path class="pet-badge" d="M80 84 C88 91 96 99 104 111 C94 106 87 104 80 104 C73 104 66 106 56 111 C64 99 72 91 80 84 Z"></path>
								<path class="pet-spider-mark" d="M80 86 L87 101 L82 101 L92 121 M80 86 L73 101 L78 101 L68 121 M80 86 L80 109 M63 94 L97 94 M59 103 L73 100 M101 103 L87 100"></path>
								<path class="pet-web-line pet-torso-web" d="M62 91 H98 M60 105 H100 M64 119 H96 M80 74 V136 M61 88 L98 126 M99 88 L62 126"></path>
								<path class="pet-highlight pet-red-highlight" d="M68 78 C75 73 88 73 95 79 M68 96 C75 101 86 101 94 96 M69 113 C75 119 86 119 92 113"></path>
								<path class="pet-highlight pet-blue-highlight" d="M51 96 C48 109 51 122 59 132 M109 96 C112 109 109 122 101 132"></path>
							</g>
							<g class="pet-left-arm">
								<path class="pet-arm-red" d="M50 82 C35 92 29 116 27 144 C26 154 35 158 40 149 C46 130 51 108 58 90 Z"></path>
								<path class="pet-arm-blue" d="M39 103 C32 117 30 133 29 146 C33 148 38 148 42 144 C45 129 49 114 54 99 Z"></path>
								<path class="pet-web-line pet-arm-web" d="M42 95 L30 145 M35 113 L48 119 M31 132 L43 137"></path>
								<path class="pet-highlight pet-arm-highlight" d="M43 88 C36 104 33 123 32 143"></path>
								<circle cx="33" cy="151" r="7"></circle>
							</g>
							<g class="pet-right-arm">
								<path class="pet-arm-red" d="M110 82 C125 92 131 116 133 144 C134 154 125 158 120 149 C114 130 109 108 102 90 Z"></path>
								<path class="pet-arm-blue" d="M121 103 C128 117 130 133 131 146 C127 148 122 148 118 144 C115 129 111 114 106 99 Z"></path>
								<path class="pet-web-line pet-arm-web" d="M118 95 L130 145 M125 113 L112 119 M129 132 L117 137"></path>
								<path class="pet-highlight pet-arm-highlight" d="M117 88 C124 104 127 123 128 143"></path>
								<circle cx="127" cy="151" r="7"></circle>
							</g>
							<g class="pet-head">
								<path class="pet-helmet" d="M49 41 C49 20 63 8 80 8 C97 8 111 20 111 41 C111 63 99 78 80 78 C61 78 49 63 49 41 Z"></path>
								<path class="pet-face" d="M56 42 C56 25 66 15 80 15 C94 15 104 25 104 42 C104 59 95 70 80 70 C65 70 56 59 56 42 Z"></path>
								<path class="pet-mask-left" d="M51 34 C56 19 67 11 80 9 C72 24 64 36 52 52 Z"></path>
								<path class="pet-mask-right" d="M109 34 C104 19 93 11 80 9 C88 24 96 36 108 52 Z"></path>
								<path class="pet-mask-shadow" d="M56 59 C63 70 70 76 80 78 C90 76 97 70 104 59 C95 64 88 67 80 67 C72 67 65 64 56 59 Z"></path>
								<path class="pet-crest" d="M74 11 L80 3 L86 11 Z"></path>
								<g class="pet-web">
									<path class="pet-web-line" d="M80 10 V73"></path>
									<path class="pet-web-line" d="M57 29 C69 34 91 34 103 29"></path>
									<path class="pet-web-line" d="M53 44 C67 51 93 51 107 44"></path>
									<path class="pet-web-line" d="M58 59 C70 64 90 64 102 59"></path>
									<path class="pet-web-line pet-web-fine" d="M61 20 C71 24 89 24 99 20"></path>
									<path class="pet-web-line pet-web-fine" d="M55 36 C68 42 92 42 105 36"></path>
									<path class="pet-web-line" d="M80 10 L56 62 M80 10 L104 62"></path>
									<path class="pet-web-line" d="M80 10 L66 72 M80 10 L94 72"></path>
									<path class="pet-web-line pet-web-fine" d="M80 10 L51 44 M80 10 L109 44"></path>
								</g>
								<g class="pet-eyes">
									<path class="pet-eye-rim pet-eye-rim-left" d="M54 42 C60 30 73 31 80 44 C72 57 59 56 54 42 Z"></path>
									<path class="pet-eye-rim pet-eye-rim-right" d="M106 42 C100 30 87 31 80 44 C88 57 101 56 106 42 Z"></path>
									<path class="pet-eye pet-eye-left" d="M59 42 C64 34 73 35 79 44 C72 52 63 52 59 42 Z"></path>
									<path class="pet-eye pet-eye-right" d="M101 42 C96 34 87 35 81 44 C88 52 97 52 101 42 Z"></path>
									<path class="pet-eye-glow pet-eye-glow-left" d="M62 40 C67 36 73 37 77 43"></path>
									<path class="pet-eye-glow pet-eye-glow-right" d="M98 40 C93 36 87 37 83 43"></path>
								</g>
								<path class="pet-mouth" d="M73 61 Q80 65 87 61"></path>
							</g>
							<g class="pet-legs">
								<path class="pet-leg-blue pet-leg-left" d="M61 136 C55 153 55 177 62 193 C69 196 76 193 76 184 C76 165 75 150 80 139 Z"></path>
								<path class="pet-leg-blue pet-leg-right" d="M99 136 C105 153 105 177 98 193 C91 196 84 193 84 184 C84 165 85 150 80 139 Z"></path>
								<path class="pet-boot-red pet-boot-left" d="M60 178 C55 186 56 195 70 196 C78 196 80 190 75 181 Z"></path>
								<path class="pet-boot-red pet-boot-right" d="M100 178 C105 186 104 195 90 196 C82 196 80 190 85 181 Z"></path>
								<path class="pet-web-line pet-leg-web" d="M66 143 L64 190 M94 143 L96 190 M60 165 H76 M84 165 H100"></path>
								<path class="pet-highlight pet-leg-highlight" d="M66 143 C62 158 62 177 66 190 M94 143 C98 158 98 177 94 190"></path>
							</g>
							<g class="pet-thinking-dots">
								<circle cx="60" cy="18" r="3"></circle>
								<circle cx="80" cy="12" r="3"></circle>
								<circle cx="100" cy="18" r="3"></circle>
							</g>
							<g class="pet-error-mark">
								<path d="M80 9 L88 25 L72 25 Z"></path>
								<circle cx="80" cy="21" r="1.8"></circle>
							</g>
							<g class="pet-stars">
								<path d="M48 24 L51 31 L58 34 L51 37 L48 44 L45 37 L38 34 L45 31 Z"></path>
								<path d="M112 32 L114 37 L119 39 L114 41 L112 46 L110 41 L105 39 L110 37 Z"></path>
							</g>
						</g>
					</svg>
				</button>`;

			this.petElement = this.rootElement.querySelector(".ai-pet");
			this.hintElement = this.rootElement.querySelector(".ai-pet-hint");
		}

		bindEvents () {
			this.addListener(this.petElement, "mouseenter", () => this.showHint());
			this.addListener(this.petElement, "mouseleave", () => this.hideHintLater(700));
			this.addListener(this.petElement, "click", () => {
				this.playWave();
				this.showHint("我在听。");
				if (typeof this.options.focusInput === "function") {
					this.options.focusInput();
				}
			});
		}

		addListener (element, type, handler) {
			element.addEventListener(type, handler);
			this.listeners.push({ element, type, handler });
		}

		setState (state) {
			const nextState = VALID_STATES.includes(state) ? state : "idle";
			this.clearTimers();
			this.petElement.classList.remove("is-waving");
			this.rootElement.dataset.state = nextState;
			this.petElement.dataset.state = nextState;
			this.state = nextState;

			if (typeof this.options.onStateChange === "function") {
				this.options.onStateChange(nextState);
			}

			if (nextState === "success" || nextState === "error") {
				this.addTimer(window.setTimeout(() => this.setState("idle"), 1200));
			}
		}

		reset () {
			this.hideHint();
			this.setState("idle");
		}

		playSuccess () {
			this.setState("success");
		}

		playError () {
			this.setState("error");
		}

		playWave () {
			this.petElement.classList.add("is-waving");
			this.addTimer(window.setTimeout(() => {
				this.petElement.classList.remove("is-waving");
			}, 850));
		}

		showHint (text) {
			if (!this.hintElement) return;

			const message = text || this.hints[this.hintIndex % this.hints.length];
			this.hintIndex += 1;
			this.hintElement.textContent = message;
			this.hintElement.classList.add("is-visible");
			this.hideHintLater(2200);
		}

		hideHintLater (delay) {
			this.addTimer(window.setTimeout(() => this.hideHint(), delay));
		}

		hideHint () {
			if (this.hintElement) {
				this.hintElement.classList.remove("is-visible");
			}
		}

		addTimer (timer) {
			this.timers.add(timer);
			return timer;
		}

		clearTimers () {
			for (const timer of this.timers) {
				window.clearTimeout(timer);
			}
			this.timers.clear();
		}

		destroy () {
			this.clearTimers();
			for (const { element, type, handler } of this.listeners) {
				element.removeEventListener(type, handler);
			}
			this.listeners = [];
			this.rootElement.innerHTML = "";
		}
	}

	window.MMM_AIChatPetController = AIChatPetController;
}());
