# Animate

Scroll, hover, click and load animations for any block, with no code.

Select a block, open **Animation** in the right panel, and pick an effect. The block animates on the
published page.

| Setting | Attribute it writes | Values |
|---|---|---|
| Effect | `data-animate` | fade up, fade down, fade in, slide left, slide right, zoom in, zoom out, flip up, blur in, pop |
| Trigger | `data-animate-on` | scroll, load, hover, click |
| Duration | `data-animate-duration` | 100 to 2000 ms |
| Delay | `data-animate-delay` | 0 to 1500 ms |
| Easing | `data-animate-ease` | ease out, ease in out, spring, linear |
| Repeat | `data-animate-repeat` | once, always |

Right-click a block and choose **Clear animation** to remove every one of these at once. The toolbar
button counts the animated blocks on the page.

## The two halves

The editor half writes attributes on a block. It never touches the tree beyond that, because
Builder writes each attribute itself through the same path a built-in control uses.

The published half is one client script, which the extension puts on the page the first time
somebody animates a block on it. The script reads those attributes, wires the triggers, and adds the
classes that run each animation.

Nothing moves in the editor canvas. A client script does not run there, so the panel shows what a
block is set to and the published page shows what it does. Preview the page to watch an animation.

## What the script does

- It carries its own keyframes, and adds them in a `<style>` tag. Builder gives an extension one
  script of each type per page, and asking twice to install one feature is one question too many.
- It hides an element only after it is sure it can animate it. A visitor whose JavaScript failed
  sees the page, not a column of invisible blocks.
- It does nothing at all when the visitor asked their system for reduced motion.
- It watches the document, so a block another script adds later still animates.

The script's first line names its version. The extension rewrites the script when a page carries an
older one, so a page picks up a fix the next time somebody edits it.

## Permissions

`page.write` is what puts the script on the page. Builder asks the user the first time, names the
page, and remembers nothing. The user can read, edit, or delete the script in the editor's Code tab,
and uninstalling the extension removes it.

`block.update` is what the six controls need. `page.read` is what the toolbar count needs.

## Install

```sh
cd sites
../env/bin/python ../apps/builder/frontend/extension-sdk/samples/install.py builder.localhost
```
