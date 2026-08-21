# Sample extensions

Working extensions, each with its own icon. Read one when you want a short example of a surface.
Install them to fill the Extensions panel with something real.

For the whole API, read `skills/build-builder-extension/references/extension-api.md`.

Three of them do a single job through a single surface:

| Extension | Surface | Capabilities | What it does |
|---|---|---|---|
| `builder/alt-text` | Toolbar button | `page.read` | Counts the images that carry no alt text |
| `builder/lorem` | Context menu row | `block.read`, `block.update` | Fills a text block with placeholder copy |
| `builder/brand-palette` | Toolbar button | `token.write` | Writes one brand color ramp as design tokens |

`builder/animate` is a full one. It adds scroll, hover, click and load animations to any block
through a property section, and it puts a client script on the page to run them. Read
[its README](animate/README.md) for how the two halves fit together, and read it first if you need
an example of `page.attachScript`.

## Install

Each sample is plain JavaScript under `src/`, so none of them needs a build step.

```sh
cd sites
../env/bin/python ../apps/builder/frontend/extension-sdk/samples/install.py builder.localhost
```

Reload the editor. They appear in the Extensions panel, each with its icon.

To remove them:

```sh
../env/bin/python ../apps/builder/frontend/extension-sdk/samples/install.py builder.localhost --uninstall
```

`builder/brand-palette` writes real `Builder Token` rows, so uninstalling it asks before it drops
the tokens it wrote. Uninstalling `builder/animate` deletes the client scripts it put on your pages,
and asks nothing: they hold its code and no data of yours.

## Icons

Each folder holds `src/icon.svg`, and its manifest names the file:

```json
"icon": "icon.svg"
```

The install copies the file to the install root, and the record derives the URL the editor loads.
Builder draws the file in an `<img>` element of 16 by 16 pixels, so a file cannot read the editor
theme. Every shape in these three carries its own color, and each color reads on a light and a dark
background.
