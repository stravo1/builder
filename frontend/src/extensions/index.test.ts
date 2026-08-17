import { describe, expect, it, vi } from "vitest";
import { dispatcherFor } from "./index";
import type { InstalledExtension } from "./types";

/** The bridge itself is covered in host/extensionBridge.test.ts. This is the table. */
const extension: InstalledExtension = {
	name: "acme/icons",
	label: "Icons",
	entry: "/builder_extension_asset/acme-icons@1.0.0/main.js",
	capabilities: [],
};

describe("the host method table", () => {
	it("answers host.info with the Builder version and the protocol", () => {
		vi.stubGlobal("window", { builder_version: "2.14.0" });

		expect(dispatcherFor(extension)("host.info", undefined)).toEqual({ version: "2.14.0", protocol: 1 });

		vi.unstubAllGlobals();
	});

	it("refuses a method no milestone has added yet", () => {
		expect(() => dispatcherFor(extension)("block.update", {})).toThrow(/Unknown method/);
	});
});
