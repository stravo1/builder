/**
 * @vitest-environment jsdom
 *
 * The last URL is remembered in `localStorage`, so this file needs a document.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Registering the dev installation is a Frappe call. Under test is what it sends. */
const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
let registers = true;

vi.mock("frappe-ui", () => ({
	call: (method: string, params: Record<string, unknown>) => {
		calls.push({ method, params });
		return registers ? Promise.resolve(null) : Promise.reject(new Error("refused"));
	},
}));

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
		calls.length = 0;
		registers = true;
		vi.stubGlobal("fetch", answer(DESCRIPTOR));
		window.csrf_token = "token123";
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

	// without an installation the server refuses everything it calls
	it("registers an installation, so the server gate lets it through", async () => {
		await dev.loadDevExtension("http://localhost:5173");

		expect(calls).toContainEqual({
			method: "builder.extensions.registry.install_dev_extension",
			params: { extension: "acme/icons" },
		});
	});

	it("names what to check when the site will not register it", async () => {
		registers = false;

		await expect(dev.loadDevExtension("http://localhost:5173")).rejects.toThrow(/developer mode/);
	});

	it("loads nothing when registering fails", async () => {
		registers = false;

		await dev.loadDevExtension("http://localhost:5173").catch(() => {});

		expect(dev.devExtension.value).toBe(null);
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

	it("puts the icon on the dev server too, because that is what serves it", async () => {
		vi.stubGlobal("fetch", answer({ ...DESCRIPTOR, icon: "/src/icon.svg" }));

		const extension = await dev.loadDevExtension("http://localhost:5173");

		expect(extension.icon).toBe("http://localhost:5173/src/icon.svg");
	});

	it("leaves the icon unset for an extension that ships none", async () => {
		expect((await dev.loadDevExtension("http://localhost:5173")).icon).toBeUndefined();
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
		expect(fetch).toHaveBeenLastCalledWith(
			"/api/method/builder.extensions.registry.remove_dev_extension",
			// Frappe refuses a form POST without the token, and fetch adds none
			expect.objectContaining({
				method: "POST",
				keepalive: true,
				headers: { "X-Frappe-CSRF-Token": "token123" },
			}),
		);
	});
});

/** The panel marks one row, and reads the list, never the object it was built from. */
describe("isDevExtension", () => {
	const listed = (name: string) => ({ name, label: name, entry: `/${name}.js`, capabilities: [] });


	beforeEach(async () => {
		localStorage.clear();
		vi.restoreAllMocks();
		calls.length = 0;
		registers = true;
		vi.stubGlobal("fetch", answer(DESCRIPTOR));
		window.csrf_token = "token123";
		dev = await loadModule();
	});

	it("marks nothing while no dev extension is loaded", () => {
		expect(dev.isDevExtension(listed("acme/icons"))).toBe(false);
	});

	it("marks the entry the dev server serves, whoever built it", async () => {
		await dev.loadDevExtension("http://localhost:5173");

		expect(dev.isDevExtension(listed("acme/icons"))).toBe(true);
	});

	it("leaves the other installed extensions unmarked", async () => {
		await dev.loadDevExtension("http://localhost:5173");

		expect(dev.isDevExtension(listed("acme/other"))).toBe(false);
	});
});
