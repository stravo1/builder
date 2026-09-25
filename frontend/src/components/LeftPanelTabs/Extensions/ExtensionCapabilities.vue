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

			<!--
				The doctypes answered for sit under the capability they elaborate, so
				turning that capability off shows what it leaves behind. No divider
				comes before them, because they belong to the toggle above.
			-->
			<div
				v-if="capability === grantsAfter && doctypeGrants.length"
				class="!border-t-0 flex flex-col gap-3 px-3 pb-3">
				<div v-for="grant in doctypeGrants" :key="grant.document_type" class="flex flex-col gap-1.5">
					<hr />
					<div class="flex items-center justify-between gap-2">
						<p class="min-w-0 truncate text-xs font-medium text-ink-gray-8">{{ grant.document_type }}</p>
						<Dropdown :options="answerAllOptions(grant)" placement="right">
							<template #trigger="{ open }">
								<Button
									variant="ghost"
									size="sm"
									icon="lucide-more-horizontal"
									:active="open"
									:aria-label="`Set all for ${grant.document_type}`" />
							</template>
						</Dropdown>
					</div>
					<div v-for="access in ACCESS" :key="access" class="flex items-center justify-between gap-2">
						<span class="text-xs capitalize text-ink-gray-6">{{ access }}</span>
						<TabButtons
							:class="COMPACT_TABS"
							:options="ANSWER_BUTTONS"
							:model-value="answersOf(grant)[access]"
							@update:model-value="
								(answer: unknown) => setAnswers(grant, [access], answer as AccessAnswer)
							" />
					</div>
				</div>
			</div>

			<!-- the methods answered for, under the capability that lets the extension run any -->
			<div
				v-if="capability === 'method.call' && methodGrants.length"
				class="!border-t-0 flex flex-col gap-3 px-3 pb-3">
				<div v-for="grant in methodGrants" :key="grant.name" class="flex flex-col gap-1.5">
					<hr />
					<div class="flex items-center justify-between gap-2">
						<p
							class="min-w-0 truncate text-xs text-ink-gray-8"
							:class="grant.scope === 'method' && 'font-mono'"
							:title="grant.target">
							{{ grant.scope === "app" ? `Every method of ${grant.target}` : grant.target }}
						</p>
						<TabButtons
							:class="COMPACT_TABS"
							:options="ANSWER_BUTTONS"
							:model-value="grant.answer"
							@update:model-value="(answer: unknown) => setMethodAnswer(grant, answer as AccessAnswer)" />
					</div>
				</div>
			</div>
		</template>
	</div>
</template>

<script setup lang="ts">
import {
	setExtensionGrant,
	setMethodGrantAnswer,
	type ExtensionGrant,
	type ExtensionMethodGrant,
} from "@/data/extensions";
import { ACCESS, type Access, type AccessAnswer } from "@/extensions/data/grants";
import { capabilityDetails, isSensitive, sortCapabilities } from "@/extensions/capabilityClasses";
import { confirm } from "@/utils/helpers";
import { COMPACT_TABS } from "@/utils/tabButtons";
import type { Capability } from "frappe-builder-extension-sdk/types";
import { Button, Dropdown, Switch, TabButtons, Tooltip, toast } from "frappe-ui";
import { computed } from "vue";

const props = defineProps<{
	extension: string;
	label: string;
	requested: Capability[];
	granted: Capability[];
	doctypeGrants: ExtensionGrant[];
	methodGrants: ExtensionMethodGrant[];
}>();

const emit = defineEmits<{
	"update:granted": [capabilities: Capability[]];
	doctypeGrants: [doctypeGrants: ExtensionGrant[]];
	methodGrants: [];
}>();

/** Only what this extension asked for. A capability it never asked for is not a choice. */
const capabilities = computed(() => sortCapabilities(props.requested));

/** Creating a doctype grants it outright, so `schema.write` alone can hold grants. They then close the list. */
const grantsAfter = computed(() =>
	props.requested.includes("data.access") ? "data.access" : capabilities.value.at(-1),
);

/** Icon only: the label names each segment for a screen reader and a tooltip. */
const ANSWER_BUTTONS = [
	{ label: "Allow", value: "allowed", icon: "lucide-check" },
	{ label: "Deny", value: "denied", icon: "lucide-x" },
	{ label: "Ask first", value: "not asked", icon: "lucide-minus" },
];

const answersOf = (grant: ExtensionGrant): Record<Access, AccessAnswer> => ({
	read: grant.read_access,
	write: grant.write_access,
	delete: grant.delete_access,
});

const answerAllOptions = (grant: ExtensionGrant) => [
	{ label: "Allow all", icon: "lucide-check", onClick: () => setAnswers(grant, ACCESS, "allowed") },
	{ label: "Deny all", icon: "lucide-x", onClick: () => setAnswers(grant, ACCESS, "denied") },
	{
		label: "Ask first for all",
		icon: "lucide-minus",
		onClick: () => setAnswers(grant, ACCESS, "not asked"),
	},
];

/** The server takes the three answers whole, so the ones not changed travel with the change. */
const setAnswers = async (grant: ExtensionGrant, changed: readonly Access[], answer: AccessAnswer) => {
	const answers = answersOf(grant);
	changed.forEach((access) => (answers[access] = answer));
	try {
		emit("doctypeGrants", await setExtensionGrant(props.extension, grant.document_type, answers));
	} catch (thrown) {
		toast.error((thrown as Error).message);
	}
};

const setMethodAnswer = async (grant: ExtensionMethodGrant, answer: AccessAnswer) => {
	try {
		await setMethodGrantAnswer(grant.name, answer);
		emit("methodGrants");
	} catch (thrown) {
		toast.error((thrown as Error).message);
	}
};

/**
 * Turning one off asks nothing: a narrower grant can break the extension and
 * nothing else. Turning a sensitive one on reaches the site's data or every
 * published page, so that direction carries the warning.
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
	return confirm(`${warning} Allow ${props.label} to ${action}?`, "This affects your whole site");
};
</script>
