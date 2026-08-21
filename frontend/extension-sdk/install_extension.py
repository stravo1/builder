"""Install a Builder extension on a site.

Builder has no install API yet, so an extension is installed by writing its files
and inserting the record. This script does both, for any extension directory.

Run it from the bench's sites directory:

    cd sites
    ../env/bin/python /path/to/install_extension.py builder.localhost /path/to/my-extension
    ../env/bin/python /path/to/install_extension.py builder.localhost /path/to/my-extension --uninstall

Run it again after every build. The checksum is a hash of the files, so a new one
busts the entry cache and a reload of the editor picks the change up.
"""

import argparse
import hashlib
import pathlib
import shutil

import frappe

# An SFC needs compiling, so a source install leaves one behind. A frame cannot
# import one, and nothing else reads it.
NOT_SHIPPED_SUFFIXES = {".vue"}


class ExtensionPackage:
	"""What an author builds: a manifest, and the files a frame loads."""

	def __init__(self, directory: str):
		self.directory = pathlib.Path(directory).resolve()

	@property
	def manifest(self) -> dict:
		path = self.directory / "manifest.json"
		if not path.is_file():
			raise SystemExit(f"no manifest.json in {self.directory}")
		return frappe.parse_json(path.read_text())

	@property
	def source_directory(self) -> pathlib.Path:
		"""`dist` after a build, `src` otherwise.

		Both are real installs. A build is what an author ships, and plain
		JavaScript under `src` runs an extension that needs no build step at all.
		"""
		built = self.directory / "dist"
		return built if built.is_dir() else self.directory / "src"

	@property
	def files(self) -> list[pathlib.Path]:
		"""Every file that belongs in the install directory, in a stable order."""
		return sorted(
			path
			for path in self.source_directory.rglob("*")
			if path.is_file() and path.suffix not in NOT_SHIPPED_SUFFIXES
		)

	@property
	def checksum(self) -> str:
		"""Of the names and the contents, so a rename busts the cache as a rewrite does."""
		digest = hashlib.sha256()
		for path in self.files:
			digest.update(path.relative_to(self.source_directory).as_posix().encode())
			digest.update(path.read_bytes())
		return digest.hexdigest()[:12]

	@property
	def record_name(self) -> str:
		return self.manifest["name"].replace("/", "-")

	def validate(self):
		if not self.source_directory.is_dir():
			raise SystemExit(f"no dist/ or src/ in {self.directory}")
		if not self.files:
			raise SystemExit(f"nothing to install in {self.source_directory}")
		for field in ("name", "version"):
			if not self.manifest.get(field):
				raise SystemExit(f'manifest.json has no "{field}"')


class ExtensionInstaller:
	def __init__(self, site: str, package: ExtensionPackage):
		self.site = site
		self.package = package
		frappe.init(site=site)
		frappe.connect()

	def install(self):
		self.package.validate()
		extension = self.upsert_record()
		self.copy_files(extension.install_path)
		frappe.db.commit()
		self.report(extension)

	def upsert_record(self):
		manifest = self.package.manifest
		values = {
			"extension_name": manifest["name"],
			"label": manifest.get("label"),
			"icon": manifest.get("icon"),
			"version": manifest["version"],
			"capabilities": frappe.as_json(manifest.get("capabilities") or []),
			"checksum": self.package.checksum,
			"enabled": 1,
		}
		if frappe.db.exists("Builder Extension", self.package.record_name):
			extension = frappe.get_doc("Builder Extension", self.package.record_name)
			extension.update(values)
			return extension.save()
		return frappe.get_doc({"doctype": "Builder Extension", **values}).insert()

	def copy_files(self, install_path: str):
		"""The whole directory, because one install is immutable under one checksum.

		The source directory flattens onto the install root, so `main.js` sits where
		the record's `script_url` points at it.
		"""
		shutil.rmtree(install_path, ignore_errors=True)
		for path in self.package.files:
			target = pathlib.Path(install_path) / path.relative_to(self.package.source_directory)
			target.parent.mkdir(parents=True, exist_ok=True)
			shutil.copy2(path, target)

	def uninstall(self):
		"""Deleting the record deletes the files: `on_trash` owns the directory.

		The tokens go first. `Builder Token.extension` is a Link, so Frappe refuses to
		delete an extension any token still names. A token an extension wrote is also
		a token published pages already use, so this asks before it drops them.
		"""
		name = self.package.record_name
		if not frappe.db.exists("Builder Extension", name):
			print(f"{name} is not installed")
			return

		tokens = frappe.get_all("Builder Token", filters={"extension": name}, pluck="name")
		if tokens and not self.confirm_token_deletion(tokens):
			return

		for token in tokens:
			frappe.delete_doc("Builder Token", token)
		frappe.delete_doc("Builder Extension", name)
		frappe.db.commit()
		print(f"uninstalled {name}, and {len(tokens)} token(s) it wrote")

	def confirm_token_deletion(self, tokens: list[str]) -> bool:
		print(f"{len(tokens)} token(s) written by this extension are still in use:")
		for token in tokens:
			print(f"  {token}")
		return input("delete them and uninstall? [y/N] ").strip().lower() == "y"

	def report(self, extension):
		print(f"installed {extension.extension_name} at checksum {extension.checksum}")
		print(f"  files  {extension.install_path}")
		print(f"  entry  {extension.script_url}")
		print(f"  from   {self.package.source_directory.name}/")


def main():
	parser = argparse.ArgumentParser(description=__doc__)
	parser.add_argument("site", help="the site to install on, for example builder.localhost")
	parser.add_argument("directory", help="the extension directory, which holds manifest.json")
	parser.add_argument("--uninstall", action="store_true", help="remove the extension instead")
	arguments = parser.parse_args()

	installer = ExtensionInstaller(arguments.site, ExtensionPackage(arguments.directory))
	installer.uninstall() if arguments.uninstall else installer.install()


if __name__ == "__main__":
	main()
