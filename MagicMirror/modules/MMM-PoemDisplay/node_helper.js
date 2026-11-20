const NodeHelper = require("node_helper");
const fs = require("fs/promises");
const path = require("path");

module.exports = NodeHelper.create({
	async socketNotificationReceived(notification) {
		if (notification !== "POEMS_REQUEST") {
			return;
		}

		try {
			const filePath = path.join(__dirname, "poems.json");
			const raw = await fs.readFile(filePath, "utf8");
			this.sendSocketNotification("POEMS_RESPONSE", JSON.parse(raw));
		} catch (error) {
			this.sendSocketNotification("POEMS_RESPONSE", []);
		}
	}
});
