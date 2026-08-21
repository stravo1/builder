<template>
	<label class="flex flex-col gap-1">
		<span class="flex items-baseline justify-between text-p-sm text-ink-gray-6">
			{{ label }}
			<span class="text-p-xs tabular-nums text-ink-gray-5">{{ modelValue }} ms</span>
		</span>
		<input
			type="range"
			class="h-1 w-full accent-ink-gray-8"
			:min="min"
			:max="max"
			:step="step"
			:value="modelValue"
			@input="$emit('update:modelValue', Number($event.target.value))" />
	</label>
</template>

<script setup>
defineProps({
	label: { type: String, required: true },
	modelValue: { type: Number, required: true },
	min: { type: Number, required: true },
	max: { type: Number, required: true },
	step: { type: Number, default: 1 },
});
defineEmits(["update:modelValue"]);
</script>
