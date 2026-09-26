# Copyright (c) 2026, Frappe Technologies Pvt Ltd and contributors
# For license information, please see license.txt

"""Drop per-doctype and per-method grants, and map each installation to today's capabilities.

A grant existed so one user's answer never stood for another. The site answers
once now, through the capabilities, so the grant rows answer nothing.

`validate` maps a legacy key too, but this runs before anyone saves, so every
gate reads today's keys from the first request.
"""

import frappe

from builder.extensions.constants import read_capabilities

GRANT_DOCTYPES = ("Builder Extension DocType Grant", "Builder Extension Method Grant")
INSTALLATION_DOCTYPE = "Builder User Extension"
FIELDS = ("requested_capabilities", "granted_capabilities")


def execute():
	for doctype in GRANT_DOCTYPES:
		frappe.delete_doc("DocType", doctype, ignore_missing=True, force=True)

	for row in frappe.get_all(INSTALLATION_DOCTYPE, fields=["name", *FIELDS]):
		mapped = {
			field: frappe.as_json(read_capabilities(frappe.parse_json(row[field] or "[]")))
			for field in FIELDS
		}
		frappe.db.set_value(INSTALLATION_DOCTYPE, row.name, mapped, update_modified=False)
