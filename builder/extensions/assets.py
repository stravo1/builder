# Copyright (c) 2026, Frappe Technologies Pvt Ltd and contributors
# For license information, please see license.txt

"""The one SDK build every extension frame shares.

Nothing else is served here. An extension's own code reaches its frame through
the connect handshake, because a frame sends no session and no route could tell
one user's request from another's.

The frame still needs this file over HTTP: its import map resolves the bare
`frappe-builder-extension-sdk` specifier to this URL, and a module script at an
opaque origin is a cross-origin request. The web server sends no CORS header for
the app's public directory, so Builder answers this one itself.
"""

import mimetypes
from pathlib import Path

import frappe
from frappe.website.page_renderers.base_renderer import BaseRenderer
from werkzeug.wrappers import Response
from werkzeug.wsgi import wrap_file

ROUTE_PREFIX = "builder_extension_asset"
SDK_FOLDER = "sdk"

# The name never changes, so the file cannot be immutable. It revalidates, and an
# unchanged build answers 304.
CACHE_CONTROL = "public, no-cache"

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


def get_file_stamp(path: Path) -> str:
	stat = path.stat()
	return f"{stat.st_mtime_ns}-{stat.st_size}"


class ExtensionAsset(BaseRenderer):
	"""Serves the extension SDK to a sandboxed frame."""

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
		if len(parts) < 3 or parts[0] != ROUTE_PREFIX or parts[1] != SDK_FOLDER:
			return

		base = Path(frappe.get_app_path("builder", "public", "extension_sdk")).resolve()
		requested = (base / "/".join(parts[2:])).resolve()
		if requested.is_relative_to(base) and requested.is_file():
			self.file_path = requested
			self.etag = get_file_stamp(requested)
