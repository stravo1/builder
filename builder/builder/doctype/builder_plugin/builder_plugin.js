// Copyright (c) 2026, Frappe Technologies Pvt Ltd and contributors
// For license information, please see license.txt

frappe.ui.form.on("Builder Plugin", {
	refresh(frm) {
		if (!frm.is_new()) {
			frm.add_custom_button(__("Run in Builder"), () => {
				const builderPath = frappe.boot.builder_path || "builder";
				window.open(`/${builderPath}`, "_blank");
			});
		}
	},
});
