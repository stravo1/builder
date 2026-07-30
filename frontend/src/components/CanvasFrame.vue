<template>
	<iframe
		ref="iframe"
		:srcdoc="frameDocument"
		title="Canvas"
		class="block border-0 bg-transparent"
		:style="{ width: `${width}px`, height: `${height}px` }" />
	<Teleport v-if="frameBody" :to="frameBody">
		<div
			ref="canvasRoot"
			class="canvas-root flex w-max items-start gap-40"
			:class="{ 'scheme-dark': dark }"
			:data-builder-canvas="canvasId"
			:style="{ minHeight: `${minHeight}px`, colorScheme: dark ? 'dark' : 'light' }">
			<slot :min-height="minHeight" />
		</div>
	</Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";

const props = defineProps<{
	canvasId: string;
	minHeight: number;
	dark: boolean;
}>();

const emit = defineEmits<{
	ready: [doc: Document, frame: HTMLIFrameElement];
	dispose: [doc: Document];
	resize: [width: number, height: number];
}>();

const iframe = ref<HTMLIFrameElement | null>(null);
const canvasRoot = ref<HTMLElement | null>(null);
const frameBody = ref<HTMLElement | null>(null);
const width = ref(1);
const height = ref(1);

let currentDocument: Document | null = null;
let contentObserver: ResizeObserver | null = null;
let headObserver: MutationObserver | null = null;

// srcdoc frames resolve relative URLs against about:srcdoc, so the base tag keeps
// cloned stylesheets and block assets pointing at the same origin as the editor.
const frameDocument = computed(
	() => `<!doctype html><html><head><base href="${document.baseURI}"></head><body></body></html>`,
);

const STYLE_MARKER = "data-builder-frame-style";

function cloneEditorStyles(doc: Document) {
	doc.head.querySelectorAll(`[${STYLE_MARKER}]`).forEach((node) => node.remove());
	document.head.querySelectorAll("link[rel='stylesheet'], style").forEach((source) => {
		const clone = source.cloneNode(true) as HTMLElement;
		clone.setAttribute(STYLE_MARKER, "");
		doc.head.appendChild(clone);
	});
}

function syncDocumentChrome(doc: Document) {
	doc.documentElement.dataset.theme = document.documentElement.dataset.theme || "";
	doc.documentElement.className = document.documentElement.className;
	doc.documentElement.style.overflow = "hidden";
	doc.body.className = document.body.className;
	doc.body.style.margin = "0";
	doc.body.style.overflow = "hidden";
	// The cloned editor stylesheets paint a page background. Keeping the frame
	// transparent lets the editor backdrop show through the gaps between breakpoints.
	doc.documentElement.style.background = "transparent";
	doc.body.style.background = "transparent";
	// The page body of every breakpoint is a block that also renders as <body>, so a
	// `body` rule in the user's CSS matches the frame's own body as well. `display:
	// contents` stops that body generating a box, so padding, borders and backgrounds
	// meant for the page cannot move or paint the canvas itself. Inline wins over the
	// stylesheet, so the user cannot undo it by accident.
	doc.body.style.display = "contents";
}

function updateSize() {
	if (!canvasRoot.value) return;
	const nextWidth = Math.max(1, Math.ceil(canvasRoot.value.scrollWidth));
	const nextHeight = Math.max(1, Math.ceil(canvasRoot.value.scrollHeight));
	if (nextWidth === width.value && nextHeight === height.value) return;
	width.value = nextWidth;
	height.value = nextHeight;
	emit("resize", nextWidth, nextHeight);
}

function releaseFrame() {
	contentObserver?.disconnect();
	contentObserver = null;
	headObserver?.disconnect();
	headObserver = null;
	if (currentDocument) emit("dispose", currentDocument);
	currentDocument = null;
	frameBody.value = null;
}

async function attachFrame() {
	const frame = iframe.value;
	const doc = frame?.contentDocument;
	// A srcdoc frame is attached once on mount and again on load, and both times it is
	// the same document. Re-attaching would run every page script into it a second time.
	if (doc && doc === currentDocument) return;

	releaseFrame();
	if (!frame || !doc || doc.readyState === "loading") return;

	currentDocument = doc;
	syncDocumentChrome(doc);
	cloneEditorStyles(doc);
	frameBody.value = doc.body;
	await nextTick();
	if (!canvasRoot.value || currentDocument !== doc) return;

	watchEditorHead(doc);
	observeContent(doc);
	emit("ready", doc, frame);
}

function observeContent(doc: Document) {
	const FrameResizeObserver = doc.defaultView?.ResizeObserver || ResizeObserver;
	contentObserver = new FrameResizeObserver(updateSize);
	contentObserver.observe(canvasRoot.value as HTMLElement);
	updateSize();
}

function watchEditorHead(doc: Document) {
	headObserver = new MutationObserver((mutations) => {
		if (currentDocument !== doc) return;
		if (mutations.some(({ target }) => document.head.contains(target))) cloneEditorStyles(doc);
		if (mutations.some(({ type }) => type === "attributes")) syncDocumentChrome(doc);
	});
	headObserver.observe(document.head, { childList: true, subtree: true, characterData: true });
	headObserver.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ["class", "data-theme"],
	});
	headObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
}

watch(
	iframe,
	(frame, previous) => {
		previous?.removeEventListener("load", attachFrame);
		frame?.addEventListener("load", attachFrame);
		attachFrame();
	},
	{ flush: "post" },
);

watch(
	() => props.minHeight,
	() => nextTick(updateSize),
);

onBeforeUnmount(() => {
	iframe.value?.removeEventListener("load", attachFrame);
	releaseFrame();
});
</script>
