import { createRegistry } from "@/utils/createRegistry";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The real registry, with the built-in tabs left out: `LeftPanelTabs/index.ts`
 * imports four SFCs and resolves a store at module load, and this suite runs in
 * node with neither a Vue plugin nor pinia. What is under test is the descriptor
 * this file builds, so the registry underneath must be the real one.
 */
vi.mock("@/components/LeftPanelTabs", async () => ({
	leftPanelTabs: (await import("@/utils/createRegistry")).createRegistry(),
}));
vi.mock("@/components/ExtensionFrame.vue", () => ({ default: { name: "ExtensionFrame" } }));

// hoisted with the mock that reads it, because vi.mock runs before the file body
const context = vi.hoisted(() => ({
	value: {
		selection: { count: 1, isText: false, isImage: false },
		breakpoint: "desktop",
		readOnly: false,
	},
}));
vi.mock("../../editor/editorContext", () => ({ editorContext: context }));

import ExtensionFrame from "@/components/ExtensionFrame.vue";
import { leftPanelTabs } from "@/components/LeftPanelTabs";
import { bridge } from "../../host/bridge";
import type { InstalledExtension } from "../../types";
import { leftPanelMethods } from "../leftPanelMethods";

const register = leftPanelMethods["leftPanel.register"].run;
const unregister = leftPanelMethods["leftPanel.unregister"].run;
const update = leftPanelMethods["leftPanel.update"].run;

const icons: InstalledExtension = {
	name: "acme/icons",
	label: "Icons",
	entry: "/builder_extension_asset/acme-icons@1.0.0/main.js",
	capabilities: [],
};
const charts: InstalledExtension = { ...icons, name: "other/charts", entry: "/other.js" };

const tab = (name = "icons", fields: Record<string, unknown> = {}) => ({
	name,
	label: "Icons",
	icon: "lucide-shapes",
	...fields,
});

const registered = (key: string) => leftPanelTabs.all.value.find((item) => item.name === key);

beforeEach(() => {
	context.value.readOnly = false;
});

afterEach(() => {
	[icons, charts].forEach((extension) => bridge.teardown(extension.name));
});

describe("register", () => {
	it("names the item for the extension that owns it", () => {
		register(tab(), icons);

		expect(registered("acme/icons:icons")).toBeDefined();
	});

	it("keeps two extensions apart when they pick the same name", () => {
		register(tab(), icons);
		register(tab(), charts);

		expect(registered("acme/icons:icons")).toBeDefined();
		expect(registered("other/charts:icons")).toBeDefined();
	});

	it("refuses a second tab from one extension", () => {
		register(tab(), icons);

		expect(() => register(tab("more"), icons)).toThrow(/already registers/);
	});

	it("takes the same tab again, because a reloaded frame registers it again", () => {
		register(tab("panel"), icons);

		expect(() => register(tab("panel"), icons)).not.toThrow();
	});

	it("carries the label, the icon and the anchor", () => {
		register(tab("icons", { after: "Assets" }), icons);

		expect(registered("acme/icons:icons")).toMatchObject({
			label: "Icons",
			icon: "lucide-shapes",
			after: "Assets",
			lazy: true,
		});
	});

	it("mounts an extension frame in the panel slot", () => {
		register(tab(), icons);
		const item = registered("acme/icons:icons")!;

		// the registry deep-reactifies what it stores, so this is a proxy of the component
		expect(item.component).toStrictEqual(ExtensionFrame);
		expect(item.props!()).toMatchObject({
			extension: "acme/icons",
			slot: "panel",
			entry: icons.entry,
		});
	});

	it("refuses a registration with no label", () => {
		expect(() => register({ name: "icons", icon: "lucide-shapes" }, icons)).toThrow(/label/);
	});

	it("refuses a rule key the host does not own", () => {
		expect(() => register(tab("icons", { showWhen: { isSVG: true } }), icons)).toThrow(/isSVG/);
	});
});

describe("the condition", () => {
	it("shows a tab that states no rule", () => {
		register(tab(), icons);

		expect(registered("acme/icons:icons")!.condition!()).toBe(true);
	});

	it("hides a tab whose rule does not match", () => {
		register(tab("icons", { showWhen: { readOnly: true } }), icons);

		expect(registered("acme/icons:icons")!.condition!()).toBe(false);
	});

	it("follows the editor when the rule starts matching", () => {
		register(tab("icons", { showWhen: { readOnly: true } }), icons);
		context.value.readOnly = true;

		expect(registered("acme/icons:icons")!.condition!()).toBe(true);
	});
});

describe("update", () => {
	it("changes the label the panel renders", () => {
		register(tab(), icons);
		update({ name: "icons", patch: { label: "Symbols" } }, icons);

		expect(registered("acme/icons:icons")!.label).toBe("Symbols");
	});

	it("hides the tab through the visible flag", () => {
		register(tab(), icons);
		update({ name: "icons", patch: { visible: false } }, icons);

		expect(registered("acme/icons:icons")!.condition!()).toBe(false);
	});

	it("keeps the slot the tab already holds", () => {
		register(tab(), icons);
		register(tab(), charts);
		update({ name: "icons", patch: { label: "Symbols" } }, icons);

		expect(leftPanelTabs.all.value.map((item) => item.name)).toEqual([
			"acme/icons:icons",
			"other/charts:icons",
		]);
	});

	it("leaves untouched fields alone", () => {
		register(tab(), icons);
		update({ name: "icons", patch: { visible: false } }, icons);

		expect(registered("acme/icons:icons")!.icon).toBe("lucide-shapes");
	});

	it("refuses a name it does not hold", () => {
		expect(() => update({ name: "ghost", patch: {} }, icons)).toThrow(/No left panel tab/);
	});

	it("refuses another extension's tab", () => {
		register(tab(), icons);

		expect(() => update({ name: "icons", patch: { label: "Stolen" } }, charts)).toThrow(/No left panel tab/);
	});
});

describe("unregister and teardown", () => {
	it("removes the tab", () => {
		register(tab(), icons);
		unregister({ name: "icons" }, icons);

		expect(registered("acme/icons:icons")).toBeUndefined();
	});

	it("refuses a name it does not hold", () => {
		expect(() => unregister({ name: "ghost" }, icons)).toThrow(/No left panel tab/);
	});

	it("drops the tab when the extension is torn down", () => {
		register(tab(), icons);
		bridge.teardown(icons.name);

		expect(registered("acme/icons:icons")).toBeUndefined();
	});

	it("lets an extension register again after teardown", () => {
		register(tab(), icons);
		bridge.teardown(icons.name);
		register(tab(), icons);

		expect(registered("acme/icons:icons")).toBeDefined();
	});
});
