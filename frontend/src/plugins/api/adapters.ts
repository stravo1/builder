import type Block from "@/block";
import { getBlockObject } from "@/utils/helpers";
import getBlockTemplate from "@/utils/blockTemplate";
import type { PluginBlock, PluginBlockPatch, PluginBlockStyles, PluginCreateBlockOptions } from "./types";

function cloneStyles(block: Block): PluginBlockStyles {
	return {
		base: { ...block.baseStyles },
		mobile: { ...block.mobileStyles },
		tablet: { ...block.tabletStyles },
		raw: { ...block.getRawStyles() },
	};
}

export function toPluginBlock(block: Block): PluginBlock {
	const blockObject = getBlockObject(block);
	return {
		id: block.blockId,
		element: blockObject.element,
		originalElement: blockObject.originalElement,
		blockName: blockObject.blockName,
		children: (block.children || []).map((child) => toPluginBlock(child)),
		styles: cloneStyles(block),
		attributes: { ...(blockObject.attributes || {}) },
		classes: [...(block.getClasses() || [])],
		props: blockObject.props ? structuredClone(blockObject.props) : undefined,
		innerHTML: blockObject.innerHTML,
		extendedFromComponent: blockObject.extendedFromComponent,
		draggable: blockObject.draggable,
	};
}

export function collectBlocksByElement(block: Block, tag: string, results: PluginBlock[] = []) {
	if (block.getElement()?.toLowerCase() === tag.toLowerCase()) {
		results.push(toPluginBlock(block));
	}
	for (const child of block.children || []) {
		collectBlocksByElement(child, tag, results);
	}
	return results;
}

export function createBlockOptionsFromTemplate(options: PluginCreateBlockOptions): BlockOptions {
	const template = options.template || "container";
	const blockOptions = getBlockTemplate(template);

	if (options.element) blockOptions.element = options.element;
	if (options.blockName) blockOptions.blockName = options.blockName;
	if (options.innerHTML) blockOptions.innerHTML = options.innerHTML;
	if (options.attributes) blockOptions.attributes = { ...options.attributes };
	if (options.classes) blockOptions.classes = [...options.classes];

	if (options.styles) {
		if (options.styles.base) blockOptions.baseStyles = { ...blockOptions.baseStyles, ...options.styles.base };
		if (options.styles.mobile) blockOptions.mobileStyles = { ...options.styles.mobile };
		if (options.styles.tablet) blockOptions.tabletStyles = { ...options.styles.tablet };
		if (options.styles.raw) blockOptions.rawStyles = { ...options.styles.raw };
	}

	return blockOptions;
}

export function applyPluginBlockPatch(block: Block, patch: PluginBlockPatch) {
	if (patch.element !== undefined) block.element = patch.element;
	if (patch.blockName !== undefined) block.blockName = patch.blockName;
	if (patch.innerHTML !== undefined) block.innerHTML = patch.innerHTML;
	if (patch.extendedFromComponent !== undefined) block.extendedFromComponent = patch.extendedFromComponent;
	if (patch.draggable !== undefined) block.draggable = patch.draggable;

	if (patch.attributes) {
		Object.assign(block.attributes, patch.attributes);
	}

	if (patch.classes) {
		block.classes = [...patch.classes];
	}

	if (patch.props) {
		if (!block.props) block.props = {};
		Object.assign(block.props, patch.props);
	}

	if (patch.styles) {
		if (patch.styles.base) Object.assign(block.baseStyles, patch.styles.base);
		if (patch.styles.mobile) Object.assign(block.mobileStyles, patch.styles.mobile);
		if (patch.styles.tablet) Object.assign(block.tabletStyles, patch.styles.tablet);
		if (patch.styles.raw) Object.assign(block.rawStyles, patch.styles.raw);
	}
}
