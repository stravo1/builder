import type { BuilderClientScript } from "@/types/doctypes";

// A published page gets its client scripts as plain style and script elements in the
// page document. The canvas frame is a document of its own, so it can have the same
// thing: no proxy, no rewriting, and window and document inside a script point at the
// canvas rather than the editor.

const SCRIPT_MARKER = "data-builder-page-script";

function removeInjectedScripts(frameDocument: Document) {
	frameDocument.querySelectorAll(`[${SCRIPT_MARKER}]`).forEach((node) => node.remove());
}

function injectStyle(frameDocument: Document, script: BuilderClientScript) {
	const style = frameDocument.createElement("style");
	style.setAttribute(SCRIPT_MARKER, script.name);
	style.textContent = script.script || "";
	frameDocument.head.appendChild(style);
}

function injectScript(frameDocument: Document, script: BuilderClientScript) {
	const element = frameDocument.createElement("script");
	element.setAttribute(SCRIPT_MARKER, script.name);
	// The frame has no CSP of its own, so an inline script runs as it would on the
	// published page. A src would need the script saved as a file first.
	element.textContent = script.script || "";
	frameDocument.body.appendChild(element);
}

/**
 * Replaces the page scripts in the canvas frame. CSS always applies, because it only
 * changes how the page looks. JavaScript runs only when the editor is set to execute
 * client scripts, since a script can fight the editor for clicks and focus.
 */
export function applyPageScripts(
	frameDocument: Document,
	scripts: BuilderClientScript[],
	runJavaScript: boolean,
) {
	removeInjectedScripts(frameDocument);
	scripts.forEach((script) => {
		if (!script.script?.trim()) return;
		if (script.script_type === "CSS") {
			injectStyle(frameDocument, script);
		} else if (runJavaScript) {
			injectScript(frameDocument, script);
		}
	});
}

export { SCRIPT_MARKER as PAGE_SCRIPT_MARKER };
