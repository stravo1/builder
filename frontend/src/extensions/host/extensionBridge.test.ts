import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChannelCallError, createPortChannel } from "../transport/createPortChannel";
import type { Capability, InstalledExtension } from "../types";
import { createExtensionBridge } from "./extensionBridge";

const channel = () => createPortChannel(new MessageChannel().port1);

const record = (capabilities: Capability[] = []): InstalledExtension => ({
	name: "acme/icons",
	label: "Icons",
	entry: "/builder_extension_asset/acme-icons@1.0.0/main.js",
	capabilities,
});

/** Every case gets its own bridge, so no state travels between tests. */
const bridge = (methods = {}) => createExtensionBridge(methods);

const codeOf = (call: () => unknown) => {
	try {
		call();
	} catch (error) {
		return (error as ChannelCallError).code;
	}
	return undefined;
};

describe("the entry channel", () => {
	it("keeps the first channel an extension connects with", () => {
		const host = bridge();
		const entry = channel();
		host.connect("acme/icons", entry);

		expect(host.entryChannel("acme/icons")).toBe(entry);
	});

	it("does not let a later frame replace the entry channel", () => {
		const host = bridge();
		const entry = channel();
		host.connect("acme/icons", entry);
		host.connect("acme/icons", channel());

		expect(host.entryChannel("acme/icons")).toBe(entry);
	});

	it("forgets a channel that disconnects", () => {
		const host = bridge();
		const entry = channel();
		host.connect("acme/icons", entry);
		host.disconnect("acme/icons", entry);

		expect(host.entryChannel("acme/icons")).toBeUndefined();
	});

	it("ignores a disconnect from a channel it does not hold", () => {
		const host = bridge();
		const entry = channel();
		host.connect("acme/icons", entry);
		host.disconnect("acme/icons", channel());

		expect(host.entryChannel("acme/icons")).toBe(entry);
	});

	it("takes a new entry channel once the first has gone", () => {
		const host = bridge();
		const first = channel();
		host.connect("acme/icons", first);
		host.disconnect("acme/icons", first);

		const second = channel();
		host.connect("acme/icons", second);

		expect(host.entryChannel("acme/icons")).toBe(second);
	});
});

describe("dispatch", () => {
	const methods = {
		"host.info": { needs: null, run: () => "info" },
		"block.update": { needs: "block.update" as Capability, run: () => "written" },
	};

	it("refuses a method it does not know", () => {
		const dispatch = bridge(methods).dispatcherFor(record());

		expect(codeOf(() => dispatch("page.getBlocks", {}))).toBe("unknown_method");
	});

	it("refuses a method the prototype answers", () => {
		const dispatch = bridge(methods).dispatcherFor(record());

		expect(codeOf(() => dispatch("constructor", {}))).toBe("unknown_method");
	});

	it("answers a method that needs no capability", () => {
		const dispatch = bridge(methods).dispatcherFor(record());

		expect(dispatch("host.info", undefined)).toBe("info");
	});

	it("answers a method whose capability was granted", () => {
		const dispatch = bridge(methods).dispatcherFor(record(["block.update"]));

		expect(dispatch("block.update", {})).toBe("written");
	});

	it("refuses a method whose capability was not granted", () => {
		const dispatch = bridge(methods).dispatcherFor(record(["block.read"]));

		expect(codeOf(() => dispatch("block.update", {}))).toBe("capability_required");
	});

	it("names the missing capability in the refusal", () => {
		const dispatch = bridge(methods).dispatcherFor(record());

		expect(() => dispatch("block.update", {})).toThrow(/block\.update/);
	});
});

describe("the message budget", () => {
	const methods = { "host.info": { needs: null, run: () => "info" } };
	const spend = (dispatch: (method: string, params: unknown) => unknown, calls: number) => {
		for (let call = 0; call < calls; call++) dispatch("host.info", undefined);
	};

	// the window is real time, so a slow run would otherwise roll it over mid-test
	beforeEach(() => {
		vi.useFakeTimers();
		vi.spyOn(console, "warn").mockImplementation(() => {});
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("refuses a call past the budget", () => {
		const dispatch = bridge(methods).dispatcherFor(record());
		spend(dispatch, 100);

		expect(codeOf(() => dispatch("host.info", undefined))).toBe("rate_limited");
	});

	it("warns once, however long the flood runs", () => {
		const warn = vi.mocked(console.warn);
		const dispatch = bridge(methods).dispatcherFor(record());
		spend(dispatch, 100);
		for (let call = 0; call < 50; call++) codeOf(() => dispatch("host.info", undefined));

		expect(warn).toHaveBeenCalledTimes(1);
	});

	it("lets the extension through again once the window rolls over", () => {
		const dispatch = bridge(methods).dispatcherFor(record());
		spend(dispatch, 100);
		vi.advanceTimersByTime(1000);

		expect(dispatch("host.info", undefined)).toBe("info");
	});

	it("gives one extension's frames one budget between them", () => {
		const host = bridge(methods);
		const entry = host.dispatcherFor(record());
		const panel = host.dispatcherFor(record());
		spend(entry, 100);

		expect(codeOf(() => panel("host.info", undefined))).toBe("rate_limited");
	});

	it("does not spend one extension's budget on another", () => {
		const host = bridge(methods);
		spend(host.dispatcherFor(record()), 100);
		const other = host.dispatcherFor({ ...record(), name: "acme/other" });

		expect(other("host.info", undefined)).toBe("info");
	});
});

describe("teardown", () => {
	it("runs every unregister an extension registered", () => {
		const host = bridge();
		const unregistered: string[] = [];
		host.onTeardown("acme/icons", () => unregistered.push("tab"));
		host.onTeardown("acme/icons", () => unregistered.push("menu"));
		host.teardown("acme/icons");

		expect(unregistered).toEqual(["tab", "menu"]);
	});

	it("leaves another extension's unregisters alone", () => {
		const host = bridge();
		const unregistered: string[] = [];
		host.onTeardown("acme/other", () => unregistered.push("other"));
		host.teardown("acme/icons");

		expect(unregistered).toEqual([]);
	});

	it("closes and drops the entry channel", () => {
		const host = bridge();
		const entry = channel();
		host.connect("acme/icons", entry);
		host.teardown("acme/icons");

		expect(host.entryChannel("acme/icons")).toBeUndefined();
		return expect(entry.call("host.info")).rejects.toThrow(/closed/);
	});

	it("runs an unregister once, however often it is torn down", () => {
		const host = bridge();
		const unregistered: string[] = [];
		host.onTeardown("acme/icons", () => unregistered.push("tab"));
		host.teardown("acme/icons");
		host.teardown("acme/icons");

		expect(unregistered).toEqual(["tab"]);
	});

	it("tears down an extension it never saw", () => {
		expect(() => bridge().teardown("acme/ghost")).not.toThrow();
	});
});
