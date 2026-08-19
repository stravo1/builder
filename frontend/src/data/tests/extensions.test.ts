/**
 * What the editor runs is the enabled records plus the one dev extension, and
 * the two lists can name the same extension.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const resource = { data: null as unknown[] | null, fetch: vi.fn() };

vi.mock("frappe-ui", () => ({ createResource: () => resource }));

const installed = (name: string) => ({ name, label: name, entry: `/${name}.js`, capabilities: [] });

const loadModule = async () => {
	vi.resetModules();
	return {
		list: (await import("../extensions")).installedExtensions,
		dev: await import("@/extensions/devExtension"),
	};
};

let modules: Awaited<ReturnType<typeof loadModule>>;

describe("installedExtensions", () => {
	beforeEach(async () => {
		resource.data = null;
		modules = await loadModule();
	});

	it("is empty before the records arrive", () => {
		expect(modules.list.value).toEqual([]);
	});

	it("is the enabled records", () => {
		resource.data = [installed("acme/icons")];

		expect(modules.list.value.map((extension) => extension.name)).toEqual(["acme/icons"]);
	});

	it("appends the dev extension", () => {
		resource.data = [installed("acme/icons")];
		modules.dev.devExtension.value = installed("acme/other");

		expect(modules.list.value.map((extension) => extension.name)).toEqual(["acme/icons", "acme/other"]);
	});

	it("replaces the installed record of the same name", () => {
		resource.data = [installed("acme/icons"), installed("acme/other")];
		modules.dev.devExtension.value = {
			...installed("acme/icons"),
			entry: "http://localhost:5173/src/main.js",
		};

		expect(modules.list.value).toEqual([
			installed("acme/other"),
			{ ...installed("acme/icons"), entry: "http://localhost:5173/src/main.js" },
		]);
	});

	it("drops the dev extension when it stops, leaving the record behind", () => {
		resource.data = [installed("acme/icons")];
		modules.dev.devExtension.value = installed("acme/icons");
		modules.dev.stopDevExtension();

		expect(modules.list.value).toEqual([installed("acme/icons")]);
	});
});
