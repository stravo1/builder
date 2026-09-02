# Copyright (c) 2026, Frappe Technologies Pvt Ltd and contributors
# For license information, please see license.txt

"""The gate every protected extension method opens with.

An extension acts as the user who installed it, and never as more. Four checks
run before a call reaches site data, and they live here together so no method can
be written with one forgotten:

1. Somebody is signed in.
2. That person can use Builder.
3. They installed this extension and left it on.
4. Their installation grants the capability the method needs.

Frappe's own permission runs last. Nothing here widens it, and no method in this
package passes `ignore_permissions`. The user comes from `frappe.session.user`,
and a caller cannot name one.
"""

import frappe
from frappe import _

INSTALLATION_DOCTYPE = "Builder User Extension"
GRANT_DOCTYPE = "Builder Extension Grant"
STATE_DOCTYPE = "Builder Extension State"


def find_installation(extension: str) -> str | None:
	"""The current user's enabled installation of this extension, or None.

	A call carries `publisher/name` and no source, while the unique key allows one
	name from two Builder Hubs. So two matches are refused rather than guessed at.
	The bridge learns to name a source when Hub installs arrive.
	"""
	matches = frappe.get_all(
		INSTALLATION_DOCTYPE,
		filters={"user": frappe.session.user, "extension": extension, "enabled": 1},
		pluck="name",
		limit=2,
	)
	if len(matches) > 1:
		frappe.throw(
			_('"{0}" is installed from more than one source, and this call names none.').format(extension)
		)
	return matches[0] if matches else None


def assert_extension_access(
	extension: str, capability: str | None = None, writes: str | None = None
) -> str:
	"""Refuse unless this user may do this. Answers with their installation name.

	`writes` names the doctype the caller is about to change, so Frappe applies
	that doctype's own rule. For a token, that is the rule a user retinting one by
	hand already meets. The capability is a separate check, and neither replaces
	the other.
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
	"""What the user allowed at install, checked where the writing happens.

	The browser bridge checks this before it sends the call, to give an extension a
	clear error. That check protects nothing: a frame cannot reach these methods,
	but the editor page can.
	"""
	if not capability:
		return

	granted = frappe.get_cached_doc(INSTALLATION_DOCTYPE, installation).capabilities
	if capability not in granted:
		frappe.throw(
			_('"{0}" was not granted {1}.').format(extension, capability), frappe.PermissionError
		)


# Desk sees what the methods above enforce. hooks.py registers these, so a list
# view, a report and a get_all all answer with one user's rows.


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
