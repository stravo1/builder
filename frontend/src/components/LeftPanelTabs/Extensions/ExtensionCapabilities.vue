<template>
	<div class="divide-y divide-outline-gray-1 overflow-hidden rounded-6 border border-outline-gray-1">
		<template v-for="capability in capabilities" :key="capability">
			<div class="px-3 py-2.5">
				<Switch
					size="sm"
					:model-value="granted.includes(capability)"
					@update:model-value="(allow: boolean) => answer(capability, allow)">
					<template #label>
						<span
							class="flex items-center gap-1.5 text-xs"
							:class="isSensitive(capability) && 'text-ink-red-6'">
							{{ capabilityDetails[capability].label }}
							<Tooltip
								v-if="capabilityDetails[capability].warning"
								:text="capabilityDetails[capability].warning">
								<!-- prevent: the icon sits inside the switch's label, and a click there would toggle it -->
								<span class="lucide-info size-3 text-ink-gray-5" aria-hidden="true" @click.prevent />
							</Tooltip>
							<span v-if="capabilityDetails[capability].warning" class="sr-only">
								{{ capabilityDetails[capability].warning }}
							</span>
						</span>
					</template>
				</Switch>
			</div>
		</template>
	</div>
</template>

<script setup lang="ts">
import { capabilityDetails, isSensitive, sortCapabilities } from "@/extensions/capabilityClasses";
import { confirm } from "@/utils/helpers";
import type { Capability } from "frappe-builder-extension-sdk/types";
import { Switch, Tooltip } from "frappe-ui";
import { computed } from "vue";

const props = defineProps<{
	extension: string;
	label: string;
	requested: Capability[];
	granted: Capability[];
}>();

const emit = defineEmits<{
	"update:granted": [capabilities: Capability[]];
}>();

/** Only what this extension asked for. A capability it never asked for is not a choice. */
const capabilities = computed(() => sortCapabilities(props.requested));

/**
 * Turning one off asks nothing: it can break the extension and nothing else.
 * Turning a sensitive one on reaches past the editor, so that direction asks.
 *
 * The parent decides where the list goes: an installation writes it, and the
 * install dialog holds it until the user installs.
 */
const answer = async (capability: Capability, allow: boolean) => {
	if (allow && isSensitive(capability) && !(await confirmSensitive(capability))) return;

	emit(
		"update:granted",
		allow ? [...props.granted, capability] : props.granted.filter((granted) => granted !== capability),
	);
};

const confirmSensitive = (capability: Capability) => {
	const { label, warning } = capabilityDetails[capability];
	const action = label.charAt(0).toLowerCase() + label.slice(1);
	return confirm(`${warning} Allow ${props.label} to ${action}?`, `Allow ${props.label}?`);
};
</script>
