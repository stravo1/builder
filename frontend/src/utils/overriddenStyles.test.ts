import { describe, expect, it } from "vitest";
import { applyOverriddenStyles, stripOverriddenSuffix, toOverriddenStyle } from "./overriddenStyles";

describe("overriddenStyles", () => {
	it("replaces a value with its override", () => {
		const styles = { display: "flex", "display:overridden": "block", color: "red" };
		expect(applyOverriddenStyles(styles)).toEqual({ display: "block", color: "red" });
	});

	it("keeps the state prefix of an override", () => {
		const styles = { "hover:color": "red", "hover:color:overridden": "color-mix(in srgb, red, blue)" };
		expect(applyOverriddenStyles(styles)).toEqual({ "hover:color": "color-mix(in srgb, red, blue)" });
	});

	it("adds an override when the built-in value is not set", () => {
		expect(applyOverriddenStyles({ "width:overridden": "clamp(1rem, 5vw, 3rem)" })).toEqual({
			width: "clamp(1rem, 5vw, 3rem)",
		});
	});

	it.each([null, ""])("drops an empty override %s and keeps the built-in value", (value) => {
		expect(applyOverriddenStyles({ display: "flex", "display:overridden": value })).toEqual({ display: "flex" });
	});

	it("does not change the given map", () => {
		const styles = { "display:overridden": "block" };
		applyOverriddenStyles(styles);
		expect(styles).toEqual({ "display:overridden": "block" });
	});

	it("adds and strips the suffix", () => {
		expect(toOverriddenStyle("hover:backgroundColor")).toBe("hover:backgroundColor:overridden");
		expect(stripOverriddenSuffix("hover:backgroundColor:overridden")).toBe("hover:backgroundColor");
		expect(stripOverriddenSuffix("color")).toBe("color");
	});
});
