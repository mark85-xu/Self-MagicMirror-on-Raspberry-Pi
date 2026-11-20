const fs = require("node:fs");
const NodeHelper = require("node_helper");
const { FaceBridge } = require("./lib/face-bridge");

module.exports = NodeHelper.create({
	start () {
		const settings = global.config?.modules?.find((module) => module.module === "MMM-FaceRecognition" && !module.disabled)?.config || {};
		this.bridge = new FaceBridge(settings);
		this.bridge.on("state", (state) => this.sendSocketNotification("FACE_STATE", state));
		this.bridge.on("greeting", (greeting) => this.sendSocketNotification("FACE_GREETING", greeting));
		this.expressApp.get("/MMM-FaceRecognition/preview", (req, res) => {
			res.set("Cache-Control", "no-store");
			if (!this.bridge.previewFile || !fs.existsSync(this.bridge.previewFile)) return res.sendStatus(404);
			res.type("jpg").sendFile(this.bridge.previewFile);
		});
	},

	socketNotificationReceived (notification) {
		if (notification === "FACE_INIT") {
			this.sendSocketNotification("FACE_STATE", this.bridge.snapshot);
			if (this.bridge.snapshot.state === "idle") this.bridge.start();
		}
	},

	stop () {
		return this.bridge?.stop();
	}
});
