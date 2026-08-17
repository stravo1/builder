# Copyright (c) 2026, Frappe Technologies Pvt Ltd and contributors
# For license information, please see license.txt

import frappe

from builder.utils import has_page_read


@frappe.whitelist()
@has_page_read("You do not have permission to load extensions.")
def get_enabled_extensions() -> list[dict]:
	"""Every enabled extension, in the shape the editor host mounts a frame from."""
	names = frappe.get_all("Builder Extension", filters={"enabled": 1}, pluck="name")
	return [describe_extension(name) for name in names]


def describe_extension(name: str) -> dict:
	"""Reads the whole document, because the entry and the grants are derived, not stored.

	Rebuilding the asset path in this method, or in the client, would give it a
	second owner. The record has no public_url field for the same reason.
	"""
	extension = frappe.get_cached_doc("Builder Extension", name)
	return {
		"name": extension.extension_name,
		"label": extension.label,
		"entry": extension.script_url,
		"capabilities": extension.granted_capabilities,
	}
