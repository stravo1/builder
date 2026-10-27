import { describe, expect, it } from "vitest";
import { defineComponent } from "vue";
import { blockTemplates, getBlockTemplateItem } from "./index";

const icon = defineComponent({ render: () => null });

describe("block templates", () => {
	it("finds a registered template by name, and fails loudly once it is gone", async () => {
		const unregister = blockTemplates.register({
			name: "card",
			label: "Card",
			category: "Plugin",
			icon,
			getBlock: () => ({ element: "div" }),
		});

		expect(await getBlockTemplateItem("card").getBlock()).toEqual({ element: "div" });
		unregister();
		expect(() => getBlockTemplateItem("card")).toThrow('No block template named "card" is registered.');
	});
});
