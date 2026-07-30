import type { BuilderClientScript } from "@/types/doctypes";

// A published page gets its client scripts as plain style and script elements in the
// page document. The canvas frame is a document of its own, so it can have the same
// thing: no proxy, no rewriting, and window and document inside a script point at the
// canvas rather than the editor.

const SCRIPT_MARKER = "data-builder-page-script";

// `body` and `:root` in the user's CSS mean the page. On a published page that is the
// document root. In the canvas one frame holds every breakpoint, and each page renders
// as a block, so those rules would land on the frame instead of on the pages. Point them
// at the page root of each breakpoint, which is what the same rule reaches once
// published.
export const PAGE_ROOT_CLASS = "__builder_page_root__";
const PAGE_ROOT_SELECTOR = `.${PAGE_ROOT_CLASS}`;
const ROOT_TOKEN = /(^|[\s>+~(])(html|body)\b/g;

function retargetSelector(selector: string) {
	return (
		selector
			.split(",")
			// `html body` names one element on a page, so drop the outer half first.
			.map((part) => part.replace(/(^|[\s>+~(])html\s+body\b/g, "$1body"))
			.map((part) => part.replace(ROOT_TOKEN, `$1${PAGE_ROOT_SELECTOR}`))
			.map((part) => part.replace(/(^|[\s>+~(]):root\b/g, `$1${PAGE_ROOT_SELECTOR}`))
			.join(",")
	);
}

// The rules belong to the frame, so their constructors are the frame's. Read the shape
// of each rule instead of testing it against the editor's classes.
function retargetRootSelectors(container: { cssRules: CSSRuleList }) {
	Array.from(container.cssRules).forEach((rule) => {
		if ("selectorText" in rule) {
			const styleRule = rule as CSSStyleRule;
			const retargeted = retargetSelector(styleRule.selectorText);
			if (retargeted !== styleRule.selectorText) styleRule.selectorText = retargeted;
		} else if ("cssRules" in rule) {
			retargetRootSelectors(rule as unknown as { cssRules: CSSRuleList });
		}
	});
}

function removeInjectedScripts(frameDocument: Document) {
	frameDocument.querySelectorAll(`[${SCRIPT_MARKER}]`).forEach((node) => node.remove());
}

function injectStyle(frameDocument: Document, script: BuilderClientScript) {
	const style = frameDocument.createElement("style");
	style.setAttribute(SCRIPT_MARKER, script.name);
	style.textContent = script.script || "";
	frameDocument.head.appendChild(style);
	// The browser has parsed the selectors by now, so the retarget works on real
	// selector text instead of a guess at where one ends.
	if (style.sheet) retargetRootSelectors(style.sheet);
}

function injectScript(frameDocument: Document, script: BuilderClientScript) {
	const element = frameDocument.createElement("script");
	element.setAttribute(SCRIPT_MARKER, script.name);
	// Wrapped in a function so the user can stop and run again. A script element that has
	// run cannot be un-run, and a second run of the same top-level `const` throws. The
	// cost is that a top-level `var` or function stays local instead of becoming a global
	// on the canvas window, which a published page would grant it.
	element.textContent = `(function () {\n${script.script || ""}\n})();`;
	frameDocument.body.appendChild(element);
}

/**
 * Replaces the page scripts in the canvas frame. Nothing goes in while the scripts are
 * stopped: CSS can move blocks out of reach as easily as JavaScript can, so Run governs
 * both.
 */
export function applyPageScripts(frameDocument: Document, scripts: BuilderClientScript[], running: boolean) {
	removeInjectedScripts(frameDocument);
	if (!running) return;
	scripts.forEach((script) => {
		if (!script.script?.trim()) return;
		if (script.script_type === "CSS") {
			injectStyle(frameDocument, script);
		} else {
			injectScript(frameDocument, script);
		}
	});
}

export { SCRIPT_MARKER as PAGE_SCRIPT_MARKER };
