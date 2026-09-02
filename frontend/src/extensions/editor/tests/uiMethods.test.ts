import { beforeEach, describe, expect, it, vi } from "vitest";

const teardowns: Array<() => void> = [];
const toastMessage = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
const toastWarning = vi.hoisted(() => vi.fn());
const toastInfo = vi.hoisted(() => vi.fn());

vi.mock("frappe-ui", () => ({
	toast: Object.assign(toastMessage, {
		success: toastSuccess,
		error: toastError,
		warning: toastWarning,
		info: toastInfo,
	}),
}));

vi.mock("../../host/bridge", () => ({
	bridge: { registerTeardown: (_extensionName: string, cleanup: () => void) => teardowns.push(cleanup) },
}));

import {
	dismissDialog,
	dismissPopover,
	openDialogs,
	openPopovers,
	uiMethods,
} from "../uiMethods";
import type { InstalledExtension } from "frappe-builder-extension-sdk/types";

const record = (name = "acme/icons"): InstalledExtension => ({
	name,
	label: "Icon Library",
	entry: `/builder_extension_asset/${name}@1.0.0/main.js`,
	capabilities: ["ui.dialog", "ui.popover"],
});

const open = (params: unknown = {}, extension = record()) =>
	uiMethods["ui.openDialog"].run(params, extension) as Promise<unknown>;
const close = (params: unknown, extension = record()) => uiMethods["ui.closeDialog"].run(params, extension);

const openPopover = (params: unknown = {}, extension = record()) =>
	uiMethods["ui.openPopover"].run(params, extension) as Promise<unknown>;
const closePopover = (params: unknown, extension = record()) =>
	uiMethods["ui.closePopover"].run(params, extension);

const codeOf = (call: () => unknown) => {
	try {
		call();
	} catch (error) {
		return (error as { code?: string }).code;
	}
	return undefined;
};

beforeEach(() => {
	teardowns.splice(0).forEach((stop) => stop());
	openDialogs.clear();
	openPopovers.clear();
	vi.clearAllMocks();
});

describe("the capability", () => {
	it("allows toasts without a capability", () => {
		expect(uiMethods["ui.toast"].needs).toBeNull();
	});

	it("gates both dialog methods behind ui.dialog", () => {
		expect(uiMethods["ui.openDialog"].needs).toBe("ui.dialog");
		expect(uiMethods["ui.closeDialog"].needs).toBe("ui.dialog");
		expect(uiMethods["ui.setHeight"]).toBeUndefined();
	});

	// a popover leaves the editor usable, so a modal is not what it should grant
	it("gates both popover methods behind ui.popover", () => {
		expect(uiMethods["ui.openPopover"].needs).toBe("ui.popover");
		expect(uiMethods["ui.closePopover"].needs).toBe("ui.popover");
	});
});

describe("toasts", () => {
	it("shows Builder's standard toast by default", () => {
		uiMethods["ui.toast"].run({ message: "Icon copied" }, record());

		expect(toastMessage).toHaveBeenCalledWith("Icon copied");
	});

	it("uses the requested toast type", () => {
		uiMethods["ui.toast"].run({ message: "Icon copied", type: "success" }, record());

		expect(toastSuccess).toHaveBeenCalledWith("Icon copied");
	});

	it("refuses an invalid toast message", () => {
		expect(codeOf(() => uiMethods["ui.toast"].run({ message: "" }, record()))).toBe(
			"invalid_params",
		);
	});

	it("refuses an unknown toast type", () => {
		expect(codeOf(() => uiMethods["ui.toast"].run({ message: "Icon copied", type: "urgent" }, record()))).toBe(
			"invalid_params",
		);
	});
});

describe("opening one", () => {
	it("records a dialog the host can render", () => {
		void open({ title: "Pick an icon", width: 520, props: { set: "lucide" } });

		expect(openDialogs.get("acme/icons")).toEqual({
			title: "Pick an icon",
			props: { set: "lucide" },
		});
	});

	it("titles it with the extension's label when the call names none", () => {
		void open();

		expect(openDialogs.get("acme/icons")?.title).toBe("Icon Library");
	});

	it("keeps one extension's dialog out of another's", () => {
		void open({ title: "Mine" });
		void open({ title: "Theirs" }, record("acme/other"));

		expect(openDialogs.get("acme/icons")?.title).toBe("Mine");
		expect(openDialogs.get("acme/other")?.title).toBe("Theirs");
	});
});

describe("how it ends", () => {
	it("resolves the opener with the result the dialog passed", async () => {
		const opened = open();
		close({ result: { name: "star" } });

		await expect(opened).resolves.toEqual({ name: "star" });
		expect(openDialogs.has("acme/icons")).toBe(false);
	});

	it("resolves with nothing when the user dismisses it", async () => {
		const opened = open();
		dismissDialog("acme/icons");

		await expect(opened).resolves.toBeUndefined();
	});

	// 1.15: a second call replaces the first, so the first caller must not wait forever
	it("settles the first caller when a second dialog replaces it", async () => {
		const first = open({ title: "First" });
		void open({ title: "Second" });

		await expect(first).resolves.toBeUndefined();
		expect(openDialogs.get("acme/icons")?.title).toBe("Second");
	});

	it("settles the caller when the extension is torn down", async () => {
		const opened = open();
		teardowns.splice(0).forEach((stop) => stop());

		await expect(opened).resolves.toBeUndefined();
		expect(openDialogs.has("acme/icons")).toBe(false);
	});

	it("refuses a close with no dialog open", () => {
		expect(codeOf(() => close({ result: 1 }))).toBe("unknown_item");
	});
});

describe("the popover", () => {
	it("records one the host can render", () => {
		void openPopover({ title: "Palette", props: { set: "lucide" } });

		expect(openPopovers.get("acme/icons")).toMatchObject({ title: "Palette", props: { set: "lucide" } });
	});

	it("titles it with the extension's label when the call names none", () => {
		void openPopover();

		expect(openPopovers.get("acme/icons")?.title).toBe("Icon Library");
	});

	it("opens it at the size the call asked for", () => {
		void openPopover({ width: 333, height: 591 });

		expect(openPopovers.get("acme/icons")?.size).toEqual({ width: 333, height: 591 });
	});

	// the host component falls back to its own starting size, so an unset field stays unset
	it("leaves the size unset when the call names none", () => {
		void openPopover();

		expect(openPopovers.get("acme/icons")?.size).toEqual({ width: undefined, height: undefined });
	});

	// the host owns a dialog's dimensions, so a size sent there is dropped like any unused field
	it("keeps no size on a dialog", () => {
		void open({ width: 520 });

		expect(openDialogs.get("acme/icons")?.size).toBeUndefined();
	});

	it("refuses a size that is not a whole number", () => {
		expect(codeOf(() => openPopover({ width: "333px" }))).toBe("invalid_params");
	});

	it("resolves the opener with the result the popover passed", async () => {
		const opened = openPopover();
		closePopover({ result: { name: "star" } });

		await expect(opened).resolves.toEqual({ name: "star" });
		expect(openPopovers.has("acme/icons")).toBe(false);
	});

	it("resolves with nothing when the user closes it", async () => {
		const opened = openPopover();
		dismissPopover("acme/icons");

		await expect(opened).resolves.toBeUndefined();
	});

	it("settles the caller when the extension is torn down", async () => {
		const opened = openPopover();
		teardowns.splice(0).forEach((stop) => stop());

		await expect(opened).resolves.toBeUndefined();
		expect(openPopovers.has("acme/icons")).toBe(false);
	});

	it("refuses a close with no popover open", () => {
		expect(codeOf(() => closePopover({ result: 1 }))).toBe("unknown_item");
	});

	// the two are separate surfaces: a dialog must not answer a popover's close
	it("keeps the dialog and the popover apart", async () => {
		const dialog = open({ title: "Modal" });
		const popover = openPopover({ title: "Floating" });

		closePopover({ result: "popover" });

		await expect(popover).resolves.toBe("popover");
		expect(openDialogs.get("acme/icons")?.title).toBe("Modal");

		close({ result: "dialog" });
		await expect(dialog).resolves.toBe("dialog");
	});

	it("keeps one extension's popover out of another's", () => {
		void openPopover({ title: "Mine" });
		void openPopover({ title: "Theirs" }, record("acme/other"));

		expect(openPopovers.get("acme/icons")?.title).toBe("Mine");
		expect(openPopovers.get("acme/other")?.title).toBe("Theirs");
	});
});
