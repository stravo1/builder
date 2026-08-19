/**
 * @vitest-environment jsdom
 *
 * The store is `localStorage`, so this file needs a browser environment. What is
 * under test is the merge rule, the key scoping and every refusal.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stateMethods } from "../stateMethods";
import type { InstalledExtension } from "../../types";

const record = (name = "acme/icons"): InstalledExtension => ({
	name,
	label: "Icons",
	entry: `/builder_extension_asset/${name}@1.0.0/main.js`,
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

beforeEach(() => localStorage.clear());

describe("the capability", () => {
	// 1.12: the extension's own storage, so no grant, and no read-only refusal
	it("gates none of the three", () => {
		expect(stateMethods["state.get"].needs).toBeNull();
		expect(stateMethods["state.set"].needs).toBeNull();
		expect(stateMethods["state.unset"].needs).toBeNull();
	});
});

describe("state.get", () => {
	it("answers with an empty store when nothing was written", () => {
		expect(get()).toEqual({});
	});

	it("answers with what was written", () => {
		set({ tier: "pro" });

		expect(get()).toEqual({ tier: "pro" });
	});

	it("treats an unreadable store as empty", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		localStorage.setItem("builder-extension:acme/icons", "{not json");

		expect(get()).toEqual({});
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});

	it("treats a stored list as empty, because a store is an object", () => {
		localStorage.setItem("builder-extension:acme/icons", "[1,2]");

		expect(get()).toEqual({});
	});
});

describe("state.set", () => {
	// a panel saving its query must not erase what the entry frame stored
	it("merges rather than replaces", () => {
		set({ tier: "pro" });
		set({ query: "star" });

		expect(get()).toEqual({ tier: "pro", query: "star" });
	});

	it("overwrites a key the patch names", () => {
		set({ tier: "pro" });
		set({ tier: "free" });

		expect(get()).toEqual({ tier: "free" });
	});

	it("refuses a patch that is not an object", () => {
		expect(codeOf(() => set("pro"))).toBe("invalid_params");
		expect(codeOf(() => set(["pro"]))).toBe("invalid_params");
		expect(codeOf(() => set(null))).toBe("invalid_params");
	});

	it("refuses a store larger than the limit", () => {
		expect(codeOf(() => set({ blob: "x".repeat(100_001) }))).toBe("state_too_large");
	});

	it("writes nothing when the limit refuses it", () => {
		set({ tier: "pro" });
		codeOf(() => set({ blob: "x".repeat(100_001) }));

		expect(get()).toEqual({ tier: "pro" });
	});

	it("reports a full browser as its own refusal", () => {
		const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("QuotaExceededError");
		});

		expect(codeOf(() => set({ tier: "pro" }))).toBe("storage_full");
		setItem.mockRestore();
	});
});

describe("state.unset", () => {
	it("removes one key and leaves the rest", () => {
		set({ tier: "pro", query: "star" });
		unset("query");

		expect(get()).toEqual({ tier: "pro" });
	});

	it("is quiet about a key that was never there", () => {
		set({ tier: "pro" });

		expect(() => unset("missing")).not.toThrow();
		expect(get()).toEqual({ tier: "pro" });
	});

	it("refuses a key that is not a string", () => {
		expect(codeOf(() => unset(7))).toBe("invalid_params");
	});
});

describe("scoping", () => {
	it("keeps one extension's store out of another's", () => {
		set({ tier: "pro" });
		set({ tier: "free" }, record("acme/other"));

		expect(get()).toEqual({ tier: "pro" });
		expect(get(record("acme/other"))).toEqual({ tier: "free" });
	});

	it("namespaces the key, so it cannot collide with Builder's own", () => {
		set({ tier: "pro" });

		expect(localStorage.getItem("builder-extension:acme/icons")).toBe(`{"tier":"pro"}`);
	});
});
