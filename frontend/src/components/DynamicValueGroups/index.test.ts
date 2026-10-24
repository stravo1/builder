import type Block from "@/block";
import { afterEach, describe, expect, it } from "vitest";
import { ref } from "vue";
import {
	dynamicValueGroups,
	loadDynamicValueGroups,
	useDynamicValueGroups,
	withoutGroupedItems,
} from "./index";

const flushPromises = () => new Promise((resolve) => setTimeout(resolve));

const context = { block: {} as Block, property: "src", type: "attribute" as const };
const unregisters: Array<() => void> = [];

afterEach(() => unregisters.splice(0).forEach((unregister) => unregister()));

describe("dynamic value groups", () => {
	it("loads each group for the control the picker opened from", async () => {
		unregisters.push(
			dynamicValueGroups.register({
				name: "images",
				label: "Images",
				getItems: async ({ property }) =>
					property === "src" ? [{ key: "entry.cover", comesFrom: "dataScript", label: "Cover" }] : [],
			}),
		);

		expect(await loadDynamicValueGroups(context)).toEqual([
			{ name: "images", label: "Images", items: [{ key: "entry.cover", comesFrom: "dataScript", label: "Cover" }] },
		]);
	});

	it("leaves out a group with nothing that fits", async () => {
		unregisters.push(dynamicValueGroups.register({ name: "empty", label: "Empty", getItems: () => [] }));

		expect(await loadDynamicValueGroups(context)).toEqual([]);
	});

	it("loads the groups while there is a context, and clears them without one", async () => {
		const items = [{ key: "entry.title", comesFrom: "dataScript" as const, label: "Title" }];
		unregisters.push(dynamicValueGroups.register({ name: "cms", label: "CMS", getItems: async () => items }));
		const current = ref<typeof context | null>({ ...context, block: { blockId: "heading" } as Block });

		const groups = useDynamicValueGroups(() => current.value);
		await flushPromises();
		expect(groups.value).toEqual([{ name: "cms", label: "CMS", items }]);

		current.value = null;
		await flushPromises();
		expect(groups.value).toEqual([]);
	});

	it("shows a grouped key only in its group", () => {
		const groups = [{ name: "cms", label: "CMS", items: [{ key: "entry.title", comesFrom: "dataScript" as const }] }];
		const items = [
			{ key: "entry.title", comesFrom: "dataScript" as const },
			{ key: "entry.title", comesFrom: "props" as const },
			{ key: "site_name", comesFrom: "dataScript" as const },
		];

		expect(withoutGroupedItems(items, groups)).toEqual(items.slice(1));
	});
});
