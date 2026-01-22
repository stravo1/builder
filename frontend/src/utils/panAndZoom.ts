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

	// touch state
	let touchPanning = false;
	let lastTouchX = 0;
	let lastTouchY = 0;
	let pinchStartDistance = 0;
	let pinchStartScale = 1;

	const getDistance = (t1: Touch, t2: Touch) => {
		const dx = t2.clientX - t1.clientX;
		const dy = t2.clientY - t1.clientY;
		return Math.hypot(dx, dy);
	};

	const getCenter = (t1: Touch, t2: Touch) => ({
		x: (t1.clientX + t2.clientX) / 2,
		y: (t1.clientY + t2.clientY) / 2,
	});

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

	const onTouchStart = (e: TouchEvent) => {
		if (e.touches.length === 1) {
			touchPanning = true;
			props.panning = true;
			props.scaling = false;
			lastTouchX = e.touches[0].clientX;
			lastTouchY = e.touches[0].clientY;
		} else if (e.touches.length === 2) {
			touchPanning = false;
			props.scaling = true;
			props.panning = false;
			pinchStartDistance = getDistance(e.touches[0], e.touches[1]);
			pinchStartScale = props.scale;
		}
	};

	const onTouchMove = (e: TouchEvent) => {
		e.preventDefault();
		if (e.touches.length === 1 && touchPanning) {
			const t = e.touches[0];
			const dx = t.clientX - lastTouchX;
			const dy = t.clientY - lastTouchY;
			lastTouchX = t.clientX;
			lastTouchY = t.clientY;
			props.translateX += dx / props.scale;
			props.translateY += dy / props.scale;
		} else if (e.touches.length === 2) {
			const distance = getDistance(e.touches[0], e.touches[1]);
			const center = getCenter(e.touches[0], e.touches[1]);
			const nextScale = pinchStartScale * (distance / Math.max(pinchStartDistance, 1));
			setZoom(nextScale, center);
		}
	};

	const onTouchEnd = (e: TouchEvent) => {
		if (e.touches.length === 0) {
			touchPanning = false;
			props.panning = false;
			props.scaling = false;
		}
	};

	const preventDocumentZoom = (e: WheelEvent) => {
		if (e.ctrlKey || e.metaKey) e.preventDefault();
	};
	const preventGestureZoom = (e: Event) => e.preventDefault();

	panAndZoomAreaElement.addEventListener(
		"wheel",
		(e) => {
			e.preventDefault();
			requestAnimationFrame(() => updatePanAndZoom(e));
		},
		{ passive: false },
	);

	panAndZoomAreaElement.addEventListener("touchstart", onTouchStart, { passive: false });
	panAndZoomAreaElement.addEventListener("touchmove", onTouchMove, { passive: false });
	panAndZoomAreaElement.addEventListener("touchend", onTouchEnd);
	panAndZoomAreaElement.addEventListener("touchcancel", onTouchEnd);

	// Disable zooming for the entire document
	document.addEventListener("wheel", preventDocumentZoom, { passive: false });
	document.addEventListener("gesturestart", preventGestureZoom, { passive: false });
	document.addEventListener("gesturechange", preventGestureZoom, { passive: false });
	document.addEventListener("gestureend", preventGestureZoom, { passive: false });

	return { setZoom };
}

export default setPanAndZoom;
