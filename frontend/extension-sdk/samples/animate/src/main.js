/**
 * Animate — scroll, hover, click and load animations for any block.
 *
 * The editor half writes attributes on a block. The published half is one client
 * script this extension puts on the page, which reads those attributes and
 * drives the animation. Neither half knows the other beyond the attribute names
 * in `controls.js`.
 *
 * The split is what makes it work at all. A client script does not run in the
 * editor canvas, so nothing moves while you edit: the panel shows what a block
 * is set to, and the published page shows what it does.
 *
 * The runtime lands on a page the first time somebody animates a block on it,
 * never at startup. A page nobody animated carries no script of ours.
 */

import builder from "frappe-builder-extension-sdk";

import { ANIMATION_ATTRIBUTES, animationControls } from "./controls.js";
import { VERSION, runtimeScript } from "./runtime.js";

/** The route the editor has open, and the one we last wrote the runtime to. */
let openRoute = null;
let syncedRoute = null;

const stamp = (version) => `runtime v${version} `;

const setRoute = (route) => {
	if (route === openRoute) return;
	openRoute = route;
	// what we knew was about the old page, and none of it holds for this one
	syncedRoute = null;
};

/**
 * Writes the runtime, unless this page already carries this version.
 *
 * `listScripts` is the only honest answer: our own memory goes stale the moment
 * somebody edits the script by hand or opens a second tab. The version marker
 * sits in the script's first line, so no second record is needed to know which
 * version a page runs.
 */
const syncRuntime = async () => {
	if (syncedRoute === openRoute) return false;

	const mine = await builder.page.listScripts();
	const current = mine.find((script) => script.type === "JavaScript");
	syncedRoute = openRoute;

	if (current && current.script.includes(stamp(VERSION))) return false;

	await builder.page.attachScript({ type: "JavaScript", script: runtimeScript() });
	return true;
};

/**
 * The first touched control on a page is what installs the runtime.
 *
 * A refusal is not something to shout about: the user was asked and said no, or
 * the page is read-only. Builder wrote the attribute before this ran either
 * way, so the setting survives and the next change asks again.
 */
builder.actions.register("animate.touched", async () => {
	if (!openRoute) return;

	try {
		if (await syncRuntime()) {
			await builder.ui.toast("Animations are on. Preview the page to watch them run.", {
				type: "success",
			});
		}
	} catch (error) {
		syncedRoute = null;
		console.warn("[animate] could not put the runtime on this page", error);
	}
});

/** Takes every attribute off in one patch, so one undo puts them back. */
builder.actions.register("animate.clear", async ({ blockId }) => {
	const attributes = {};
	ANIMATION_ATTRIBUTES.forEach((name) => (attributes[name] = null));

	await builder.block.update(blockId, { attributes });
	await builder.ui.toast("Animation cleared");
});

/** What the page will do, counted from the tree rather than guessed. */
builder.actions.register("animate.report", async () => {
	const walk = (block) => [block, ...(block.children ?? []).flatMap(walk)];
	const blocks = (await builder.page.getBlocks()).flatMap(walk);
	const animated = blocks.filter((block) => {
		const effect = block.attributes && block.attributes["data-animate"];
		return effect && effect !== "none";
	});

	await builder.toolbar.update("report", { badge: animated.length || null });
	await builder.ui.toast(
		animated.length
			? `${animated.length} animated block(s). Preview the page to watch them run.`
			: "Nothing here is animated. Select a block and pick an effect under Animation.",
		animated.length ? { type: "success" } : {},
	);
});

builder.properties.registerSection({
	name: "animation",
	label: "Animation",
	// one block at a time: a bound control cannot answer for a multiple selection
	showWhen: { count: 1 },
	controls: animationControls(),
});

builder.contextMenu.register({
	name: "clear",
	label: "Clear animation",
	action: "animate.clear",
	showWhen: { count: 1 },
});

builder.toolbar.register({
	name: "report",
	region: "right",
	icon: "lucide-wand-sparkles",
	tooltip: "Count the animated blocks on this page",
	action: "animate.report",
});

// a subscription only reports a change, so the route the editor opened with has
// to be read once
builder.main(async () => {
	const context = await builder.context.get();
	setRoute(context.page ? context.page.route : null);
});

builder.context.subscribe(["page"], (context) => setRoute(context.page ? context.page.route : null));
