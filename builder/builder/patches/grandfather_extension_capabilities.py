# Copyright (c) 2026, Frappe Technologies Pvt Ltd and contributors
# For license information, please see license.txt

"""Fill what an extension asked for, from what it was already granted.

One field used to hold both. The installer copied the manifest's capabilities
into `granted_capabilities`, so that list is the ask and the answer at once.

The record now refuses a grant the manifest never asked for. Leaving the ask
empty would therefore stop every standing installation, so each one is
grandfathered: the grant stands, and the ask is set to match it.
"""

import frappe

INSTALLATION_DOCTYPE = "Builder User Extension"


def execute():
	installations = frappe.get_all(
		INSTALLATION_DOCTYPE,
		filters={"requested_capabilities": ("in", (None, ""))},
		fields=["name", "granted_capabilities"],
	)
	for installation in installations:
		frappe.db.set_value(
			INSTALLATION_DOCTYPE,
			installation.name,
			"requested_capabilities",
			installation.granted_capabilities or "[]",
			update_modified=False,
		)
