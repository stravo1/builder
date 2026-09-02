# Copyright (c) 2026, Frappe Technologies Pvt Ltd and contributors
# For license information, please see license.txt

"""What an extension is allowed to be named, hold, and ask for.

Its own module so `access.py` and `registry.py` can share this vocabulary
without importing each other.
"""

import re

EXTENSIONS_FOLDER = "extensions"
ENTRY_FILE = "main.js"
MANIFEST_FILE = "manifest.json"

# publisher/name, lowercase. The slash is the only separator, and no install
# path is ever built from it, so a name can add no path segment.
EXTENSION_NAME_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]*/[a-z0-9][a-z0-9-]*$")
VERSION_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9.+-]*$")

# One SVG in the install root. No separator, so an icon can never name a file
# outside the install folder, and no other format, so the editor can draw it in
# an <img> at any size without a second rule per type.
ICON_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*\.svg$")

# every capability the bridge gates a method by
CAPABILITIES = (
	"context.read",
	"block.read",
	"block.update",
	"block.insert",
	"page.read",
	"page.write",
	"token.write",
	"ui.dialog",
	"ui.popover",
	"data.access",
	"schema.write",
)

# An installation loaded from a dev server this session. It has no files, so
# nothing serves it and `get_enabled_extensions` leaves it out: the browser adds
# its own entry for it.
DEV_EXTENSION_VERSION = "0.0.0-dev"

# The editor reads the whole entry into memory and posts it to five frames, so
# the ceiling is on what a browser can hold, not on what a disk can.
MAX_SOURCE_BYTES = 5_000_000

# Generous for settings and a cached list, small enough that no extension can
# fill a site with what it remembers.
MAX_STATE_BYTES = 100_000
