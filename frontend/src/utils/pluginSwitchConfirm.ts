import { showDialog } from "@/utils/helpers";

/** In-memory only; resets when the tab is refreshed. */
let skipPluginSwitchConfirmInSession = false;

export function confirmPluginSwitch(currentName: string, nextName: string): Promise<boolean> {
	if (skipPluginSwitchConfirmInSession) {
		return Promise.resolve(true);
	}

	return new Promise((resolve) => {
		showDialog({
			title: "Confirm",
			message: `Are you sure you want to close "${currentName}" and open "${nextName}"? The current plugin panel will be closed.`,
			icon: {
				name: "alert-circle",
				appearance: "warning",
			},
			checkboxLabel: "Don't ask anymore in this session",
			actions: [
				{
					label: "Cancel",
					variant: "subtle",
					onClick: () => resolve(false),
				},
				{
					label: "Confirm",
					theme: "red",
					onClick: (checkboxChecked) => {
						if (checkboxChecked) {
							skipPluginSwitchConfirmInSession = true;
						}
						resolve(true);
					},
				},
			],
		});
	});
}
