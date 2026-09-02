<template>
	<div class="flex h-full min-h-0 flex-col">
		<div class="flex shrink-0 items-center gap-1 bg-surface-base px-2 py-3">
			<Button variant="ghost" size="sm" icon-left="lucide-arrow-left" label="Back" @click="emit('back')" />
		</div>

		<div class="no-scrollbar min-h-0 flex-1 overflow-y-auto">
			<p v-if="error" class="px-3 pb-3 text-p-sm text-ink-red-6">{{ error }}</p>
			<LoadingIndicator v-else-if="!details" class="mx-auto mt-6 size-4 text-ink-gray-5" />

			<div v-else class="flex flex-col gap-5 px-3 pb-5">
				<div class="flex items-start gap-3">
					<img
						v-if="details.icon"
						:src="details.icon"
						class="size-8 shrink-0 object-contain"
						alt=""
						aria-hidden="true" />
					<span v-else class="lucide-plug size-8 shrink-0 text-ink-gray-6" aria-hidden="true" />
					<div class="flex min-w-0 flex-col gap-0.5">
						<span class="truncate text-base text-ink-gray-9">{{ details.label }}</span>
						<span class="truncate text-xs text-ink-gray-5">{{ details.name }}</span>
						<span class="text-xs text-ink-gray-5">Version {{ details.version }}</span>
					</div>
				</div>

				<p v-if="details.description" class="text-p-sm text-ink-gray-7">{{ details.description }}</p>

				<ExtensionActions
					:can-open="Boolean(mounted && hasPopover)"
					:enabled="details.enabled"
					:working="working"
					@open="openPopover"
					@set-enabled="setEnabled"
					@uninstall="uninstall" />

				<!-- eslint-disable-next-line vue/no-v-html -- renderMarkdown sanitizes through DOMPurify -->
				<div
					v-if="readme"
					class="extension-readme markdown-body prose prose-sm max-w-none break-words border-t border-outline-gray-1 pt-4 text-p-sm text-ink-gray-7"
					v-html="readme" />

				<section class="border-t border-outline-gray-1 py-4">
					<div class="pb-3">
						<h2 class="text-sm font-medium text-ink-gray-8">Capabilities</h2>
						<p class="pt-0.5 text-xs text-ink-gray-5">
							Control what {{ details.label }} may do in Builder and on this site.
						</p>
					</div>
					<ExtensionCapabilities
						:extension="details.name"
						:label="details.label ?? details.name"
						:requested="details.requested_capabilities"
						:granted="details.granted_capabilities"
						@granted="(capabilities) => (details!.granted_capabilities = capabilities)" />
				</section>

				<div v-if="details.grants.length" class="border-t border-outline-gray-1 pt-4">
					<p class="pb-1 text-sm text-ink-gray-8">Doctypes you answered for</p>
					<p class="pb-3 text-xs text-ink-gray-5">Clear one and it asks you again.</p>
					<div class="flex flex-col gap-1">
						<div v-for="grant in details.grants" :key="grant.document_type" class="flex items-baseline gap-2">
							<span class="truncate text-p-sm text-ink-gray-7">{{ grant.document_type }}</span>
							<span class="text-xs text-ink-gray-5">{{ grantSummary(grant) }}</span>
						</div>
					</div>
				</div>

				<div class="flex flex-col gap-1 border-t border-outline-gray-1 pt-4 text-xs text-ink-gray-5">
					<p>{{ details.source_url || "Installed from a directory" }}</p>
					<p>Installed on {{ installedOn }}</p>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import ExtensionActions from "@/components/LeftPanelTabs/Extensions/ExtensionActions.vue";
import ExtensionCapabilities from "@/components/LeftPanelTabs/Extensions/ExtensionCapabilities.vue";
import { renderMarkdown } from "@/components/ai/markdown";
import {
	installedExtensions,
	installationDetails,
	setExtensionEnabled,
	uninstallExtension,
	uninstallSummary,
	type ExtensionGrant,
	type InstallationDetails,
} from "@/data/extensions";
import { openRegisteredPopover, registeredPopovers } from "@/extensions/editor/uiMethods";
import { confirm } from "@/utils/helpers";
import { Button, LoadingIndicator, toast } from "frappe-ui";
import { computed, ref, watch } from "vue";

const props = defineProps<{ extension: string }>();
const emit = defineEmits<{ back: [] }>();

const details = ref<InstallationDetails | null>(null);
const error = ref("");
const working = ref(false);

/** The running record, which a disabled extension does not have. Its popover needs a frame. */
const mounted = computed(() => installedExtensions.value.find((row) => row.name === props.extension));

const hasPopover = computed(() => registeredPopovers.has(props.extension));

const openPopover = () => mounted.value && openRegisteredPopover(mounted.value);

const readme = computed(() => (details.value?.readme ? renderMarkdown(details.value.readme) : ""));

const installedOn = computed(() =>
	details.value ? new Date(details.value.installed_on).toLocaleDateString() : "",
);

const load = async () => {
	details.value = null;
	error.value = "";
	try {
		details.value = await installationDetails(props.extension);
	} catch (thrown) {
		error.value = (thrown as Error).message;
	}
};

watch(() => props.extension, load, { immediate: true });

/** Disabling unmounts every frame, so the panel has to say what it did. */
const setEnabled = async (enabled: boolean) => {
	working.value = true;
	try {
		await setExtensionEnabled(props.extension, enabled);
		await load();
		toast.success(enabled ? "Extension enabled" : "Extension disabled");
	} catch (thrown) {
		toast.error((thrown as Error).message);
	} finally {
		working.value = false;
	}
};

/**
 * The summary is read before the question, because what the site keeps is the
 * part a user cannot guess: a token styles pages they already published.
 */
const uninstall = async () => {
	working.value = true;
	try {
		const summary = await uninstallSummary(props.extension);
		if (await confirm(uninstallMessage(summary), `Uninstall ${details.value?.label}?`)) {
			await uninstallExtension(props.extension);
			toast.success("Extension uninstalled");
			emit("back");
		}
	} catch (thrown) {
		toast.error((thrown as Error).message);
	} finally {
		working.value = false;
	}
};

const uninstallMessage = (summary: Awaited<ReturnType<typeof uninstallSummary>>) => {
	const kept = summary.resources.map((made) => `${made.count} ${made.resource_type}`);
	if (summary.tokens) kept.push(`${summary.tokens} design token(s)`);

	const lines = ["This removes your copy, your grants and what the extension remembered."];
	if (kept.length) lines.push(`The site keeps ${kept.join(", ")}, because published pages use them.`);
	if (summary.other_users) lines.push(`${summary.other_users} other user(s) still have it installed.`);
	return lines.join(" ");
};

const grantSummary = (grant: ExtensionGrant) => {
	if (grant.denied) return "denied";
	return ["read", "write", "delete"]
		.filter((action) => grant[`can_${action}` as keyof ExtensionGrant])
		.join(", ");
};
</script>

<style scoped>
/* The panel is 300 pixels wide, so anything that cannot wrap has to scroll in
 * its own box rather than push the column. */
.extension-readme :deep(pre),
.extension-readme :deep(table) {
	overflow-x: auto;
	display: block;
	max-width: 100%;
}
</style>
