<template>
	<div
		class="flex h-7 w-full cursor-pointer items-center gap-3 rounded-4 px-2 text-sm hover:bg-surface-gray-2"
		:class="selected ? 'bg-surface-gray-3 text-ink-gray-9' : 'text-ink-gray-8'"
		:data-selected="selected || undefined">
		<MiddleTruncate class="min-w-0 flex-1" :text="item.label || item.key" />
		<span class="max-w-[45%] shrink-0 truncate text-xs text-ink-gray-5" :class="{ italic: value == null }">
			{{ value == null ? __("Empty") : value }}
		</span>
	</div>
</template>

<script setup lang="ts">
import { __ } from "@/translation";
import type { DynamicValueItem } from "@/components/DynamicValueGroups";
import MiddleTruncate from "../MiddleTruncate.vue";

defineProps<{ item: DynamicValueItem; value: unknown; selected?: boolean }>();
</script>
