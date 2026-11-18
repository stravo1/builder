<template>
	<!-- Bob's mark: BobOrb's shader aurora behind the sparkle, in a breathing bloom -->
	<span class="bob-spark" :style="{ width: `${size}px`, height: `${size}px` }">
		<BobOrb class="bob-spark-aura" />
		<SparklesIcon class="bob-spark-icon relative z-10 size-7 text-ink-gray-8" />
	</span>
</template>

<script setup lang="ts">
import BobOrb from "@/components/ai/BobOrb.vue";
import SparklesIcon from "@/components/Icons/Sparkles.vue";

withDefaults(defineProps<{ size?: number }>(), { size: 76 });
</script>

<style scoped>
.bob-spark {
	position: relative;
	display: grid;
	place-items: center;
	isolation: isolate;
}
/* Soft outer bloom that gently breathes */
.bob-spark::after {
	content: "";
	position: absolute;
	inset: 4px;
	border-radius: 999px;
	background: radial-gradient(circle, rgb(139 92 246 / 0.28), transparent 70%);
	filter: blur(7px);
	z-index: 0;
	animation: bob-spark-bloom 5s ease-in-out infinite;
}
@keyframes bob-spark-bloom {
	0%,
	100% {
		opacity: 0.55;
		transform: scale(0.9);
	}
	50% {
		opacity: 1;
		transform: scale(1.08);
	}
}

/* The shader canvas, clipped to a soft disc. A light blur melts the pixel grid
 * into the surrounding bloom so the edge reads as glow, not a hard circle. */
.bob-spark-aura {
	position: absolute;
	inset: -6%;
	z-index: 1;
	border-radius: 999px;
	overflow: hidden;
	filter: blur(4px) saturate(1.15);
}

/* The sparkle sits above the aura with a soft glow and a gentle twinkle */
.bob-spark-icon {
	filter: drop-shadow(0 0 6px rgb(196 181 253 / 0.7));
	animation: bob-spark-twinkle 3.4s ease-in-out infinite;
}
@keyframes bob-spark-twinkle {
	0%,
	100% {
		opacity: 0.9;
		transform: scale(1) rotate(0deg);
	}
	50% {
		opacity: 1;
		transform: scale(1.08) rotate(4deg);
	}
}

@media (prefers-reduced-motion: reduce) {
	.bob-spark::after,
	.bob-spark-icon {
		animation: none;
	}
}
</style>
