import { describe, expect, it } from "vitest";
import { readCapabilities, validateManifest } from "../src/protocol.js";

const manifest = (values: Record<string, unknown> = {}) => ({
	v: 1,
	name: "acme/icons",
	label: "Icons",
	description: "Add and manage icons.",
	version: "1.2.0",
	entry: "main.js",
	capabilities: ["page.edit"],
	...values,
});

describe("the version 1 manifest", () => {
	it("accepts the exact public contract", () => {
		expect(validateManifest(manifest())).toEqual(manifest());
	});

	it.each([
		["missing fields", { description: undefined }, /description.*plain text/],
		["unknown fields", { network: ["example.com"] }, /unknown field "network"/],
		["protocol", { v: 2 }, /"v" must equal 1/],
		["name", { name: "Acme/icons" }, /publisher\/name/],
		["label", { label: "<b>Icons<\/b>" }, /plain text/],
		["version", { version: "v1.2.0" }, /SemVer/],
		["entry", { entry: "src/main.js" }, /must equal "main.js"/],
		["icon", { icon: "images/icon.svg" }, /root SVG/],
		["duplicate capability", { capabilities: ["page.edit", "page.edit"] }, /duplicates/],
		["unknown capability", { capabilities: ["network.access"] }, /unknown capability/],
	])("rejects %s", (_name, values, expected) => {
		expect(() => validateManifest(manifest(values))).toThrow(expected as RegExp);
	});
});

describe("readCapabilities", () => {
	it("maps the two block keys to page.edit, once", () => {
		expect(readCapabilities(["block.update", "block.insert"])).toEqual(["page.edit"]);
	});

	it("drops a read or a window, which needs no permission now", () => {
		expect(readCapabilities(["context.read", "ui.popover", "data.access"])).toEqual(["data.access"]);
	});

	it("keeps today's keys in the order asked", () => {
		expect(readCapabilities(["method.call", "page.write"])).toEqual(["method.call", "page.write"]);
	});
});

describe("a published manifest with legacy keys", () => {
	it("still validates, so it keeps packaging", () => {
		expect(() =>
			validateManifest(manifest({ capabilities: ["block.update", "context.read"] })),
		).not.toThrow();
	});
});
