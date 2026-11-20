"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { loadEnvFile } = require("../lib/env-loader");

test("loads simple .env values and ignores comments", () => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mmm-aichat-env-"));
	const filePath = path.join(directory, ".env");
	fs.writeFileSync(filePath, [
		"# local secret",
		"DEEPSEEK_API_KEY=\"abc=123\"",
		"OTHER_KEY='value'",
		"INVALID LINE",
		"bad-key=nope"
	].join("\n"));

	const values = loadEnvFile(filePath);
	assert.equal(values.DEEPSEEK_API_KEY, "abc=123");
	assert.equal(values.OTHER_KEY, "value");
	assert.equal(values["bad-key"], undefined);
	fs.rmSync(directory, { recursive: true, force: true });
});

test("missing .env file returns empty object", () => {
	assert.deepEqual(loadEnvFile(path.join(os.tmpdir(), "missing-mmm-aichat.env")), {});
});
