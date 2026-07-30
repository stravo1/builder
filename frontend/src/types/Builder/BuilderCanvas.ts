import { useCanvasHistory } from "@/utils/useCanvasHistory";
import { Ref } from "vue";

export interface BreakpointConfig {
	icon: string;
	device: "desktop" | "tablet" | "mobile";
	displayName: string;
	width: number;
	visible: boolean;
	renderedOnce: boolean;
}

export interface CanvasProps {
	overlayElement: HTMLElement | null;
	frameDocument: Document | null;
	// Client scripts run only when the user asks for it, from the command palette.
	scriptsRunning: boolean;
	background: string;
	scale: number;
	translateX: number;
	translateY: number;
	settingCanvas: boolean;
	scaling: boolean;
	panning: boolean;
	breakpoints: BreakpointConfig[];
}

export type CanvasHistory = Ref<ReturnType<typeof useCanvasHistory>>;
