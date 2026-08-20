# Copyright (c) 2026, Frappe Technologies Pvt Ltd and contributors
# For license information, please see license.txt

"""What one extension may do to one doctype.

Three gates stand between an extension and a document. The capability says the
extension may work with site data at all, and an admin answers it at install. The
grant here says which doctype, and the user answers it while the editor runs.
Frappe's own permission says whether this user may do it, and it is the only one
that cannot be widened: nothing in this module passes `ignore_permissions`.

A grant is asked for, never assumed. `data.requestAccess` in the browser is the
one path that opens a dialog, and every other call refuses without a grant.
"""

import frappe
from frappe import _

from builder.extensions import find_extension, resolve_extension

GRANT_DOCTYPE = "Builder Extension Grant"

ACCESS_FIELDS = {"read": "can_read", "write": "can_write", "delete": "can_delete"}

NO_ACCESS = {"read": False, "write": False, "delete": False, "denied": False}


@frappe.whitelist()
def get_extension_grant(extension: str, doctype: str) -> dict:
	"""What this extension may already do to this doctype.

	An unknown extension and an ungranted doctype answer the same way, because
	both mean the same thing to the caller: nothing is allowed yet.
	"""
	owner = find_extension(extension)
	return describe_grant(owner, doctype) if owner else {"doctype": doctype, **NO_ACCESS}


@frappe.whitelist()
def record_extension_grant(
	extension: str, doctype: str, access: list[str] | None = None, denied: bool = False
) -> dict:
	"""Write what the user answered in the Builder dialog.

	The browser is the only witness to that answer. The dialog is host chrome, and
	an extension frame cannot reach this method at all: it runs at an opaque origin
	and carries no session cookie, so the host is the only caller.

	Merges, and never removes what a call leaves unmentioned. That is the rule
	`set_extension_tokens` follows too. An admin narrows a grant in Desk, and a
	later `data.revokeAccess` can narrow it from an extension.
	"""
	owner = resolve_extension(extension, GRANT_DOCTYPE)
	allowed = set() if denied else read_access(access)

	values = {field: 1 for name, field in ACCESS_FIELDS.items() if name in allowed}
	values["denied"] = int(denied)
	values["granted_by"] = frappe.session.user

	name = find_extension_grant(owner, doctype)
	if name:
		frappe.get_doc(GRANT_DOCTYPE, name).update(values).save()
	else:
		frappe.get_doc(
			{"doctype": GRANT_DOCTYPE, "extension": owner, "document_type": doctype, **values}
		).insert()

	return describe_grant(owner, doctype)


def read_access(access: list[str] | None) -> set[str]:
	access = set(access or [])
	unknown = sorted(access - set(ACCESS_FIELDS))
	if unknown:
		frappe.throw(_("Unknown access: {0}").format(", ".join(unknown)))
	return access


def describe_grant(extension: str, doctype: str) -> dict:
	grant = frappe.db.get_value(
		GRANT_DOCTYPE,
		{"extension": extension, "document_type": doctype},
		[*ACCESS_FIELDS.values(), "denied"],
		as_dict=True,
	)
	if not grant:
		return {"doctype": doctype, **NO_ACCESS}

	answer = {name: bool(grant[field]) for name, field in ACCESS_FIELDS.items()}
	return {"doctype": doctype, **answer, "denied": bool(grant.denied)}


def find_extension_grant(extension: str, doctype: str) -> str | None:
	return frappe.db.get_value(GRANT_DOCTYPE, {"extension": extension, "document_type": doctype}, "name")


def assert_grant(extension: str, doctype: str, access: str) -> None:
	"""The gate every data method opens with. Refuses loudly, and names what is missing.

	Called from the server rather than trusted to the browser, so the grant is
	checked on the same side as the write it guards.
	"""
	owner = find_extension(extension)
	grant = describe_grant(owner, doctype) if owner else NO_ACCESS
	if grant.get(access):
		return

	frappe.throw(
		_('"{0}" was not granted {1} access to {2}.').format(extension, access, doctype),
		frappe.PermissionError,
	)
