type ComponentElement = HTMLElement & {
	getComponentProps?: () => Readonly<Record<string, any>>;
	setComponentProp?: (name: string, value: any) => ComponentElement;
	setComponentProps?: (values: Record<string, any>) => ComponentElement;
	refresh?: () => Promise<void>;
};

type ComponentScript = (
	this: ComponentElement,
	componentData: any,
	props: Record<string, any>,
) => void | (() => void) | Promise<void | (() => void)>;

type ClientScriptDefinition = {
	id: string;
	source: string;
};

type ComponentScope = {
	page: string;
	blockId: string;
	el: ComponentElement;
	props: Record<string, any>;
	componentData: any;
	scriptId?: string;
	cleanup: null | (() => void);
	scriptVersion: number;
	version: number;
	timer: number | null;
};

type MountOptions = {
	page: string;
	blockId: string;
	uid?: string;
	el: HTMLElement | null;
	props?: Record<string, any>;
	componentData?: any;
	scriptId?: string;
};

type BuilderRuntime = {
	routeVariables?: Record<string, any>;
	clientScripts?: Record<string, ComponentScript>;
};

const componentScopes = new Map<string, ComponentScope>();
const builderRuntime = ((window as any).builder || {}) as BuilderRuntime;
const clientScripts = builderRuntime.clientScripts || {};
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

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

function logRefreshError(error: unknown) {
	console.error("Failed to refresh Builder component", error);
}

function logScriptError(error: unknown) {
	console.error("Error in Builder client script", error);
}

function registerClientScripts(scripts: ClientScriptDefinition[]) {
	for (const script of scripts || []) {
		if (!script?.id || typeof script.source !== "string" || clientScripts[script.id]) {
			continue;
		}
		clientScripts[script.id] = new AsyncFunction("component_data", "props", script.source);
	}
}

function createReactiveProps(values: Record<string, any>, onChange: (name: string) => void) {
	const proxies = new WeakMap<object, object>();

	function wrap(value: any, rootProp?: string): any {
		if (!value || typeof value !== "object") return value;
		const existing = proxies.get(value);
		if (existing) return existing;

		const proxy = new Proxy(value, {
			get(target, property, receiver) {
				const nextRoot = rootProp || String(property);
				return wrap(Reflect.get(target, property, receiver), nextRoot);
			},
			set(target, property, nextValue, receiver) {
				const previous = Reflect.get(target, property, receiver);
				const changed = !Object.is(previous, nextValue);
				const updated = Reflect.set(target, property, nextValue, receiver);
				if (updated && changed) onChange(rootProp || String(property));
				return updated;
			},
			deleteProperty(target, property) {
				if (!Reflect.has(target, property)) return true;
				const deleted = Reflect.deleteProperty(target, property);
				if (deleted) onChange(rootProp || String(property));
				return deleted;
			},
		});
		proxies.set(value, proxy);
		return proxy;
	}

	return wrap({ ...values }) as Record<string, any>;
}

function clearRefreshTimer(scope: ComponentScope) {
	if (!scope.timer) return;
	window.clearTimeout(scope.timer);
	scope.timer = null;
}

function scheduleRefresh(scope: ComponentScope) {
	clearRefreshTimer(scope);
	scope.timer = window.setTimeout(() => {
		scope.timer = null;
		void refreshComponent(scope).catch(logRefreshError);
	}, 80);
}

function attachComponentPropAPI(scope: ComponentScope) {
	Object.defineProperties(scope.el, {
		getComponentProps: {
			configurable: true,
			value: () => scope.props,
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
		refresh: {
			configurable: true,
			value: () => {
				clearRefreshTimer(scope);
				return refreshComponent(scope).catch(logRefreshError);
			},
		},
	});
}

function cleanupComponentScript(scope: ComponentScope) {
	scope.scriptVersion++;
	scope.cleanup?.();
	scope.cleanup = null;
}

function runComponentScript(scope: ComponentScope) {
	cleanupComponentScript(scope);
	if (!scope.scriptId) return;
	const script = clientScripts[scope.scriptId];
	if (!script) {
		logScriptError(new Error(`Builder client script ${scope.scriptId} is not registered`));
		return;
	}

	const scriptVersion = scope.scriptVersion;
	Promise.resolve(script.call(scope.el, scope.componentData, scope.props))
		.then((cleanup) => {
			if (typeof cleanup !== "function") return;
			if (scriptVersion !== scope.scriptVersion) {
				cleanup();
				return;
			}
			scope.cleanup = cleanup;
		})
		.catch(logScriptError);
}

function executeBuilderScripts(root: HTMLElement) {
	root.querySelectorAll("script[data-builder-script-invocation]").forEach((script) => {
		const code = script.textContent || "";
		if (code.trim()) new Function(code)();
	});
}

function upsertFragmentStyle(scope: ComponentScope, style: string) {
	const id = styleId(scope.page, scope.blockId);
	let styleElement =
		(Array.from(document.querySelectorAll("style[data-builder-fragment-style]")).find(
			(element) => element.getAttribute("data-builder-fragment-style") === id,
		) as HTMLStyleElement | undefined) || null;
	if (!style) {
		styleElement?.remove();
		return;
	}
	if (!styleElement) {
		styleElement = document.createElement("style");
		styleElement.setAttribute("data-builder-fragment-style", id);
		document.head.appendChild(styleElement);
	}
	styleElement.textContent = style;
}

async function refreshComponent(scope: ComponentScope) {
	const requestVersion = ++scope.version;
	const csrfToken = (window as any).frappe?.csrf_token || "";
	const response = await fetch("/api/method/builder.api.render_component_fragment", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...(csrfToken ? { "X-Frappe-CSRF-Token": csrfToken } : {}),
		},
		body: JSON.stringify({
			page: scope.page,
			block_id: scope.blockId,
			props: scope.props,
			route_variables: builder.routeVariables,
			known_script_ids: Object.keys(clientScripts),
		}),
	});
	const payload = await response.json();
	if (requestVersion !== scope.version) return;
	if (!response.ok || payload.exc) {
		throw new Error(payload._server_messages || payload.exception || "Failed to render component fragment");
	}

	const fragment = payload.message || payload;
	registerClientScripts(fragment.scripts || []);
	const template = document.createElement("template");
	template.innerHTML = (fragment.html || "").trim();
	const nextElement = template.content.firstElementChild as ComponentElement | null;
	if (!nextElement) return;

	upsertFragmentStyle(scope, fragment.style || "");
	cleanupComponentScript(scope);
	scope.el.replaceWith(nextElement);
	scope.el = nextElement;
	executeBuilderScripts(nextElement);
}

const builder = Object.assign(builderRuntime, {
	routeVariables: builderRuntime.routeVariables || {},
	clientScripts,
	registerClientScripts,
	mountComponent(options: MountOptions) {
		const element = options.el || getBuilderBlock(options.uid);
		if (!element || !options.blockId) return false;
		const key = getScopeKey(options.page, options.blockId);
		let scope = componentScopes.get(key);
		if (!scope) {
			scope = {
				page: options.page,
				blockId: options.blockId,
				el: element,
				props: {},
				componentData: options.componentData || {},
				scriptId: options.scriptId,
				cleanup: null,
				scriptVersion: 0,
				version: 0,
				timer: null,
			};
			scope.props = createReactiveProps(options.props || {}, () => {
				if (scope) scheduleRefresh(scope);
			});
			componentScopes.set(key, scope);
		} else {
			// element still equals scope.el when this is the block that just refreshed itself
			// (refreshComponent assigns scope.el before re-running mount scripts); in that case
			// scope.props is already the authoritative source and echoing options.props back
			// could clobber a mutation made after the request was sent. A nested component swept
			// along by an ancestor's refresh won't match, so its props are synced to the fresh render.
			const isSelfRefresh = element === scope.el;
			scope.el = element;
			scope.componentData = options.componentData || {};
			scope.scriptId = options.scriptId;
			if (!isSelfRefresh && options.props) {
				Object.assign(scope.props, options.props);
			}
		}
		attachComponentPropAPI(scope);
		runComponentScript(scope);
		return true;
	},
	refreshComponent(blockId: string, page?: string) {
		const scope = Array.from(componentScopes.values()).find(
			(scope) => scope.blockId === blockId && (!page || scope.page === page),
		);
		if (scope) return refreshComponent(scope).catch(logRefreshError);
	},
});

declare global {
	interface Window {
		builder: typeof builder;
	}

	interface HTMLElement {
		getComponentProps?: () => Readonly<Record<string, any>>;
		setComponentProp?: (name: string, value: any) => HTMLElement;
		setComponentProps?: (values: Record<string, any>) => HTMLElement;
		refresh?: () => Promise<void>;
	}
}

window.builder = builder;
