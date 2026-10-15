// More Styles saves its value for a property with a built-in control under "<style>:overridden",
// so the built-in value stays as it is and the override wins at the same breakpoint
const OVERRIDDEN_SUFFIX = ":overridden";

const isOverriddenStyle = (style: string) => style.endsWith(OVERRIDDEN_SUFFIX);

const toOverriddenStyle = (style: string) => `${style}${OVERRIDDEN_SUFFIX}`;

const stripOverriddenSuffix = (style: string) =>
	isOverriddenStyle(style) ? style.slice(0, -OVERRIDDEN_SUFFIX.length) : style;

// renderers see plain CSS properties: each override replaces the value it overrides
const applyOverriddenStyles = (styleMap: BlockStyleMap) => {
	const styles = { ...styleMap };
	Object.keys(styleMap)
		.filter(isOverriddenStyle)
		.forEach((style) => {
			const value = styles[style];
			delete styles[style];
			if (value !== null && value !== undefined && value !== "") styles[stripOverriddenSuffix(style)] = value;
		});
	return styles;
};

export { applyOverriddenStyles, isOverriddenStyle, stripOverriddenSuffix, toOverriddenStyle };
