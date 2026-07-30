<template>
	<div
		ref="canvasContainer"
		:data-builder-canvas="canvasId"
		@click="handleClick"
		@mousedown="handleMarqueeStart">
		<Transition name="fade">
			<div
				class="absolute bottom-0 left-0 right-0 top-0 grid w-full place-items-center bg-surface-gray-1 p-10 text-ink-gray-5"
				v-show="pageStore.settingPage">
				<LoadingIcon></LoadingIcon>
			</div>
		</Transition>
		<BlockSnapGuides></BlockSnapGuides>
		<div
			class="fixed flex gap-40"
			:class="{
				'scheme-dark': builderStore.canvasDarkMode,
			}"
			ref="canvas"
			:style="{
				transformOrigin: 'top center',
				transform: `scale(${canvasProps.scale}) translate(${canvasProps.translateX}px, ${canvasProps.translateY}px)`,
				'--canvas-scale': canvasProps.scale,
				colorScheme: builderStore.canvasDarkMode ? 'dark' : 'light',
			}">
			<div class="absolute right-0 top-[-60px] flex rounded-md bg-surface-base px-3">
				<Tooltip text="Toggle Canvas Dark Mode (⌘⇧D)" :hoverDelay="0.6">
					<div
						v-show="!canvasProps.scaling && !canvasProps.panning"
						class="w-auto cursor-pointer p-2"
						@click.stop="builderStore.canvasDarkMode = !builderStore.canvasDarkMode">
						<span
							:class="[builderStore.canvasDarkMode ? 'lucide-sun' : 'lucide-moon', 'h-8 w-6 text-ink-gray-8']"
							aria-hidden="true" />
					</div>
				</Tooltip>
				<div
					v-show="!canvasProps.scaling && !canvasProps.panning"
					class="m-2 my-3 w-px bg-[var(--outline-gray-2)]"></div>
				<div
					v-show="!canvasProps.scaling && !canvasProps.panning"
					class="w-auto cursor-pointer p-2"
					v-for="breakpoint in canvasProps.breakpoints"
					:key="breakpoint.device"
					@click.stop="(ev) => selectBreakpoint(ev, breakpoint)">
					<span
						:class="[
							breakpoint.icon,
							'h-8 w-6',
							{ 'text-ink-gray-8': breakpoint.visible, 'text-ink-gray-3': !breakpoint.visible },
						]"
						aria-hidden="true" />
				</div>
			</div>
			<CanvasFrame
				:canvasId="canvasId"
				:minHeight="containerHeight"
				:dark="builderStore.canvasDarkMode"
				@ready="onFrameReady"
				@dispose="onFrameDispose"
				@resize="onFrameResize">
				<component :is="'style'" v-if="blockClientStyles" v-text="blockClientStyles" />
				<component :is="'style'" v-if="blockStateStyles" v-text="blockStateStyles" />
				<div
					class="canvas relative flex bg-surface-base shadow-xl contain-layout"
					:data-breakpoint="breakpoint.device"
					:style="{
						...canvasStyles,
						background: canvasProps.background,
						width: `${breakpoint.width}px`,
					}"
					v-for="breakpoint in renderedBreakpoints"
					v-show="breakpoint.visible"
					:key="breakpoint.device">
					<div
						class="absolute left-0 cursor-pointer select-none text-4xl text-ink-gray-7"
						:style="{
							fontSize: `calc(${12}px * 1/${canvasProps.scale})`,
							top: `calc(${-20}px * 1/${canvasProps.scale})`,
						}"
						v-show="!canvasProps.scaling && !canvasProps.panning"
						@click="activeBreakpoint = breakpoint.device">
						{{ breakpoint.displayName }}
					</div>
					<BuilderBlock
						:class="['min-h-[inherit]', PAGE_ROOT_CLASS]"
						:block="block"
						:style="variables"
						:key="`${block.blockId}:${blockEpoch}`"
						:readonly="builderStore.readOnlyMode"
						v-if="showBlocks"
						:breakpoint="breakpoint.device"
						:data="pageStore.pageData" />
				</div>
			</CanvasFrame>
		</div>
		<div
			class="overlay absolute"
			:class="{ 'pointer-events-none': isOverDropZone }"
			id="overlay"
			ref="overlay" />
		<!-- Covers the canvas frame while a panel drag runs, so dragover and drop stay
		     in the editor document and reach the drop zone on the container. -->
		<div v-show="canvasStore.isDragging" data-canvas-capture class="absolute inset-0 z-[150]" />
		<div v-show="marquee.visible" class="pointer-events-none fixed z-[200]" :style="marqueeStyle" />
		<DropIndicator />
		<div
			class="text-sm-semibold fixed bottom-12 left-[50%] flex translate-x-[-50%] cursor-default items-center justify-center gap-2 rounded-lg bg-surface-base px-3 py-2 text-center text-ink-gray-7 shadow-md"
			v-show="!canvasProps.panning && !canvasStore.isDragging">
			{{ Math.round(canvasProps.scale * 100) + "%" }}
			<div class="ml-2 cursor-pointer" @click="setScaleAndTranslate">
				<FitScreenIcon />
			</div>
		</div>
		<div class="absolute top-0 order-1 w-full">
			<slot name="header"></slot>
		</div>
		<DraggablePopup
			v-model="builderStore.showSearchBlock"
			:container="canvasContainer"
			placement="top-right"
			:placementOffset="20"
			v-if="builderStore.showSearchBlock">
			<template #header>Search Block</template>
			<template #content>
				<SearchBlock></SearchBlock>
			</template>
		</DraggablePopup>
	</div>
</template>
<script setup lang="ts">
import type Block from "@/block";
import DraggablePopup from "@/components/Controls/DraggablePopup.vue";
import SearchBlock from "@/components/Controls/SearchBlock.vue";
import LoadingIcon from "@/components/Icons/Loading.vue";
import { builderSettings } from "@/data/builderSettings";
import useBuilderStore from "@/stores/builderStore";
import useCanvasStore from "@/stores/canvasStore";
import usePageStore from "@/stores/pageStore";
import { BreakpointConfig, CanvasHistory } from "@/types/Builder/BuilderCanvas";
import { getBlockObject, isCtrlOrCmd } from "@/utils/helpers";
import {
	type BlockClientScriptRuntime,
	executeClientScriptRestricted,
	executeClientScriptUnrestricted,
} from "@/utils/scriptSandbox";
import { useBlockEventHandlers } from "@/utils/useBlockEventHandlers";
import { useBlockSelection } from "@/utils/useBlockSelection";
import { useBuilderVariable } from "@/utils/useBuilderVariable";
import { useCanvasDropZone } from "@/utils/useCanvasDropZone";
import { useCanvasEvents } from "@/utils/useCanvasEvents";
import { useCanvasMarqueeSelection } from "@/utils/useCanvasMarqueeSelection";
import { useCanvasUtils } from "@/utils/useCanvasUtils";
import { forwardFrameKeys } from "@/utils/canvasFrame";
import { PAGE_ROOT_CLASS, applyPageScripts } from "@/utils/canvasPageScripts";
import { registerFontDocument } from "@/utils/fontManager";
import { useElementSize, useEventListener } from "@vueuse/core";
import { Tooltip } from "frappe-ui";
import {
	EffectScope,
	Ref,
	computed,
	effectScope,
	nextTick,
	onMounted,
	onUnmounted,
	provide,
	reactive,
	ref,
	useId,
	watch,
} from "vue";
import setPanAndZoom from "../utils/panAndZoom";
import BlockSnapGuides from "./BlockSnapGuides.vue";
import BuilderBlock from "./BuilderBlock.vue";
import CanvasFrame from "./CanvasFrame.vue";
import DropIndicator from "./DropIndicator.vue";
import FitScreenIcon from "./Icons/FitScreen.vue";

const builderStore = useBuilderStore();
const canvasStore = useCanvasStore();
const pageStore = usePageStore();
const canvasId = `builder-canvas-${useId()}`;

const { cssVariables, darkCssVariables } = useBuilderVariable();

const variables = computed(() => {
	return {
		...cssVariables.value,
		...(builderStore.canvasDarkMode ? darkCssVariables.value : {}),
	};
});

const resizingBlock = ref(false);
const canvasContainer = ref(null) as Ref<HTMLElement | null>;
const canvas = ref(null);
const showBlocks = ref(false);
const overlay = ref(null);
const blockStyles = reactive(new Map<string, string>());
const stateStyles = reactive(new Map<string, string>());

const props = withDefaults(
	defineProps<{
		blockData: Block | BlockOptions;
		canvasStyles?: Record<string, any>;
		// Only the page canvas runs the page client scripts. A fragment canvas edits a
		// component, which is not the page those scripts belong to.
		runPageScripts?: boolean;
	}>(),
	{
		canvasStyles: () => ({}),
		runPageScripts: false,
	},
);

const block = ref(props.blockData) as Ref<Block>;
// The frame holds no viewport of its own, so the canvases take their full-height look
// from the editor container, the same height the transformed wrapper used to give them.
const { height: containerHeight } = useElementSize(canvasContainer);
const history = ref(null) as Ref<null> | CanvasHistory;
const blockClientStyles = computed(() => Array.from(blockStyles.values()).join("\n"));
// Hover, focus and active render as real rules during preview only. To select a block the
// user hovers it, and a block that restyles itself under the pointer is hard to edit.
const blockStateStyles = computed(() =>
	canvasProps.scriptsRunning ? Array.from(stateStyles.values()).filter(Boolean).join("\n") : "",
);

const activeBreakpoint = ref("desktop") as Ref<string | null>;
const hoveredBreakpoint = ref("desktop") as Ref<string | null>;
const hoveredBlock = ref(null) as Ref<string | null>;
const setCanvasZoom = ref<(scale: number, pinchPoint: { x: number; y: number } | "center") => void>();
// Remounting the block tree is how the canvas takes back what a client script changed.
const blockEpoch = ref(0);

const {
	clearSelection,
	selectBlockRange,
	selectedBlockIds,
	isSelected,
	toggleBlockSelection,
	selectedBlocks,
} = useBlockSelection(block);

const canvasProps = reactive({
	overlayElement: null,
	frameDocument: null as Document | null,
	// Off until the user presses Run. A script that moves or hides blocks makes the
	// canvas hard to edit, so it should never start on its own.
	scriptsRunning: false,
	background: "#fff",
	scale: 1,
	translateX: 0,
	translateY: 0,
	settingCanvas: true,
	scaling: false,
	panning: false,
	breakpoints: [
		{
			icon: "lucide-monitor",
			device: "desktop",
			displayName: "Desktop",
			width: 1400,
			visible: true,
			renderedOnce: true,
		},
		{
			icon: "lucide-tablet",
			device: "tablet",
			displayName: "Tablet",
			width: 800,
			visible: false,
		},
		{
			icon: "lucide-smartphone",
			device: "mobile",
			displayName: "Mobile",
			width: 420,
			visible: false,
		},
	] as BreakpointConfig[],
});

const {
	setScaleAndTranslate,
	resetZoom,
	moveCanvas,
	zoomIn,
	zoomOut,
	toggleMode,
	toggleDirty,
	setupHistory,
	clearCanvas,
	getRootBlock,
	setRootBlock,
	selectBlock,
	scrollBlockIntoView,
	removeBlock,
	findBlock,
	isDirty,
} = useCanvasUtils(canvasProps, canvasContainer, canvas, block, selectedBlockIds, history);

const { marquee, marqueeStyle, suppressNextClick, handleMarqueeStart, cleanupMarqueeListeners } =
	useCanvasMarqueeSelection({
		canvasProps,
		activeBreakpoint,
		selectedBlockIds,
		findBlock,
		setActiveBreakpoint,
		setHoveredBreakpoint,
	});

const { isOverDropZone } = useCanvasDropZone(
	canvasContainer as unknown as Ref<HTMLElement>,
	block,
	findBlock,
);

onMounted(() => {
	const canvasContainerEl = canvasContainer.value as unknown as HTMLElement;
	const canvasEl = canvas.value as unknown as HTMLElement;
	canvasProps.overlayElement = overlay.value;
	setScaleAndTranslate();
	showBlocks.value = true;
	setupHistory();
	// a read-only canvas (version preview / protected page) fully disables history;
	// editing the canvas re-enables it
	watch(
		() => builderStore.readOnlyMode,
		(readOnly) => (readOnly ? history.value?.disable() : history.value?.enable()),
		{ immediate: true },
	);
	const { setZoom, addWheelTarget } = setPanAndZoom(canvasEl, canvasContainerEl, canvasProps);
	setCanvasZoom.value = setZoom;
	addFrameWheelTarget = addWheelTarget;
});

// Blocks live in the canvas frame, so the delegated listeners bind to its document.
// The scope is stopped on dispose, which happens before every reload of the frame.
let frameScope: EffectScope | null = null;
let addFrameWheelTarget: ((target: EventTarget) => () => void) | null = null;
let removeFrameWheelTarget: (() => void) | null = null;
let unregisterFontDocument: (() => void) | null = null;

function onFrameReady(frameDoc: Document) {
	canvasProps.frameDocument = frameDoc;
	removeFrameWheelTarget = addFrameWheelTarget?.(frameDoc) ?? null;
	unregisterFontDocument = registerFontDocument(frameDoc);
	frameScope = effectScope();
	frameScope.run(() => {
		useCanvasEvents(
			frameDoc,
			canvasContainer as unknown as Ref<HTMLElement>,
			canvasProps,
			history as CanvasHistory,
			selectedBlocks,
			getRootBlock,
			findBlock,
		);
		useBlockEventHandlers(frameDoc);
		useEventListener(frameDoc, "mousedown", handleMarqueeStart);
		useEventListener(frameDoc, "click", handleFrameClick);
		forwardFrameKeys(frameDoc);
	});
	toggleMode(builderStore.mode);
	// Fit once, on the first frame. A later frame comes from a reload, and re-fitting
	// then would move the canvas under the user for no reason.
	if (canvasProps.settingCanvas) nextTick(setScaleAndTranslate);
}

function onFrameDispose() {
	frameScope?.stop();
	frameScope = null;
	removeFrameWheelTarget?.();
	removeFrameWheelTarget = null;
	unregisterFontDocument?.();
	unregisterFontDocument = null;
	canvasProps.frameDocument = null;
}

onUnmounted(() => {
	cleanupMarqueeListeners();
});

const handleClick = (ev: MouseEvent) => {
	if (suppressNextClick.value) {
		suppressNextClick.value = false;
		return;
	}

	const target = document.elementFromPoint(ev.clientX, ev.clientY);
	// hack to ensure if click is on canvas-container
	// TODO: Still clears selection if space handlers are dragged over canvas-container
	if (target?.classList.contains("canvas-container")) {
		clearSelection();
	}
};

// Inside the frame the empty space around the canvases is the frame body, so a
// press there clears the selection the same way the editor gutter does.
const handleFrameClick = (ev: MouseEvent) => {
	if (suppressNextClick.value) {
		suppressNextClick.value = false;
		return;
	}
	const target = ev.target as HTMLElement | null;
	if (target && !target.closest(".__builder_component__")) {
		clearSelection();
	}
};

function searchBlock(searchTerm: string, targetBlock: null | Block, limit: number = 5): Block[] {
	const results: Block[] = [];

	function search(block: Block) {
		if (results.length >= limit) return;

		const blockObject = getBlockObject(block);
		const children = blockObject.children || [];
		delete blockObject.children;

		if (JSON.stringify(blockObject).toLowerCase().includes(searchTerm.toLowerCase())) {
			results.push(findBlock(block.blockId) as Block);
		}

		for (const child of children) {
			search(child);
		}
	}

	if (!targetBlock) {
		targetBlock = getRootBlock();
	}

	search(targetBlock);
	return results;
}

function setActiveBreakpoint(breakpoint: string | null) {
	activeBreakpoint.value = breakpoint;
}

function setHoveredBreakpoint(breakpoint: string | null) {
	hoveredBreakpoint.value = breakpoint;
}

function setHoveredBlock(blockId: string | null) {
	hoveredBlock.value = blockId;
}

watch(
	() => block,
	() => {
		toggleDirty(true);
	},
	{
		deep: true,
	},
);

// Showing or hiding a breakpoint changes the frame width, but the frame reports its new
// size one observer tick later. Fitting before that would measure the old width, so the
// fit waits for the frame to report.
let refitPending = false;

watch(
	() => canvasProps.breakpoints.map((b) => b.visible),
	() => {
		if (canvasProps.settingCanvas) {
			return;
		}
		refitPending = true;
	},
);

function onFrameResize() {
	if (!refitPending) return;
	refitPending = false;
	setScaleAndTranslate();
}

watch(
	() => builderStore.mode,
	(newValue, oldValue) => {
		builderStore.lastMode = oldValue;
		toggleMode(builderStore.mode);
	},
);

provide("canvasProps", canvasProps);
provide("emulateBlockClientScript", emulateBlockClientScript);
provide("registerBlockStateStyles", registerBlockStateStyles);

defineExpose({
	setScaleAndTranslate,
	resetZoom,
	moveCanvas,
	zoomIn,
	zoomOut,
	history,
	clearCanvas,
	getRootBlock,
	block,
	setRootBlock,
	canvasProps,
	selectBlock,
	toggleBlockSelection,
	selectedBlocks,
	clearSelection,
	isSelected,
	selectedBlockIds,
	findBlock,
	isDirty,
	toggleDirty,
	scrollBlockIntoView,
	removeBlock,
	selectBlockRange,
	resizingBlock,
	searchBlock,
	activeBreakpoint,
	hoveredBreakpoint,
	hoveredBlock,
	setActiveBreakpoint,
	setHoveredBreakpoint,
	setHoveredBlock,
	setCanvasZoom,
});

function selectBreakpoint(ev: MouseEvent, breakpoint: BreakpointConfig) {
	if (isCtrlOrCmd(ev)) {
		canvasProps.breakpoints.forEach((bp) => {
			bp.visible = bp.device === breakpoint.device;
		});
	} else {
		breakpoint.visible = !breakpoint.visible;
		if (canvasProps.breakpoints.filter((bp) => bp.visible).length === 0) {
			breakpoint.visible = true;
		}
	}
	if (breakpoint.visible) {
		hoveredBreakpoint.value = breakpoint.device;
		activeBreakpoint.value = breakpoint.device;
		breakpoint.renderedOnce = true;
	}
	const isActiveVisible = canvasProps.breakpoints.find(
		(bp) => bp.device === activeBreakpoint.value && bp.visible,
	);
	if (!isActiveVisible) {
		const lastVisible = Array.from(canvasProps.breakpoints)
			.reverse()
			.find((bp) => bp.visible);
		if (lastVisible) {
			activeBreakpoint.value = lastVisible.device;
			hoveredBreakpoint.value = lastVisible.device;
		}
	}
}

// Stopping has to undo what the scripts did. Reloading the frame would do that, but the
// canvas goes blank while the new one builds. Instead the injected elements come out and
// the block tree remounts, which puts back every block a script moved, hid or rewrote.
// A script that reached outside the block tree, or left something on the canvas window,
// survives until the page reloads.
watch(
	() => canvasProps.frameDocument,
	async (frameDocument) => {
		if (!props.runPageScripts || !frameDocument || pageStore.settingPage) return;
		await nextTick();
		runPageScriptsInFrame();
	},
	{ immediate: true },
);

watch(
	[() => canvasProps.scriptsRunning, () => pageStore.activePageScripts],
	(_, [wasRunning]) => {
		if (!props.runPageScripts || pageStore.settingPage) return;
		// Only a canvas that has been running has anything to take back. Skipping the
		// remount on the way in keeps the blocks, and their images, on screen.
		if (wasRunning) blockEpoch.value += 1;
		nextTick(runPageScriptsInFrame);
	},
	{ deep: true },
);

function runPageScriptsInFrame() {
	const frameDocument = canvasProps.frameDocument;
	if (!frameDocument) return;
	applyPageScripts(frameDocument, pageStore.activePageScripts, canvasProps.scriptsRunning);
}

function registerBlockStateStyles(key: string, css: string) {
	stateStyles.set(key, css);
	return () => stateStyles.delete(key);
}

function escapeAttributeValue(value: string) {
	return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function emulateBlockClientScript(script: BlockClientScriptRuntime) {
	const registrationKey = `${script.key}:${script.breakpoint}`;
	const selector = `[data-builder-canvas="${canvasId}"] [data-block-uid="${escapeAttributeValue(
		script.key,
	)}"][data-breakpoint="${escapeAttributeValue(script.breakpoint)}"]`;
	// Run/Stop from the command palette decides whether a block script applies, CSS as
	// much as JavaScript. The setting only picks how much of the canvas the script may
	// reach.
	const running = canvasProps.scriptsRunning;
	blockStyles.set(registrationKey, running && script.css ? `${selector} { ${script.css} }` : "");

	const mode = builderSettings.doc?.execute_block_scripts_in_editor ?? "Restricted";
	let cleanup = () => {};
	if (running && mode !== "Don't Execute" && script.javascript.trim()) {
		const context = {
			componentData: script.componentData,
			props: script.props,
		};
		// The blocks live in the canvas frame, so the sandbox root is the canvas root
		// inside that document, not the editor container.
		const sandboxRoot = script.element.closest(".canvas-root") as HTMLElement | null;
		cleanup =
			mode === "Unrestricted"
				? executeClientScriptUnrestricted(script.element, script.javascript, context)
				: executeClientScriptRestricted(script.element, sandboxRoot, script.javascript, context);
	}

	return () => {
		try {
			cleanup();
		} finally {
			blockStyles.delete(registrationKey);
		}
	};
}

const renderedBreakpoints = computed(() => canvasProps.breakpoints.filter((bp) => bp.renderedOnce));
</script>
<style>
.fade-enter-active,
.fade-leave-active {
	transition: opacity 0.1s ease;
}

.fade-enter-from,
.fade-leave-to {
	opacity: 0;
}

#placeholder {
	@apply transition-all;
}
.vertical-placeholder {
	@apply mx-4 h-full min-h-5 w-auto border-l-2 border-dashed border-blue-500;
}
.horizontal-placeholder {
	@apply my-4 h-auto w-full border-t-2 border-dashed border-blue-500;
}

/* Lightweight marquee-drag highlight — applied via DOM attribute, not Vue reactive state */
.__builder_component__[data-marquee-selected] {
	box-shadow: inset 0 0 0 calc(2px / var(--canvas-scale, 1)) theme("colors.blue.400 / 85%");
}

.canvas-container {
	p:not(:where(.prose, .ProseMirror) *) {
		line-height: revert;
	}
}

/* mirrors the published-page default in webpage_scripts.html */
.scheme-dark img:not([data-dark-src]) {
	filter: brightness(0.85) contrast(1.05);
}
</style>
