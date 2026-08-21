/**
 * The client script this extension puts on a page.
 *
 * It is a string, not a module, because it crosses the port as data and then
 * runs on the published page. Nothing in the editor imports it, and it imports
 * nothing: a client script is a plain file the page loads.
 *
 * It carries its own keyframes. Builder gives an extension one script of each
 * type per page, and asking the user twice — once for the CSS, once for the
 * JavaScript — to install one feature is one question too many.
 *
 * Bump VERSION when the runtime changes. `main.js` writes the script again when
 * the page carries an older one, so a page picks the fix up on the next edit.
 */

export const VERSION = 1;

/** Every effect, as one keyframes rule each. The value of `data-animate`. */
const EFFECTS = {
	"fade-up": "from{opacity:0;transform:translate3d(0,28px,0)}to{opacity:1;transform:none}",
	"fade-down": "from{opacity:0;transform:translate3d(0,-28px,0)}to{opacity:1;transform:none}",
	"fade-in": "from{opacity:0}to{opacity:1}",
	"slide-left": "from{opacity:0;transform:translate3d(48px,0,0)}to{opacity:1;transform:none}",
	"slide-right": "from{opacity:0;transform:translate3d(-48px,0,0)}to{opacity:1;transform:none}",
	"zoom-in": "from{opacity:0;transform:scale3d(.86,.86,1)}to{opacity:1;transform:none}",
	"zoom-out": "from{opacity:0;transform:scale3d(1.14,1.14,1)}to{opacity:1;transform:none}",
	"flip-up": "from{opacity:0;transform:perspective(900px) rotateX(28deg)}to{opacity:1;transform:none}",
	"blur-in": "from{opacity:0;filter:blur(12px)}to{opacity:1;filter:none}",
	pop: "0%{opacity:0;transform:scale3d(.8,.8,1)}60%{opacity:1;transform:scale3d(1.04,1.04,1)}100%{transform:none}",
};

/** The names an extension may put in `data-animate-ease`, and what each one means. */
const EASINGS = {
	"ease-out": "cubic-bezier(.22,.61,.36,1)",
	"ease-in-out": "cubic-bezier(.65,0,.35,1)",
	spring: "cubic-bezier(.34,1.56,.64,1)",
	linear: "linear",
};

const keyframes = () =>
	Object.entries(EFFECTS)
		.map(([name, steps]) => `@keyframes anim-${name}{${steps}}`)
		.join("");

const effectRules = () =>
	Object.keys(EFFECTS)
		.map((name) => `[data-animate="${name}"].anim-run{animation-name:anim-${name}}`)
		.join("");

/**
 * The style sheet, as one string.
 *
 * `anim-armed` is added by the script and never by this sheet. A visitor whose
 * JavaScript failed then sees the page rather than a column of invisible
 * blocks.
 *
 * Exported because the left panel replays an animation in its own document, and
 * a second copy of these keyframes would drift from the page's.
 */
export const styles = () =>
	[
		".anim-armed{opacity:0}",
		".anim-run{animation-duration:var(--anim-d,600ms);animation-delay:var(--anim-w,0ms);" +
			"animation-timing-function:var(--anim-e,cubic-bezier(.22,.61,.36,1));animation-fill-mode:both}",
		effectRules(),
		keyframes(),
	].join("");

/**
 * What the page runs, as one self-contained function.
 *
 * `String(fn)` puts the source in the script, so the file below is the file
 * that runs, and this module stays readable while it does.
 */
const main = function (SHEET, EASINGS) {
	var SELECTOR = "[data-animate]:not([data-animate=\"none\"])";
	var mount = document.createElement("style");
	mount.textContent = SHEET;
	document.head.appendChild(mount);

	// a visitor who asked their system for less motion gets the page, finished,
	// with nothing moving. Every other branch below is skipped
	if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

	var read = function (node) {
		return {
			on: node.getAttribute("data-animate-on") || "scroll",
			repeat: node.getAttribute("data-animate-repeat") === "always",
			duration: node.getAttribute("data-animate-duration"),
			delay: node.getAttribute("data-animate-delay"),
			ease: node.getAttribute("data-animate-ease"),
		};
	};

	var arm = function (node, settings) {
		if (settings.duration) node.style.setProperty("--anim-d", settings.duration + "ms");
		if (settings.delay) node.style.setProperty("--anim-w", settings.delay + "ms");
		if (settings.ease && EASINGS[settings.ease]) node.style.setProperty("--anim-e", EASINGS[settings.ease]);
		node.classList.add("anim-armed");
	};

	var run = function (node) {
		node.classList.remove("anim-armed");
		// the class has to leave the element and come back for a second run, and a
		// reflow between the two is what makes the browser notice
		node.classList.remove("anim-run");
		void node.offsetWidth;
		node.classList.add("anim-run");
	};

	var reset = function (node) {
		node.classList.remove("anim-run");
		node.classList.add("anim-armed");
	};

	var observer =
		"IntersectionObserver" in window
			? new IntersectionObserver(
				function (entries) {
					entries.forEach(function (entry) {
						var settings = read(entry.target);
						if (entry.isIntersecting) {
							run(entry.target);
							if (!settings.repeat) observer.unobserve(entry.target);
						} else if (settings.repeat) {
							reset(entry.target);
						}
					});
				},
				{ threshold: 0.15 },
			)
			: null;

	var wire = function (node) {
		if (node.dataset.animateWired) return;
		node.dataset.animateWired = "1";

		var settings = read(node);
		arm(node, settings);

		if (settings.on === "load") return run(node);

		if (settings.on === "hover" || settings.on === "click") {
			var event = settings.on === "hover" ? "mouseenter" : "click";
			node.addEventListener(event, function () {
				run(node);
			});
			if (settings.on === "hover" && settings.repeat) {
				node.addEventListener("mouseleave", function () {
					reset(node);
				});
			}
			// a click or hover target must be visible before it is touched
			node.classList.remove("anim-armed");
			return;
		}

		// scroll, and anything this runtime does not know
		if (observer) return observer.observe(node);
		run(node);
	};

	var scan = function () {
		Array.prototype.forEach.call(document.querySelectorAll(SELECTOR), wire);
	};

	scan();
	// Builder renders on the server, so the nodes are here already. This catches
	// anything a later script adds
	if (window.MutationObserver) {
		new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
	}
};

/** The whole client script, ready to hand to `page.attachScript`. */
export const runtimeScript = () =>
	[
		`/* builder/animate runtime v${VERSION} — written by the Animate extension. */`,
		"/* Edit it here and the extension will rewrite it. Delete the extension to remove it. */",
		`(${String(main)})(${JSON.stringify(styles())},${JSON.stringify(EASINGS)});`,
	].join("\n");

/** The editor reads these too, so one list feeds both the controls and the page. */
export const effectNames = () => Object.keys(EFFECTS);
export const easingNames = () => Object.keys(EASINGS);

/** The curve behind each easing name, for the panel's own preview. */
export const EASING_VALUES = EASINGS;
