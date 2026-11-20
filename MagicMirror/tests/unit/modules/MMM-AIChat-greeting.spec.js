
const fs = require("node:fs/promises");
const { GreetingSpeaker } = require("../../../modules/MMM-AIChat/lib/greeting-speaker");

describe("one-shot Chinese greeting speech", () => {
	it("uses the existing TTS and audio player once and deletes temporary audio", async () => {
		let output;
		const synthesize = jest.fn(async (text, file) => {
			output = file;
			await fs.writeFile(file, text);
		});
		const play = jest.fn().mockResolvedValue();
		const speaker = new GreetingSpeaker({ makeTTS: () => ({ synthesize }), makePlayer: () => ({ play }) });
		const request = { eventId: "run:huangqichao", text: "晚上好啊，黄启超，今天要做些什么呢？", config: { voiceChat: { speakEnabled: true } } };
		await expect(speaker.speak(request)).resolves.toBe("spoken");
		await expect(speaker.speak(request)).resolves.toBe("duplicate");
		expect(synthesize).toHaveBeenCalledTimes(1);
		expect(synthesize.mock.calls[0][0]).toContain("黄启超");
		expect(play).toHaveBeenCalledTimes(1);
		await expect(fs.access(output)).rejects.toThrow();
	});

	it("honors mute and does not create a microphone or synthesize speech", async () => {
		const makeTTS = jest.fn();
		const speaker = new GreetingSpeaker({ makeTTS });
		await expect(speaker.speak({ eventId: "id", text: "你好", config: { voiceChat: { speakEnabled: false } } })).resolves.toBe("muted");
		expect(makeTTS).not.toHaveBeenCalled();
	});

	it("cleans up audio and unlocks after synthesis failure", async () => {
		const synthesize = jest.fn().mockRejectedValue(new Error("no model"));
		const speaker = new GreetingSpeaker({ makeTTS: () => ({ synthesize }), makePlayer: () => ({ play: jest.fn() }) });
		await expect(speaker.speak({ eventId: "id", text: "你好", config: { voiceChat: {} } })).rejects.toThrow("no model");
		expect(speaker.active).toBeNull();
	});
});
