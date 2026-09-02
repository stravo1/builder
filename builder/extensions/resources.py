# Copyright (c) 2026, Frappe Technologies Pvt Ltd and contributors
# For license information, please see license.txt

"""What an extension made, so no caller has to guess ownership from a name.

These rows name the extension, not one user's installation of it. That is what
makes them survive a user leaving: a doctype holds the site's data, a token
styles every page, and a client script runs for every visitor, so none of the
three belongs to one person.

It also means a later installation of the same extension owns what an earlier one
made. An extension can edit the doctype it created, whoever installed it.

Every resource kind shares these four helpers, which is why they live here rather
than beside the first kind that needed them.
"""

import frappe

RESOURCE_DOCTYPE = "Builder Extension Resource"


def record_resource(extension: str, resource_type: str, resource_name: str) -> None:
	if find_resource(extension, resource_type, resource_name):
		return
	frappe.get_doc(
		{
			"doctype": RESOURCE_DOCTYPE,
			"extension": extension,
			"resource_type": resource_type,
			"resource_name": resource_name,
		}
	).insert()


def forget_resource(extension: str, resource_type: str, resource_name: str) -> None:
	name = find_resource(extension, resource_type, resource_name)
	if name:
		frappe.delete_doc(RESOURCE_DOCTYPE, name)


def find_resource(extension: str, resource_type: str, resource_name: str) -> str | None:
	return frappe.db.get_value(
		RESOURCE_DOCTYPE,
		{"extension": extension, "resource_type": resource_type, "resource_name": resource_name},
		"name",
	)


def list_resources(extension: str, resource_type: str) -> list[str]:
	return frappe.get_all(
		RESOURCE_DOCTYPE,
		filters={"extension": extension, "resource_type": resource_type},
		pluck="resource_name",
	)
