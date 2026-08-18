import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The real registry, without the built-in items: `ToolbarItems/index.ts` imports
 * seven SFCs and resolves two stores at module load.
 */
vi.mock("@/components/ToolbarItems", async () => ({
	toolbarItems: (await import("@/utils/createRegistry")).createRegistry(),
}));
vi.mock("@/components/ToolbarItems/ExtensionToolbarButton.vue", () => ({
	default: { name: "ExtensionToolbarButton" },
}));
vi.mock("frappe-ui", () => ({ toast: { error: vi.fn() } }));

const context = vi.hoisted(() => ({
	value: { selection: { count: 1, isImage: false }, breakpoint: "desktop", readOnly: false },
}));
vi.mock("../editor/editorContext", () => ({ editorContext: context }));

const invoked = vi.hoisted(() => vi.fn());
vi.mock("./actionMethods", () => ({ invokeAction: invoked, actionMethods: {} }));

import { toolbarItems } from "@/components/ToolbarItems";
import { bridge } from "../host/bridge";
import type { InstalledExtension } from "../types";
import { toolbarMethods } from "./toolbarMethods";

const register = toolbarMethods["toolbar.register"].run;
const unregister = toolbarMethods["toolbar.unregister"].run;
const update = toolbarMethods["toolbar.update"].run;

const icons: InstalledExtension = {
	name: "acme/icons",
	label: "Icons",
	entry: "/main.js",
	capabilities: [],
};

const button = (fields: Record<string, unknown> = {}) => ({
	name: "search",
	region: "right",
	icon: "lucide-search",
	...fields,
});

const item = (key = "acme/icons:search") => toolbarItems.all.value.find((entry) => entry.name === key);

beforeEach(() => {
	context.value.readOnly = false;
	invoked.mockClear();
});

afterEach(() => bridge.teardown(icons.name));

describe("register", () => {
	it("puts the button in the region it asked for", () => {
		register(button({ region: "left" }), icons);

		expect(item()).toMatchObject({ region: "left" });
	});

	it("refuses a region the toolbar does not have", () => {
		expect(() => register(button({ region: "middle" }), icons)).toThrow(/region/);
	});

	it("allows more than one button per extension", () => {
		register(button(), icons);
		register(button({ name: "settings", icon: "lucide-settings" }), icons);

		expect(item()).toBeDefined();
		expect(item("acme/icons:settings")).toBeDefined();
	});

	it("passes the descriptor through to the button's props", () => {
		register(button({ tooltip: "Find an icon", badge: 3 }), icons);

		expect(item()!.props!()).toMatchObject({
			icon: "lucide-search",
			tooltip: "Find an icon",
			badge: 3,
			disabled: false,
		});
	});

	it("refuses an enableWhen key the host does not own", () => {
		expect(() => register(button({ enableWhen: { isSVG: true } }), icons)).toThrow(/isSVG/);
	});
});

describe("the click", () => {
	it("invokes the action the descriptor names", () => {
		register(button({ action: "icons.pick" }), icons);
		(item()!.props!() as { onClick: () => void }).onClick();

		expect(invoked).toHaveBeenCalledWith(icons, "icons.pick");
	});

	it("gives a button with no action nothing to do", () => {
		register(button(), icons);

		expect((item()!.props!() as { onClick?: () => void }).onClick).toBeUndefined();
	});
});

describe("showWhen and enableWhen", () => {
	it("shows a button that states no rule", () => {
		register(button(), icons);

		expect(item()!.condition!()).toBe(true);
	});

	it("hides a button whose rule does not match", () => {
		register(button({ showWhen: { isImage: true } }), icons);

		expect(item()!.condition!()).toBe(false);
	});

	it("disables a button whose enableWhen does not match", () => {
		register(button({ enableWhen: { readOnly: false } }), icons);
		context.value.readOnly = true;

		expect(item()!.props!()).toMatchObject({ disabled: true });
	});

	it("leaves a button enabled under read-only when it states no rule", () => {
		register(button(), icons);
		context.value.readOnly = true;

		expect(item()!.props!()).toMatchObject({ disabled: false });
	});
});

describe("update", () => {
	it("changes the badge and the tooltip", () => {
		register(button(), icons);
		update({ name: "search", patch: { badge: 7, tooltip: "7 issues" } }, icons);

		expect(item()!.props!()).toMatchObject({ badge: 7, tooltip: "7 issues" });
	});

	it("clears a badge that is set to null", () => {
		register(button({ badge: 3 }), icons);
		update({ name: "search", patch: { badge: null } }, icons);

		expect(item()!.props!()).toMatchObject({ badge: null });
	});

	it("disables the button through the enabled flag", () => {
		register(button(), icons);
		update({ name: "search", patch: { enabled: false } }, icons);

		expect(item()!.props!()).toMatchObject({ disabled: true });
	});

	it("hides the button through the visible flag", () => {
		register(button(), icons);
		update({ name: "search", patch: { visible: false } }, icons);

		expect(item()!.condition!()).toBe(false);
	});
});

describe("unregister and teardown", () => {
	it("removes the button", () => {
		register(button(), icons);
		unregister({ name: "search" }, icons);

		expect(item()).toBeUndefined();
	});

	it("drops every button when the extension is torn down", () => {
		register(button(), icons);
		register(button({ name: "settings", icon: "lucide-settings" }), icons);
		bridge.teardown(icons.name);

		expect(toolbarItems.all.value).toEqual([]);
	});
});
