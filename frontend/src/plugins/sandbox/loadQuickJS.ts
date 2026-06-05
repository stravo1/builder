import variant from "@jitl/quickjs-singlefile-browser-release-sync";
import { newQuickJSWASMModuleFromVariant, type QuickJSWASMModule } from "quickjs-emscripten-core";

let quickJSModulePromise: Promise<QuickJSWASMModule> | null = null;

export function loadQuickJSModule(): Promise<QuickJSWASMModule> {
	if (!quickJSModulePromise) {
		quickJSModulePromise = newQuickJSWASMModuleFromVariant(variant);
	}
	return quickJSModulePromise;
}
