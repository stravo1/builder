# Copyright (c) 2026, Frappe Technologies Pvt Ltd and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

from builder.api.plugin_icon import resolve_doctype_plugin_icon


class BuilderPlugin(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		allowed_domains: DF.SmallText | None
		enabled: DF.Check
		main_script: DF.Code
		manifest: DF.JSON | None
		plugin_icon: DF.AttachImage | None
		plugin_id: DF.Data
		plugin_name: DF.Data
		ui_html: DF.Code | None
	# end: auto-generated types

	def validate(self):
		if not self.plugin_id:
			frappe.throw("Plugin ID is required")

	def get_manifest_dict(self) -> dict:
		manifest = frappe.parse_json(self.manifest) if self.manifest else {}
		if not isinstance(manifest, dict):
			manifest = {}

		allowed_domains = manifest.get("allowedDomains")
		if not allowed_domains and self.allowed_domains:
			allowed_domains = [domain.strip() for domain in self.allowed_domains.split(",") if domain.strip()]

		return {
			"id": self.plugin_id,
			"name": self.plugin_name,
			"apiVersion": manifest.get("apiVersion") or "1.0",
			"main": manifest.get("main") or "main.js",
			"ui": manifest.get("ui") or "ui.html",
			"icon": manifest.get("icon"),
			"allowedDomains": allowed_domains or [],
			"permissions": manifest.get("permissions")
			or ["blocks:read", "blocks:write", "selection:write", "viewport:read"],
		}

	def to_plugin_bundle(self) -> dict:
		manifest = self.get_manifest_dict()
		icon_fields = resolve_doctype_plugin_icon(self.plugin_icon, manifest)
		return {
			"id": manifest["id"],
			"name": manifest["name"],
			"manifest": manifest,
			"mainScript": self.main_script or "",
			"uiHtml": self.ui_html or "",
			"enabled": bool(self.enabled),
			"isDev": False,
			**icon_fields,
		}
