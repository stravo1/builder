/**
 * @vitest-environment jsdom
 *
 * What the editor runs is the enabled records plus the one dev extension, and
 * the two lists can name the same extension.
 *
 * `devExtension.ts` listens for `pagehide` at module scope, so importing the
 * list at all needs a window.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const resource = { data: null as unknown[] | null, fetch: vi.fn() };
const call = vi.fn();

vi.mock("frappe-ui", () => ({ call, createResource: () => resource }));

const installed = (name: string) => ({ name, label: name, entry: `/${name}.js`, capabilities: [] });
const development = (name: string) => ({
	...installed(name),
	version: "1.0.0",
	serverOrigin: "http://localhost:5173",
});

const loadModule = async () => {
	vi.resetModules();
	const data = await import("../extensions");
	return {
		data,
		list: data.installedExtensions,
		dev: await import("@/extensions/devExtension"),
	};
};

let modules: Awaited<ReturnType<typeof loadModule>>;

describe("installedExtensions", () => {
	beforeEach(async () => {
		resource.data = null;
		call.mockReset();
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
		modules.dev.devExtension.value = development("acme/other");

		expect(modules.list.value.map((extension) => extension.name)).toEqual(["acme/icons", "acme/other"]);
	});

	it("replaces the installed record of the same name", () => {
		resource.data = [installed("acme/icons"), installed("acme/other")];
		modules.dev.devExtension.value = {
			...development("acme/icons"),
			entry: "http://localhost:5173/src/main.js",
		};

		expect(modules.list.value).toEqual([
			installed("acme/other"),
			{ ...development("acme/icons"), entry: "http://localhost:5173/src/main.js" },
		]);
	});

	it("drops the dev extension when it stops, leaving the record behind", () => {
		resource.data = [installed("acme/icons")];
		modules.dev.devExtension.value = development("acme/icons");
		modules.dev.stopDevExtension();

		expect(modules.list.value).toEqual([installed("acme/icons")]);
	});
});

describe("installationDetails", () => {
	beforeEach(async () => {
		resource.data = null;
		call.mockReset();
		modules = await loadModule();
	});

	const recorded = {
		name: "acme/icons",
		label: "the label the record was written with",
		version: "0.0.0-dev",
		readme: undefined,
		requested_capabilities: ["block.update", "data.access", "schema.write"],
		granted_capabilities: ["block.update", "data.access", "schema.write"],
		grants: [{ document_type: "ToDo", can_read: 1, can_write: 0, can_delete: 0, denied: 0 }],
		installed_on: "2026-09-03 10:00:00",
	};

	const running = () =>
		Object.assign(development("acme/icons"), {
			label: "Icons",
			description: "Add and manage icons.",
			version: "1.2.0",
			serverOrigin: "http://localhost:5173",
			readme: "# Icons\n\nDevelopment documentation.",
			capabilities: ["block.update"],
		});

	it("lets the live descriptor answer for what the manifest declares", async () => {
		call.mockResolvedValue(recorded);
		modules.dev.devExtension.value = running();

		await expect(modules.data.installationDetails("acme/icons")).resolves.toMatchObject({
			label: "Icons",
			version: "1.2.0",
			development_server: "http://localhost:5173",
			is_development: true,
			readme: "# Icons\n\nDevelopment documentation.",
			requested_capabilities: ["block.update"],
			granted_capabilities: ["block.update"],
		});
	});

	/**
	 * The record grants every capability, so reading it would tell a developer
	 * their extension may do what no gate would let it do.
	 */
	it("never lets the record widen what the manifest asked for", async () => {
		call.mockResolvedValue(recorded);
		modules.dev.devExtension.value = running();

		const details = await modules.data.installationDetails("acme/icons");

		expect(details.granted_capabilities).toEqual(["block.update"]);
		expect(details.requested_capabilities).toEqual(["block.update"]);
	});

	it("keeps the grants, which only the record holds", async () => {
		call.mockResolvedValue(recorded);
		modules.dev.devExtension.value = running();

		const details = await modules.data.installationDetails("acme/icons");

		expect(details.grants).toEqual(recorded.grants);
		expect(details.installed_on).toBe("2026-09-03 10:00:00");
	});

	it("answers with the record untouched for an installed extension", async () => {
		call.mockResolvedValue(recorded);

		await expect(modules.data.installationDetails("acme/icons")).resolves.toEqual(recorded);
	});
});
