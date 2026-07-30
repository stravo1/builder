// The canvas renders inside an iframe, so every measurement taken in the canvas is in
// frame coordinates while the editor overlay works in editor coordinates. These helpers
// are the only place that knows about that boundary.

export type CanvasPoint = { x: number; y: number };

type CanvasDragMove = {
	event: MouseEvent;
	point: CanvasPoint;
	startPoint: CanvasPoint;
	movementX: number;
	movementY: number;
};

type CanvasDragOptions = {
	cursor?: string;
	// Pixels of travel before the gesture counts as a drag. Until then no move is
	// reported and the capture layer stays down, so a plain press still clicks through.
	threshold?: number;
	onMove: (move: CanvasDragMove) => void;
	onEnd?: (event?: MouseEvent) => void;
	// Runs before onEnd.
	onCancel?: () => void;
};

export function getElementDocument(element: Element | null): Document {
	return element?.ownerDocument || document;
}

export function getElementWindow(element: Element | null): Window {
	return getElementDocument(element).defaultView || window;
}

export function getComputedStyleFor(element: Element): CSSStyleDeclaration {
	return getElementWindow(element).getComputedStyle(element);
}

export function getFrameElement(doc: Document): HTMLIFrameElement | null {
	const frame = doc.defaultView?.frameElement;
	return frame instanceof HTMLIFrameElement ? frame : null;
}

// The frame is scaled by the canvas transform, so its rendered width over its layout
// width is the canvas scale.
function getFrameScale(frame: HTMLIFrameElement) {
	const rect = frame.getBoundingClientRect();
	return {
		rect,
		scaleX: frame.clientWidth ? rect.width / frame.clientWidth : 1,
		scaleY: frame.clientHeight ? rect.height / frame.clientHeight : 1,
	};
}

export function getElementRectInEditor(element: Element): DOMRect {
	const rect = element.getBoundingClientRect();
	const frame = getFrameElement(element.ownerDocument);
	if (!frame) return rect;

	const { rect: frameRect, scaleX, scaleY } = getFrameScale(frame);
	return new DOMRect(
		frameRect.left + rect.left * scaleX,
		frameRect.top + rect.top * scaleY,
		rect.width * scaleX,
		rect.height * scaleY,
	);
}

export function framePointToEditor(doc: Document, point: CanvasPoint): CanvasPoint {
	const frame = getFrameElement(doc);
	if (!frame) return point;

	const { rect, scaleX, scaleY } = getFrameScale(frame);
	return { x: rect.left + point.x * scaleX, y: rect.top + point.y * scaleY };
}

export function editorPointToFrame(frame: HTMLIFrameElement, point: CanvasPoint): CanvasPoint {
	const { rect, scaleX, scaleY } = getFrameScale(frame);
	return { x: (point.x - rect.left) / scaleX, y: (point.y - rect.top) / scaleY };
}

export function getEventDocument(event: Event): Document {
	const target = event.target as { nodeType?: number; ownerDocument?: Document } | null;
	if (target?.nodeType === Node.DOCUMENT_NODE) return target as unknown as Document;
	return target?.ownerDocument || document;
}

export function getEventPointInEditor(event: MouseEvent): CanvasPoint {
	return framePointToEditor(getEventDocument(event), { x: event.clientX, y: event.clientY });
}

export function getEventPointInDocument(event: MouseEvent, doc: Document): CanvasPoint {
	const point = getEventPointInEditor(event);
	const frame = getFrameElement(doc);
	return frame ? editorPointToFrame(frame, point) : point;
}

export const CAPTURE_ATTRIBUTE = "data-canvas-capture";

// document.elementFromPoint stops at the iframe, so read through it into the canvas.
// Capture layers are see-through for this test: they exist to collect events, not to
// stand in for what the pointer is over.
export function elementFromEditorPoint(x: number, y: number): Element | null {
	const stack = document.elementsFromPoint(x, y);
	const element = stack.find((node) => !node.hasAttribute(CAPTURE_ATTRIBUTE)) || null;
	if (!(element instanceof HTMLIFrameElement) || !element.contentDocument) return element;

	const point = editorPointToFrame(element, { x, y });
	return element.contentDocument.elementFromPoint(point.x, point.y) || element;
}

// Focus follows the user into the frame when they select or edit a block, so the editor
// document stops seeing key presses. Keys carry no coordinates, so a plain re-dispatch is
// enough. This is the only event the canvas forwards.
export function forwardFrameKeys(frameDoc: Document) {
	const forward = (event: KeyboardEvent) => {
		if (isEditableTarget(event.target)) return;
		const forwarded = new KeyboardEvent(event.type, {
			bubbles: true,
			cancelable: event.cancelable,
			key: event.key,
			code: event.code,
			location: event.location,
			repeat: event.repeat,
			isComposing: event.isComposing,
			ctrlKey: event.ctrlKey,
			altKey: event.altKey,
			shiftKey: event.shiftKey,
			metaKey: event.metaKey,
		});
		if (!document.dispatchEvent(forwarded)) event.preventDefault();
	};

	frameDoc.addEventListener("keydown", forward);
	frameDoc.addEventListener("keyup", forward);
	return () => {
		frameDoc.removeEventListener("keydown", forward);
		frameDoc.removeEventListener("keyup", forward);
	};
}

function isEditableTarget(target: EventTarget | null) {
	if (!(target instanceof HTMLElement)) return false;
	return (
		target.isContentEditable ||
		["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
		Boolean(target.closest("[contenteditable='true']"))
	);
}

// A drag that starts on a block runs in the frame document, but the pointer can leave the
// frame and land on a panel. The capture layer sits above everything in the editor
// document for the length of the gesture, so one listener pair sees the whole drag.
//
// The layer goes up only once the gesture is real. Raising it on mousedown would take the
// matching mouseup away from the block, and the browser would never fire the click.
let captureLayer: HTMLElement | null = null;
let activeGestures = 0;

function raiseCaptureLayer(cursor?: string) {
	if (!captureLayer) {
		captureLayer = document.createElement("div");
		captureLayer.id = "canvas-gesture-capture";
		captureLayer.setAttribute(CAPTURE_ATTRIBUTE, "");
		captureLayer.style.cssText = "position:fixed;inset:0;z-index:9999";
	}
	captureLayer.style.cursor = cursor || "";
	if (!captureLayer.isConnected) document.body.appendChild(captureLayer);
	activeGestures += 1;
}

function lowerCaptureLayer() {
	activeGestures = Math.max(0, activeGestures - 1);
	if (activeGestures === 0) captureLayer?.remove();
}

export function startCanvasDrag(
	startEvent: MouseEvent,
	{ cursor, threshold = 0, onMove, onEnd, onCancel }: CanvasDragOptions,
) {
	const startPoint = getEventPointInEditor(startEvent);
	const frameDocument = getEventDocument(startEvent);
	let capturing = false;
	let stopped = false;

	const startCapture = () => {
		if (capturing) return;
		capturing = true;
		raiseCaptureLayer(cursor);
	};
	if (!threshold) startCapture();

	const stop = () => {
		if (stopped) return;
		stopped = true;
		document.removeEventListener("mousemove", handleMove);
		document.removeEventListener("mouseup", handleEnd);
		document.removeEventListener("keydown", handleKeyDown);
		frameDocument.removeEventListener("mousemove", handleMove);
		frameDocument.removeEventListener("mouseup", handleEnd);
		if (capturing) lowerCaptureLayer();
	};
	const handleMove = (event: MouseEvent) => {
		const point = getEventPointInEditor(event);
		const movementX = point.x - startPoint.x;
		const movementY = point.y - startPoint.y;
		if (!capturing) {
			if (Math.abs(movementX) < threshold && Math.abs(movementY) < threshold) return;
			startCapture();
		}
		onMove({ event, point, startPoint, movementX, movementY });
	};
	const handleEnd = (event: MouseEvent) => {
		stop();
		onEnd?.(event);
	};
	// Dropping the mouseup listener keeps the pending release from ending the drag twice.
	const handleKeyDown = (event: KeyboardEvent) => {
		if (event.key !== "Escape") return;
		event.preventDefault();
		stop();
		onCancel?.();
		onEnd?.();
	};

	document.addEventListener("mousemove", handleMove);
	document.addEventListener("mouseup", handleEnd);
	document.addEventListener("keydown", handleKeyDown);
	// Before the capture layer goes up the pointer is still inside the frame, so the
	// frame document has to be listened to as well.
	if (frameDocument !== document) {
		frameDocument.addEventListener("mousemove", handleMove);
		frameDocument.addEventListener("mouseup", handleEnd);
	}
	return stop;
}
