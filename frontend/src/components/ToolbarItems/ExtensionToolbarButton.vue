<template>
	<Tooltip :text="tooltip" :hoverDelay="0.6" arrow-class="mb-3">
		<Button variant="ghost" :icon="icon" :disabled="disabled" :label="label" @click="click">
			<template v-if="badge" #suffix>
				<span class="rounded-full bg-surface-gray-3 px-1.5 text-xs text-ink-gray-7">{{ badge }}</span>
			</template>
		</Button>
	</Tooltip>
</template>

<script setup lang="ts">
/**
 * Tier A: the extension sends data and Builder draws the button, so it cannot
 * look foreign (1.8).
 *
 * It knows nothing about extensions or the bridge. The descriptor the bridge
 * synthesizes passes `onClick`, so every extension-aware decision stays there.
 */
import { Button, Tooltip } from "frappe-ui";

const props = defineProps<{
	icon: string;
	tooltip?: string;
	label?: string;
	badge?: string | number | null;
	disabled?: boolean;
	onClick?: () => void;
}>();

// the built-in toolbar buttons blur on click, so a focus ring does not linger
const click = (event: MouseEvent) => {
	(event.currentTarget as HTMLElement)?.blur();
	props.onClick?.();
};
</script>
