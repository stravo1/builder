import {
	computed,
	customRef,
	effect,
	effectScope,
	getCurrentScope,
	isProxy,
	isReactive,
	isReadonly,
	isRef,
	markRaw,
	onScopeDispose,
	reactive,
	readonly,
	ref,
	shallowReactive,
	shallowReadonly,
	shallowRef,
	stop,
	toRaw,
	toRef,
	toRefs,
	triggerRef,
	unref,
	watch,
} from "@vue/reactivity";

const reactivity = {
	computed,
	customRef,
	effect,
	effectScope,
	getCurrentScope,
	isProxy,
	isReactive,
	isReadonly,
	isRef,
	markRaw,
	onScopeDispose,
	reactive,
	readonly,
	ref,
	shallowReactive,
	shallowReadonly,
	shallowRef,
	stop,
	toRaw,
	toRef,
	toRefs,
	triggerRef,
	unref,
	watch,
	// Alias for Vue users — implemented by `effect` in @vue/reactivity
	watchEffect: effect,
};

type ComponentElement = HTMLElement & {
	getComponentProps?: () => Record<string, any>;
	setComponentProp?: (name: string, value: any) => ComponentElement;
	setComponentProps?: (values: Record<string, any>) => ComponentElement;
};

type ComponentScript = (this: ComponentElement, componentData: any, props: Record<string, any>) => void | (() => void);

type ComponentScope = {
	page: string;
	blockId: string;
	el: ComponentElement;
	props: Record<string, any>;
	reactiveProps: string[];
	componentData: any;
	script?: ComponentScript;
	cleanup: null | (() => void);
	version: number;
	timer: number | null;
	stop: null | (() => void);
};

type MountOptions = {
	page: string;
	blockId: string;
	uid?: string;
	el: HTMLElement | null;
	props?: Record<string, any>;
	reactiveProps?: string[];
	componentData?: any;
	script?: ComponentScript;
};

const componentScopes = new Map<string, ComponentScope>();

function getScopeKey(page: string, blockId: string) {
	return `${page}:${blockId}`;
}

function getBuilderBlock(uid?: string) {
	if (!uid) return null;
	return document.querySelector(`[data-block-uid="${uid}"]`) as ComponentElement | null;
}

function styleId(page: string, blockId: string) {
	return `builder-fragment-style:${page}:${blockId}`;
}

function getCSRFToken() {
	return (window as any).frappe?.csrf_token || "";
}

function getRouteVariables() {
	return (window as any).builder?.routeVariables || {};
}

function logRefreshError(error: unknown) {
	console.error("Failed to refresh Builder component", error);
}

function getReactiveProps(options: MountOptions) {
	return Array.isArray(options.reactiveProps)
		? options.reactiveProps.filter((name) => typeof name === "string")
		: [];
}

function getInitialProps(options: MountOptions) {
	const props = options.props || {};
	return getReactiveProps(options).length ? reactive(props) : props;
}

function clearRefreshTimer(scope: ComponentScope) {
	if (!scope.timer) return;
	window.clearTimeout(scope.timer);
	scope.timer = null;
}

function updatePropWatcher(scope: ComponentScope) {
	scope.stop?.();
	scope.stop = null;

	if (!scope.reactiveProps.length) {
		clearRefreshTimer(scope);
		if (isReactive(scope.props)) {
			scope.props = toRaw(scope.props);
		}
		return;
	}

	if (!isReactive(scope.props)) {
		scope.props = reactive(scope.props);
	}

	scope.stop = watch(() => scope.reactiveProps.map((name) => scope.props[name]), () => scheduleRefresh(scope), {
		deep: true,
	});
}

function attachComponentPropAPI(scope: ComponentScope) {
	Object.defineProperties(scope.el, {
		getComponentProps: {
			configurable: true,
			value: () => readonly(scope.props),
		},
		setComponentProp: {
			configurable: true,
			value: (name: string, value: any) => {
				scope.props[name] = value;
				return scope.el;
			},
		},
		setComponentProps: {
			configurable: true,
			value: (values: Record<string, any>) => {
				Object.assign(scope.props, values || {});
				return scope.el;
			},
		},
	});
}

function runComponentScript(scope: ComponentScope) {
	scope.cleanup?.();
	scope.cleanup = null;
	if (!scope.script) return;
	const cleanup = scope.script.call(scope.el, scope.componentData, scope.props);
	scope.cleanup = typeof cleanup === "function" ? cleanup : null;
}

function executeMountScripts(root: HTMLElement) {
	root.querySelectorAll("script[data-builder-component-mount]").forEach((script) => {
		const code = script.textContent || "";
		if (!code.trim()) return;
		new Function(code)();
	});
}

function upsertFragmentStyle(scope: ComponentScope, style: string) {
	const id = styleId(scope.page, scope.blockId);
	let styleEl = Array.from(document.querySelectorAll("style[data-builder-fragment-style]")).find(
		(el) => el.getAttribute("data-builder-fragment-style") === id,
	) as HTMLStyleElement | undefined;
	if (!style && styleEl) {
		styleEl.remove();
		return;
	}
	if (!style) return;
	if (!styleEl) {
		styleEl = document.createElement("style");
		styleEl.setAttribute("data-builder-fragment-style", id);
		document.head.appendChild(styleEl);
	}
	styleEl.textContent = style;
}

function scheduleRefresh(scope: ComponentScope) {
	if (scope.timer) {
		window.clearTimeout(scope.timer);
	}
	scope.timer = window.setTimeout(() => {
		scope.timer = null;
		void refreshComponent(scope).catch(logRefreshError);
	}, 80);
}

function getReactivePropValues(scope: ComponentScope) {
	return scope.reactiveProps.reduce(
		(values, name) => {
			values[name] = scope.props[name];
			return values;
		},
		{} as Record<string, any>,
	);
}

async function refreshComponent(scope: ComponentScope) {
	const requestVersion = ++scope.version;
	const csrfToken = getCSRFToken();
	const response = await fetch("/api/method/builder.api.render_component_fragment", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...(csrfToken ? { "X-Frappe-CSRF-Token": csrfToken } : {}),
		},
		body: JSON.stringify({
			page: scope.page,
			block_id: scope.blockId,
			props: getReactivePropValues(scope),
			route_variables: getRouteVariables(),
		}),
	});
	const payload = await response.json();
	if (requestVersion !== scope.version) return;
	if (!response.ok || payload.exc) {
		throw new Error(payload._server_messages || payload.exception || "Failed to render component fragment");
	}

	const fragment = payload.message || payload;
	const template = document.createElement("template");
	template.innerHTML = (fragment.html || "").trim();
	const nextEl = template.content.firstElementChild as HTMLElement | null;
	if (!nextEl) return;

	upsertFragmentStyle(scope, fragment.style || "");
	scope.cleanup?.();
	scope.cleanup = null;
	scope.el.replaceWith(nextEl);
	scope.el = nextEl;
	executeMountScripts(nextEl);
}

const builder = {
	routeVariables: {},
	mountComponent(options: MountOptions) {
		const el = options.el || getBuilderBlock(options.uid);
		if (!el || !options.blockId) return false;
		const key = getScopeKey(options.page, options.blockId);
		let scope = componentScopes.get(key);
		if (!scope) {
			scope = {
				page: options.page,
				blockId: options.blockId,
				el,
				props: getInitialProps(options),
				reactiveProps: getReactiveProps(options),
				componentData: options.componentData || {},
				script: options.script,
				cleanup: null,
				version: 0,
				timer: null,
				stop: null,
			};
			updatePropWatcher(scope);
			componentScopes.set(key, scope);
		} else {
			scope.el = el;
			scope.reactiveProps = getReactiveProps(options);
			scope.componentData = options.componentData || {};
			scope.script = options.script;
			updatePropWatcher(scope);
		}
		attachComponentPropAPI(scope);
		runComponentScript(scope);
		return true;
	},
	refreshComponent(blockId: string, page?: string) {
		const scope = Array.from(componentScopes.values()).find(
			(scope) => scope.blockId === blockId && (!page || scope.page === page),
		);
		if (scope) {
			return refreshComponent(scope).catch(logRefreshError);
		}
	},
};

declare global {
	interface Window {
		reactivity: typeof reactivity;
		builder: typeof builder;
	}

	interface HTMLElement {
		getComponentProps?: () => Record<string, any>;
		setComponentProp?: (name: string, value: any) => HTMLElement;
		setComponentProps?: (values: Record<string, any>) => HTMLElement;
	}
}

if (typeof window !== "undefined") {
	window.reactivity = reactivity;
	window.builder = builder;
	Object.assign(window, reactivity);
}

export default reactivity;
