import { beforeEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";

/**
 * The Frappe call is mocked. Under test is the gate, the validation, and the
 * confirmation that stands between an extension and a new or dropped table.
 */
const submitted: Array<{ url: string; params: Record<string, unknown> }> = [];
let answer: unknown = {};

vi.mock("frappe-ui", () => ({
	createResource: ({ url }: { url: string }) => ({
		submit: (params: Record<string, unknown>) => {
			submitted.push({ url, params });
			return Promise.resolve(reactive(answer as object));
		},
	}),
}));

let allowed = true;
const asked: Array<{ doctype: string; act: string }> = [];

vi.mock("../grants", () => ({
	confirmSchema: (_extension: unknown, doctype: string, act: string) => {
		asked.push({ doctype, act });
		return Promise.resolve(allowed);
	},
}));

import { schemaMethods } from "../schemaMethods";
import type { InstalledExtension } from "frappe-builder-extension-sdk/types";

const record = (): InstalledExtension => ({
	name: "acme/schema",
	label: "Schema",
	entry: "/builder_extension_asset/acme-schema@1.0.0/main.js",
	capabilities: ["schema.write"],
});

const run = (method: string, params: unknown) =>
	schemaMethods[method].run(params, record()) as Promise<unknown>;

const last = () => submitted[submitted.length - 1];

const codeOf = async (call: () => unknown) => {
	try {
		await call();
	} catch (error) {
		return (error as { code?: string }).code;
	}
	return undefined;
};

const FIELDS = [{ fieldname: "title", fieldtype: "Data" }];

beforeEach(() => {
	submitted.length = 0;
	asked.length = 0;
	allowed = true;
	answer = {};
});

describe("the capability", () => {
	it("gates every method behind schema.write", () => {
		for (const method of Object.values(schemaMethods)) {
			expect(method.needs).toBe("schema.write");
		}
	});

	it("covers the five verbs and nothing else", () => {
		expect(Object.keys(schemaMethods).sort()).toEqual([
			"schema.createDoctype",
			"schema.deleteDoctype",
			"schema.getDoctype",
			"schema.listDoctypes",
			"schema.updateDoctype",
		]);
	});
});

describe("what a frame sent", () => {
	it("refuses a create with no doctype", async () => {
		expect(await codeOf(() => run("schema.createDoctype", { fields: FIELDS }))).toBe(
			"invalid_params",
		);
	});

	it("refuses a doctype with no fields", async () => {
		expect(await codeOf(() => run("schema.createDoctype", { doctype: "Widget", fields: [] }))).toBe(
			"invalid_params",
		);
	});

	it("refuses a field that is not an object", async () => {
		expect(
			await codeOf(() => run("schema.createDoctype", { doctype: "Widget", fields: ["title"] })),
		).toBe("invalid_params");
	});

	it("refuses a naming rule it does not know", async () => {
		expect(
			await codeOf(() =>
				run("schema.createDoctype", { doctype: "Widget", fields: FIELDS, naming: "sequential" }),
			),
		).toBe("invalid_params");
	});
});

describe("the confirmation", () => {
	it("asks before creating, and names the doctype", async () => {
		await run("schema.createDoctype", { doctype: "Widget", fields: FIELDS });

		expect(asked).toEqual([{ doctype: "Widget", act: "create" }]);
	});

	it("writes nothing when the user says no", async () => {
		allowed = false;

		expect(await codeOf(() => run("schema.createDoctype", { doctype: "Widget", fields: FIELDS }))).toBe(
			"refused",
		);
		expect(submitted).toHaveLength(0);
	});

	it("asks before dropping a doctype", async () => {
		await run("schema.deleteDoctype", { doctype: "Widget" });

		expect(asked).toEqual([{ doctype: "Widget", act: "delete" }]);
	});

	it("drops nothing when the user says no", async () => {
		allowed = false;

		expect(await codeOf(() => run("schema.deleteDoctype", { doctype: "Widget" }))).toBe("refused");
		expect(submitted).toHaveLength(0);
	});

	/** Adding a field to a table this extension already owns is not a new decision. */
	it("does not ask before updating a doctype", async () => {
		await run("schema.updateDoctype", { doctype: "Widget", fields: FIELDS });

		expect(asked).toHaveLength(0);
		expect(last().url).toBe("builder.extensions.schema.update_doctype");
	});

	it("does not ask to read one", async () => {
		await run("schema.getDoctype", { doctype: "Widget" });

		expect(asked).toHaveLength(0);
	});
});

describe("what travels to the server", () => {
	it("names the calling extension, never one the frame sent", async () => {
		await run("schema.createDoctype", {
			doctype: "Widget",
			fields: FIELDS,
			extension: "acme/other",
		});

		expect(last().params.extension).toBe("acme/schema");
	});

	it("defaults the naming to a hash, so a doctype needs no user input", async () => {
		await run("schema.createDoctype", { doctype: "Widget", fields: FIELDS });

		expect(last().params).toMatchObject({ naming: "hash", istable: false });
	});

	it("carries the naming and istable a frame chose", async () => {
		await run("schema.createDoctype", {
			doctype: "Widget",
			fields: FIELDS,
			naming: "prompt",
			istable: true,
		});

		expect(last().params).toMatchObject({ naming: "prompt", istable: true });
	});

	it("reaches the right method per verb", async () => {
		await run("schema.getDoctype", { doctype: "Widget" });
		expect(last().url).toBe("builder.extensions.schema.get_doctype");

		await run("schema.listDoctypes", {});
		expect(last().url).toBe("builder.extensions.schema.list_doctypes");
	});
});

describe("what travels back to the frame", () => {
	it("is a plain value a port can carry", async () => {
		answer = { doctype: "Widget", fields: [{ fieldname: "title" }] };

		const described = await run("schema.getDoctype", { doctype: "Widget" });

		expect(() => structuredClone(described)).not.toThrow();
	});
});
