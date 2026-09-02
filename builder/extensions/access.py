# Copyright (c) 2026, Frappe Technologies Pvt Ltd and contributors
# For license information, please see license.txt

"""The gate every protected extension method opens with.

An extension acts as the user who installed it, and never as more than that.
Four things have to hold before a call reaches site state, and this module holds
all four in one place so no method can be written with one of them forgotten:

1. Somebody is signed in.
2. That person can use Builder.
3. They have this extension installed and switched on.
4. Their installation grants the capability the method needs.

Frappe's own permission is the fifth gate and the last one. Nothing here widens
it, and no method in this package passes `ignore_permissions` to change site
data.

The user always comes from `frappe.session.user`. A caller cannot name one.
"""

import frappe
from frappe import _

INSTALLATION_DOCTYPE = "Builder User Extension"
GRANT_DOCTYPE = "Builder Extension Grant"
STATE_DOCTYPE = "Builder Extension State"


def find_installation(extension: str) -> str | None:
	"""The current user's enabled installation of this extension, or None."""
	return frappe.db.get_value(
		INSTALLATION_DOCTYPE,
		{"user": frappe.session.user, "extension": extension, "enabled": 1},
		"name",
	)


def assert_extension_access(
	extension: str, capability: str | None = None, writes: str | None = None
) -> str:
	"""Refuse unless this user may do this, and answer with their installation name.

	`writes` names the doctype the caller is about to change, so the permission is
	that doctype's own rule. For a token, that is the rule which already governs a
	user retinting one by hand. The capability is a separate check, and neither
	replaces the other.
	"""
	if frappe.session.user == "Guest":
		frappe.throw(_("Sign in to use extensions."), frappe.PermissionError)

	frappe.has_permission("Builder Page", ptype="read", throw=True)

	installation = find_installation(extension)
	if not installation:
		frappe.throw(_('"{0}" is not installed for you.').format(extension), frappe.PermissionError)

	assert_capability(installation, extension, capability)

	if writes:
		frappe.has_permission(writes, ptype="write", throw=True)

	return installation


def assert_capability(installation: str, extension: str, capability: str | None) -> None:
	"""What the user allowed at install, checked on the side that does the writing.

	The browser bridge makes the same check before it sends the call. That one is
	there to give an extension a clear error, not to protect anything: a frame
	cannot reach these methods, but the editor page can.
	"""
	if not capability:
		return

	granted = frappe.get_cached_doc(INSTALLATION_DOCTYPE, installation).capabilities
	if capability not in granted:
		frappe.throw(
			_('"{0}" was not granted {1}.').format(extension, capability), frappe.PermissionError
		)


# Desk sees what the methods above already enforce. Registered in hooks.py, so a
# report, a list view and a get_all all answer with one user's rows.


def is_system_manager(user: str) -> bool:
	return "System Manager" in frappe.get_roles(user)


def scoped_to_user(doctype: str, user: str | None) -> str:
	user = user or frappe.session.user
	if is_system_manager(user):
		return ""
	return f"`tab{doctype}`.`user` = {frappe.db.escape(user)}"


def installation_conditions(user: str | None = None) -> str:
	return scoped_to_user(INSTALLATION_DOCTYPE, user)


def grant_conditions(user: str | None = None) -> str:
	return scoped_to_user(GRANT_DOCTYPE, user)


def state_conditions(user: str | None = None) -> str:
	"""State names no user. Its installation does, so the scope goes through that."""
	user = user or frappe.session.user
	if is_system_manager(user):
		return ""
	return (
		f"`tab{STATE_DOCTYPE}`.`installation` in "
		f"(select name from `tab{INSTALLATION_DOCTYPE}` where user = {frappe.db.escape(user)})"
	)


def owns_row(doc, ptype=None, user=None, debug=False) -> bool:
	user = user or frappe.session.user
	return doc.user == user or is_system_manager(user)


def owns_state(doc, ptype=None, user=None, debug=False) -> bool:
	user = user or frappe.session.user
	if is_system_manager(user):
		return True
	return frappe.db.get_value(INSTALLATION_DOCTYPE, doc.installation, "user") == user
