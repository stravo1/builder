import { beforeEach, describe, expect, it, vi } from "vitest";

const teardowns: Array<() => void> = [];

vi.mock("../../host/bridge", () => ({
	bridge: { onTeardown: (_extension: string, unregister: () => void) => teardowns.push(unregister) },
}));

import { dismissDialog, openDialogs, uiMethods } from "../uiMethods";
import type { InstalledExtension } from "../../types";

const record = (name = "acme/icons"): InstalledExtension => ({
	name,
	label: "Icon Library",
	entry: `/builder_extension_asset/${name}@1.0.0/main.js`,
	capabilities: ["ui.dialog"],
});

const open = (params: unknown = {}, extension = record()) =>
	uiMethods["ui.openDialog"].run(params, extension) as Promise<unknown>;
const close = (params: unknown, extension = record()) => uiMethods["ui.closeDialog"].run(params, extension);

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
});

describe("the capability", () => {
	it("gates both methods behind ui.dialog", () => {
		expect(uiMethods["ui.openDialog"].needs).toBe("ui.dialog");
		expect(uiMethods["ui.closeDialog"].needs).toBe("ui.dialog");
		expect(uiMethods["ui.setHeight"]).toBeUndefined();
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
