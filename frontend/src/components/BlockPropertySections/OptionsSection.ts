import InlineInput from "@/components/Controls/InlineInput.vue";
import VisibilityInput from "@/components/VisibilityInput.vue";
import blockController from "@/utils/blockController";

const setClasses = (val: string) => {
	const classes = val.split(",").map((c) => c.trim());
	blockController.setClasses(classes);
};

const optionsSectionProperties = [
	{
		component: InlineInput,
		getProps: () => {
			return {
				label: "Class",
				modelValue: blockController.getClasses().join(", "),
			};
		},
		searchKeyWords: "Class, ClassName, Class Name",
		events: {
			"update:modelValue": (val: string) => setClasses(val || ""),
		},
		condition: () => !blockController.multipleBlocksSelected(),
	},
	{
		component: InlineInput,
		getProps: () => {
			return {
				label: "Group",
				modelValue: blockController.getGroupName(),
				description:
					"Name this block as a group so its children can respond to its hover, focus and active states.",
			};
		},
		searchKeyWords: "Group, Group Name, GroupName, Hover, Parent, Ancestor",
		events: {
			"update:modelValue": (val: string) => blockController.setGroupName(val || ""),
		},
		condition: () => !blockController.multipleBlocksSelected(),
	},
	{
		component: VisibilityInput,
		getProps: () => {
			return {
				label: "Condition",
				property: "visibilityCondition",
				getModelValue: () => (blockController.getKeyValue("visibilityCondition") as BlockVisibilityCondition).key,
				setModelValue: (val: BlockVisibilityCondition) => {
					blockController.setKeyValue("visibilityCondition", val);
				},
				description:
					"Visibility condition to show/hide the block based on a condition. Pass a boolean variable created in your Data Script.<br><b>Note:</b> This is only evaluated in the preview mode.",
			};
		},
		searchKeyWords:
			"Condition, Visibility, VisibilityCondition, Visibility Condition, show, hide, display, hideIf, showIf",
		condition: () => !blockController.isRoot(),
	},
];

export default {
	name: "Options",
	properties: optionsSectionProperties,
};
