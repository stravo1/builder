import type { BlockTemplate } from "@/types/doctypes";
import { describe, expect, it } from "vitest";
import { getBlockTemplateSections, type PluginBlockTemplate } from "./BlockTemplates";

const template = (name: string, category: string) => ({ name, category }) as BlockTemplate;
const pluginTemplate = (name: string, category: string): PluginBlockTemplate => ({
	name,
	label: name,
	category,
	getBlock: () => ({}) as BlockOptions,
});

const summarize = (sections: ReturnType<typeof getBlockTemplateSections>) =>
	sections.map((section) => [
		section.category,
		section.templates.map((item) => item.name),
		section.pluginTemplates.map((item) => item.name),
	]);

describe("getBlockTemplateSections", () => {
	const templates = [template("Hero", "Basic"), template("Grid", "Structure")];
	const pluginTemplates = [pluginTemplate("Card", "Basic"), pluginTemplate("Collection list", "CMS")];

	it("puts a plugin template in its category, and a new category after Builder's own", () => {
		const sections = getBlockTemplateSections(["Basic", "Structure", "Media"], templates, pluginTemplates);

		expect(summarize(sections)).toEqual([
			["Basic", ["Hero"], ["Card"]],
			["Structure", ["Grid"], []],
			["CMS", [], ["Collection list"]],
		]);
	});

	it("filters both kinds by name and drops the sections left empty", () => {
		const sections = getBlockTemplateSections(["Basic", "Structure"], templates, pluginTemplates, "coll");

		expect(summarize(sections)).toEqual([["CMS", [], ["Collection list"]]]);
	});
});
