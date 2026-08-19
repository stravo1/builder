import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Frappe call is mocked. What is under test is the validation in front of it
 * and the shape that travels, not the round trip.
 */
const submitted: Array<{ url: string; params: unknown }> = [];

vi.mock("frappe-ui", () => ({
	createResource: ({ url }: { url: string }) => ({
		submit: (params: unknown) => {
			submitted.push({ url, params });
			return Promise.resolve(null);
		},
	}),
}));

import { tokenMethods } from "../tokenMethods";
import type { InstalledExtension } from "../../types";

const record = (): InstalledExtension => ({
	name: "acme/material",
	label: "Material",
	entry: "/builder_extension_asset/acme-material@1.0.0/main.js",
	capabilities: ["token.write"],
});

const token = (over: Record<string, unknown> = {}) => ({
	key: "accent-0",
	token_name: "Accent 0",
	type: "Color",
	value: "#4285f4",
	...over,
});

const set = (tokens: unknown) => tokenMethods["tokens.set"].run({ tokens }, record());
const unset = (key: unknown) => tokenMethods["tokens.unset"].run({ key }, record());

const codeOf = (call: () => unknown) => {
	try {
		call();
	} catch (error) {
		return (error as { code?: string }).code;
	}
	return undefined;
};

beforeEach(() => (submitted.length = 0));

describe("the capability", () => {
	// token.write is a write capability, so the bridge also refuses it read-only
	it("gates both behind token.write", () => {
		expect(tokenMethods["tokens.set"].needs).toBe("token.write");
		expect(tokenMethods["tokens.unset"].needs).toBe("token.write");
	});
});

describe("tokens.set", () => {
	it("sends the extension and every token", () => {
		void set([token(), token({ key: "accent-1", token_name: "Accent 1" })]);

		expect(submitted).toHaveLength(1);
		expect(submitted[0].url).toBe("builder.extensions.set_extension_tokens");
		const params = submitted[0].params as { extension: string; tokens: unknown[] };
		expect(params.extension).toBe("acme/material");
		expect(params.tokens).toHaveLength(2);
	});

	it("carries the optional fields as null when the call omits them", () => {
		void set([token()]);

		const [sent] = (submitted[0].params as { tokens: Record<string, unknown>[] }).tokens;
		expect(sent).toEqual({
			key: "accent-0",
			token_name: "Accent 0",
			type: "Color",
			value: "#4285f4",
			dark_value: null,
			group: null,
		});
	});

	it("keeps a dark value and a group", () => {
		void set([token({ dark_value: "#8ab4f8", group: "Material Accent" })]);

		const [sent] = (submitted[0].params as { tokens: Record<string, unknown>[] }).tokens;
		expect(sent.dark_value).toBe("#8ab4f8");
		expect(sent.group).toBe("Material Accent");
	});

	it("refuses an empty list", () => {
		expect(codeOf(() => set([]))).toBe("invalid_params");
	});

	it("refuses anything that is not a list", () => {
		expect(codeOf(() => set(token()))).toBe("invalid_params");
	});

	// key is the whole reason a second call updates rather than duplicates (D6)
	it("refuses a token with no key", () => {
		expect(codeOf(() => set([token({ key: "" })]))).toBe("invalid_params");
	});

	it("refuses a token with no name or value", () => {
		expect(codeOf(() => set([token({ token_name: undefined })]))).toBe("invalid_params");
		expect(codeOf(() => set([token({ value: undefined })]))).toBe("invalid_params");
	});

	it("refuses a type the doctype does not have", () => {
		expect(codeOf(() => set([token({ type: "Shadow" })]))).toBe("invalid_params");
	});

	it("sends nothing when one token in the list is refused", () => {
		codeOf(() => set([token(), token({ key: "accent-1", type: "Shadow" })]));

		expect(submitted).toEqual([]);
	});
});

describe("tokens.unset", () => {
	it("sends the extension and the key", () => {
		void unset("accent-9");

		expect(submitted[0].url).toBe("builder.extensions.unset_extension_token");
		expect(submitted[0].params).toEqual({ extension: "acme/material", key: "accent-9" });
	});

	it("refuses a missing key", () => {
		expect(codeOf(() => unset(undefined))).toBe("invalid_params");
	});
});
