import { describe, expect, it } from "vitest";
import { getStylesFromText } from "./styleText";

describe("getStylesFromText", () => {
	it("reads CSS declarations", () => {
		expect(getStylesFromText("color: red; display: block;")).toEqual({ color: "red", display: "block" });
	});

	it("reads one declaration on each line", () => {
		expect(getStylesFromText("color: red\nwidth: 10px")).toEqual({ color: "red", width: "10px" });
	});

	it("reads a style object with quoted and camel case keys", () => {
		const text = `{ backgroundColor: "rgb(1, 2, 3)", "hover:color": 'blue', zIndex: 2 }`;
		expect(getStylesFromText(text)).toEqual({
			backgroundColor: "rgb(1, 2, 3)",
			"hover:color": "blue",
			zIndex: "2",
		});
	});

	it("keeps state prefixes in CSS text", () => {
		expect(getStylesFromText("hover:color: blue; focus:outline:none")).toEqual({
			"hover:color": "blue",
			"focus:outline": "none",
		});
	});

	it("keeps commas and colons that are part of a CSS value", () => {
		const text = "font-family: 'Inter', sans-serif; background-image: url(https://example.com/a.png)";
		expect(getStylesFromText(text)).toEqual({
			"font-family": "'Inter', sans-serif",
			"background-image": "url(https://example.com/a.png)",
		});
	});

	it("does not run the pasted text", () => {
		const text = "{ color: (() => { throw new Error('ran') })() }";
		expect(() => getStylesFromText(text)).not.toThrow();
	});

	it.each(["display", "", "color:", "not a declaration"])("reads nothing from %j", (text) => {
		expect(getStylesFromText(text)).toEqual({});
	});
});
