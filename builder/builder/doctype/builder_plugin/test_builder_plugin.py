# Copyright (c) 2026, Frappe Technologies Pvt Ltd and contributors
# For license information, please see license.txt

import frappe


def test_builder_plugin_import():
	assert frappe.get_doc("DocType", "Builder Plugin")
