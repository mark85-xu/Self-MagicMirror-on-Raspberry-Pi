const path = require("node:path");
const { JSDOM } = require("jsdom");

describe("MMM-AIChat centered card states", () => {
	let dom;
	let definition;
	let assistant;
	let root;

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
			require(path.resolve(__dirname, "../../../modules/MMM-AIChat/MMM-AIChat.js"));
		});

		assistant = Object.assign(Object.create(definition), {
			config: {
				title: "AI 助手",
				maxInputCharacters: 4000,
				showHeader: true,
				showClearButton: true,
				autoFocus: false,
				voiceChat: { enabled: false, initialVolume: 0.22 }
			},
			identifier: "module_1_MMM-AIChat",
			isExpanded: false,
			messages: [],
			state: "IDLE",
			error: null,
			isUserNearBottom: true,
			voiceEnabled: false,
			voiceState: "disabled",
			voiceSpeakEnabled: false,
			voiceVolume: 0.22,
			petController: null,
			petState: "idle",
			updateDom: jest.fn(() => {
				if (root) {
					root.replaceChildren(assistant.getDom());
				}
			})
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
	 * Mount the assistant's current DOM into the test document.
	 * @returns {HTMLElement} The rendered assistant root.
	 */
	function render () {
		root = document.createElement("div");
		root.className = "MMM-AIChat";
		root.appendChild(assistant.getDom());
		document.body.appendChild(root);
		return root;
	}

	it("starts collapsed without creating an input field", () => {
		const mounted = render();
		const toggle = mounted.querySelector(".ai-chat-toggle");

		expect(toggle).not.toBeNull();
		expect(toggle.getAttribute("aria-expanded")).toBe("false");
		expect(mounted.querySelector(".ai-chat-input")).toBeNull();
		expect(mounted.querySelector(".ai-chat-controls")).toBeNull();
	});

	it("shows a Chinese face greeting once and sends it directly to TTS without an AI request", () => {
		assistant.faceGreetingReady = true;
		assistant.sessionId = "assistant";
		assistant.sendSocketNotification = jest.fn();
		assistant.sendNotification = jest.fn();
		const greeting = { eventId: "run:huangqichao", text: "晚上好啊，黄启超，今天要做些什么呢？" };
		assistant.notificationReceived("FACE_RECOGNIZED_GREETING", greeting);
		assistant.notificationReceived("FACE_RECOGNIZED_GREETING", greeting);
		expect(assistant.messages).toEqual([{ role: "assistant", content: greeting.text }]);
		expect(assistant.sendSocketNotification).toHaveBeenCalledWith("AI_CHAT_GREETING", { sessionId: "assistant", eventId: greeting.eventId, text: greeting.text });
		expect(assistant.sendSocketNotification).not.toHaveBeenCalledWith("AI_CHAT_REQUEST", expect.anything());
		assistant.finishFaceGreeting({ eventId: greeting.eventId, status: "muted" });
	});

	it("waits for an active voice chat before greeting and restores paused music afterward", () => {
		assistant.faceGreetingReady = true;
		assistant.voiceEnabled = true;
		assistant.voiceSpeakEnabled = true;
		assistant.sendSocketNotification = jest.fn();
		assistant.sendNotification = jest.fn();
		assistant.notificationReceived("FACE_RECOGNIZED_GREETING", { eventId: "test", text: "你好，黄启超" });
		expect(assistant.messages).toHaveLength(0);
		assistant.voiceEnabled = false;
		jest.advanceTimersByTime(1000);
		expect(assistant.sendNotification).toHaveBeenCalledWith("MUSIC_PAUSE_FOR_VOICE", { requestId: "greeting-test" });
		assistant.notificationReceived("MUSIC_PAUSE_CONFIRMED", { requestId: "greeting-test", wasPlaying: true });
		expect(assistant.sendSocketNotification).toHaveBeenCalledWith("AI_CHAT_GREETING", expect.objectContaining({ eventId: "test" }));
		assistant.finishFaceGreeting({ eventId: "test", status: "spoken" });
		expect(assistant.sendNotification).toHaveBeenCalledWith("MUSIC_RESUME_AFTER_VOICE", expect.objectContaining({ wasPlaying: true }));
	});

	it("opens from the compact button and focuses the composer", () => {
		const mounted = render();
		mounted.querySelector(".ai-chat-toggle").click();
		jest.runOnlyPendingTimers();

		expect(assistant.isExpanded).toBe(true);
		expect(mounted.querySelector(".ai-chat-input")).not.toBeNull();
		expect(document.activeElement).toBe(mounted.querySelector(".ai-chat-input"));
	});

	it("keeps messages in a separate region above the fixed control group", () => {
		assistant.isExpanded = true;
		const mounted = render();
		const messages = mounted.querySelector(".ai-chat-messages");
		const controls = mounted.querySelector(".ai-chat-controls");

		expect(messages).not.toBeNull();
		expect(controls).not.toBeNull();
		expect(messages.compareDocumentPosition(controls) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(mounted.querySelector(".ai-chat-collapse")).not.toBeNull();
	});

	it("collapses from the panel and returns focus to the compact button", () => {
		assistant.isExpanded = true;
		const mounted = render();
		mounted.querySelector(".ai-chat-collapse").click();
		jest.runOnlyPendingTimers();

		expect(assistant.isExpanded).toBe(false);
		expect(mounted.querySelector(".ai-chat-input")).toBeNull();
		expect(document.activeElement).toBe(mounted.querySelector(".ai-chat-toggle"));
	});
});
