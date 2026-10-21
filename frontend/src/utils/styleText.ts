// an optional state prefix (hover:) and a camel or kebab property, quoted or not, then the value
const DECLARATION_PATTERN = /^\s*["']?((?:[a-z-]+:)?-?[a-zA-Z][a-zA-Z0-9-]*)["']?\s*:\s*([\s\S]+?)\s*$/;

// splits on separators outside quotes and parentheses, so rgb(1, 2, 3) stays whole
const splitTopLevel = (text: string, separators: string) => {
	const parts: string[] = [];
	let depth = 0;
	let quote = "";
	let current = "";
	for (const character of text) {
		if (quote) {
			if (character === quote) quote = "";
		} else if (character === '"' || character === "'") {
			quote = character;
		} else if (character === "(" || character === ")") {
			depth += character === "(" ? 1 : -1;
		} else if (depth === 0 && separators.includes(character)) {
			parts.push(current);
			current = "";
			continue;
		}
		current += character;
	}
	return [...parts, current];
};

const unquote = (value: string) => value.replace(/^(["'])([\s\S]*)\1$/, "$2");

// reads "color: red; hover:color: blue" or { color: "red", "hover:color": "blue" } without running it
const getStylesFromText = (text: string) => {
	const objectBody = text.trim().match(/^\{([\s\S]*)\}$/)?.[1];
	// a comma only ends a declaration in an object, since CSS values such as font lists use it
	const declarations = splitTopLevel(objectBody ?? text, objectBody === undefined ? ";\n" : ",;\n");
	const styles: Record<string, string> = {};
	declarations.forEach((declaration) => {
		const match = declaration.match(DECLARATION_PATTERN);
		const value = match ? unquote(match[2]) : "";
		if (match && value) styles[match[1]] = value;
	});
	return styles;
};

export { getStylesFromText };
