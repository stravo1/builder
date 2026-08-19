<template>
	<Tooltip :text="tooltip" :hoverDelay="0.6" arrow-class="mb-3">
		<Button
			variant="ghost"
			:icon="icon.startsWith('lucide-') ? undefined : icon"
			:disabled="disabled"
			:label="label"
			@click="click">
			<template v-if="icon.startsWith('lucide-')" #icon>
				<RuntimeLucideIcon :name="icon" class="size-4.5" />
			</template>
			<template v-if="badge !== null && badge !== undefined" #suffix>
				<!-- Builder's own Badge, with the theme fixed: the extension supplies
				     the count, never how it looks. ReadOnlyBadge.vue is the precedent -->
				<Badge variant="subtle" theme="gray" size="sm">{{ badge }}</Badge>
			</template>
		</Button>
	</Tooltip>
</template>

<script setup lang="ts">
/**
 * Tier A: the extension sends data and Builder draws the button out of its own
 * components, so it cannot look foreign (1.8).
 *
 * It knows nothing about extensions or the bridge. The descriptor the bridge
 * synthesizes passes `onClick`, so every extension-aware decision stays there.
 */
import { Badge, Button, Tooltip } from "frappe-ui";

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
