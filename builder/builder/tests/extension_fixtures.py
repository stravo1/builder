# Copyright (c) 2026, Frappe Technologies Pvt Ltd and Contributors
# See license.txt

"""What every extension test needs: one user's installation, and its files.

An extension used to be one site record, so a test could make one in three lines.
It is now a record per user, with that user's own copy of the entry, so the setup
lives here rather than in each of the seven files that need it.
"""

import json
import pathlib

import frappe

from builder.extensions.constants import CAPABILITIES, ENTRY_FILE

INSTALLATION_DOCTYPE = "Builder User Extension"


def make_installation(extension="acme/listed", user=None, capabilities=None, source=None, **values):
	"""This user's installation of one extension, and its files when a source is given.

	Grants every capability by default, so a test that is not about the gate does
	not have to list them. A test that checks a refusal names the shorter list.
	"""
	user = user or frappe.session.user
	granted = list(CAPABILITIES) if capabilities is None else list(capabilities)
	fields = {
		"label": extension,
		"version": "1.0.0",
		"checksum": "sum123",
		"granted_capabilities": json.dumps(granted),
		"enabled": 1,
		**values,
	}

	name = find_installation(extension, user)
	if name:
		installation = frappe.get_doc(INSTALLATION_DOCTYPE, name).update(fields).save()
	else:
		installation = frappe.get_doc(
			{"doctype": INSTALLATION_DOCTYPE, "user": user, "extension": extension, **fields}
		).insert()

	if source is not None:
		write_source(installation, source)
	return installation


def find_installation(extension, user=None):
	return frappe.db.get_value(
		INSTALLATION_DOCTYPE, {"user": user or frappe.session.user, "extension": extension}, "name"
	)


def write_source(installation, source: str):
	"""The one file an install holds, plus an icon when the record names one."""
	install = pathlib.Path(installation.install_path)
	install.mkdir(parents=True, exist_ok=True)
	(install / ENTRY_FILE).write_text(source)
	if installation.icon:
		(install / installation.icon).write_text("<svg />")


def drop_installations(extension: str):
	"""Every user's installation of one extension, for a test that starts clean."""
	for name in frappe.get_all(INSTALLATION_DOCTYPE, filters={"extension": extension}, pluck="name"):
		frappe.delete_doc(INSTALLATION_DOCTYPE, name, force=True)


def make_user(email="extension-tester@example.com", roles=("Website Manager",)):
	"""A second Builder user, so a test can show that an installation is one person's.

	Website Manager is what gives read on Builder Page, which is the check the
	extension gate makes before it looks for an installation. Pass no roles for a
	user the gate has to turn away.
	"""
	if not frappe.db.exists("User", email):
		frappe.get_doc(
			{
				"doctype": "User",
				"email": email,
				"first_name": "Extension",
				"send_welcome_email": 0,
				"roles": [{"role": role} for role in roles],
			}
		).insert(ignore_permissions=True)
	return email
