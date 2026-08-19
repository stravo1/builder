/**
 * @vitest-environment jsdom
 *
 * The last URL is remembered in `localStorage`, so this file needs a document.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const DESCRIPTOR = {
	v: 1,
	name: "acme/icons",
	label: "Icons",
	version: "1.0.0",
	capabilities: ["block.update"],
	entry: "/src/main.js",
};

const answer = (body: unknown, ok = true) =>
	vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(body) });

/** Each test needs a fresh module: the loaded extension is module state. */
const loadModule = async () => {
	vi.resetModules();
	return import("../devExtension");
};

let dev: Awaited<ReturnType<typeof loadModule>>;

describe("loadDevExtension", () => {
	beforeEach(async () => {
		localStorage.clear();
		vi.restoreAllMocks();
		vi.stubGlobal("fetch", answer(DESCRIPTOR));
		dev = await loadModule();
	});

	it("asks the dev server what it is serving", async () => {
		await dev.loadDevExtension("http://localhost:5173");

		expect(fetch).toHaveBeenCalledWith("http://localhost:5173/__builder-extension");
	});

	it("takes any URL on that server, because an author pastes what the terminal printed", async () => {
		await dev.loadDevExtension("http://localhost:5173/src/main.js?x=1");

		expect(fetch).toHaveBeenCalledWith("http://localhost:5173/__builder-extension");
	});

	it("builds an entry the frame can import", async () => {
		const extension = await dev.loadDevExtension("http://localhost:5173");

		expect(extension.entry).toBe("http://localhost:5173/src/main.js");
		expect(extension.name).toBe("acme/icons");
		expect(extension.label).toBe("Icons");
	});

	it("falls back to the name when the manifest carries no label", async () => {
		vi.stubGlobal("fetch", answer({ ...DESCRIPTOR, label: undefined }));

		expect((await dev.loadDevExtension("http://localhost:5173")).label).toBe("acme/icons");
	});

	it("keeps the capabilities this Builder knows", async () => {
		const extension = await dev.loadDevExtension("http://localhost:5173");

		expect(extension.capabilities).toEqual(["block.update"]);
	});

	it("drops a capability this Builder does not have, and says so", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.stubGlobal("fetch", answer({ ...DESCRIPTOR, capabilities: ["block.update", "quantum.read"] }));

		const extension = await dev.loadDevExtension("http://localhost:5173");

		expect(extension.capabilities).toEqual(["block.update"]);
		expect(warn.mock.calls[0][0]).toContain("quantum.read");
	});

	it("grants nothing when the manifest asks for nothing", async () => {
		vi.stubGlobal("fetch", answer({ ...DESCRIPTOR, capabilities: undefined }));

		expect((await dev.loadDevExtension("http://localhost:5173")).capabilities).toEqual([]);
	});

	it("names the server when nothing answers", async () => {
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection refused")));

		await expect(dev.loadDevExtension("http://localhost:5173")).rejects.toThrow(/Nothing is answering/);
	});

	it("says what is wrong when the server is not a Builder extension", async () => {
		vi.stubGlobal("fetch", answer({ hello: true }));

		await expect(dev.loadDevExtension("http://localhost:5173")).rejects.toThrow(/builderExtension\(\)/);
	});

	it("treats a page that is not the descriptor as no descriptor", async () => {
		vi.stubGlobal("fetch", answer(null, false));

		await expect(dev.loadDevExtension("http://localhost:5173")).rejects.toThrow(/not a Builder extension/);
	});

	it("remembers the origin, so nobody retypes it", async () => {
		await dev.loadDevExtension("http://localhost:5173/src/main.js");

		expect(dev.lastDevUrl()).toBe("http://localhost:5173");
	});

	it("answers with an empty URL before anything has been loaded", () => {
		expect(dev.lastDevUrl()).toBe("");
	});

	it("replaces the one already loaded, because there is one at a time", async () => {
		await dev.loadDevExtension("http://localhost:5173");
		vi.stubGlobal("fetch", answer({ ...DESCRIPTOR, name: "acme/other" }));

		await dev.loadDevExtension("http://localhost:5174");

		expect(dev.devExtension.value?.name).toBe("acme/other");
	});

	it("stops, which is what tears down everything it registered", async () => {
		await dev.loadDevExtension("http://localhost:5173");

		dev.stopDevExtension();

		expect(dev.devExtension.value).toBe(null);
	});
});
