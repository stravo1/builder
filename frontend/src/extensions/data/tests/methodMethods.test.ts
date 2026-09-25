import { beforeEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";

/**
 * The Frappe call is mocked. Under test is when the dialog opens, what it shows,
 * and which scope reaches the record — not the rule, which the server owns.
 */
type Call = { url: string; params: Record<string, unknown> };

const submitted: Call[] = [];
let answer = "not asked";

vi.mock("frappe-ui", () => ({
	createResource: ({ url }: { url: string }) => ({
		submit: (params: Record<string, unknown>) => {
			submitted.push({ url, params });
			if (url.endsWith("record_method_grant")) answer = params.denied ? "denied" : "allowed";
			return Promise.resolve(
				reactive({
					method: params.method,
					app: "acme",
					app_title: "Acme",
					description: "Exports responses.",
					answer,
				}),
			);
		},
	}),
}));

vi.mock("../../host/bridge", () => ({ bridge: { registerTeardown: () => undefined } }));

import { answerPrompt, pendingPrompt } from "../grants";
import { methodMethods } from "../methodMethods";
import type { InstalledExtension } from "frappe-builder-extension-sdk/types";

const record = (): InstalledExtension => ({
	name: "acme/forms",
	label: "Forms",
	capabilities: ["method.call"],
});

const request = (method: unknown) =>
	methodMethods["methods.requestAccess"].run({ method }, record()) as Promise<Record<string, unknown>>;

/** Lets the pending read settle so the prompt is on screen. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

const recorded = () => submitted.find((call) => call.url.endsWith("record_method_grant"));

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
	answer = "not asked";
	if (pendingPrompt.value) answerPrompt(false);
	submitted.length = 0;
});

describe("the capability", () => {
	it("gates both behind method.call", () => {
		expect(methodMethods["methods.requestAccess"].needs).toBe("method.call");
		expect(methodMethods["methods.getAccess"].needs).toBe("method.call");
	});
});

describe("requestAccess", () => {
	it("refuses a missing method name before anything travels", async () => {
		expect(await codeOf(() => request(""))).toBe("invalid_params");
		expect(submitted).toEqual([]);
	});

	it("asks with the method, its app and what it says it does", async () => {
		const asked = request("acme.api.export");
		await settled();

		expect(pendingPrompt.value).toMatchObject({
			kind: "method",
			subject: "acme.api.export",
			app: "Acme",
			description: "Exports responses.",
		});
		answerPrompt(true);
		await asked;
	});

	it("records the method alone by default", async () => {
		const asked = request("acme.api.export");
		await settled();
		answerPrompt(true);

		expect(await asked).toMatchObject({ answer: "allowed" });
		expect(recorded()?.params).toMatchObject({ method: "acme.api.export", scope: "method", denied: false });
	});

	it("records the whole app when the user chose it", async () => {
		const asked = request("acme.api.export");
		await settled();
		answerPrompt(true, "app");
		await asked;

		expect(recorded()?.params).toMatchObject({ scope: "app", denied: false });
	});

	it("records a denial", async () => {
		const asked = request("acme.api.export");
		await settled();
		answerPrompt(false);

		expect(await asked).toMatchObject({ answer: "denied" });
		expect(recorded()?.params).toMatchObject({ denied: true });
	});

	it("does not ask again about a method already answered", async () => {
		answer = "denied";

		expect(await request("acme.api.export")).toMatchObject({ answer: "denied" });
		expect(pendingPrompt.value).toBeNull();
		expect(recorded()).toBeUndefined();
	});
});
