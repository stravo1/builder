import { beforeEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";

/**
 * The Frappe call is mocked. Under test is the gate, the validation in front of
 * it, the names that travel, and what comes back — not the query.
 */
type Call = { url: string; params: Record<string, unknown> };

const submitted: Call[] = [];
let answer: unknown = [];
let thrown: unknown = null;

vi.mock("frappe-ui", () => ({
	createResource: ({ url }: { url: string }) => ({
		submit: (params: Record<string, unknown>) => {
			submitted.push({ url, params });
			if (thrown) return Promise.reject(thrown);
			// reactive, because createResource keeps its data reactive and a Vue
			// proxy cannot cross postMessage
			return Promise.resolve(reactive(answer as object));
		},
	}),
}));

import { documentMethods } from "../documentMethods";
import type { InstalledExtension } from "frappe-builder-extension-sdk/types";

const record = (): InstalledExtension => ({
	name: "acme/crm",
	label: "CRM",
	entry: "/builder_extension_asset/acme-crm@1.0.0/main.js",
	capabilities: ["data.access"],
});

const run = (method: string, params: unknown) =>
	documentMethods[method].run(params, record()) as Promise<unknown>;

const last = () => submitted[submitted.length - 1];

const codeOf = async (call: () => unknown) => {
	try {
		await call();
	} catch (error) {
		return (error as { code?: string }).code;
	}
	return undefined;
};

beforeEach(() => {
	submitted.length = 0;
	answer = [];
	thrown = null;
});

describe("the capability", () => {
	it("gates every method behind data.access", () => {
		for (const method of Object.values(documentMethods)) {
			expect(method.needs).toBe("data.access");
		}
	});

	it("covers the six verbs and nothing else", () => {
		expect(Object.keys(documentMethods).sort()).toEqual([
			"data.delete",
			"data.getCount",
			"data.getDoc",
			"data.getList",
			"data.insert",
			"data.update",
		]);
	});
});

describe("what a frame sent", () => {
	it("refuses a missing doctype", async () => {
		expect(await codeOf(() => run("data.getList", {}))).toBe("invalid_params");
	});

	it("refuses a missing name", async () => {
		expect(await codeOf(() => run("data.getDoc", { doctype: "Contact" }))).toBe("invalid_params");
	});

	it("refuses a doc that is not an object", async () => {
		expect(await codeOf(() => run("data.insert", { doctype: "Contact", doc: "hello" }))).toBe(
			"invalid_params",
		);
	});

	it("refuses a doc that is a list", async () => {
		expect(await codeOf(() => run("data.insert", { doctype: "Contact", doc: [{}] }))).toBe(
			"invalid_params",
		);
	});

	it("refuses fields that are not names", async () => {
		expect(await codeOf(() => run("data.getList", { doctype: "Contact", fields: [1] }))).toBe(
			"invalid_params",
		);
	});

	it("refuses a filter that is a bare value", async () => {
		expect(await codeOf(() => run("data.getList", { doctype: "Contact", filters: "open" }))).toBe(
			"invalid_params",
		);
	});

	it("refuses a page length that is not a whole number", async () => {
		expect(await codeOf(() => run("data.getList", { doctype: "Contact", pageLength: 2.5 }))).toBe(
			"invalid_params",
		);
	});
});

describe("what travels to the server", () => {
	it("names the calling extension, never one the frame sent", async () => {
		await run("data.getList", { doctype: "Contact", extension: "acme/other" });

		expect(last().params.extension).toBe("acme/crm");
	});

	it("translates the frontend option names to Frappe's", async () => {
		await run("data.getList", {
			doctype: "Contact",
			fields: ["name"],
			filters: { status: "Open" },
			orderBy: "modified desc",
			start: 20,
			pageLength: 50,
		});

		expect(last().params).toMatchObject({
			doctype: "Contact",
			fields: ["name"],
			filters: { status: "Open" },
			order_by: "modified desc",
			limit_start: 20,
			limit_page_length: 50,
		});
	});

	it("leaves the page size out when the frame named none, so the server decides", async () => {
		await run("data.getList", { doctype: "Contact" });

		expect(last().params.limit_page_length).toBeUndefined();
	});

	it("takes Frappe's list form of a filter unchanged", async () => {
		await run("data.getList", { doctype: "Contact", filters: [["status", "!=", "Open"]] });

		expect(last().params.filters).toEqual([["status", "!=", "Open"]]);
	});

	it("sends a patch as the doc", async () => {
		await run("data.update", { doctype: "Contact", name: "CT-1", doc: { first_name: "Ada" } });

		expect(last()).toMatchObject({
			url: "builder.extensions.data.update_doc",
			params: { doctype: "Contact", name: "CT-1", doc: { first_name: "Ada" } },
		});
	});

	it("reaches the right method per verb", async () => {
		await run("data.getCount", { doctype: "Contact" });
		expect(last().url).toBe("builder.extensions.data.get_count");

		await run("data.getDoc", { doctype: "Contact", name: "CT-1" });
		expect(last().url).toBe("builder.extensions.data.get_doc");

		await run("data.insert", { doctype: "Contact", doc: {} });
		expect(last().url).toBe("builder.extensions.data.insert_doc");

		await run("data.delete", { doctype: "Contact", name: "CT-1" });
		expect(last().url).toBe("builder.extensions.data.delete_doc");
	});
});

describe("what travels back to the frame", () => {
	it("is a plain value a port can carry", async () => {
		answer = [{ name: "CT-1", first_name: "Ada" }];

		const rows = await run("data.getList", { doctype: "Contact" });

		expect(() => structuredClone(rows)).not.toThrow();
		expect(rows).toEqual([{ name: "CT-1", first_name: "Ada" }]);
	});

	it("carries a nested document through unchanged", async () => {
		answer = { name: "CT-1", email_ids: [{ email_id: "ada@example.com" }] };

		const doc = (await run("data.getDoc", { doctype: "Contact", name: "CT-1" })) as {
			email_ids: unknown[];
		};

		expect(() => structuredClone(doc)).not.toThrow();
		expect(doc.email_ids).toEqual([{ email_id: "ada@example.com" }]);
	});
});

describe("a refusal from the server", () => {
	it("becomes grant_required when no grant covers the doctype", async () => {
		thrown = { exc_type: "ExtensionGrantRequired", messages: ["not granted read"] };

		expect(await codeOf(() => run("data.getList", { doctype: "Contact" }))).toBe("grant_required");
	});

	it("carries the server's own words, so the frame can show them", async () => {
		thrown = { exc_type: "ExtensionGrantRequired", messages: ["not granted read"] };

		try {
			await run("data.getList", { doctype: "Contact" });
		} catch (error) {
			expect((error as Error).message).toBe("not granted read");
		}
	});

	it("stays server_error for anything else, because asking again will not help", async () => {
		thrown = { exc_type: "PermissionError", messages: ["No permission for Contact"] };

		expect(await codeOf(() => run("data.getList", { doctype: "Contact" }))).toBe("server_error");
	});

	it("still refuses when the server sent no message at all", async () => {
		thrown = new Error("");

		expect(await codeOf(() => run("data.getList", { doctype: "Contact" }))).toBe("server_error");
	});
});
