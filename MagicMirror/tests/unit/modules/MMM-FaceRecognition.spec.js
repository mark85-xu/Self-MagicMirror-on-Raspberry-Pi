
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { FaceBridge, RecognitionGate, greetingFor } = require("../../../modules/MMM-FaceRecognition/lib/face-bridge");

describe("face recognition stability and greetings", () => {
	it("requires consecutive stable known matches and greets each person once per run", () => {
		const gate = new RecognitionGate();
		const face = { name: "huangqichao", score: 0.9 };
		expect(gate.update([face], 0)).toEqual([]);
		expect(gate.update([face], 500)).toEqual([]);
		expect(gate.update([face], 1000)).toEqual([face]);
		expect(gate.update([face], 2000)).toEqual([]);
		gate.update([], 3000);
		gate.update([face], 4000);
		gate.update([face], 4500);
		expect(gate.update([face], 5000)).toEqual([]);
	});

	it("does not greet unknown, weak matches, duplicate detections or flickering identities", () => {
		const gate = new RecognitionGate();
		const known = { name: "huangqichao", score: 0.9 };
		expect(gate.update([known, known, { name: "Unknown", score: 1 }], 0)).toEqual([]);
		expect(gate.update([{ name: "huangqichao", score: 0.1 }], 1000)).toEqual([]);
		expect(gate.update([known], 2000)).toEqual([]);
		expect(gate.update([known], 2100)).toEqual([]);
		expect(gate.update([known], 3000)).toEqual([known]);
	});

	it("uses the Chinese name from the gallery and handles fragmented worker JSON", () => {
		jest.useFakeTimers();
		const bridge = new FaceBridge({ stableMs: 0, stableFrames: 1 });
		bridge.names = { huangqichao: "黄启超" };
		const greet = jest.fn();
		bridge.on("greeting", greet);
		bridge.buffer = "";
		bridge.consume(Buffer.from("runtime log\n{\"type\":\"frame\",\"faces\":[{\"name\":\"huang"));
		expect(greet).not.toHaveBeenCalled();
		bridge.consume(Buffer.from("qichao\",\"score\":0.9}],\"previewUpdated\":true,\"frame\":1}\n"));
		expect(greet).toHaveBeenCalledTimes(1);
		expect(greet.mock.calls[0][0].text).toContain("黄启超");
		expect(bridge.snapshot.faces[0].displayName).toBe("黄启超");
		clearTimeout(bridge.watchdog);
		jest.useRealTimers();
	});

	it("uses the matching time-of-day greeting and omits unconfigured pinyin from speech", () => {
		expect(greetingFor("黄启超", new Date(2026, 10, 13, 19))).toBe("晚上好啊，黄启超，今天要做些什么呢？");
		expect(greetingFor("", new Date(2026, 10, 13, 9))).toBe("早上好啊，今天要做些什么呢？");
	});
});

describe("face recognition card", () => {
	let dom;
	let card;
	beforeEach(() => {
		dom = new JSDOM("<!doctype html><body></body>");
		global.document = dom.window.document;
		global.config = { basePath: "/" };
		global.Module = { register: (name, definition) => { card = Object.create(definition); } };
		jest.isolateModules(() => require(path.resolve(__dirname, "../../../modules/MMM-FaceRecognition/MMM-FaceRecognition.js")));
		card.sendSocketNotification = jest.fn();
		card.sendNotification = jest.fn();
		card.start();
		document.body.appendChild(card.getDom());
	});
	afterEach(() => {
		dom.window.close();
		delete global.document;
		delete global.Module;
		delete global.config;
	});

	it("shows truthful connection errors and renders untrusted names as text", () => {
		card.socketNotificationReceived("FACE_STATE", { state: "error", message: "摄像头未连接", faces: [] });
		expect(document.querySelector(".face-empty").textContent).toContain("摄像头未连接");
		expect(document.querySelector("img").hidden).toBe(true);
		card.socketNotificationReceived("FACE_STATE", { state: "running", frame: 1, previewUpdated: true, faces: [{ name: "test", displayName: "<script>alert(1)</script>", score: 0.9 }] });
		expect(document.querySelector("strong").textContent).toContain("<script>");
		expect(document.querySelector("script")).toBeNull();
		expect(document.querySelector("img").src).toContain("/MMM-FaceRecognition/preview?frame=1");
	});

	it("forwards a greeting to the assistant only once", () => {
		const greeting = { eventId: "run:huangqichao", text: "晚上好啊，黄启超，今天要做些什么呢？" };
		card.socketNotificationReceived("FACE_GREETING", greeting);
		card.socketNotificationReceived("FACE_GREETING", greeting);
		expect(card.sendNotification).toHaveBeenCalledTimes(1);
		expect(card.sendNotification).toHaveBeenCalledWith("FACE_RECOGNIZED_GREETING", greeting);
	});
});
