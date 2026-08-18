import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChannelCallError, createPortChannel } from "../transport/createPortChannel";
import type { Capability, InstalledExtension } from "../types";
import type { MethodTable } from "./capabilities";
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

describe("read-only mode", () => {
	const writing = { needs: "block.update" as const, run: () => "written" };
	const reading = { needs: "block.read" as const, run: () => "read" };

	const readOnlyBridge = (methods: MethodTable) =>
		createExtensionBridge(methods, { isReadOnly: () => true });

	it("refuses a write while the page is read-only", () => {
		const dispatch = readOnlyBridge({ "block.update": writing }).dispatcherFor(record(["block.update"]));

		expect(codeOf(() => dispatch("block.update", {}))).toBe("read_only");
	});

	it("still answers a read while the page is read-only", () => {
		const dispatch = readOnlyBridge({ "block.get": reading }).dispatcherFor(record(["block.read"]));

		expect(dispatch("block.get", {})).toBe("read");
	});

	it("still answers a method that needs no capability", () => {
		const dispatch = readOnlyBridge({ "host.info": { needs: null, run: () => "info" } }).dispatcherFor(record());

		expect(dispatch("host.info", {})).toBe("info");
	});

	it("allows the write when the page is not read-only", () => {
		const host = createExtensionBridge({ "block.update": writing }, { isReadOnly: () => false });
		const dispatch = host.dispatcherFor(record(["block.update"]));

		expect(dispatch("block.update", {})).toBe("written");
	});

	// a bridge built without the option is the shape every existing test uses
	it("allows the write when no reader was injected", () => {
		const dispatch = bridge({ "block.update": writing }).dispatcherFor(record(["block.update"]));

		expect(dispatch("block.update", {})).toBe("written");
	});

	it("refuses the missing grant before it looks at read-only", () => {
		const dispatch = readOnlyBridge({ "block.update": writing }).dispatcherFor(record());

		expect(codeOf(() => dispatch("block.update", {}))).toBe("capability_required");
	});
});

describe("every live frame", () => {
	it("keeps each channel an extension connects with", () => {
		const host = bridge();
		const entry = channel();
		const panel = channel();
		host.connect("acme/icons", entry);
		host.connect("acme/icons", panel);

		expect(host.getChannels("acme/icons")).toEqual([entry, panel]);
	});

	it("drops a channel that disconnects, entry or not", () => {
		const host = bridge();
		const entry = channel();
		const panel = channel();
		host.connect("acme/icons", entry);
		host.connect("acme/icons", panel);
		host.disconnect("acme/icons", panel);

		expect(host.getChannels("acme/icons")).toEqual([entry]);
		expect(host.getEntryChannel("acme/icons")).toBe(entry);
	});

	it("answers with nothing for an extension that never connected", () => {
		expect(bridge().getChannels("acme/icons")).toEqual([]);
	});

	it("keeps one extension's frames out of another's", () => {
		const host = bridge();
		const mine = channel();
		host.connect("acme/icons", mine);
		host.connect("acme/other", channel());

		expect(host.getChannels("acme/icons")).toEqual([mine]);
	});

	// a copy, so a frame that disconnects while a push walks the list is safe
	it("hands back a copy, not the live set", () => {
		const host = bridge();
		const entry = channel();
		host.connect("acme/icons", entry);
		host.getChannels("acme/icons").pop();

		expect(host.getChannels("acme/icons")).toEqual([entry]);
	});

	it("forgets every frame when the extension is torn down", () => {
		const host = bridge();
		host.connect("acme/icons", channel());
		host.teardown("acme/icons");

		expect(host.getChannels("acme/icons")).toEqual([]);
	});
});

describe("the entry channel", () => {
	it("keeps the first channel an extension connects with", () => {
		const host = bridge();
		const entry = channel();
		host.connect("acme/icons", entry);

		expect(host.getEntryChannel("acme/icons")).toBe(entry);
	});

	it("does not let a later frame replace the entry channel", () => {
		const host = bridge();
		const entry = channel();
		host.connect("acme/icons", entry);
		host.connect("acme/icons", channel());

		expect(host.getEntryChannel("acme/icons")).toBe(entry);
	});

	it("forgets a channel that disconnects", () => {
		const host = bridge();
		const entry = channel();
		host.connect("acme/icons", entry);
		host.disconnect("acme/icons", entry);

		expect(host.getEntryChannel("acme/icons")).toBeUndefined();
	});

	it("ignores a disconnect from a channel it does not hold", () => {
		const host = bridge();
		const entry = channel();
		host.connect("acme/icons", entry);
		host.disconnect("acme/icons", channel());

		expect(host.getEntryChannel("acme/icons")).toBe(entry);
	});

	it("takes a new entry channel once the first has gone", () => {
		const host = bridge();
		const first = channel();
		host.connect("acme/icons", first);
		host.disconnect("acme/icons", first);

		const second = channel();
		host.connect("acme/icons", second);

		expect(host.getEntryChannel("acme/icons")).toBe(second);
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

		expect(host.getEntryChannel("acme/icons")).toBeUndefined();
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
