# Crosscut

A board cut planner that runs entirely in the browser. Give it a sheet size,
then lay pieces out on it until the cuts make sense — no install, no account,
nothing leaves your machine.

**Static site, no build step.** Open `index.html`, or serve the folder.

## Using it

1. **Set the board size.** Two boxes and a unit drop-down — `4` × `4` feet, or
   `120` × `60` centimetres.
2. **Add pieces.** Drag across bare board to cut one, or type a size into
   **Quick add** and let it drop into the first free spot.
3. **Arrange.** Drag pieces around, rotate them, resize from the corner handle.
4. **Add boards.** Press **+ Board** for another sheet, and drag pieces straight
   from one board to another. If a quick-added piece has nowhere to go, a new
   board appears for it.

There are no modes. What is under the pointer decides what a drag does: press a
piece to take hold of it, press bare board to cut a new one. A click on bare
board just clears the selection.

### Snapping

Everything lands on the grid increment chosen in the toolbar:

| Units | Increments |
| --- | --- |
| Inches | 1", 1/2", 1/4", 1/8" |
| Centimetres | 1 cm, 0.5 cm |

On top of the grid, edges are magnetic. As you drag, an edge within a few pixels
snaps flush to:

- the **board's** edges — drag past a corner and the piece settles into it;
- a **neighbour's** edges, leaving the saw kerf between them if one is set;
- a **size you have already cut**, so a second 12" × 16" piece comes out at
  exactly 12" × 16" without typing anything.

A cyan line marks the guide being followed; a new piece turns cyan when its size
matches one already on the board.

### Warnings

- **Red outline** — the piece hangs off the board. Rotating about the centre can
  push a piece over the edge; move or rotate it back.
- **Amber hatching** — the piece overlaps another one, or sits closer than the
  saw kerf set in the toolbar. Set the kerf to the width of your blade and the
  layout will hold that gap between neighbours.

### Keyboard

| Key | Action |
| --- | --- |
| `R` | Rotate the selected piece 90° |
| Arrow keys | Nudge by one snap increment (`Shift` for ten) |
| `Delete` | Remove the selected piece |
| `Ctrl/Cmd + D` | Duplicate |
| `Ctrl/Cmd + Z` | Undo (`Shift` to redo) |
| `Esc` | Cancel the piece being drawn, or deselect |

Your plan is kept in the browser's local storage, so it survives a reload. The
menu (`⋯`) also exports and imports it as JSON, and prints a layout you can
carry to the workshop.

## Publishing

Pushing to `main` deploys via `.github/workflows/pages.yml`. Enable it once
under **Settings → Pages → Source → GitHub Actions**. Serving the branch
directly works too — `.nojekyll` is already in place.

## Layout

```
index.html      markup and the two screens
css/styles.css  all styling, including print and narrow-screen layouts
js/units.js     inches vs centimetres: conversion, snapping, formatting
js/state.js     the plan model, geometry, snapping, packing, storage, undo
js/app.js       rendering and every pointer/keyboard interaction
```

Dimensions are held in one base unit per system — inches for imperial,
centimetres for metric — and converted only for display.
