import { describe, expect, it, vi } from "vitest";
import { hostMethods } from "../hostMethods";
import type { InstalledExtension } from "frappe-builder-extension-sdk/types";

const extension: InstalledExtension = {
	name: "acme/icons",
	label: "Icons",
	entry: "/builder_extension_asset/acme-icons@1.0.0/main.js",
	capabilities: [],
};

describe("host.info", () => {
	it("answers with the Builder version and the protocol", () => {
		vi.stubGlobal("window", { builder_version: "2.14.0" });

		expect(hostMethods["host.info"].run(undefined, extension)).toEqual({
			version: "2.14.0",
			protocol: 1,
		});

		vi.unstubAllGlobals();
	});

	it("needs no capability, because it tells an extension nothing about the site", () => {
		expect(hostMethods["host.info"].needs).toBeNull();
	});
});
