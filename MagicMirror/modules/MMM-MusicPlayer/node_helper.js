const NodeHelper = require("node_helper");
const express = require("express");
const fs = require("fs/promises");
const path = require("path");

module.exports = NodeHelper.create({
	start() {
		this.musicDir = "/home/lhx/Desktop/music_library";
		this.routesConfigured = false;
		this.configureRoutes(this.musicDir);
	},

	configureRoutes(musicDir) {
		if (this.routesConfigured || !this.expressApp) {
			return;
		}

		this.musicDir = musicDir || this.musicDir;
		this.expressApp.use(`/${this.name}/library`, express.static(this.musicDir));
		this.routesConfigured = true;
	},

	async socketNotificationReceived(notification, payload = {}) {
		if (notification !== "MUSIC_LIBRARY_REQUEST") {
			return;
		}

		const musicDir = payload.musicDir || this.musicDir;
		this.configureRoutes(musicDir);
		const tracks = await this.scanLibrary(musicDir);
		this.sendSocketNotification("MUSIC_LIBRARY_RESPONSE", { tracks });
	},

	async scanLibrary(musicDir) {
		try {
			await fs.mkdir(musicDir, { recursive: true });
			const entries = await fs.readdir(musicDir, { withFileTypes: true });
			const mp3Files = entries
				.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".mp3"))
				.map((entry) => entry.name)
				.sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));

			return Promise.all(mp3Files.map((fileName) => this.buildTrack(musicDir, fileName)));
		} catch (error) {
			return [];
		}
	},

	async buildTrack(musicDir, fileName) {
		const parsed = path.parse(fileName);
		const { title, artist } = this.parseName(parsed.name);
		const lyrics = await this.readLyrics(path.join(musicDir, `${parsed.name}.lrc`));

		return {
			displayName: parsed.name,
			title,
			artist,
			fileName,
			url: `/${this.name}/library/${encodeURIComponent(fileName)}`,
			lyrics
		};
	},

	parseName(baseName) {
		const parts = baseName.split(/\s[-–—]\s/);
		if (parts.length >= 2) {
			return {
				title: parts[0].trim() || baseName,
				artist: parts.slice(1).join(" - ").trim() || "未知歌手"
			};
		}

		return {
			title: baseName,
			artist: "未知歌手"
		};
	},

	async readLyrics(filePath) {
		try {
			const raw = await fs.readFile(filePath, "utf8");
			return raw
				.split(/\r?\n/)
				.flatMap((line) => this.parseLyricLine(line))
				.sort((a, b) => a.time - b.time);
		} catch (error) {
			return [];
		}
	},

	parseLyricLine(line) {
		const matches = [...line.matchAll(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g)];
		const text = line.replace(/\[[^\]]+\]/g, "").trim();
		if (!matches.length || !text) {
			return [];
		}

		return matches.map((match) => {
			const minutes = Number.parseInt(match[1], 10);
			const seconds = Number.parseInt(match[2], 10);
			const fraction = match[3] ? Number.parseFloat(`0.${match[3]}`) : 0;
			return {
				time: minutes * 60 + seconds + fraction,
				text
			};
		});
	}
});
