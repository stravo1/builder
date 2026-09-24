import { CAPABILITIES, type Capability } from "frappe-builder-extension-sdk/types";
import { describe, expect, it } from "vitest";
import { capabilityDetails, isSensitive, sortCapabilities } from "../capabilityClasses";

describe("capabilityDetails", () => {
	it("names every capability the bridge gates by", () => {
		// A capability added without wording would reach the panel as a bare key.
		expect(Object.keys(capabilityDetails).sort()).toEqual([...CAPABILITIES].sort());
	});

	it("gives every sensitive capability a reason to read", () => {
		const sensitive = CAPABILITIES.filter(isSensitive);

		expect(sensitive).toEqual(["token.write", "data.access", "schema.write"]);
		sensitive.forEach((capability) => expect(capabilityDetails[capability].warning).toBeTruthy());
	});
});

describe("sortCapabilities", () => {
	it("puts the widest reach last, whatever order the manifest used", () => {
		const asked: Capability[] = ["schema.write", "block.update", "context.read"];

		expect(sortCapabilities(asked)).toEqual(["context.read", "block.update", "schema.write"]);
	});

	it("answers with nothing when an extension asked for nothing", () => {
		expect(sortCapabilities([])).toEqual([]);
	});
});
