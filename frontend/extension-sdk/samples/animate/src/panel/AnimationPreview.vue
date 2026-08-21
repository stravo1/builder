<template>
	<div class="flex flex-col gap-2">
		<div
			class="relative flex h-24 items-center justify-center overflow-hidden rounded-md border border-outline-gray-2 bg-surface-gray-1">
			<div
				ref="tile"
				class="h-11 w-16 rounded bg-surface-gray-7"
				:data-animate="effect"
				:style="{
					'--anim-d': `${duration}ms`,
					'--anim-w': `${delay}ms`,
					'--anim-e': easingValue,
				}" />
			<span class="absolute bottom-1 right-2 text-p-xs text-ink-gray-4">Preview</span>
		</div>
		<Button variant="subtle" size="sm" label="Play again" @click="play" />
	</div>
</template>

<script setup>
/**
 * The one thing the editor canvas cannot do.
 *
 * A client script does not run in the canvas, so a block never moves while you
 * edit it. This tile replays the animation from the same keyframes the
 * published page uses, which is why `runtime.js` exports the sheet rather than
 * only baking it into the script.
 */
import { Button } from "frappe-ui";
import { computed, onMounted, ref, watch } from "vue";
import { EASING_VALUES, styles } from "../runtime.js";

const props = defineProps({
	effect: { type: String, default: "none" },
	duration: { type: Number, default: 600 },
	delay: { type: Number, default: 0 },
	easing: { type: String, default: "ease-out" },
});

const tile = ref(null);
const easingValue = computed(() => EASING_VALUES[props.easing]);

// the frame is its own document, so it carries its own copy of the sheet
onMounted(() => {
	const mount = document.createElement("style");
	mount.textContent = styles();
	document.head.appendChild(mount);
	play();
});

const play = () => {
	const node = tile.value;
	if (!node || props.effect === "none") return;

	// the class has to leave and come back for a second run, and a reflow between
	// the two is what makes the browser notice
	node.classList.remove("anim-run");
	void node.offsetWidth;
	node.classList.add("anim-run");
};

watch(() => [props.effect, props.duration, props.delay, props.easing], play);
</script>
