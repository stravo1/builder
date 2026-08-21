/**
 * The right panel section, as data.
 *
 * Every control binds an attribute, so Builder writes the block through the same
 * path a built-in control uses and this extension never touches the tree. The
 * runtime on the published page reads those attributes back.
 *
 * Each one also names an action. A bound control with an action is written
 * first and reported after, which is how the runtime gets attached the moment a
 * page needs it, and not before.
 */

import { easingNames, effectNames } from "./runtime.js";

const TOUCHED = "animate.touched";

const titleCase = (name) => name.replace(/-/g, " ").replace(/^./, (first) => first.toUpperCase());

const choices = (names) => names.map((name) => ({ label: titleCase(name), value: name }));

export const animationControls = () => [
	{
		name: "effect",
		control: "select",
		label: "Effect",
		bind: { attribute: "data-animate" },
		action: TOUCHED,
		options: [{ label: "None", value: "none" }, ...choices(effectNames())],
	},
	{
		name: "trigger",
		control: "select",
		label: "Trigger",
		bind: { attribute: "data-animate-on" },
		action: TOUCHED,
		options: [
			{ label: "On scroll", value: "scroll" },
			{ label: "On load", value: "load" },
			{ label: "On hover", value: "hover" },
			{ label: "On click", value: "click" },
		],
	},
	{
		name: "duration",
		control: "range",
		label: "Duration (ms)",
		bind: { attribute: "data-animate-duration" },
		action: TOUCHED,
		min: 100,
		max: 2000,
		step: 50,
	},
	{
		name: "delay",
		control: "range",
		label: "Delay (ms)",
		bind: { attribute: "data-animate-delay" },
		action: TOUCHED,
		min: 0,
		max: 1500,
		step: 50,
	},
	{
		name: "easing",
		control: "select",
		label: "Easing",
		bind: { attribute: "data-animate-ease" },
		action: TOUCHED,
		options: choices(easingNames()),
	},
	{
		name: "repeat",
		control: "toggle",
		label: "Repeat",
		bind: { attribute: "data-animate-repeat" },
		action: TOUCHED,
		options: [
			{ label: "Once", value: "once" },
			{ label: "Always", value: "always" },
		],
	},
];

/** Every attribute the section writes, so one list drives the clear action too. */
export const ANIMATION_ATTRIBUTES = [
	"data-animate",
	"data-animate-on",
	"data-animate-duration",
	"data-animate-delay",
	"data-animate-ease",
	"data-animate-repeat",
];
