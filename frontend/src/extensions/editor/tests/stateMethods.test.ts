/**
 * @vitest-environment jsdom
 *
 * Two stores, one API. An installation keeps its state on the site, so what is
 * under test there is the call it makes. A development extension keeps its state
 * in the browser, so what is under test there is the merge rule, the key scoping
 * and every refusal.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/** The Frappe call is mocked. Under test is the method it targets. */
const submitted: Array<{ url: string; params: Record<string, unknown> }> = [];
let answer: unknown = {};

vi.mock("frappe-ui", () => ({
	createResource: ({ url }: { url: string }) => ({
		submit: (params: Record<string, unknown>) => {
			submitted.push({ url, params });
			return Promise.resolve(answer);
		},
	}),
}));

let development: string | null = null;

vi.mock("@/extensions/devExtension", () => ({
	isDevExtension: (extension: { name: string }) => extension.name === development,
}));

import type { InstalledExtension } from "frappe-builder-extension-sdk/types";
import { stateMethods } from "../stateMethods";

const INSTALLED = "acme/icons";
const DEV = "acme/draft";

const record = (name = INSTALLED): InstalledExtension => ({
	name,
	label: "Icons",
	capabilities: [],
});

const get = (extension = record()) => stateMethods["state.get"].run(undefined, extension);
const set = (state: unknown, extension = record()) => stateMethods["state.set"].run({ state }, extension);
const unset = (key: unknown, extension = record()) => stateMethods["state.unset"].run({ key }, extension);

const codeOf = (call: () => unknown) => {
	try {
		call();
	} catch (error) {
		return (error as { code?: string }).code;
	}
	return undefined;
};

const stored = (name: string) => localStorage.getItem(`builder-extension:${name}`);

beforeEach(() => {
	localStorage.clear();
	submitted.length = 0;
	answer = {};
	development = DEV;
});

describe("the capability", () => {
	// 1.12: the extension's own storage, so no grant, and no read-only refusal
	it("gates none of the three", () => {
		expect(stateMethods["state.get"].needs).toBeNull();
		expect(stateMethods["state.set"].needs).toBeNull();
		expect(stateMethods["state.unset"].needs).toBeNull();
	});
});

describe("an installation", () => {
	it("reads its store from the site, not from this browser", async () => {
		answer = { theme: "dark" };

		await expect(get()).resolves.toEqual({ theme: "dark" });
		expect(submitted[0].url).toBe("builder.extensions.state.get_state");
		expect(submitted[0].params).toEqual({ extension: INSTALLED });
	});

	it("sends the patch, and leaves the merge to the server", async () => {
		await set({ query: "icon" });

		expect(submitted[0].url).toBe("builder.extensions.state.set_state");
		expect(submitted[0].params).toEqual({ extension: INSTALLED, state: { query: "icon" } });
	});

	it("drops one key by name", async () => {
		await unset("query");

		expect(submitted[0].url).toBe("builder.extensions.state.unset_state");
		expect(submitted[0].params).toEqual({ extension: INSTALLED, key: "query" });
	});

	// the browser store is per browser, so two people on one machine shared it
	it("writes nothing to this browser", async () => {
		await set({ query: "icon" });

		expect(localStorage.length).toBe(0);
	});

	it("refuses a patch that is not an object", () => {
		expect(codeOf(() => set("icon"))).toBe("invalid_params");
		expect(codeOf(() => set(["icon"]))).toBe("invalid_params");
		expect(codeOf(() => set(null))).toBe("invalid_params");
	});
});

describe("a development extension", () => {
	const dev = () => record(DEV);

	// its installation is deleted on every pagehide, so a row on the site would
	// not survive the reload an author needs to test their own state
	it("keeps its store in this browser", () => {
		set({ query: "icon" }, dev());

		expect(get(dev())).toEqual({ query: "icon" });
		expect(submitted).toHaveLength(0);
	});

	it("merges, and never removes what a call leaves unmentioned", () => {
		set({ query: "icon" }, dev());
		set({ page: 2 }, dev());

		expect(get(dev())).toEqual({ query: "icon", page: 2 });
	});

	it("gives every extension its own drawer", () => {
		development = "acme/other";
		set({ query: "icon" }, record("acme/other"));

		expect(stored("acme/other")).toBe('{"query":"icon"}');
		expect(stored(INSTALLED)).toBeNull();
	});

	it("drops one key and keeps the rest", () => {
		set({ query: "icon", page: 2 }, dev());
		unset("query", dev());

		expect(get(dev())).toEqual({ page: 2 });
	});

	it("refuses a store larger than its limit", () => {
		expect(codeOf(() => set({ blob: "x".repeat(100_001) }, dev()))).toBe("state_too_large");
	});

	it("treats a store that will not parse as absent", () => {
		localStorage.setItem(`builder-extension:${DEV}`, "{not json");

		expect(get(dev())).toEqual({});
	});
});
