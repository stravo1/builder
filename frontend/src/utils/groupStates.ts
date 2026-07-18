// Group states let a block react to an ancestor's state, mirroring tailwind's
// `group/name` + `group-hover/name:` convention. Style keys are stored as
// `group-<state>/<groupName>:<property>` and resolved into descendant
// selectors when the page is published.

const GROUP_STATE_PREFIX = "group-";

export const stateLabels: Record<string, string> = {
	hover: "On Hover",
	focus: "On Focus",
	active: "On Active",
};

export const getGroupStateVariantName = (groupName: string, state: string) =>
	`${GROUP_STATE_PREFIX}${state}/${groupName}`;

export const isGroupStateKey = (key: string) => key.startsWith(GROUP_STATE_PREFIX);
