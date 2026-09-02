import { describe, expect, it } from "vitest";
import { validateManifest, validateVersions } from "../src/protocol.js";

const manifest = (values: Record<string, unknown> = {}) => ({
	v: 1,
	name: "acme/icons",
	label: "Icons",
	description: "Add and manage icons.",
	version: "1.2.0",
	entry: "main.js",
	capabilities: ["context.read"],
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
		["duplicate capability", { capabilities: ["context.read", "context.read"] }, /duplicates/],
		["unknown capability", { capabilities: ["network.access"] }, /unknown capability/],
	])("rejects %s", (_name, values, expected) => {
		expect(() => validateManifest(manifest(values))).toThrow(expected as RegExp);
	});
});

describe("versions.json", () => {
	it("maps the current version to its protocol", () => {
		expect(validateVersions({ "1.0.0": 1, "1.2.0": 1 }, manifest())).toEqual({
			"1.0.0": 1,
			"1.2.0": 1,
		});
	});

	it("rejects a missing current version", () => {
		expect(() => validateVersions({ "1.0.0": 1 }, manifest())).toThrow(/current version/);
	});

	it("rejects a root manifest older than a listed version", () => {
		expect(() => validateVersions({ "1.2.0": 1, "2.0.0": 1 }, manifest())).toThrow(/later than current/);
	});

	it("rejects invalid versions and protocol values", () => {
		expect(() => validateVersions({ latest: 1 }, manifest())).toThrow(/invalid SemVer/);
		expect(() => validateVersions({ "1.2.0": 0 }, manifest())).toThrow(/positive protocol integer/);
	});
});
