import { beforeEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";

/**
 * The channel is mocked. Under test is the routing table: which `data.*` method
 * each frappe-ui URL reaches, and what a URL with no route does.
 *
 * This file is the adapter's whole contract. It decides nothing about access —
 * every route lands on a host method that the grant still gates.
 */
const calls: Array<{ method: string; params: unknown }> = [];
let answer: unknown = null;

vi.mock("../connect", () => ({
	getChannel: () => ({
		call: (method: string, params: unknown) => {
			calls.push({ method, params });
			return Promise.resolve(answer);
		},
	}),
}));

vi.mock("../slots", () => ({
	getActiveSlot: () => "main",
	registerSlot: () => undefined,
}));

vi.mock("../actions", () => ({
	holdAction: () => undefined,
	releaseAction: () => undefined,
}));

import { resourceFetcher } from "../resourceFetcher";

const last = () => calls[calls.length - 1];

const codeOf = async (run: () => unknown) => {
	try {
		await run();
	} catch (error) {
		return (error as { code?: string }).code;
	}
	return undefined;
};

beforeEach(() => {
	calls.length = 0;
	answer = null;
});

describe("a URL with no route", () => {
	it("is refused, never forwarded", async () => {
		expect(await codeOf(() => resourceFetcher({ url: "myapp.api.sync" }))).toBe(
			"unsupported_request",
		);
		expect(calls).toHaveLength(0);
	});

	it("is refused when there is no url at all", async () => {
		expect(await codeOf(() => resourceFetcher({}))).toBe("unsupported_request");
	});

	it("names what a resource may ask for", async () => {
		try {
			resourceFetcher({ url: "run_doc_method" });
		} catch (error) {
			expect((error as Error).message).toContain("frappe.client.get_list");
		}
	});
});

describe("frappe.client.get_list", () => {
	/** Exactly what `listResource.js:57` sends on every fetch. */
	const params = {
		doctype: "Contact",
		fields: ["name"],
		filters: { status: "Open" },
		or_filters: undefined,
		order_by: "modified desc",
		start: 0,
		limit: 20,
		limit_start: 0,
		limit_page_length: 20,
		group_by: undefined,
		parent: undefined,
		debug: 0,
	};

	it("reaches data.getList", async () => {
		await resourceFetcher({ url: "frappe.client.get_list", params });

		expect(last().method).toBe("data.getList");
	});

	it("translates Frappe's names back to the SDK's", async () => {
		await resourceFetcher({ url: "frappe.client.get_list", params });

		expect(last().params).toMatchObject({
			doctype: "Contact",
			fields: ["name"],
			filters: { status: "Open" },
			orderBy: "modified desc",
			start: 0,
			pageLength: 20,
		});
	});

	it("carries or_filters and group_by, which a list resource always sends", async () => {
		await resourceFetcher({
			url: "frappe.client.get_list",
			params: { ...params, or_filters: { status: "Closed" }, group_by: "status" },
		});

		expect(last().params).toMatchObject({
			orFilters: { status: "Closed" },
			groupBy: "status",
		});
	});

	it("drops debug rather than sending a field the host refuses", async () => {
		await resourceFetcher({ url: "frappe.client.get_list", params });

		expect(last().params).not.toHaveProperty("debug");
	});

	it("refuses a child table, whose permission belongs to its parent", async () => {
		expect(
			await codeOf(() =>
				resourceFetcher({ url: "frappe.client.get_list", params: { ...params, parent: "Contact" } }),
			),
		).toBe("unsupported_request");
	});

	it("refuses a list with no doctype", async () => {
		expect(await codeOf(() => resourceFetcher({ url: "frappe.client.get_list", params: {} }))).toBe(
			"invalid_params",
		);
	});
});

describe("the document verbs", () => {
	it("routes get to data.getDoc", async () => {
		await resourceFetcher({ url: "frappe.client.get", params: { doctype: "Contact", name: "CT-1" } });

		expect(last()).toEqual({
			method: "data.getDoc",
			params: { doctype: "Contact", name: "CT-1" },
		});
	});

	it("routes get_count to data.getCount", async () => {
		await resourceFetcher({
			url: "frappe.client.get_count",
			params: { doctype: "Contact", filters: { status: "Open" } },
		});

		expect(last()).toEqual({
			method: "data.getCount",
			params: { doctype: "Contact", filters: { status: "Open" } },
		});
	});

	/** An insert carries its doctype inside the document, not beside it. */
	it("lifts the doctype out of the document", async () => {
		await resourceFetcher({
			url: "frappe.client.insert",
			params: { doc: { doctype: "Contact", first_name: "Ada" } },
		});

		expect(last().method).toBe("data.insert");
		expect(last().params).toMatchObject({ doctype: "Contact" });
	});

	it("refuses an insert whose document names no doctype", async () => {
		expect(
			await codeOf(() => resourceFetcher({ url: "frappe.client.insert", params: { doc: {} } })),
		).toBe("invalid_params");
	});

	it("reads set_value's patch, which every frappe-ui path sends as an object", async () => {
		await resourceFetcher({
			url: "frappe.client.set_value",
			params: { doctype: "Contact", name: "CT-1", fieldname: { first_name: "Grace" } },
		});

		expect(last()).toEqual({
			method: "data.update",
			params: { doctype: "Contact", name: "CT-1", doc: { first_name: "Grace" } },
		});
	});

	it("also reads set_value's one-field form", async () => {
		await resourceFetcher({
			url: "frappe.client.set_value",
			params: { doctype: "Contact", name: "CT-1", fieldname: "first_name", value: "Grace" },
		});

		expect(last().params).toMatchObject({ doc: { first_name: "Grace" } });
	});

	it("routes delete to data.delete", async () => {
		await resourceFetcher({
			url: "frappe.client.delete",
			params: { doctype: "Contact", name: "CT-1" },
		});

		expect(last().method).toBe("data.delete");
	});
});

describe("what leaves the frame", () => {
	/**
	 * A list resource holds its options in a `reactive`, so `makeParams` hands the
	 * fetcher proxies. A proxy cannot cross a port.
	 */
	it("is plain, whatever a reactive resource handed over", async () => {
		await resourceFetcher({
			url: "frappe.client.get_list",
			params: reactive({ doctype: "Contact", fields: ["name"], filters: { status: "Open" } }),
		});

		expect(() => structuredClone(last().params)).not.toThrow();
	});

	it("flattens a reactive document on the way to insert", async () => {
		await resourceFetcher({
			url: "frappe.client.insert",
			params: reactive({ doc: { doctype: "Contact", first_name: "Ada" } }),
		});

		expect(() => structuredClone(last().params)).not.toThrow();
	});
});

describe("the answer", () => {
	it("is whatever the host sent, so a resource stores it unchanged", async () => {
		answer = [{ name: "CT-1" }];

		const rows = await resourceFetcher({
			url: "frappe.client.get_list",
			params: { doctype: "Contact" },
		});

		expect(rows).toEqual([{ name: "CT-1" }]);
	});
});
