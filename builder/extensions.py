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


TOKEN_TYPES = {"Color", "Dimension", "Font"}
TOKEN_FIELDS = ("token_name", "type", "value", "dark_value", "group")


def resolve_extension(extension: str) -> str:
	"""Turns an extension_name such as "acme/icons" into the record name a Link holds.

	The doctype names itself by slug (`builder_extension.py:51`), and the client
	only ever knows the extension_name. Refuses a name no extension owns, so a
	direct caller cannot attach tokens to something that was never installed.

	The permission is the doctype's own, which is the rule that already governs a
	user retinting a token by hand. The client capability is a separate check the
	bridge makes, and neither replaces the other.
	"""
	frappe.has_permission("Builder Token", ptype="write", throw=True)
	return frappe.get_cached_doc("Builder Extension", {"extension_name": extension}).name


@frappe.whitelist()
def set_extension_tokens(extension: str, tokens: list[dict]) -> None:
	"""Create or update a Builder Token per entry, keyed by (extension, key).

	`key` exists because Builder Token.name is a database-assigned uuid, so an
	extension has no other way to name the same token twice (D6).

	Never deletes what a call leaves unmentioned. Dropping a token takes an
	explicit unset.
	"""
	installed = resolve_extension(extension)
	for token in frappe.parse_json(tokens):
		upsert_extension_token(installed, token)


def upsert_extension_token(extension: str, token: dict) -> None:
	key = (token.get("key") or "").strip()
	if not key:
		frappe.throw(frappe._("Every extension token needs a key."))
	if token.get("type") not in TOKEN_TYPES:
		frappe.throw(frappe._("A token type must be one of: {0}").format(", ".join(sorted(TOKEN_TYPES))))

	values = {field: token.get(field) for field in TOKEN_FIELDS if token.get(field) is not None}
	name = find_extension_token(extension, key)
	if name:
		frappe.get_doc("Builder Token", name).update(values).save()
		return

	frappe.get_doc(
		{"doctype": "Builder Token", "extension": extension, "key": key, **values}
	).insert()


@frappe.whitelist()
def unset_extension_token(extension: str, key: str) -> None:
	"""Delete one token this extension created (D6).

	Quiet about a key that is not there: an extension dropping a palette it has
	already dropped is not an error, and the end state is the one it asked for.
	"""
	name = find_extension_token(resolve_extension(extension), key)
	if name:
		frappe.delete_doc("Builder Token", name)


def find_extension_token(extension: str, key: str) -> str | None:
	return frappe.db.get_value("Builder Token", {"extension": extension, "key": key}, "name")
