Module.register("MMM-FaceRecognition", {
	defaults: { runtime: "auto", source: "0", stableFrames: 3, stableMs: 1000, threshold: 0.5 },

	start () {
		this.state = { state: "idle", message: "正在连接识别系统", faces: [] };
		this.greeted = new Set();
		this.sendSocketNotification("FACE_INIT");
	},

	getStyles () {
		return ["MMM-FaceRecognition.css"];
	},

	socketNotificationReceived (notification, payload = {}) {
		if (notification === "FACE_GREETING") {
			if (this.greeted.has(payload.eventId)) return;
			this.greeted.add(payload.eventId);
			this.sendNotification("FACE_RECOGNIZED_GREETING", payload);
			this.lastGreeting = payload.text;
			this.refreshCard();
		} else if (notification === "FACE_STATE") {
			this.state = payload;
			this.refreshCard();
		}
	},

	getDom () {
		const card = document.createElement("section");
		card.className = "face-card";
		card.setAttribute("aria-label", "人脸识别");
		const title = document.createElement("div");
		title.className = "face-heading";
		const heading = document.createElement("h2");
		heading.textContent = "人脸识别";
		const status = document.createElement("span");
		status.className = "face-status";
		status.setAttribute("role", "status");
		title.append(heading, status);
		const preview = document.createElement("div");
		preview.className = "face-preview";
		const image = document.createElement("img");
		image.alt = "摄像头实时识别画面";
		image.hidden = true;
		const empty = document.createElement("div");
		empty.className = "face-empty";
		preview.append(image, empty);
		const people = document.createElement("div");
		people.className = "face-people";
		const greeting = document.createElement("p");
		greeting.className = "face-greeting";
		card.append(title, preview, people, greeting);
		this.card = card;
		this.refreshCard();
		return card;
	},

	refreshCard () {
		if (!this.card) return;
		const state = this.state || {};
		const status = this.card.querySelector(".face-status");
		status.textContent = { running: "识别中", starting: "连接中", error: "暂不可用", ended: "已结束", idle: "待连接" }[state.state] || "待连接";
		status.dataset.state = state.state;
		const image = this.card.querySelector("img");
		const empty = this.card.querySelector(".face-empty");
		if (state.previewUpdated) {
			const base = config.basePath || "/";
			image.src = `${base}MMM-FaceRecognition/preview?frame=${encodeURIComponent(state.frame)}`;
			image.hidden = false;
		}
		if (state.state !== "running" && state.state !== "starting") image.hidden = true;
		empty.hidden = !image.hidden;
		empty.textContent = state.message || "等待有人进入画面";
		const people = this.card.querySelector(".face-people");
		people.replaceChildren();
		const faces = state.faces || [];
		if (!faces.length) {
			people.textContent = state.state === "running" ? "等待有人进入画面" : state.message;
		}
		faces.forEach((face) => {
			const person = document.createElement("div");
			person.className = "face-person";
			const name = document.createElement("strong");
			name.textContent = face.displayName;
			const detail = document.createElement("span");
			detail.textContent = face.name === "Unknown" ? "未匹配到人脸库" : `相似度 ${face.score.toFixed(2)}`;
			person.append(name, detail);
			people.appendChild(person);
		});
		this.card.querySelector(".face-greeting").textContent = this.lastGreeting || "首次认出你时，AI 助手会向你问好";
	}
});
