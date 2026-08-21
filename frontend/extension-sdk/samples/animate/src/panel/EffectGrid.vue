<template>
	<div class="grid grid-cols-3 gap-1.5">
		<button
			v-for="option in EFFECTS"
			:key="option.value"
			type="button"
			class="flex flex-col items-center gap-1 rounded-md border p-2 text-p-xs transition-colors"
			:class="
				option.value === modelValue
					? 'border-outline-gray-4 bg-surface-gray-2 text-ink-gray-9'
					: 'border-transparent bg-surface-gray-1 text-ink-gray-6 hover:bg-surface-gray-2'
			"
			@mouseenter="replay"
			@click="$emit('update:modelValue', option.value)">
			<!-- the chip runs the effect the card names, so nothing has to describe
				motion in words -->
			<span class="flex h-6 w-full items-center justify-center overflow-hidden">
				<span
					class="h-3.5 w-8 rounded-sm bg-surface-gray-5"
					:data-animate="option.value"
					style="--anim-d: 500ms" />
			</span>
			<!-- wraps rather than truncates: "Fade do…" names nothing -->
			<span class="w-full text-center leading-tight">{{ option.label }}</span>
		</button>
	</div>
</template>

<script setup>
/**
 * The keyframes come from the sheet `AnimationPreview` adds to this document, so
 * the chip runs exactly what the published page will run.
 */
import { EFFECTS } from "../animation.js";

defineProps({ modelValue: { type: String, default: "none" } });
defineEmits(["update:modelValue"]);

const replay = (event) => {
	const chip = event.currentTarget.querySelector("[data-animate]");
	// the class has to leave and come back, with a reflow between, or a second
	// hover paints nothing
	chip.classList.remove("anim-run");
	void chip.offsetWidth;
	chip.classList.add("anim-run");
};
</script>
