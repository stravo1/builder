import { beforeEach, describe, expect, it, vi } from "vitest";
import { connectExtension, disconnectExtension, dispatch, entryChannel } from "./index";
import { createPortChannel } from "./transport/createPortChannel";

const channel = () => createPortChannel(new MessageChannel().port1);

describe("the extension singleton", () => {
	beforeEach(() => {
		disconnectExtension("acme/icons", entryChannel("acme/icons")!);
	});

	it("keeps the first channel an extension connects with", () => {
		const entry = channel();
		connectExtension("acme/icons", entry);

		expect(entryChannel("acme/icons")).toBe(entry);
	});

	it("does not let a later frame replace the entry channel", () => {
		const entry = channel();
		connectExtension("acme/icons", entry);
		connectExtension("acme/icons", channel());

		expect(entryChannel("acme/icons")).toBe(entry);
	});

	it("forgets a channel that disconnects", () => {
		const entry = channel();
		connectExtension("acme/icons", entry);
		disconnectExtension("acme/icons", entry);

		expect(entryChannel("acme/icons")).toBeUndefined();
	});

	it("ignores a disconnect from a channel it does not hold", () => {
		const entry = channel();
		connectExtension("acme/icons", entry);
		disconnectExtension("acme/icons", channel());

		expect(entryChannel("acme/icons")).toBe(entry);
	});
});

describe("dispatch", () => {
	it("answers host.info with the Builder version and the protocol", () => {
		vi.stubGlobal("window", { builder_version: "2.14.0" });

		expect(dispatch("host.info", undefined)).toEqual({ version: "2.14.0", protocol: 1 });

		vi.unstubAllGlobals();
	});

	it("refuses a method it does not know", () => {
		expect(() => dispatch("block.update", {})).toThrow(/Unknown method/);
	});
});
