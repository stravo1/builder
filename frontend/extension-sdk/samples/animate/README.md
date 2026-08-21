# Animate

Scroll, hover, click and load animations for any block, with no code.

Open the **Animate** tab in the left panel and select a block. Pick an effect from the grid, set the
trigger and the timing, and watch it replay in the preview tile at the top.

| Setting | Attribute it writes | Values |
|---|---|---|
| Effect | `data-animate` | fade up, fade down, fade in, slide left, slide right, zoom in, zoom out, flip up, blur in, pop |
| Trigger | `data-animate-on` | scroll, load, hover, click |
| Duration | `data-animate-duration` | 100 to 2000 ms |
| Delay | `data-animate-delay` | 0 to 1500 ms |
| Easing | `data-animate-ease` | ease out, ease in out, spring, linear |
| Repeat | `data-animate-repeat` | once, always |

A setting left at its default writes no attribute, so a block with a plain fade carries one
attribute rather than six. Choosing **None** takes all of them off.

The toolbar button counts the animated blocks on the page.

## The two halves

The editor half writes attributes on a block. It never touches the tree beyond that: `block.update`
writes each attribute through the same path a built-in control uses.

The published half is one client script, which the extension puts on the page the first time
somebody animates a block on it. The script reads those attributes, wires the triggers, and adds the
classes that run each animation.

Nothing moves in the editor canvas. A client script does not run there, so the panel is the only
place an animation can be seen before the page is published — which is what the preview tile is for.
It replays from the same keyframes the published page uses, so what you see is what ships.

## One panel, and no second editor

The panel reads a block once, when the selection moves, and writes on every change. A second surface
editing the same six values — a property section, a context menu row — would leave the panel showing
what the block no longer says, because nothing pushes an attribute change back to a frame.

So the panel is the only thing that writes them. The toolbar button only counts.

## What the script does

- It carries its own keyframes, and adds them in a `<style>` tag. Builder gives an extension one
  script of each type per page, and asking the user twice to install one feature is one question too
  many.
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

`block.read` and `block.update` are what the panel needs to read and write a block. `context.read`
is how it follows the selection. `page.read` is what the toolbar count needs.

## Build and install

The panel is a Vue frame, so this one needs a build. The other samples do not.

```sh
cd frontend/extension-sdk/samples/animate
yarn install
yarn build
```

`vite.config.js` names `http://builder.localhost:8080` as the Builder origin. Change it if your bench
serves Builder somewhere else — any other origin loads a second SDK instance, and the frame never
connects.

Then install it with the rest:

```sh
cd sites
../env/bin/python ../apps/builder/frontend/extension-sdk/samples/install.py builder.localhost
```

Run `yarn build` again after every edit, then install again.

For live reloading instead, run `yarn dev` and load the dev server URL from the Extensions panel.
