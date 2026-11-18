<template>
	<!-- Bob, floating over the editor or the dashboard. The dashboard's chat has no page, and works on any page -->
	<!-- mounted on the first open, then kept, so closing it keeps the chat and its listeners -->
	<!-- the panel opens out of the spark, and closes back into it -->
	<Transition name="bob-panel">
		<div
			v-if="hasOpened"
			v-show="isOpen"
			class="fixed z-20 flex w-[420px] flex-col overflow-hidden rounded-7 border border-outline-gray-2 bg-surface-base shadow-2xl"
			:style="panelStyle"
			@pointerdown="startWindowDrag">
			<BuilderAIChatPanel>
				<template #actions>
					<Button variant="ghost" size="sm" icon="lucide-x" :tooltip="__('Close')" @click="isOpen = false" />
				</template>
			</BuilderAIChatPanel>
		</div>
	</Transition>
	<Transition name="bob-spark">
		<div v-show="!isOpen" ref="handle" class="fixed z-30 touch-none" :style="sparkStyle">
			<Button
				variant="solid"
				class="!size-12 !rounded-full shadow-lg"
				:tooltip="__('Ask Bob')"
				:aria-label="__('Ask Bob')"
				@click="open">
				<!-- the icon the Bob AI tab had in the left panel's rail -->
				<template #icon><span class="lucide-sparkle size-5" /></template>
			</Button>
		</div>
	</Transition>
</template>

<script setup lang="ts">
import useBuilderStore from "@/stores/builderStore";
import { __ } from "@/translation";
import { useDraggable, useLocalStorage, useWindowSize } from "@vueuse/core";
import { Button, useKeyboardShortcut } from "frappe-ui";
import { computed, defineAsyncComponent, ref, watch } from "vue";

// the panel brings its own markdown, yaml and sanitiser stack, so it waits to be opened
const BuilderAIChatPanel = defineAsyncComponent(() => import("@/components/BuilderAIChatPanel.vue"));

const SIZE = 48;
const MARGIN = 12;
const PANEL_WIDTH = 420;
const PANEL_HEIGHT = 640;
// a press that moves less than this is a click
const DRAG_THRESHOLD = 4;

const builderStore = useBuilderStore();
// the store owns whether Bob is open, so anything can open it, such as a plugin's "Change it with Bob"
const isOpen = computed({
	get: () => builderStore.showAIChat,
	set: (open: boolean) => (builderStore.showAIChat = open),
});
const hasOpened = ref(false);
watch(isOpen, (open) => open && (hasOpened.value = true), { immediate: true });
useKeyboardShortcut({
	combo: "Mod+Shift+O",
	description: __("Show Bob"),
	group: __("View"),
	handler: () => (isOpen.value = !isOpen.value),
});
const handle = ref<HTMLElement | null>(null);
const { width, height } = useWindowSize();

// kept from the bottom-right corner, so the spark stays by its corner when the window resizes.
// One place everywhere: it is the same Bob in the editor and the dashboard
const offset = useLocalStorage("bob-position", { right: MARGIN, bottom: MARGIN });
const clamp = (value: number, max: number) => Math.min(Math.max(value, MARGIN), max - SIZE - MARGIN);
const left = computed(() => clamp(width.value - offset.value.right - SIZE, width.value));
const top = computed(() => clamp(height.value - offset.value.bottom - SIZE, height.value));

let start = { x: 0, y: 0 };
const isDragging = ref(false);
useDraggable(handle, {
	preventDefault: true,
	onStart: (_, event) => {
		start = { x: event.clientX, y: event.clientY };
	},
	onMove: (position, event) => {
		if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > DRAG_THRESHOLD)
			isDragging.value = true;
		if (!isDragging.value) return;
		offset.value = {
			right: width.value - clamp(position.x, width.value) - SIZE,
			bottom: height.value - clamp(position.y, height.value) - SIZE,
		};
	},
	// after the click that ends the drag, which open then ignores
	onEnd: () => setTimeout(() => (isDragging.value = false)),
});

const open = () => {
	if (!isDragging.value) isOpen.value = true;
};

const within = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

// the window and the spark are one: the spark sits in the middle of the window's near edge, and
// the window opens toward the middle of the screen, staying on it near an edge
const opensUp = computed(() => top.value + SIZE / 2 > height.value / 2);
const panelBox = computed(() => {
	const room = opensUp.value ? top.value + SIZE - MARGIN : height.value - top.value - MARGIN;
	const panelHeight = Math.min(PANEL_HEIGHT, room);
	const centred = left.value + SIZE / 2 - PANEL_WIDTH / 2;
	return {
		left: within(centred, MARGIN, width.value - PANEL_WIDTH - MARGIN),
		top: opensUp.value ? top.value + SIZE - panelHeight : top.value,
		height: panelHeight,
	};
});
// the spark's centre in the panel, and the circle from it that covers the whole panel
const reveal = computed(() => {
	const x = left.value + SIZE / 2 - panelBox.value.left;
	const y = top.value + SIZE / 2 - panelBox.value.top;
	const radius = Math.hypot(Math.max(x, PANEL_WIDTH - x), Math.max(y, panelBox.value.height - y));
	return { x, y, radius };
});
const panelStyle = computed(() => ({
	left: `${panelBox.value.left}px`,
	top: `${panelBox.value.top}px`,
	height: `${panelBox.value.height}px`,
	"--bob-from": `${reveal.value.x}px ${reveal.value.y}px`,
	"--bob-radius": `${reveal.value.radius}px`,
}));
const sparkStyle = computed(() => ({ left: `${left.value}px`, top: `${top.value}px` }));

/**
 * A press on the header, not on one of its buttons, moves the window and its spark together.
 * They stop where the window meets the screen's edge, so the window never jumps to the spark's
 * other side, or off its centre.
 */
const startWindowDrag = (event: PointerEvent) => {
	const target = event.target as HTMLElement;
	if (!target.closest("[data-bob-drag]") || target.closest("button, a, input")) return;
	event.preventDefault();
	const panel = event.currentTarget as HTMLElement;
	const [startX, startY, startLeft, startTop] = [event.clientX, event.clientY, left.value, top.value];
	const [isUp, panelHeight] = [opensUp.value, panelBox.value.height];
	const move = (moved: PointerEvent) => {
		const halfSpan = PANEL_WIDTH / 2 - SIZE / 2;
		const sparkLeft = within(
			startLeft + moved.clientX - startX,
			MARGIN + halfSpan,
			width.value - MARGIN - SIZE - halfSpan,
		);
		const [lowest, highest] = isUp
			? [MARGIN + panelHeight - SIZE, height.value - MARGIN - SIZE]
			: [MARGIN, height.value - MARGIN - panelHeight];
		const sparkTop = within(startTop + moved.clientY - startY, lowest, highest);
		offset.value = { right: width.value - sparkLeft - SIZE, bottom: height.value - sparkTop - SIZE };
	};
	// the panel holds the pointer, so the drag goes on over the canvas and the page frames
	panel.setPointerCapture(event.pointerId);
	panel.addEventListener("pointermove", move);
	panel.addEventListener("lostpointercapture", () => panel.removeEventListener("pointermove", move), {
		once: true,
	});
};
</script>

<style scoped>
:deep([data-bob-drag]) {
	cursor: grab;
}
:deep([data-bob-drag]:active) {
	cursor: grabbing;
}
/* a circle from the spark reveals the panel */
.bob-panel-enter-active,
.bob-panel-leave-active {
	transition: clip-path 260ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.bob-panel-enter-from,
.bob-panel-leave-to {
	clip-path: circle(0px at var(--bob-from));
}
.bob-panel-enter-to,
.bob-panel-leave-from {
	clip-path: circle(var(--bob-radius) at var(--bob-from));
}
/* the spark fades as the panel opens, and returns once it has closed */
.bob-spark-enter-active,
.bob-spark-leave-active {
	transition:
		transform 150ms ease-out,
		opacity 150ms ease-out;
}
.bob-spark-enter-active {
	transition-delay: 200ms;
}
.bob-spark-enter-from,
.bob-spark-leave-to {
	opacity: 0;
	transform: scale(0.85);
}
@media (prefers-reduced-motion: reduce) {
	.bob-panel-enter-active,
	.bob-panel-leave-active,
	.bob-spark-enter-active,
	.bob-spark-leave-active {
		transition: none;
	}
}
</style>
