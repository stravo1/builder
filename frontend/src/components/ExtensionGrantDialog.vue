<template>
	<!--
		The consent prompt, drawn by Builder and never by the extension (1.7). An
		extension frame cannot paint here, cannot read this, and cannot answer it.

		One instance for the whole editor: `grants.ts` queues requests so only one
		question stands at a time.
	-->
	<Dialog v-if="prompt" :modelValue="true" size="sm" bare @update:modelValue="deny">
		<template #default>
			<div class="flex flex-col gap-3 bg-surface-modal p-5">
				<DialogTitle as="h3" class="text-md-semibold text-ink-gray-9">
					{{ prompt.extension.label }} wants access
				</DialogTitle>

				<!-- the sentence ends with its bold subject, full stop included: Prettier
					may put whitespace after a closing tag, and "Contact ." would follow -->
				<DialogDescription as="p" class="text-p-sm text-ink-gray-6">
					{{ sentence.before }}
					<span class="font-semibold text-ink-gray-8">{{ sentence.subject }}.</span>
				</DialogDescription>

				<!-- the technical detail, for the user who wants it -->
				<div v-if="prompt.kind === 'method'" class="flex flex-col items-start gap-1.5">
					<Button
						variant="ghost"
						size="sm"
						:icon-right="showDetails ? 'lucide-chevron-up' : 'lucide-chevron-down'"
						@click="showDetails = !showDetails">
						Details
					</Button>
					<div v-if="showDetails" class="w-full rounded-4 bg-surface-gray-2 p-2">
						<p class="break-all font-mono text-xs text-ink-gray-8">{{ prompt.subject }}</p>
						<p v-if="prompt.description" class="pt-1 text-p-xs text-ink-gray-6">
							{{ prompt.description }}
						</p>
					</div>
				</div>

				<Checkbox
					v-if="prompt.kind === 'method'"
					v-model="wholeApp"
					:label="`Allow all actions from ${prompt.app}`" />

				<div v-if="prompt.sensitive" class="flex flex-col gap-2 rounded-4 bg-surface-red-1 p-3">
					<p class="text-p-sm text-ink-red-6">{{ warning }}</p>
					<Checkbox v-model="understood" :label="`I trust ${prompt.extension.label}`" />
				</div>

				<div class="flex justify-end gap-2 pt-1">
					<Button variant="subtle" @click="deny">Deny</Button>
					<Button variant="solid" :disabled="!canAllow" @click="allow">Allow</Button>
				</div>
			</div>
		</template>
	</Dialog>
</template>

<script setup lang="ts">
import Dialog from "@/components/Controls/Dialog.vue";
import { answerPrompt, pendingPrompt, type GrantPrompt } from "@/extensions/data/grants";
import { Button, Checkbox } from "frappe-ui";
import { computed, ref, watch } from "vue";
import { DialogDescription, DialogTitle } from "reka-ui";

const prompt = computed(() => pendingPrompt.value);
const understood = ref(false);
const wholeApp = ref(false);
const showDetails = ref(false);

// each question is answered on its own. Carrying a tick over would let one
// consent stand for a doctype, or an app, the user never saw
watch(prompt, () => {
	understood.value = false;
	wholeApp.value = false;
	showDetails.value = false;
});

const canAllow = computed(() => !prompt.value?.sensitive || understood.value);

/** "read", "read and write", "read, write and delete". */
const listed = (words: string[]) =>
	words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;

type Sentence = { before: string; subject: string };

/** One short sentence per question, ending with its subject in bold. */
const SENTENCES: Record<GrantPrompt["kind"], (asked: GrantPrompt) => Sentence> = {
	access: (asked) => ({ before: `It wants to ${listed(asked.access)} records of`, subject: asked.subject }),
	schema: (asked) => ({ before: `It wants to ${asked.act} the DocType`, subject: asked.subject }),
	script: (asked) => ({ before: "It wants to add a script to", subject: asked.subject }),
	method: (asked) => ({ before: "It wants to run an action from", subject: asked.app ?? "" }),
};

const sentence = computed(() =>
	prompt.value ? SENTENCES[prompt.value.kind](prompt.value) : { before: "", subject: "" },
);

const WARNINGS: Record<GrantPrompt["kind"], string> = {
	access: "This controls how your site works.",
	schema: "This deletes all its records.",
	script: "It runs for every visitor to this page.",
	method: "",
};

const warning = computed(() => WARNINGS[prompt.value?.kind ?? "access"]);

const allow = () => answerPrompt(true, wholeApp.value ? "app" : "method");

/**
 * The button, Escape and a click outside all mean the same thing. An unanswered
 * question is a no, which is what every browser permission prompt does.
 */
const deny = () => answerPrompt(false);
</script>
