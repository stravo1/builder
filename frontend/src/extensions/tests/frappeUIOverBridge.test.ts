import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChannelCallError } from "frappe-builder-extension-sdk/transport";
import call from "../../../../frappe-ui/src/utils/call";
import { useList } from "../../../../frappe-ui/src/data-fetching/useList/useList";
import { installFetchBridge } from "../../../extension-sdk/src/sdk/fetchBridge";

/**
 * The SDK's fetch bridge, read by frappe-ui itself.
 *
 * `fetchBridge.test.ts` checks the envelopes the bridge writes. This file checks
 * that frappe-ui reads them as Frappe's own, so a change on either side that
 * breaks an extension's data layer fails here. It lives on the host side because
 * the SDK folder is copied to a repo that has no frappe-ui checkout.
 *
 * frappe-ui is imported by source path: its package index pulls in `.vue` files,
 * which this test config does not compile.
 */
let answer: unknown = null;
let thrown: unknown = null;

vi.mock("../../../extension-sdk/src/sdk/connect", () => ({
	HOST_ORIGIN: "http://builder.test",
	getChannel: () => ({
		call: () => (thrown ? Promise.reject(thrown) : Promise.resolve(answer)),
	}),
}));

vi.stubGlobal("location", {
	href: "http://builder.test/builder_extension",
	hostname: "builder.test",
	origin: "http://builder.test",
});
// frappeRequest reads `window.location` for its site header
vi.stubGlobal("window", globalThis);

// both sides read `fetch` and `location` at request time, so installing after the imports is enough
installFetchBridge();

beforeEach(() => {
	answer = null;
	thrown = null;
});

describe("call()", () => {
	it("resolves with the answer", async () => {
		answer = { data: [{ name: "CON-1" }] };

		expect(await call("frappe.client.get_list", { doctype: "Contact" })).toEqual([{ name: "CON-1" }]);
	});

	it("rejects with an exc_type an onError can branch on", async () => {
		thrown = new ChannelCallError({ message: "Ask first.", code: "grant_required" });

		const error = await call("frappe.client.get_list", {}).catch((caught: unknown) => caught);

		expect(error).toMatchObject({ exc_type: "ExtensionGrantRequired", status: 403 });
		expect((error as { messages: string[] }).messages).toContain("Ask first.");
	});
});

describe("useList()", () => {
	it("reads the rows and the page flag", async () => {
		answer = { data: [{ name: "A" }], hasNextPage: true };

		const list = useList({ doctype: "Contact", fields: ["name"], immediate: false });
		await list.fetch();

		expect(list.data).toEqual([{ name: "A" }]);
		expect(list.hasNextPage).toBe(true);
	});
});
