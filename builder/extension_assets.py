# Copyright (c) 2026, Frappe Technologies Pvt Ltd and contributors
# For license information, please see license.txt

import mimetypes
from pathlib import Path

import frappe
from frappe.website.page_renderers.base_renderer import BaseRenderer
from werkzeug.wrappers import Response
from werkzeug.wsgi import wrap_file

ROUTE_PREFIX = "builder_extension_asset"
SDK_FOLDER = "sdk"
CACHE_CONTROL = "public, max-age=31536000, immutable"

# a module script is MIME-strict: the wrong type stops the browser running it,
# with an error that names neither the type nor the script
MIME_TYPES = {
	".js": "text/javascript",
	".mjs": "text/javascript",
	".css": "text/css",
	".json": "application/json",
	".map": "application/json",
	".svg": "image/svg+xml",
}


def get_enabled_extension(slug: str, version: str):
	"""The URL names a version, so an upgraded record stops serving the old path."""
	try:
		extension = frappe.get_cached_doc("Builder Extension", slug)
	except frappe.DoesNotExistError:
		return None
	if not extension.enabled or extension.version != version:
		return None
	return extension


def get_file_stamp(path: Path) -> str:
	stat = path.stat()
	return f"{stat.st_mtime_ns}-{stat.st_size}"


class ExtensionAsset(BaseRenderer):
	"""Serves an installed extension's files to its own sandboxed frame.

	The frame runs at an opaque origin, so every file it loads is a cross-origin
	request and needs an Access-Control-Allow-Origin header. The web server
	serves the install directory to nobody, so Builder answers these itself.
	"""

	def __init__(self, path=None, http_status_code=None):
		super().__init__(path=path, http_status_code=http_status_code)
		self.file_path = None
		self.etag = None
		self.set_file_path()

	def can_render(self) -> bool:
		return bool(self.file_path)

	def render(self):
		if self.is_unchanged:
			return Response(status=304, headers=self.response_headers)

		# the file descriptor stays open, and the middleware closes it
		stream = wrap_file(frappe.local.request.environ, open(self.file_path, "rb"))
		response = Response(stream, direct_passthrough=True, headers=self.response_headers)
		response.mimetype = self.mimetype
		return response

	@property
	def response_headers(self) -> dict:
		return {
			"Access-Control-Allow-Origin": "*",
			"Cache-Control": CACHE_CONTROL,
			"ETag": self.quoted_etag,
		}

	@property
	def quoted_etag(self) -> str:
		return f'"{self.etag}"'

	@property
	def mimetype(self) -> str:
		guessed = mimetypes.guess_type(self.file_path.name)[0]
		return MIME_TYPES.get(self.file_path.suffix) or guessed or "application/octet-stream"

	@property
	def is_unchanged(self) -> bool:
		return frappe.local.request.headers.get("If-None-Match") == self.quoted_etag

	def set_file_path(self):
		parts = self.path.split("/")
		if len(parts) < 3 or parts[0] != ROUTE_PREFIX:
			return

		base, etag = self.get_base(parts[1])
		if not base:
			return

		requested = (base / "/".join(parts[2:])).resolve()
		if requested.is_relative_to(base) and requested.is_file():
			self.file_path = requested
			self.etag = etag or get_file_stamp(requested)

	def get_base(self, folder: str) -> tuple[Path | None, str | None]:
		"""The directory a request may read from, and the etag every file in it shares."""
		if folder == SDK_FOLDER:
			return Path(frappe.get_app_path("builder", "public", "extension_sdk")).resolve(), None

		slug, _, version = folder.partition("@")
		extension = get_enabled_extension(slug, version)
		if not extension:
			return None, None

		# one install is immutable under one checksum, so every file in it shares that etag
		return Path(extension.install_path).resolve(), extension.checksum
