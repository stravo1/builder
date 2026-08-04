import { computed, reactive, toRaw } from "vue";

/** Every registry item needs a stable identity and a sort position. */
export type RegistryEntry = {
	name: string;
	rank?: number;
};

/** The common case: the surface itself decides whether an item shows. */
export type RegistryItem = RegistryEntry & {
	condition?: () => boolean;
};

const RANK_STEP = 10;

/**
 * A registry backs one editor surface. Builder registers its own items with
 * `registerBuiltIn`, which locks the name. Extensions use `register`, and cannot
 * replace or remove a built-in item.
 *
 * Leave `rank` unset in the common case: items then display in registration order.
 * Set it only to force an item to a specific spot (e.g. ahead of, or behind, an
 * item registered earlier).
 *
 * Read `visible` when an item decides its own visibility. Read `all` when the
 * surface passes an argument to condition, as the block context menu does.
 */
export function createRegistry<T extends RegistryEntry>() {
	const items = reactive(new Map<string, T>()) as Map<string, T>;
	const builtInNames = new Set<string>();
	let nextAutoRank = RANK_STEP;

	const add = (item: T) => {
		const rank = item.rank ?? nextAutoRank;
		nextAutoRank = Math.max(nextAutoRank, rank + RANK_STEP);
		const registered = { ...item, rank };
		items.set(item.name, registered);
		// a later registration under the same name owns the entry, so this must not delete it
		return () => {
			if (toRaw(items.get(item.name)) === registered) items.delete(item.name);
		};
	};

	const guardBuiltIn = (name: string) => {
		if (builtInNames.has(name)) throw new Error(`"${name}" is a built-in item and is read-only`);
	};

	/** Builder registers its own items here. A built-in name is then locked. */
	const registerBuiltIn = (item: T) => {
		builtInNames.add(item.name);
		add(item);
	};

	// returns its own unregister, so a caller never has to track names
	const register = (item: T) => {
		guardBuiltIn(item.name);
		return add(item);
	};

	const unregister = (name: string) => {
		guardBuiltIn(name);
		return items.delete(name);
	};

	const all = computed(() => [...items.values()].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)));

	// condition runs at render, never at register, so it can read live state
	const visible = computed(() => all.value.filter((item) => (item as RegistryItem).condition?.() ?? true));

	return { register, registerBuiltIn, unregister, all, visible };
}
