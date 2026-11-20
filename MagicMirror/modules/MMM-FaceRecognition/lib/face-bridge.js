const { EventEmitter } = require("node:events");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

class RecognitionGate {
	constructor ({ stableFrames = 3, stableMs = 1000, threshold = 0.5 } = {}) {
		this.stableFrames = stableFrames;
		this.stableMs = stableMs;
		this.threshold = threshold;
		this.candidates = new Map();
		this.greeted = new Set();
	}

	update (faces, now) {
		const present = new Set();
		const ready = [];
		for (const face of faces) {
			if (!face.name || face.name.toLowerCase() === "unknown" || face.score < this.threshold || present.has(face.name)) continue;
			present.add(face.name);
			const candidate = this.candidates.get(face.name) || { since: now, frames: 0 };
			candidate.frames++;
			this.candidates.set(face.name, candidate);
			if (!this.greeted.has(face.name) && candidate.frames >= this.stableFrames && now - candidate.since >= this.stableMs) {
				this.greeted.add(face.name);
				ready.push(face);
			}
		}
		for (const name of this.candidates.keys()) {
			if (!present.has(name)) this.candidates.delete(name);
		}
		return ready;
	}
}

function greetingFor (name, date = new Date()) {
	const hour = date.getHours();
	const period = hour < 6 ? "夜深了" : hour < 11 ? "早上好啊" : hour < 14 ? "中午好啊" : hour < 18 ? "下午好啊" : "晚上好啊";
	return `${period}${name ? `，${name}` : ""}，今天要做些什么呢？`;
}

class FaceBridge extends EventEmitter {
	constructor (settings = {}) {
		super();
		this.settings = { runtime: "auto", source: "0", threshold: 0.5, stableFrames: 3, stableMs: 1000, ...settings };
		this.root = path.resolve(settings.projectRoot || path.join(__dirname, "../../../../face-recognition"));
		this.gate = new RecognitionGate(this.settings);
		this.runId = crypto.randomUUID();
		this.snapshot = { state: "idle", message: "等待启动摄像头", faces: [] };
		this.stopping = false;
	}

	command () {
		const native = path.join(this.root, "build/cpp/face_recognizer");
		const cpp = this.settings.runtime === "cpp" || (this.settings.runtime === "auto" && fs.existsSync(native));
		const common = ["--no-show", "--json-events", "--preview-file", this.previewFile, "--threshold", String(this.settings.threshold)];
		const source = cpp && this.settings.source.startsWith("picamera2") ? this.settings.source.replace("picamera2", "csi") : this.settings.source;
		if (this.settings.maxFrames) common.push("--max-frames", String(this.settings.maxFrames));
		if (cpp) return { binary: native, args: ["--root", this.root, "--source", source, ...common] };
		return {
			binary: this.settings.pythonBinary || path.join(this.root, ".venv/bin/python"),
			args: ["-u", path.join(this.root, "src/recognize.py"), "--source", source, "--device", "cpu", "--opencv-threads", "4", ...common]
		};
	}

	setState (state, message) {
		this.snapshot = { ...this.snapshot, state, message };
		this.emit("state", this.snapshot);
	}

	start () {
		if (this.child) return;
		this.stopping = false;
		try {
			const namesFile = this.settings.namesFile || path.join(this.root, "face_vectors/names.json");
			this.names = fs.existsSync(namesFile) ? JSON.parse(fs.readFileSync(namesFile, "utf8")) : {};
			if (!this.names || Array.isArray(this.names) || typeof this.names !== "object") throw new Error("人脸中文名配置格式错误");
			this.directory = fs.mkdtempSync(path.join(os.tmpdir(), "magicmirror-face-"));
			this.previewFile = path.join(this.directory, "preview.jpg");
			const { binary, args } = this.command();
			if (!fs.existsSync(binary)) throw new Error("未找到人脸识别程序，请检查本地运行环境");
			this.setState("starting", "正在连接摄像头");
			this.child = spawn(binary, args, { cwd: this.root, stdio: ["ignore", "pipe", "pipe"] });
			this.buffer = "";
			this.child.stdout.on("data", (chunk) => this.consume(chunk));
			this.child.stderr.on("data", () => {});
			this.child.on("error", () => this.setState("error", "人脸识别程序启动失败"));
			this.child.on("close", (code) => {
				this.child = null;
				clearTimeout(this.watchdog);
				if (!this.stopping) this.setState(code === 0 ? "ended" : "error", code === 0 ? "识别已结束" : "摄像头或识别程序不可用，请检查后重新启动");
			});
			this.armWatchdog();
		} catch (error) {
			this.setState("error", error.message);
		}
	}

	armWatchdog () {
		clearTimeout(this.watchdog);
		this.watchdog = setTimeout(() => {
			this.setState("error", "摄像头长时间没有返回画面");
			this.child?.kill("SIGTERM");
		}, this.settings.frameTimeoutMs || 60000);
	}

	consume (chunk) {
		this.buffer += chunk.toString();
		if (this.buffer.length > 1024 * 1024) {
			this.buffer = "";
			return;
		}
		let newline;
		while ((newline = this.buffer.indexOf("\n")) !== -1) {
			const line = this.buffer.slice(0, newline).trim();
			this.buffer = this.buffer.slice(newline + 1);
			if (!line.startsWith("{")) continue;
			try {
				const event = JSON.parse(line);
				if (event.type === "frame" && Array.isArray(event.faces)) this.onFrame(event);
			} catch { /* Other runtime logs do not form part of the event stream. */ }
		}
	}

	onFrame (event) {
		this.armWatchdog();
		if (this.lastFrameAt && Date.now() - this.lastFrameAt > 2000) this.gate.candidates.clear();
		this.lastFrameAt = Date.now();
		const faces = event.faces.filter((face) => typeof face.name === "string" && face.name.length <= 100 && Number.isFinite(face.score)).map((face) => {
			const known = face.name.toLowerCase() !== "unknown" && face.score >= this.settings.threshold;
			const alias = this.names?.[face.name];
			return { name: known ? face.name : "Unknown", displayName: known ? (typeof alias === "string" && alias.trim() ? alias.trim() : face.name) : "陌生访客", score: face.score };
		});
		this.snapshot = { state: "running", message: faces.length ? "已检测到人脸" : "等待有人进入画面", faces, frame: event.frame, previewUpdated: Boolean(event.previewUpdated) };
		this.emit("state", this.snapshot);
		for (const face of this.gate.update(faces, Date.now())) {
			// Unmapped pinyin is displayed, but never read as English letters.
			const spokenName = /[\u3400-\u9fff]/u.test(face.displayName) ? face.displayName : "";
			const greeting = { eventId: `${this.runId}:${face.name}`, name: face.name, displayName: face.displayName, text: greetingFor(spokenName) };
			this.emit("greeting", greeting);
		}
	}

	async stop () {
		this.stopping = true;
		clearTimeout(this.watchdog);
		const child = this.child;
		if (child) {
			await new Promise((resolve) => {
				const timer = setTimeout(() => { child.kill("SIGKILL"); }, 3000);
				child.once("close", () => { clearTimeout(timer); resolve(); });
				child.kill("SIGTERM");
			});
		}
		if (this.directory) fs.rmSync(this.directory, { recursive: true, force: true });
		this.setState("idle", "摄像头已停止");
	}
}

module.exports = { FaceBridge, RecognitionGate, greetingFor };
