import { useElementBounding } from "@vueuse/core";
import { nextTick, reactive } from "vue";

function setPanAndZoom(
	target: HTMLElement,
	panAndZoomAreaElement: HTMLElement,
	props: CanvasProps,
	zoomLimits = { min: 0.1, max: 10 },
) {
	const targetBound = reactive(useElementBounding(target));
	let pointFromCenterX = 0;
	let pointFromCenterY = 0;
	let startX = 0;
	let startY = 0;
	let pinchPointSet = false;
	let wheeling: undefined | NodeJS.Timeout;

	// Track active pointers for multi-touch pinch-to-zoom and pan
	const activePointers = new Map<number, { x: number; y: number }>();

	const setZoom = (scale: number, pinchPoint: { x: number; y: number } | "center" = "center") => {
		const clampedScale = Math.min(Math.max(scale, zoomLimits.min), zoomLimits.max);
		const oldScale = props.scale;

		let pinchX: number;
		let pinchY: number;

		if (pinchPoint === "center") {
			const areaBound = panAndZoomAreaElement.getBoundingClientRect();
			pinchX = areaBound.left + areaBound.width / 2;
			pinchY = areaBound.top + areaBound.height / 2;
		} else {
			pinchX = pinchPoint.x;
			pinchY = pinchPoint.y;
		}

		const middleX = targetBound.left + targetBound.width / 2;
		const middleY = targetBound.top + targetBound.height / 2;
		const pointFromCenterX = (pinchX - middleX) / oldScale;
		const pointFromCenterY = (pinchY - middleY) / oldScale;

		props.scale = clampedScale;

		nextTick(() => {
			// Recalculate the middle after scale change
			const newMiddleX = targetBound.left + targetBound.width / 2;
			const newMiddleY = targetBound.top + targetBound.height / 2;

			// Calculate where the pinch point ended up after scaling
			const pinchLocationX = newMiddleX + pointFromCenterX * clampedScale;
			const pinchLocationY = newMiddleY + pointFromCenterY * clampedScale;

			// Adjust translation to keep the pinch point in place
			const diffX = pinchX - pinchLocationX;
			const diffY = pinchY - pinchLocationY;

			props.translateX += diffX / clampedScale;
			props.translateY += diffY / clampedScale;
		});
	};

	const updatePanAndZoom = (e: WheelEvent) => {
		clearTimeout(wheeling);
		if (e.ctrlKey || e.metaKey) {
			props.scaling = true;
			if (!pinchPointSet) {
				// set pinch point before setting new scale value
				const middleX = targetBound.left + targetBound.width / 2;
				const middleY = targetBound.top + targetBound.height / 2;
				pointFromCenterX = (e.clientX - middleX) / props.scale;
				pointFromCenterY = (e.clientY - middleY) / props.scale;
				startX = e.clientX;
				startY = e.clientY;
				pinchPointSet = true;
				let clearPinchPoint = () => {
					pinchPointSet = false;
				};
				panAndZoomAreaElement.addEventListener("mousemove", clearPinchPoint, { once: true });
			}

			let sensitivity = 0.008;
			function tooMuchScroll() {
				if (e.deltaY > 30 || e.deltaY < -30) {
					return true;
				}
			}
			if (tooMuchScroll()) {
				// If the user scrolls too much, reduce the sensitivity
				// this mostly happens when the user uses mouse wheel to scroll
				// probably not the best way to handle this, but works for now
				sensitivity = 0.001;
			}

			// Multiplying with scale to make the zooming feel consistent
			let scale = props.scale - e.deltaY * sensitivity * props.scale;
			scale = Math.min(Math.max(scale, zoomLimits.min), zoomLimits.max);
			props.scale = scale;
			nextTick(() => {
				const middleX = targetBound.left + targetBound.width / 2;
				const middleY = targetBound.top + targetBound.height / 2;

				const pinchLocationX = middleX + pointFromCenterX * scale;
				const pinchLocationY = middleY + pointFromCenterY * scale;

				const diffX = startX - pinchLocationX;
				const diffY = startY - pinchLocationY;

				props.translateX += diffX / scale;
				props.translateY += diffY / scale;
			});
		} else {
			props.panning = true;
			pinchPointSet = false;
			// Dividing with scale to make the panning feel consistent
			props.translateX -= e.deltaX / props.scale;
			props.translateY -= e.deltaY / props.scale;
		}
		wheeling = setTimeout(() => {
			props.scaling = false;
			props.panning = false;
		}, 200);
	};

	panAndZoomAreaElement.addEventListener(
		"wheel",
		(e) => {
			e.preventDefault();
			requestAnimationFrame(() => updatePanAndZoom(e));
		},
		{ passive: false },
	);

	// Touch/stylus: track pointer positions for pinch-to-zoom and two-finger pan
	const onPointerDown = (e: PointerEvent) => {
		if (e.pointerType === "mouse") return;
		activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
	};

	const onPointerMove = (e: PointerEvent) => {
		if (e.pointerType === "mouse") return;
		if (!activePointers.has(e.pointerId)) return;

		const prevPointers = new Map(activePointers);
		activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

		if (activePointers.size === 2) {
			// Two-finger pinch-to-zoom and pan
			const prev = Array.from(prevPointers.values());
			const curr = Array.from(activePointers.values());
			if (prev.length < 2) return;

			const prevDist = Math.hypot(prev[1].x - prev[0].x, prev[1].y - prev[0].y);
			const currDist = Math.hypot(curr[1].x - curr[0].x, curr[1].y - curr[0].y);

			if (prevDist > 0) {
				const midX = (curr[0].x + curr[1].x) / 2;
				const midY = (curr[0].y + curr[1].y) / 2;
				setZoom(props.scale * (currDist / prevDist), { x: midX, y: midY });
			}

			// Two-finger pan
			const prevMidX = (prev[0].x + prev[1].x) / 2;
			const prevMidY = (prev[0].y + prev[1].y) / 2;
			const currMidX = (curr[0].x + curr[1].x) / 2;
			const currMidY = (curr[0].y + curr[1].y) / 2;
			props.translateX += (currMidX - prevMidX) / props.scale;
			props.translateY += (currMidY - prevMidY) / props.scale;
			props.scaling = true;
			props.panning = true;

			clearTimeout(wheeling);
			wheeling = setTimeout(() => {
				props.scaling = false;
				props.panning = false;
			}, 200);
			e.preventDefault();
		} else if (activePointers.size === 1) {
			// Single-finger pan
			const prev = prevPointers.get(e.pointerId);
			if (!prev) return;
			props.translateX += (e.clientX - prev.x) / props.scale;
			props.translateY += (e.clientY - prev.y) / props.scale;
			props.panning = true;

			clearTimeout(wheeling);
			wheeling = setTimeout(() => {
				props.panning = false;
			}, 200);
			e.preventDefault();
		}
	};

	const onPointerUp = (e: PointerEvent) => {
		if (e.pointerType === "mouse") return;
		activePointers.delete(e.pointerId);
		if (activePointers.size < 2) {
			props.scaling = false;
		}
		if (activePointers.size === 0) {
			props.panning = false;
		}
	};

	panAndZoomAreaElement.addEventListener("pointerdown", onPointerDown);
	panAndZoomAreaElement.addEventListener("pointermove", onPointerMove, { passive: false });
	panAndZoomAreaElement.addEventListener("pointerup", onPointerUp);
	panAndZoomAreaElement.addEventListener("pointercancel", onPointerUp);

	return { setZoom };
}

export default setPanAndZoom;
