/**
 * Builder's live state, reduced to what an extension may read (1.11).
 *
 * A computed, so the 23 context menu items that read it during one render share
 * one evaluation, and so milestone 5 can watch it rather than keep a second copy.
 *
 * Stores resolve inside the getter. A registry module must not import Vue SFC
 * scope (1.5, rule 1), and resolving a store at import time would tie this
 * module to the order the editor loads in.
 */

import useBuilderStore from "@/stores/builderStore";
import useCanvasStore from "@/stores/canvasStore";
import usePageStore from "@/stores/pageStore";
import blockController from "@/utils/blockController";
import { computed } from "vue";
import type { Breakpoint, EditorContext, EditorSelection } from "../types";

const selection = (): EditorSelection => {
	const blocks = blockController.getSelectedBlocks();
	const first = blocks[0];

	return {
		count: blocks.length,
		blockId: first?.blockId ?? null,
		element: (first?.element as string) ?? "",
		isRoot: Boolean(blockController.isRoot()),
		isText: Boolean(blockController.isText()),
		isImage: Boolean(blockController.isImage()),
		isHTML: Boolean(blockController.isHTML()),
		isSVG: Boolean(blockController.isSVG()),
		isLink: Boolean(blockController.isLink()),
		isContainer: Boolean(blockController.isContainer()),
		isVideo: Boolean(blockController.isVideo()),
		isInput: Boolean(blockController.isInput()),
		isRepeater: Boolean(blockController.isRepeater()),
		isComponent: Boolean(first?.isExtendedFromComponent()),
		// a string field holding the component name, not a method
		isChildOfComponent: Boolean(first?.isChildOfComponent),
	};
};

const page = () => {
	const active = usePageStore().activePage;
	if (!active) return null;

	return {
		route: active.route ?? "",
		isTemplate: Boolean(active.is_template),
		isStandard: Boolean(active.is_standard),
		published: Boolean(active.published),
	};
};

export const editorContext = computed<EditorContext>(() => {
	const builderStore = useBuilderStore();
	const canvasStore = useCanvasStore();

	return {
		selection: selection(),
		breakpoint: (canvasStore.activeCanvas?.activeBreakpoint ?? "desktop") as Breakpoint,
		editingMode: canvasStore.editingMode,
		readOnly: builderStore.readOnlyMode,
		isAIEnabled: builderStore.isAIEnabled,
		page: page(),
		site: {
			isDeveloperMode: Boolean(window.is_developer_mode),
			isFCSite: Boolean(window.is_fc_site),
		},
	};
});
