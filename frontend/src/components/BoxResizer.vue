<template>
	<span
		class="resize-dimensions absolute bottom-[-40px] right-[-40px] flex h-8 w-20 items-center justify-center whitespace-nowrap rounded-full bg-gray-600 p-2 text-sm text-white opacity-80"
		v-if="resizing && !props.targetBlock.isText()">
		{{ targetWidth }} x
		{{ targetHeight }}
	</span>
	<span
		class="resize-dimensions absolute bottom-[-40px] right-[-40px] flex h-8 w-fit items-center justify-center whitespace-nowrap rounded-full bg-gray-600 p-2 text-sm text-white opacity-80"
		v-if="resizing && props.targetBlock.isText()">
		{{ fontSize }}
	</span>

	<div
		class="left-handle ew-resize pointer-events-auto absolute bottom-0 left-[-2px] top-0 w-2 touch-none border-none bg-transparent" />
	<div
		class="right-handle pointer-events-auto absolute bottom-0 right-[-2px] top-0 w-2 touch-none border-none bg-transparent"
		:class="{ 'cursor-ew-resize': true }"
		@mousedown.stop="handleRightResize"
		@touchstart.stop.prevent="handleRightResize" />
	<div
		class="top-handle ns-resize pointer-events-auto absolute left-0 right-0 top-[-2px] h-2 touch-none border-none bg-transparent" />
	<div
		class="bottom-handle pointer-events-auto absolute bottom-[-2px] left-0 right-0 h-2 touch-none border-none bg-transparent"
		:class="{ 'cursor-ns-resize': true }"
		@mousedown.stop="handleBottomResize"
		@touchstart.stop.prevent="handleBottomResize" />
	<div
		class="pointer-events-auto absolute bottom-[-5px] right-[-5px] h-[12px] w-[12px] cursor-nwse-resize touch-none rounded-full border-[2.5px] border-blue-400 bg-white"
		:class="{
			'border-purple-400': targetBlock.isExtendedFromComponent(),
		}"
		v-show="!resizing"
		@mousedown.stop.prevent="handleBottomCornerResize"
		@touchstart.stop.prevent="handleBottomCornerResize" />
</template>
<script setup lang="ts">
import type Block from "@/block";
import useCanvasStore from "@/stores/canvasStore";
import { getEventCoords, getNumberFromPx } from "@/utils/helpers";
import { clamp } from "@vueuse/core";
import { computed, inject, onMounted, ref, watch } from "vue";
import guidesTracker from "../utils/guidesTracker";

const canvasStore = useCanvasStore();
const props = defineProps<{
	targetBlock: Block;
	target: HTMLElement | SVGElement;
}>();

const emit = defineEmits(["resizing"]);
const resizing = ref(false);
let guides = null as unknown as ReturnType<typeof guidesTracker>;

const canvasProps = inject("canvasProps") as CanvasProps;

onMounted(() => {
	guides = guidesTracker(props.target as HTMLElement, canvasProps);
});

watch(resizing, () => {
	if (resizing.value) {
		if (canvasStore.activeCanvas) {
			canvasStore.activeCanvas.history?.pause();
			canvasStore.activeCanvas.resizingBlock = true;
		}
		emit("resizing", true);
	} else {
		if (canvasStore.activeCanvas) {
			canvasStore.activeCanvas?.history?.resume(undefined, true, true);
			canvasStore.activeCanvas.resizingBlock = false;
		}
		emit("resizing", false);
	}
});

const targetWidth = computed(() => {
	props.targetBlock.getStyle("width"); // to trigger reactivity
	return Math.round(getNumberFromPx(getComputedStyle(props.target).getPropertyValue("width")));
});

const targetHeight = computed(() => {
	props.targetBlock.getStyle("height"); // to trigger reactivity
	return Math.round(getNumberFromPx(getComputedStyle(props.target).getPropertyValue("height")));
});

const fontSize = computed(() => {
	props.targetBlock.getStyle("fontSize"); // to trigger reactivity
	return Math.round(getNumberFromPx(getComputedStyle(props.target).getPropertyValue("font-size")));
});

const handleRightResize = (ev: MouseEvent | TouchEvent) => {
	const { clientX } = getEventCoords(ev);
	const startX = clientX;
	const startHeight = (props.target as HTMLElement).offsetHeight;
	const startWidth = (props.target as HTMLElement).offsetWidth;
	const blockStartWidth = props.targetBlock.getStyle("width") as string;
	const blockStartHeight = props.targetBlock.getStyle("height") as string;
	const startFontSize = fontSize.value || 0;

	// to disable cursor jitter
	const docCursor = document.body.style.cursor;
	document.body.style.cursor = ev instanceof TouchEvent ? "ew-resize" : window.getComputedStyle(ev.target as HTMLElement).cursor;	resizing.value = true;
	guides.showX();
	const mousemove = (mouseMoveEvent: MouseEvent) => {
		const movement = (mouseMoveEvent.clientX - startX) / canvasProps.scale;
		if (props.targetBlock.isText() && !props.targetBlock.hasChildren()) {
			setFontSize(movement, startFontSize);
			return mouseMoveEvent.preventDefault();
		}
		setWidth(movement, startWidth, blockStartWidth);
		if (mouseMoveEvent.shiftKey) {
			setHeight(movement, startHeight, blockStartHeight);
		}
		mouseMoveEvent.preventDefault();
	};
	const touchmove = (touchMoveEvent: TouchEvent) => {
		const touch = touchMoveEvent.touches[0];
		if (!touch) return;
		const movement = (touch.clientX - startX) / canvasProps.scale;
		if (props.targetBlock.isText() && !props.targetBlock.hasChildren()) {
			setFontSize(movement, startFontSize);
		} else {
			setWidth(movement, startWidth, blockStartWidth);
		}
		touchMoveEvent.preventDefault();
	};
	const cleanup = () => {
		document.body.style.cursor = docCursor;
		document.removeEventListener("mousemove", mousemove);
		document.removeEventListener("touchmove", touchmove);
		document.removeEventListener("mouseup", cleanup);
		document.removeEventListener("touchend", cleanup);
		resizing.value = false;
		guides.hideX();
	};
	document.addEventListener("mousemove", mousemove);
	document.addEventListener("touchmove", touchmove, { passive: false });
	document.addEventListener("mouseup", cleanup, { once: true });
	document.addEventListener("touchend", cleanup, { once: true });
};

const handleBottomResize = (ev: MouseEvent | TouchEvent) => {
	const { clientY } = getEventCoords(ev);
	const startY = clientY;
	const startHeight = (props.target as HTMLElement).offsetHeight;
	const startWidth = (props.target as HTMLElement).offsetWidth;
	const blockStartWidth = props.targetBlock.getStyle("width") as string;
	const blockStartHeight = props.targetBlock.getStyle("height") as string;
	const startFontSize = fontSize.value || 0;

	// to disable cursor jitter
	const docCursor = document.body.style.cursor;
	document.body.style.cursor = ev instanceof TouchEvent ? "ns-resize" : window.getComputedStyle(ev.target as HTMLElement).cursor;
	resizing.value = true;
	guides.showY();

	const mousemove = (mouseMoveEvent: MouseEvent) => {
		const movement = (mouseMoveEvent.clientY - startY) / canvasProps.scale;

		if (props.targetBlock.isText() && !props.targetBlock.hasChildren()) {
			setFontSize(movement, startFontSize);
			return mouseMoveEvent.preventDefault();
		}
		setHeight(movement, startHeight, blockStartHeight);
		if (mouseMoveEvent.shiftKey) {
			setWidth(movement, startWidth, blockStartWidth);
		}
		mouseMoveEvent.preventDefault();
	};
	const touchmove = (touchMoveEvent: TouchEvent) => {
		const touch = touchMoveEvent.touches[0];
		if (!touch) return;
		const movement = (touch.clientY - startY) / canvasProps.scale;
		if (props.targetBlock.isText() && !props.targetBlock.hasChildren()) {
			setFontSize(movement, startFontSize);
		} else {
			setHeight(movement, startHeight, blockStartHeight);
		}
		touchMoveEvent.preventDefault();
	};
	const cleanup = () => {
		document.body.style.cursor = docCursor;
		document.removeEventListener("mousemove", mousemove);
		document.removeEventListener("touchmove", touchmove);
		document.removeEventListener("mouseup", cleanup);
		document.removeEventListener("touchend", cleanup);
		resizing.value = false;
		guides.hideY();
	};
	document.addEventListener("mousemove", mousemove);
	document.addEventListener("touchmove", touchmove, { passive: false });
	document.addEventListener("mouseup", cleanup, { once: true });
	document.addEventListener("touchend", cleanup, { once: true });
};

const handleBottomCornerResize = (ev: MouseEvent | TouchEvent) => {
	const { clientX, clientY } = getEventCoords(ev);
	const startX = clientX;
	const startY = clientY;
	const startHeight = (props.target as HTMLElement).offsetHeight;
	const startWidth = (props.target as HTMLElement).offsetWidth;
	const blockStartWidth = props.targetBlock.getStyle("width") as string;
	const blockStartHeight = props.targetBlock.getStyle("height") as string;
	const startFontSize = fontSize.value || 0;

	// to disable cursor jitter
	const docCursor = document.body.style.cursor;
	document.body.style.cursor = ev instanceof TouchEvent ? "nwse-resize" : window.getComputedStyle(ev.target as HTMLElement).cursor;
	resizing.value = true;

	const mousemove = (mouseMoveEvent: MouseEvent) => {
		const movementX = (mouseMoveEvent.clientX - startX) / canvasProps.scale;
		const movementY = (mouseMoveEvent.clientY - startY) / canvasProps.scale;
		if (props.targetBlock.isText() && !props.targetBlock.hasChildren()) {
			setFontSize(movementY, startFontSize);
			return mouseMoveEvent.preventDefault();
		}
		setWidth(movementX, startWidth, blockStartWidth);
		setHeight(mouseMoveEvent.shiftKey ? movementX : movementY, startHeight, blockStartHeight);
		mouseMoveEvent.preventDefault();
	};
	const touchmove = (touchMoveEvent: TouchEvent) => {
		const touch = touchMoveEvent.touches[0];
		if (!touch) return;
		const movementX = (touch.clientX - startX) / canvasProps.scale;
		const movementY = (touch.clientY - startY) / canvasProps.scale;
		if (props.targetBlock.isText() && !props.targetBlock.hasChildren()) {
			setFontSize(movementY, startFontSize);
		} else {
			setWidth(movementX, startWidth, blockStartWidth);
			setHeight(movementY, startHeight, blockStartHeight);
		}
		touchMoveEvent.preventDefault();
	};
	const cleanup = () => {
		document.body.style.cursor = docCursor;
		document.removeEventListener("mousemove", mousemove);
		document.removeEventListener("touchmove", touchmove);
		document.removeEventListener("mouseup", cleanup);
		document.removeEventListener("touchend", cleanup);
		resizing.value = false;
	};
	document.addEventListener("mousemove", mousemove);
	document.addEventListener("touchmove", touchmove, { passive: false });
	document.addEventListener("mouseup", cleanup, { once: true });
	document.addEventListener("touchend", cleanup, { once: true });
};

const setWidth = (movementX: number, startWidth: number, blockStartWidth: string) => {
	const finalWidth = Math.round(startWidth + movementX);
	if (blockStartWidth?.includes("%")) {
		const parentWidth = props.target.parentElement?.offsetWidth || 0;
		const movementPercent = (movementX / parentWidth) * 100;
		const startWidthPercent = (startWidth / parentWidth) * 100;
		const finalWidthPercent = Math.abs(Math.round(startWidthPercent + movementPercent));
		props.targetBlock.setStyle("width", `${finalWidthPercent}%`);
	} else {
		props.targetBlock.setStyle("width", `${finalWidth}px`);
	}
};

const setHeight = (movementY: number, startHeight: number, blockStartHeight: string) => {
	const finalHeight = Math.round(startHeight + movementY);
	if (blockStartHeight?.includes("%")) {
		const parentHeight = props.target.parentElement?.offsetHeight || 0;
		const movementPercent = (movementY / parentHeight) * 100;
		const startHeightPercent = (startHeight / parentHeight) * 100;
		const finalHeightPercent = Math.abs(Math.round(startHeightPercent + movementPercent));
		props.targetBlock.setStyle("height", `${finalHeightPercent}%`);
	} else {
		props.targetBlock.setStyle("height", `${finalHeight}px`);
	}
};

const setFontSize = (movement: number, startFontSize: number) => {
	const fontSize = clamp(Math.round(startFontSize + 0.5 * movement), 10, 300);
	props.targetBlock.setStyle("fontSize", `${fontSize}px`);
};
</script>
