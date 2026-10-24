import type Block from "@/block";
import { createRegistry, type RegistryEntry } from "@/utils/createRegistry";
import { shallowRef, watch } from "vue";

export type DynamicValueItem = {
	key: string;
	comesFrom: BlockDataKey["comesFrom"];
	label?: string;
};

// the picker opens from one property control, so a group can offer only the values that fit it
export type DynamicValueContext = {
	block: Block;
	property: string;
	type: "style" | "attribute" | "key";
};

/** A labelled set of values in the "Set Dynamic Value" picker, such as a plugin's fields. */
export type DynamicValueGroup = RegistryEntry & {
	label: string;
	getItems: (context: DynamicValueContext) => DynamicValueItem[] | Promise<DynamicValueItem[]>;
};

export type LoadedDynamicValueGroup = { name: string; label: string; items: DynamicValueItem[] };

export const dynamicValueGroups = createRegistry<DynamicValueGroup>();

export const loadDynamicValueGroups = async (context: DynamicValueContext) => {
	const groups = await Promise.all(
		dynamicValueGroups.all.value.map(async ({ name, label, getItems }) => ({
			name,
			label,
			items: await getItems(context),
		})),
	);
	return groups.filter((group) => group.items.length);
};

/** Loads the groups again when the context changes. A null context clears them. */
export const useDynamicValueGroups = (getContext: () => DynamicValueContext | null) => {
	const groups = shallowRef<LoadedDynamicValueGroup[]>([]);
	let loadVersion = 0;
	// a string key, so a change elsewhere in the context getter does not load again
	watch(
		() => {
			const context = getContext();
			return context && `${context.block.blockId}:${context.type}:${context.property}`;
		},
		async () => {
			const version = ++loadVersion;
			const context = getContext();
			groups.value = [];
			if (!context) return;
			const loaded = await loadDynamicValueGroups(context);
			if (version === loadVersion) groups.value = loaded;
		},
		{ immediate: true },
	);
	return groups;
};

export const isSameItem =(item: DynamicValueItem, other: DynamicValueItem) =>
	item.key === other.key && item.comesFrom === other.comesFrom;

// a group names some keys that the page data also lists, so each key shows once, in its group
export const withoutGroupedItems = (items: DynamicValueItem[], groups: LoadedDynamicValueGroup[]) =>
	items.filter((item) => !groups.some((group) => group.items.some((grouped) => isSameItem(grouped, item))));
