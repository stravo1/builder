import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The real registry with the built-in tabs left out, as
 * `leftPanelMethods.test.ts` does: `LeftPanelTabs/index.ts` imports four SFCs
 * and resolves a store at module load, and this suite runs in node.
 */
vi.mock("@/components/LeftPanelTabs", async () => ({
	leftPanelTabs: (await import("@/utils/createRegistry")).createRegistry(),
}));

const store = vi.hoisted(() => ({ leftPanelActiveTab: "Layers", showTokenManager: true }));
vi.mock("@/stores/builderStore", () => ({ default: () => store }));

// the frame surfaces are covered by uiMethods.test.ts. What matters here is
// which one an open target starts, and with what
const startPopover = vi.hoisted(() => vi.fn());
const startDialog = vi.hoisted(() => vi.fn());
vi.mock("../../editor/uiMethods", () => ({ startPopover, startDialog }));

import { leftPanelTabs } from "@/components/LeftPanelTabs";
import type { InstalledExtension } from "frappe-builder-extension-sdk/types";
import { bridge } from "../../host/bridge";
import { canOpen, openExtension, openMethods, openTargets } from "../openMethods";

const register = openMethods["open.register"].run;
const unregister = openMethods["open.unregister"].run;

const icons: InstalledExtension = {
	name: "acme/icons",
	label: "Icons",
	entry: "/builder_extension_asset/acme-icons@1.0.0/main.js",
	capabilities: [],
};

const registeredTabs: Array<() => void> = [];

const registerTab = (visible = true) =>
	registeredTabs.push(
		leftPanelTabs.register({
			name: "acme/icons:icons",
			label: "Icons",
			icon: "lucide-shapes",
			condition: () => visible,
		}),
	);

const codeOf = (call: () => unknown) => {
	try {
		call();
	} catch (error) {
		return (error as { code?: string }).code;
	}
	return undefined;
};

beforeEach(() => {
	store.leftPanelActiveTab = "Layers";
	store.showTokenManager = true;
	vi.clearAllMocks();
});

afterEach(() => {
	bridge.teardown(icons.name);
	registeredTabs.splice(0).forEach((remove) => remove());
});

describe("the capability", () => {
	// Builder chrome opens the target, so the user is the one who asked
	it("gates neither method", () => {
		expect(openMethods["open.register"].needs).toBeNull();
		expect(openMethods["open.unregister"].needs).toBeNull();
	});
});

describe("register", () => {
	it("keeps the size a popover target asked for", () => {
		register({ kind: "popover", width: 333, height: 591 }, icons);

		expect(openTargets.get(icons.name)).toEqual({ kind: "popover", width: 333, height: 591 });
	});

	it("leaves an unset size unset, so the host uses its own", () => {
		register({ kind: "popover" }, icons);

		expect(openTargets.get(icons.name)).toEqual({ kind: "popover", width: undefined, height: undefined });
	});

	it("refuses a kind Builder cannot open", () => {
		expect(codeOf(() => register({ kind: "sidebar" }, icons))).toBe("invalid_params");
		expect(openTargets.has(icons.name)).toBe(false);
	});

	it("refuses a left panel target that names no tab", () => {
		expect(codeOf(() => register({ kind: "leftPanel" }, icons))).toBe("invalid_params");
	});

	it("refuses a size that is not a whole number", () => {
		expect(codeOf(() => register({ kind: "popover", width: "333px" }, icons))).toBe("invalid_params");
	});

	// a reloaded frame registers again on every edit, and one extension has one target
	it("replaces a target the extension already declared", () => {
		register({ kind: "popover" }, icons);
		register({ kind: "dialog", title: "Pick an icon" }, icons);

		expect(openTargets.get(icons.name)).toEqual({ kind: "dialog", title: "Pick an icon" });
	});

	it("forgets the target when the extension is torn down", () => {
		register({ kind: "popover" }, icons);
		bridge.teardown(icons.name);

		expect(openTargets.has(icons.name)).toBe(false);
	});
});

describe("unregister", () => {
	it("takes the target back", () => {
		register({ kind: "popover" }, icons);
		unregister({}, icons);

		expect(openTargets.has(icons.name)).toBe(false);
	});

	it("refuses when the extension declared none", () => {
		expect(codeOf(() => unregister({}, icons))).toBe("unknown_item");
	});
});

describe("canOpen", () => {
	it("says no when the extension declared no target", () => {
		expect(canOpen(icons)).toBe(false);
	});

	it("says yes for a popover target", () => {
		register({ kind: "popover" }, icons);

		expect(canOpen(icons)).toBe(true);
	});

	it("says yes for a left panel target whose tab is showing", () => {
		registerTab();
		register({ kind: "leftPanel", name: "icons" }, icons);

		expect(canOpen(icons)).toBe(true);
	});

	// leftPanel.update and a showWhen rule both hide a tab, and a button that
	// switches to nothing is worse than no button
	it("says no for a left panel target whose tab is hidden", () => {
		registerTab(false);
		register({ kind: "leftPanel", name: "icons" }, icons);

		expect(canOpen(icons)).toBe(false);
	});

	it("says no for a left panel target whose tab was never registered", () => {
		register({ kind: "leftPanel", name: "icons" }, icons);

		expect(canOpen(icons)).toBe(false);
	});
});

describe("openExtension", () => {
	it("starts the popover at the size the target holds", () => {
		register({ kind: "popover", width: 333, height: 591 }, icons);
		openExtension(icons);

		expect(startPopover).toHaveBeenCalledWith({ width: 333, height: 591 }, icons);
	});

	it("starts the dialog with the title the target holds", () => {
		register({ kind: "dialog", title: "Pick an icon" }, icons);
		openExtension(icons);

		expect(startDialog).toHaveBeenCalledWith({ title: "Pick an icon" }, icons);
	});

	it("switches the panel to the extension's own tab", () => {
		registerTab();
		register({ kind: "leftPanel", name: "icons" }, icons);
		openExtension(icons);

		expect(store.leftPanelActiveTab).toBe("acme/icons:icons");
		expect(store.showTokenManager).toBe(false);
		expect(startPopover).not.toHaveBeenCalled();
	});

	it("does nothing for an extension that declared no target", () => {
		openExtension(icons);

		expect(startPopover).not.toHaveBeenCalled();
		expect(store.leftPanelActiveTab).toBe("Layers");
	});
});
