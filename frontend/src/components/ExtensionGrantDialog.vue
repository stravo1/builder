<template>
	<!--
		The consent prompt, drawn by Builder and never by the extension (1.7). An
		extension frame cannot paint here, cannot read this, and cannot answer it.

		One instance for the whole editor: `grants.ts` queues requests so only one
		question stands at a time.
	-->
	<Dialog v-if="prompt" :modelValue="true" size="sm" bare @update:modelValue="deny">
		<template #default>
			<div class="bg-surface-modal p-5">
				<DialogTitle as="h3" class="text-md-semibold text-ink-gray-9">
					{{ prompt.extension.label }} wants access
				</DialogTitle>

				<!-- the period is part of the interpolation, not a node beside it: a
					newline between a closing tag and a bare "." becomes a text node, and
					the sentence reads "Contact ." Prettier reflows the markup, so the
					punctuation cannot live in the whitespace -->
				<DialogDescription as="p" class="pt-4 text-p-sm text-ink-gray-6">
					It wants to
					<span class="font-semibold text-ink-gray-8">{{ verbs }}</span>
					{{ object }}
					<span class="font-semibold text-ink-gray-8">{{ subject }}</span>
				</DialogDescription>

				<p v-if="prompt.description" class="pt-2 text-p-sm text-ink-gray-7">{{ prompt.description }}</p>

				<p v-if="prompt.kind === 'method'" class="pt-2 text-p-sm text-ink-gray-5">
					It runs as you, so it can change anything you can.
				</p>
				<p v-else class="pt-2 text-p-sm text-ink-gray-5">It cannot do more than you can.</p>

				<label
					v-if="prompt.kind === 'method'"
					class="flex cursor-pointer items-start gap-2 pt-3 text-p-sm text-ink-gray-7">
					<input v-model="wholeApp" type="checkbox" class="mt-0.5" />
					<span>Also allow every other method of {{ prompt.app }}</span>
				</label>

				<div v-if="prompt.sensitive" class="mt-4 rounded-4 bg-surface-red-1 p-3">
					<p v-if="prompt.kind === 'schema'" class="text-p-sm text-ink-red-6">
						Deleting a DocType deletes all its records. You cannot undo this.
					</p>
					<p v-else-if="prompt.kind === 'script'" class="text-p-sm text-ink-red-6">
						The script runs for everyone who visits this page. You can see or remove it in the Code tab.
					</p>
					<p v-else class="text-p-sm text-ink-red-6">
						{{ prompt.subject }} controls how your site works. Changes to it can affect other people and
						extensions.
					</p>
					<label class="flex cursor-pointer items-start gap-2 pt-3 text-p-sm text-ink-red-6">
						<input v-model="understood" type="checkbox" class="mt-0.5" />
						<span>I trust {{ prompt.extension.label }} with this.</span>
					</label>
				</div>

				<div class="flex justify-end gap-2 pt-4">
					<Button variant="subtle" @click="deny">Deny</Button>
					<Button variant="solid" :disabled="!canAllow" @click="allow">Allow</Button>
				</div>
			</div>
		</template>
	</Dialog>
</template>

<script setup lang="ts">
import Dialog from "@/components/Controls/Dialog.vue";
import { answerPrompt, pendingPrompt } from "@/extensions/data/grants";
import { Button } from "frappe-ui";
import { computed, ref, watch } from "vue";
import { DialogDescription, DialogTitle } from "reka-ui";

const prompt = computed(() => pendingPrompt.value);
const understood = ref(false);
const wholeApp = ref(false);

// each question is answered on its own. Carrying a tick over would let one
// consent stand for a doctype, or an app, the user never saw
watch(prompt, () => {
	understood.value = false;
	wholeApp.value = false;
});

const canAllow = computed(() => !prompt.value?.sensitive || understood.value);

/** The subject and the full stop, so no reflow can put whitespace between them. */
const subject = computed(() => `${prompt.value?.subject}.`);

/**
 * "read", "read and write", "read, write and delete" — or the one verb a schema
 * or script prompt names.
 */
const verbs = computed(() => {
	if (prompt.value?.kind === "schema") return prompt.value.act ?? "";
	if (prompt.value?.kind === "script") return "run a script";
	if (prompt.value?.kind === "method") return "run";
	const asked = prompt.value?.access ?? [];
	if (asked.length < 2) return asked.join("");
	return `${asked.slice(0, -1).join(", ")} and ${asked[asked.length - 1]}`;
});

/** What the verbs act on: records of a doctype, the doctype itself, or a page. */
const object = computed(
	() =>
		({ schema: "the DocType", script: "on the page", access: "records of", method: "the server method" })[
			prompt.value?.kind ?? "access"
		],
);

const allow = () => answerPrompt(true, wholeApp.value ? "app" : "method");

/**
 * The button, Escape and a click outside all mean the same thing. An unanswered
 * question is a no, which is what every browser permission prompt does.
 */
const deny = () => answerPrompt(false);
</script>
