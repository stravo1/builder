import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The real registry, with the built-in panes left out: `Settings/index.ts`
 * registers 13 async SFCs at module load, and this suite runs in node with no
 * Vue plugin. What is under test is the descriptor this file builds.
 */
vi.mock("@/components/Settings", async () => ({
	settingsItems: (await import("@/utils/createRegistry")).createRegistry(),
}));
vi.mock("@/components/ExtensionFrame.vue", () => ({ default: { name: "ExtensionFrame" } }));

import ExtensionFrame from "@/components/ExtensionFrame.vue";
import { settingsItems } from "@/components/Settings";
import { toRaw } from "vue";
import { bridge } from "../../host/bridge";
import type { InstalledExtension } from "frappe-builder-extension-sdk/types";
import { settingsMethods } from "../settingsMethods";

const register = settingsMethods["settings.registerItem"].run;
const unregister = settingsMethods["settings.unregisterItem"].run;
const update = settingsMethods["settings.update"].run;

const sample: InstalledExtension = {
	name: "builder/sample",
	label: "Sample",
	entry: "/builder_extension_asset/builder-sample@1.0.0/main.js",
	capabilities: [],
};
const charts: InstalledExtension = { ...sample, name: "other/charts", entry: "/other.js" };

const page = (fields: Record<string, unknown> = {}) => ({
	name: "sample",
	label: "Sample",
	title: "Sample Extension",
	icon: "lucide-shapes",
	...fields,
});

const registered = (key: string) => settingsItems.all.value.find((item) => item.name === key);

afterEach(() => {
	[sample, charts].forEach((extension) => bridge.teardown(extension.name));
});

describe("registerItem", () => {
	it("registers under a name the host composes", () => {
		register(page(), sample);
		expect(registered("builder/sample:sample")).toBeTruthy();
	});

	it("puts an extension's page in the Global group", () => {
		register(page(), sample);
		expect(registered("builder/sample:sample")).toMatchObject({ group: "Global" });
	});

	it("keeps the sidebar entry and the heading apart", () => {
		register(page(), sample);
		expect(registered("builder/sample:sample")).toMatchObject({
			label: "Sample",
			title: "Sample Extension",
			usesRuntimeIcon: true,
		});
	});

	it("falls back to the label when no title is sent", () => {
		register(page({ title: undefined }), sample);
		expect(registered("builder/sample:sample")).toMatchObject({ title: "Sample" });
	});

	it("keeps the anchor the extension asked for", () => {
		register(page({ after: "global_code" }), sample);
		expect(registered("builder/sample:sample")).toMatchObject({ after: "global_code" });
	});

	it("refuses a registration with no icon", () => {
		expect(() => register(page({ icon: undefined }), sample)).toThrow(/icon/);
	});

	it("allows one page per extension", () => {
		register(page(), sample);
		expect(() => register(page({ name: "second" }), sample)).toThrow(/already registers/);
	});

	it("lets a second extension register its own", () => {
		register(page(), sample);
		register(page(), charts);
		expect(registered("other/charts:sample")).toBeTruthy();
	});
});

describe("the frame the pane mounts", () => {
	it("mounts an ExtensionFrame in the settings slot", () => {
		register(page(), sample);
		const item = registered("builder/sample:sample") as { component: unknown; props: () => object };

		expect(toRaw(item.component)).toBe(ExtensionFrame);
		expect(item.props()).toMatchObject({
			extension: "builder/sample",
			slot: "settings",
			entry: sample.entry,
		});
	});

	it("keeps one component identity, so KeepAlive holds the frame across updates", () => {
		register(page(), sample);
		const before = registered("builder/sample:sample")?.component;
		update({ name: "sample", patch: { label: "Renamed" } }, sample);

		expect(registered("builder/sample:sample")?.component).toBe(before);
	});
});

describe("update, unregister and teardown", () => {
	it("repaints the sidebar entry when the label changes", () => {
		register(page(), sample);
		update({ name: "sample", patch: { label: "Renamed" } }, sample);
		expect(registered("builder/sample:sample")).toMatchObject({ label: "Renamed" });
	});

	it("hides the page through the flag it pushes", () => {
		register(page(), sample);
		update({ name: "sample", patch: { visible: false } }, sample);
		expect(registered("builder/sample:sample")?.condition?.()).toBe(false);
	});

	it("refuses an update to a page nobody registered", () => {
		expect(() => update({ name: "ghost", patch: {} }, sample)).toThrow(/No settings item/);
	});

	it("drops the page on unregister", () => {
		register(page(), sample);
		unregister({ name: "sample" }, sample);
		expect(registered("builder/sample:sample")).toBeUndefined();
	});

	it("frees the one-per-extension slot after unregister", () => {
		register(page(), sample);
		unregister({ name: "sample" }, sample);
		expect(() => register(page({ name: "second" }), sample)).not.toThrow();
	});

	it("drops the page when the extension is torn down", () => {
		register(page(), sample);
		bridge.teardown(sample.name);
		expect(registered("builder/sample:sample")).toBeUndefined();
	});
});
