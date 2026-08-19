import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toRaw } from "vue";

/**
 * The real registry, with the 20 built-in sections left out: their index imports
 * an SFC per section, and this suite runs in node with no Vue plugin. What is
 * under test is the descriptor these two files build.
 */
vi.mock("@/components/BlockPropertySections", async () => ({
	propertySections: (await import("@/utils/createRegistry")).createRegistry(),
}));

vi.mock("@/components/Controls/AttributePropertyControl.vue", () => ({ default: { name: "Attribute" } }));
vi.mock("@/components/Controls/StylePropertyControl.vue", () => ({ default: { name: "Style" } }));
vi.mock("@/components/Controls/BasePropertyControl.vue", () => ({ default: { name: "Base" } }));
vi.mock("@/components/Controls/OptionToggle.vue", () => ({ default: { name: "OptionToggle" } }));
vi.mock("@/components/Controls/ColorInput.vue", () => ({ default: { name: "ColorInput" } }));
vi.mock("@/components/Controls/RangeInput.vue", () => ({ default: { name: "RangeInput" } }));

const blocks = vi.hoisted(() => ({ setAttribute: vi.fn(), setStyle: vi.fn() }));
vi.mock("@/utils/blockController", () => ({ default: blocks }));

const invoked = vi.hoisted(() => vi.fn());
vi.mock("../actionMethods", () => ({ invokeAction: invoked }));

const context = vi.hoisted(() => ({
	value: { selection: { count: 1, blockId: "block-1", isText: false }, readOnly: false },
}));
vi.mock("../../editor/editorContext", () => ({ editorContext: context }));

import { propertySections } from "@/components/BlockPropertySections";
import AttributePropertyControl from "@/components/Controls/AttributePropertyControl.vue";
import BasePropertyControl from "@/components/Controls/BasePropertyControl.vue";
import OptionToggle from "@/components/Controls/OptionToggle.vue";
import RangeInput from "@/components/Controls/RangeInput.vue";
import StylePropertyControl from "@/components/Controls/StylePropertyControl.vue";
import { bridge } from "../../host/bridge";
import type { InstalledExtension } from "../../types";
import { propertyMethods } from "../propertiesMethods";

const register = propertyMethods["properties.registerSection"].run;
const unregister = propertyMethods["properties.unregisterSection"].run;
const update = propertyMethods["properties.update"].run;
const setControls = propertyMethods["properties.setControls"].run;

const writer: InstalledExtension = {
	name: "acme/icons",
	label: "Icons",
	entry: "/main.js",
	capabilities: ["block.update"],
};
const reader: InstalledExtension = { ...writer, name: "other/charts", capabilities: [] };

const bound = { name: "iconSet", control: "select", label: "Icon set", bind: { attribute: "data-icon-set" } };

const section = (fields: Record<string, unknown> = {}) => ({
	name: "Icon",
	controls: [bound],
	...fields,
});

const registered = (key: string) => propertySections.all.value.find((item) => item.name === key);

const propertiesOf = (key: string) => {
	const found = registered(key) as { properties: unknown[] };
	return found.properties as Array<{
		component: unknown;
		getProps: () => Record<string, unknown>;
		searchKeyWords: string;
		condition?: () => boolean;
	}>;
};

const propsOf = (key: string, index = 0) => propertiesOf(key)[index].getProps();

beforeEach(() => {
	context.value.selection = { count: 1, blockId: "block-1", isText: false };
	blocks.setAttribute.mockClear();
	blocks.setStyle.mockClear();
	invoked.mockClear();
});

afterEach(() => {
	[writer, reader].forEach((extension) => bridge.teardown(extension.name));
});

describe("registerSection", () => {
	it("registers under a name the host composes", () => {
		register(section(), writer);
		expect(registered("acme/icons:Icon")).toBeTruthy();
	});

	it("shows the label in the header, not the composed name", () => {
		register(section({ label: "Icon tools" }), writer);
		expect(registered("acme/icons:Icon")).toMatchObject({ label: "Icon tools" });
	});

	it("falls back to the name when no label is sent", () => {
		register(section(), writer);
		expect(registered("acme/icons:Icon")).toMatchObject({ label: "Icon" });
	});

	it("builds one property per control", () => {
		register(section({ controls: [bound, { name: "size", control: "range", bind: { style: "width" } }] }), writer);
		expect(propertiesOf("acme/icons:Icon")).toHaveLength(2);
	});

	it("keeps the anchor the extension asked for", () => {
		register(section({ after: "Layout" }), writer);
		expect(registered("acme/icons:Icon")).toMatchObject({ after: "Layout" });
	});

	it("hides the section when its rule does not match", () => {
		register(section({ showWhen: { count: 2 } }), writer);
		expect(registered("acme/icons:Icon")?.condition?.()).toBe(false);
	});

	it("refuses a control name this Builder does not render", () => {
		const controls = [{ name: "pick", control: "button", action: "icons.pick" }];
		expect(() => register(section({ controls }), writer)).toThrow(/must be one of/);
	});

	it("refuses a control that neither binds nor acts", () => {
		const controls = [{ name: "idle", control: "text" }];
		expect(() => register(section({ controls }), writer)).toThrow(/does nothing/);
	});

	it("refuses a bind that names neither an attribute nor a style", () => {
		const controls = [{ name: "odd", control: "text", bind: {} }];
		expect(() => register(section({ controls }), writer)).toThrow(/binds to neither/);
	});

	it("refuses a list that is not a list", () => {
		expect(() => register(section({ controls: bound }), writer)).toThrow(/must be a list/);
	});
});

describe("the capability a bound control needs", () => {
	it("refuses a bound control without block.update", () => {
		expect(() => register(section(), reader)).toThrow(/block.update/);
	});

	it("leaves nothing registered when a control is refused", () => {
		expect(() => register(section(), reader)).toThrow();
		expect(registered("other/charts:Icon")).toBeUndefined();
	});

	it("lets an unbound control through without the grant", () => {
		const controls = [{ name: "tier", control: "select", value: "free", action: "icons.setTier" }];
		register(section({ controls }), reader);
		expect(registered("other/charts:Icon")).toBeTruthy();
	});
});

describe("the control the host renders", () => {
	it("sends an attribute bind to AttributePropertyControl", () => {
		register(section(), writer);
		expect(toRaw(propertiesOf("acme/icons:Icon")[0].component)).toBe(AttributePropertyControl);
		expect(propsOf("acme/icons:Icon")).toMatchObject({ propertyKey: "data-icon-set" });
	});

	it("sends a style bind to StylePropertyControl", () => {
		register(section({ controls: [{ name: "fill", control: "color", bind: { style: "fill" } }] }), writer);
		expect(toRaw(propertiesOf("acme/icons:Icon")[0].component)).toBe(StylePropertyControl);
		expect(propsOf("acme/icons:Icon")).toMatchObject({ propertyKey: "fill" });
	});

	it("sends an unbound control to BasePropertyControl, keyed by its own name", () => {
		const controls = [{ name: "tier", control: "text", value: "free", action: "icons.setTier" }];
		register(section({ controls }), writer);
		expect(toRaw(propertiesOf("acme/icons:Icon")[0].component)).toBe(BasePropertyControl);
		expect(propsOf("acme/icons:Icon")).toMatchObject({ propertyKey: "tier" });
	});

	it("names the widget each control renders", () => {
		const controls = [
			{ name: "set", control: "select", bind: { attribute: "data-set" } },
			{ name: "align", control: "toggle", bind: { style: "textAlign" } },
			{ name: "width", control: "range", bind: { style: "width" }, min: 0, max: 10, step: 1 },
		];
		register(section({ controls }), writer);
		expect(propsOf("acme/icons:Icon", 0)).toMatchObject({ type: "select" });
		expect(toRaw(propsOf("acme/icons:Icon", 1).component)).toBe(OptionToggle);
		expect(propsOf("acme/icons:Icon", 2)).toMatchObject({ min: 0, max: 10, step: 1 });
		expect(toRaw(propsOf("acme/icons:Icon", 2).component)).toBe(RangeInput);
	});

	it("leaves a bind-only control's write to the wrapper", () => {
		register(section(), writer);
		expect(propsOf("acme/icons:Icon").setModelValue).toBeUndefined();
		expect(propsOf("acme/icons:Icon").getModelValue).toBeUndefined();
	});

	it("reads an unbound control's value from the registration", () => {
		const controls = [{ name: "tier", control: "text", value: "free", action: "icons.setTier" }];
		register(section({ controls }), writer);
		const getModelValue = propsOf("acme/icons:Icon").getModelValue as () => unknown;
		expect(getModelValue()).toBe("free");
	});

	it("writes and then tells the extension, for bind plus action", () => {
		register(section({ controls: [{ ...bound, action: "icons.changed" }] }), writer);
		(propsOf("acme/icons:Icon").setModelValue as (value: string) => void)("feather");

		expect(blocks.setAttribute).toHaveBeenCalledWith("data-icon-set", "feather");
		expect(invoked).toHaveBeenCalledWith(writer, "icons.changed", {
			name: "iconSet",
			blockId: "block-1",
			value: "feather",
		});
	});

	it("never writes a block for an unbound control", () => {
		const controls = [{ name: "tier", control: "text", value: "free", action: "icons.setTier" }];
		register(section({ controls }), writer);
		(propsOf("acme/icons:Icon").setModelValue as (value: string) => void)("pro");

		expect(blocks.setAttribute).not.toHaveBeenCalled();
		expect(blocks.setStyle).not.toHaveBeenCalled();
		expect(invoked).toHaveBeenCalledWith(writer, "icons.setTier", {
			name: "tier",
			blockId: "block-1",
			value: "pro",
		});
	});

	it("gives one control its own rule", () => {
		const controls = [{ ...bound, showWhen: { isText: true } }];
		register(section({ controls }), writer);
		expect(propertiesOf("acme/icons:Icon")[0].condition?.()).toBe(false);

		context.value.selection = { count: 1, blockId: "block-1", isText: true };
		expect(propertiesOf("acme/icons:Icon")[0].condition?.()).toBe(true);
	});

	it("refuses a rule key the vocabulary does not hold", () => {
		const controls = [{ ...bound, showWhen: { isPurple: true } }];
		expect(() => register(section({ controls }), writer)).toThrow(/isPurple/);
	});

	it("synthesizes the search words the panel filter needs", () => {
		register(section({ label: "Icon tools" }), writer);
		expect(propertiesOf("acme/icons:Icon")[0].searchKeyWords).toBe("Icon tools, Icon set, iconSet");
	});
});

describe("setControls", () => {
	it("replaces the whole list", () => {
		register(section(), writer);
		setControls({ name: "Icon", controls: [bound, { name: "fill", control: "color", bind: { style: "fill" } }] }, writer);
		expect(propertiesOf("acme/icons:Icon")).toHaveLength(2);
	});

	it("keeps the section's slot and its label", () => {
		register(section({ label: "Icon tools" }), writer);
		setControls({ name: "Icon", controls: [] }, writer);
		expect(registered("acme/icons:Icon")).toMatchObject({ label: "Icon tools" });
	});

	it("checks the capability again, because it is a second door", () => {
		const controls = [{ name: "tier", control: "text", value: "free", action: "icons.setTier" }];
		register(section({ controls }), reader);
		expect(() => setControls({ name: "Icon", controls: [bound] }, reader)).toThrow(/block.update/);
	});

	it("refuses a section nobody registered", () => {
		expect(() => setControls({ name: "Ghost", controls: [] }, writer)).toThrow(/No property section/);
	});
});

describe("update, unregister and teardown", () => {
	it("hides a section through the flag it pushes", () => {
		register(section(), writer);
		update({ name: "Icon", patch: { visible: false } }, writer);
		expect(registered("acme/icons:Icon")?.condition?.()).toBe(false);
	});

	it("repaints the header when the label changes", () => {
		register(section(), writer);
		update({ name: "Icon", patch: { label: "Icon tools" } }, writer);
		expect(registered("acme/icons:Icon")).toMatchObject({ label: "Icon tools" });
	});

	it("drops the section on unregister", () => {
		register(section(), writer);
		unregister({ name: "Icon" }, writer);
		expect(registered("acme/icons:Icon")).toBeUndefined();
	});

	it("drops every section when the extension is torn down", () => {
		register(section(), writer);
		bridge.teardown(writer.name);
		expect(registered("acme/icons:Icon")).toBeUndefined();
	});
});
