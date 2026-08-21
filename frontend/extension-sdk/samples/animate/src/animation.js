/**
 * The vocabulary every part of this extension reads.
 *
 * One block attribute per setting, and one list of them. The right panel
 * section, the left panel, the clear action and the runtime on the published
 * page all name a setting through this file, so a rename is one edit.
 *
 * A setting at its default writes no attribute. The runtime falls back to the
 * same value, so a block with a plain fade carries one attribute rather than
 * six.
 */

import { easingNames, effectNames } from "./runtime.js";

export const ATTRIBUTES = {
	effect: "data-animate",
	trigger: "data-animate-on",
	duration: "data-animate-duration",
	delay: "data-animate-delay",
	easing: "data-animate-ease",
	repeat: "data-animate-repeat",
};

export const DEFAULTS = {
	effect: "none",
	trigger: "scroll",
	duration: 600,
	delay: 0,
	easing: "ease-out",
	repeat: "once",
};

export const TRIGGERS = [
	{ label: "Scroll", value: "scroll", hint: "When it comes into view" },
	{ label: "Load", value: "load", hint: "As soon as the page opens" },
	{ label: "Hover", value: "hover", hint: "When the pointer enters it" },
	{ label: "Click", value: "click", hint: "When a visitor clicks it" },
];

export const REPEATS = [
	{ label: "Once", value: "once" },
	{ label: "Every time", value: "always" },
];

const titleCase = (name) => name.replace(/-/g, " ").replace(/^./, (first) => first.toUpperCase());

const named = (name) => ({ label: titleCase(name), value: name });

/** "None" first, because it is the state a block starts in. */
export const EFFECTS = [{ label: "None", value: "none" }, ...effectNames().map(named)];

export const EASINGS = easingNames().map(named);

const whole = (value, fallback) => {
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : fallback;
};

/** What a block is set to, with every default filled in. */
export const readSettings = (attributes = {}) => ({
	effect: attributes[ATTRIBUTES.effect] || DEFAULTS.effect,
	trigger: attributes[ATTRIBUTES.trigger] || DEFAULTS.trigger,
	duration: whole(attributes[ATTRIBUTES.duration], DEFAULTS.duration),
	delay: whole(attributes[ATTRIBUTES.delay], DEFAULTS.delay),
	easing: attributes[ATTRIBUTES.easing] || DEFAULTS.easing,
	repeat: attributes[ATTRIBUTES.repeat] || DEFAULTS.repeat,
});

/**
 * The patch `block.update` takes.
 *
 * `null` removes an attribute, so a setting left at its default is taken off
 * the block rather than written to it.
 */
export const toAttributes = (settings) => {
	const patch = {};
	Object.entries(ATTRIBUTES).forEach(([key, attribute]) => {
		const value = settings[key];
		patch[attribute] = value === DEFAULTS[key] ? null : String(value);
	});
	// an effect of "none" is the whole animation off, so nothing else is worth keeping
	if (settings.effect === DEFAULTS.effect) Object.values(ATTRIBUTES).forEach((name) => (patch[name] = null));
	return patch;
};
