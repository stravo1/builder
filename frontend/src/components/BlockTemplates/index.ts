import { createRegistry, type RegistryItem } from "@/utils/createRegistry";
import type { Component } from "vue";

/** A template from code, such as a plugin's, shown in the Blocks tab next to the Block Template records. */
export type BlockTemplateItem = RegistryItem & {
	label: string;
	/** the section of the Blocks tab; a new name adds a section after the built-in ones */
	category: string;
	icon: Component;
	/** called on each drop, so every drop gets a fresh tree */
	getBlock: () => BlockOptions | Promise<BlockOptions>;
};

export const blockTemplates = createRegistry<BlockTemplateItem>();

export const getBlockTemplateItem = (name: string) => {
	const item = blockTemplates.all.value.find((each) => each.name === name);
	if (!item) throw new Error(`No block template named "${name}" is registered.`);
	return item;
};
