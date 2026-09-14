/* Crosscut — interface: rendering, drawing, dragging, rotating. */
(function (global) {
  'use strict';

  var units = global.CC.units;
  var S = global.CC.state;
  var doc = global.document;

  var project = null;
  var history = new S.History();
  var selectedId = null;
  var scale = 6;          // pixels per base unit (inch or centimetre)
  var draw = null;        // rectangle being dragged out on bare board
  var drag = null;        // piece being moved or resized
  var els = {};

  /* ------------------------------------------------------------- helpers */

  function $(id) { return doc.getElementById(id); }
  function on(el, type, fn, opts) {
    // A control that is not on the page must not take the whole app down with it.
    if (!el) return;
    el.addEventListener(type, fn, opts);
  }

  function el(tag, className, text) {
    var node = doc.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function sys() { return units.system(project.system); }
  function fmt(v) { return units.format(v, project.system); }

  function commit() {
    S.save(project);
    render();
  }

  function record() {
    history.push(project);
  }

  /* ------------------------------------------------------------ bootstrap */

  function init() {
    cacheElements();
    buildSetupUnits();
    wireSetup();
    wireToolbar();
    wireSidebar();
    wireGlobalKeys();

    var saved = S.load();
    if (saved) {
      els.restoreBtn.classList.remove('hidden');
      els.setupNote.textContent = 'A saved plan is waiting for you.';
    }
    global.addEventListener('resize', function () {
      if (project) render();
    });
  }

  function cacheElements() {
    els = {
      setup: $('setup'),
      setupForm: $('setup-form'),
      setupW: $('setup-w'),
      setupH: $('setup-h'),
      setupUnit: $('setup-unit'),
      setupNote: $('setup-note'),
      restoreBtn: $('restore-btn'),
      app: $('app'),
      boards: $('boards'),
      snapSelect: $('snap-select'),
      hintbar: doc.querySelector('.hintbar'),
      kerfInput: $('kerf-input'),
      kerfUnit: $('kerf-unit'),
      zoomRange: $('zoom-range'),
      undoBtn: $('undo-btn'),
      redoBtn: $('redo-btn'),
      addBoardBtn: $('add-board-btn'),
      homeBtn: $('home-btn'),
      exportBtn: $('export-btn'),
      importBtn: $('import-btn'),
      importFile: $('import-file'),
      printBtn: $('print-btn'),
      resetBtn: $('reset-btn'),
      qaW: $('qa-w'),
      qaH: $('qa-h'),
      qaQty: $('qa-qty'),
      qaLabel: $('qa-label'),
      qaAdd: $('qa-add'),
      selPanel: $('selection-panel'),
      selLabel: $('sel-label'),
      selW: $('sel-w'),
      selH: $('sel-h'),
      selX: $('sel-x'),
      selY: $('sel-y'),
      selBoard: $('sel-board'),
      selRotate: $('sel-rotate'),
      selDupe: $('sel-dupe'),
      selDelete: $('sel-delete'),
      selStatus: $('sel-status'),
      cutlist: $('cutlist')
    };
  }

  /* ---------------------------------------------------------- setup screen */

  function buildSetupUnits() {
    units.INPUT_UNITS.forEach(function (u) {
      var opt = el('option', null, u.label);
      opt.value = u.id;
      els.setupUnit.appendChild(opt);
    });
    els.setupUnit.value = 'ft';
  }

  function wireSetup() {
    on(els.setupForm, 'submit', function (event) {
      event.preventDefault();
      var unit = units.inputUnit(els.setupUnit.value);
      var w = parseFloat(els.setupW.value) * unit.toBase;
      var h = parseFloat(els.setupH.value) * unit.toBase;
      if (!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) {
        els.setupNote.textContent = 'Give the board a width and a height.';
        return;
      }
      project = S.newProject(w, h, unit.system);
      history = new S.History();
      selectedId = null;
      openPlanner();
    });

    on(els.restoreBtn, 'click', function () {
      var saved = S.load();
      if (!saved) return;
      project = saved;
      history = new S.History();
      selectedId = null;
      openPlanner();
    });
  }

  function openPlanner() {
    els.setup.classList.add('hidden');
    els.app.classList.remove('hidden');
    buildSnapOptions();
    els.kerfUnit.textContent = sys().baseLabel;
    els.kerfInput.value = project.kerf;
    els.kerfInput.step = project.snap;
    els.zoomRange.value = project.zoom;
    commit();
    els.boards.focus();
  }

  function backToSetup() {
    S.save(project);
    els.app.classList.add('hidden');
    els.setup.classList.remove('hidden');
    els.restoreBtn.classList.remove('hidden');
    els.setupNote.textContent = 'Your plan is saved — starting fresh replaces it.';
  }

  function buildSnapOptions() {
    els.snapSelect.innerHTML = '';
    sys().snaps.forEach(function (s) {
      var opt = el('option', null, s.label);
      opt.value = String(s.value);
      els.snapSelect.appendChild(opt);
    });
    els.snapSelect.value = String(project.snap);
  }

  /* -------------------------------------------------------------- toolbar */

  function wireToolbar() {
    on(els.snapSelect, 'change', function () {
      project.snap = parseFloat(els.snapSelect.value);
      els.kerfInput.step = project.snap;
      commit();
    });

    on(els.kerfInput, 'change', function () {
      project.kerf = Math.max(0, S.num(els.kerfInput.value, 0));
      els.kerfInput.value = project.kerf;
      commit();
    });

    on(els.zoomRange, 'input', function () {
      project.zoom = parseFloat(els.zoomRange.value);
      render();
    });

    on(els.undoBtn, 'click', undo);
    on(els.redoBtn, 'click', redo);
    on(els.homeBtn, 'click', backToSetup);

    on(els.addBoardBtn, 'click', function () {
      var last = project.boards[project.boards.length - 1];
      record();
      project.boards.push(S.newBoard(last.w, last.h, 'Board ' + (project.boards.length + 1)));
      commit();
    });

    on(els.exportBtn, 'click', exportPlan);
    on(els.importBtn, 'click', function () { els.importFile.click(); });
    on(els.importFile, 'change', importPlan);
    on(els.printBtn, 'click', function () { closeMenus(); global.print(); });

    on(els.resetBtn, 'click', function () {
      if (!global.confirm('Throw away this plan and start over?')) return;
      S.clearSaved();
      project = null;
      closeMenus();
      els.app.classList.add('hidden');
      els.setup.classList.remove('hidden');
      els.restoreBtn.classList.add('hidden');
      els.setupNote.textContent = '';
    });
  }

  function closeMenus() {
    Array.prototype.forEach.call(doc.querySelectorAll('details.menu[open]'), function (d) {
      d.removeAttribute('open');
    });
  }

  /* ------------------------------------------------------------- rendering */

  function computeScale() {
    var widest = 1, tallest = 1;
    project.boards.forEach(function (b) {
      widest = Math.max(widest, b.w);
      tallest = Math.max(tallest, b.h);
    });
    var rect = els.boards.getBoundingClientRect();
    var availW = Math.max(240, rect.width - 48);
    var availH = Math.max(240, rect.height - 120);
    var fit = Math.min(availW / widest, availH / tallest);
    scale = Math.max(0.5, fit) * (project.zoom || 1);
  }

  function render() {
    if (!project) return;
    computeScale();
    renderBoards();
    renderSelection();
    renderCutList();
    els.undoBtn.disabled = !history.canUndo();
    els.redoBtn.disabled = !history.canRedo();
  }

  function renderBoards() {
    els.boards.innerHTML = '';
    project.boards.forEach(function (board, index) {
      els.boards.appendChild(renderBoard(board, index));
    });
  }

  function renderBoard(board, index) {
    var stats = S.boardStats(board, project.kerf);
    var section = el('section', 'board');
    section.dataset.board = board.id;

    var head = el('header', 'board-head');

    var name = el('input', 'board-name');
    name.value = board.name;
    name.setAttribute('aria-label', 'Board name');
    on(name, 'input', function () { board.name = name.value; S.save(project); });
    on(name, 'change', function () { record(); commit(); });
    head.appendChild(name);

    head.appendChild(sizeField(board, 'w'));
    head.appendChild(el('span', 'board-times', '×'));
    head.appendChild(sizeField(board, 'h'));
    head.appendChild(el('span', 'board-unit', sys().baseLabel));

    head.appendChild(el('span', 'board-size', '(' + units.formatLong(board.w, project.system) +
      ' × ' + units.formatLong(board.h, project.system) + ')'));

    var meta = el('span', 'board-meta');
    meta.textContent = '· ' + stats.count + (stats.count === 1 ? ' piece' : ' pieces') +
      ' · ' + stats.pct + '% used · ' + units.formatArea(stats.waste, project.system) + ' left';
    if (stats.problems) meta.classList.add('has-problem');
    head.appendChild(meta);

    if (project.boards.length > 1) {
      var del = el('button', 'icon-button board-del', '×');
      del.title = 'Remove this board';
      on(del, 'click', function () {
        if (board.pieces.length && !global.confirm('Remove ' + board.name + ' and its ' + board.pieces.length + ' piece(s)?')) return;
        record();
        project.boards.splice(index, 1);
        commit();
      });
      head.appendChild(del);
    }

    section.appendChild(head);

    var frame = el('div', 'board-frame');
    var surface = el('div', 'board-surface');
    surface.dataset.board = board.id;
    surface.style.width = (board.w * scale) + 'px';
    surface.style.height = (board.h * scale) + 'px';
    var majorPx = sys().majorGrid * scale;
    var minorPx = sys().minorGrid * scale;
    // Below a few pixels apart the fine grid turns into noise, so drop it.
    surface.style.setProperty('--minor', (minorPx < 5 ? majorPx : minorPx) + 'px');
    surface.style.setProperty('--major', majorPx + 'px');

    board.pieces.forEach(function (piece) {
      surface.appendChild(renderPiece(board, piece));
    });

    surface.appendChild(el('div', 'guides'));

    var ghost = el('div', 'add-ghost hidden', '+');
    surface.appendChild(ghost);
    var preview = el('div', 'draw-preview hidden');
    preview.appendChild(el('span', 'draw-dims'));
    surface.appendChild(preview);

    attachSurfaceEvents(surface, board, ghost, preview);

    frame.appendChild(surface);
    section.appendChild(frame);
    return section;
  }

  function sizeField(board, key) {
    var input = el('input', 'board-size-input');
    input.type = 'number';
    input.step = 'any';
    input.min = '0.1';
    input.value = round(board[key]);
    input.setAttribute('aria-label', 'Board ' + (key === 'w' ? 'width' : 'height'));
    on(input, 'change', function () {
      var value = S.num(input.value, board[key]);
      if (value <= 0) { input.value = round(board[key]); return; }
      record();
      board[key] = value;
      commit();
    });
    return input;
  }

  function renderPiece(board, piece) {
    var node = el('div', 'piece');
    node.dataset.piece = piece.id;
    node.style.setProperty('--piece-color', piece.color);
    applyPieceGeometry(node, board, piece);

    var label = el('div', 'piece-label', piece.label || '');
    node.appendChild(label);
    node.appendChild(el('div', 'piece-dims'));

    if (piece.rot) {
      node.appendChild(el('div', 'piece-rot-badge', piece.rot + '°'));
    }

    if (piece.id === selectedId) {
      node.classList.add('is-selected');

      var rotate = el('button', 'piece-tool piece-rotate', '↻');
      rotate.title = 'Rotate 90°';
      on(rotate, 'pointerdown', function (e) { e.stopPropagation(); });
      on(rotate, 'click', function (e) { e.stopPropagation(); rotateSelected(); });
      node.appendChild(rotate);

      var remove = el('button', 'piece-tool piece-remove', '×');
      remove.title = 'Delete piece';
      on(remove, 'pointerdown', function (e) { e.stopPropagation(); });
      on(remove, 'click', function (e) { e.stopPropagation(); deleteSelected(); });
      node.appendChild(remove);

      var handle = el('div', 'piece-handle');
      handle.title = 'Drag to resize';
      node.appendChild(handle);
    }

    updatePieceVisual(node, board, piece);
    return node;
  }

  function applyPieceGeometry(node, board, piece) {
    var f = S.footprint(piece);
    node.style.left = (piece.x * scale) + 'px';
    node.style.top = (piece.y * scale) + 'px';
    node.style.width = (f.w * scale) + 'px';
    node.style.height = (f.h * scale) + 'px';
  }

  /* Keeps a piece's position, size, caption and warning state in sync — used
     both on a full render and on every pointer move while dragging. */
  function updatePieceVisual(node, board, piece) {
    applyPieceGeometry(node, board, piece);
    var f = S.footprint(piece);
    // Fall back to the compact caption once the full one would not fit —
    // metric reads longer than imperial, so measure rather than guess.
    var full = units.formatPair(f.w, f.h, project.system);
    var tiny = f.h * scale < 42 || f.w * scale < full.length * 6.6 + 10;
    var dims = node.querySelector('.piece-dims');
    if (dims) {
      dims.textContent = tiny ? units.formatPairCompact(f.w, f.h, project.system) : full;
    }
    var labelNode = node.querySelector('.piece-label');
    if (labelNode) labelNode.textContent = piece.label || '';
    var outside = S.outOfBounds(piece, board);
    var clash = S.overlapping(board, piece, project.kerf);
    node.classList.toggle('is-outside', outside);
    node.classList.toggle('is-clashing', !outside && clash);
    node.classList.toggle('is-tiny', tiny);

    var tip = (piece.label ? piece.label + ' — ' : '') + units.formatPair(f.w, f.h, project.system);
    if (outside) tip += ' — hangs off the board';
    else if (clash) tip += ' — overlaps another piece';
    node.title = tip;
  }

  /* ------------------------------------------------------ board interaction */

  /* Pressing on the board takes focus away from whichever toolbar field had it,
     so the keyboard shortcuts keep working. */
  function focusBoards() {
    var active = doc.activeElement;
    if (active && active !== els.boards && typeof active.blur === 'function') {
      var tag = active.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') active.blur();
    }
    try { els.boards.focus({ preventScroll: true }); } catch (err) { els.boards.focus(); }
  }

  /* How far a magnet reaches, in board units — a constant few pixels on screen
     however far in or out the plan is zoomed. */
  function magnetRange() {
    return 7 / scale;
  }

  function snapOpts() {
    return { snap: project.snap, kerf: project.kerf, tolerance: magnetRange() };
  }

  /* Snaps a pointer position to the grid, then to any guide within reach.
     The raw point is kept inside the board so dragging past a corner lands
     flush against it rather than overshooting. */
  function snapPoint(board, raw, anchor, excludeId) {
    var inside = { x: S.clamp(raw.x, 0, board.w), y: S.clamp(raw.y, 0, board.h) };
    return S.snapCorner(board, inside, anchor, snapOpts(), excludeId);
  }

  function paintGuides(boardId, gx, gy) {
    clearGuides();
    var layer = doc.querySelector('.board-surface[data-board="' + boardId + '"] .guides');
    if (!layer) return;
    if (gx != null) {
      var vertical = el('div', 'guide guide-v');
      vertical.style.left = (gx * scale) + 'px';
      layer.appendChild(vertical);
    }
    if (gy != null) {
      var horizontal = el('div', 'guide guide-h');
      horizontal.style.top = (gy * scale) + 'px';
      layer.appendChild(horizontal);
    }
  }

  function clearGuides() {
    Array.prototype.forEach.call(doc.querySelectorAll('.guides'), function (layer) {
      layer.innerHTML = '';
    });
  }

  function pointIn(surface, event) {
    var rect = surface.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / scale,
      y: (event.clientY - rect.top) / scale
    };
  }

  function attachSurfaceEvents(surface, board, ghost, preview) {
    /* One mode throughout: press a piece to take hold of it, press bare board
       to cut a new one. What is under the pointer decides, not a toolbar. */
    on(surface, 'pointerdown', function (event) {
      if (event.button !== 0 || drag || draw) return;
      focusBoards();

      var pieceNode = event.target.closest ? event.target.closest('.piece') : null;
      if (pieceNode && surface.contains(pieceNode)) {
        var found = S.findPiece(project, pieceNode.dataset.piece);
        if (!found) return;
        event.preventDefault();
        select(found.piece.id);
        startDrag(event, found.board, found.piece,
          event.target.classList.contains('piece-handle') ? 'resize' : 'move');
        return;
      }

      event.preventDefault();
      var anchor = snapPoint(board, pointIn(surface, event), null, null);
      draw = {
        boardId: board.id,
        ax: anchor.x,
        ay: anchor.y,
        x: anchor.x,
        y: anchor.y,
        downX: event.clientX,
        downY: event.clientY,
        live: false,
        matched: false
      };
      ghost.classList.add('hidden');
      // Capture so the rectangle keeps following the pointer past the board edge.
      try { surface.setPointerCapture(event.pointerId); } catch (err) { /* fine without */ }
    });

    on(surface, 'pointermove', function (event) {
      if (drag) return;
      var raw = pointIn(surface, event);

      if (draw && draw.boardId === board.id) {
        if (!draw.live && Math.abs(event.clientX - draw.downX) +
                          Math.abs(event.clientY - draw.downY) > 4) {
          draw.live = true;
        }
        var corner = snapPoint(board, raw, { x: draw.ax, y: draw.ay }, null);
        draw.x = corner.x;
        draw.y = corner.y;
        draw.matched = corner.matchW || corner.matchH;
        if (draw.live) {
          showPreview(preview);
          paintGuides(board.id, corner.guideX, corner.guideY);
        }
        return;
      }

      if (!draw) {
        var spot = snapPoint(board, raw, null, null);
        ghost.classList.remove('hidden');
        ghost.style.left = (spot.x * scale) + 'px';
        ghost.style.top = (spot.y * scale) + 'px';
      }
    });

    on(surface, 'pointerleave', function () {
      if (!draw) ghost.classList.add('hidden');
    });

    on(surface, 'pointerup', function () {
      if (!draw || draw.boardId !== board.id) return;
      if (draw.live) {
        finishDraw();
      } else {
        // A press that never moved is just a click on bare board.
        draw = null;
        clearGuides();
        select(null);
      }
    });

    on(surface, 'dblclick', function (event) {
      var pieceNode = event.target.closest ? event.target.closest('.piece') : null;
      if (pieceNode) {
        select(pieceNode.dataset.piece);
        els.selLabel.focus();
        els.selLabel.select();
      }
    });
  }

  function showPreview(preview) {
    if (!draw) {
      preview.classList.add('hidden');
      return;
    }
    var x = Math.min(draw.ax, draw.x);
    var y = Math.min(draw.ay, draw.y);
    var w = Math.abs(draw.x - draw.ax);
    var h = Math.abs(draw.y - draw.ay);
    preview.classList.remove('hidden');
    preview.classList.toggle('is-matched', !!draw.matched);
    preview.style.left = (x * scale) + 'px';
    preview.style.top = (y * scale) + 'px';
    preview.style.width = (w * scale) + 'px';
    preview.style.height = (h * scale) + 'px';
    preview.querySelector('.draw-dims').textContent = units.formatPair(w, h, project.system);
  }

  function cancelDraw() {
    if (!draw) return;
    draw = null;
    clearGuides();
    render();
  }

  function finishDraw() {
    if (!draw) return;
    var board = S.findBoard(project, draw.boardId);
    var current = draw;
    draw = null;
    clearGuides();
    if (!board) { render(); return; }

    var x = Math.min(current.ax, current.x);
    var y = Math.min(current.ay, current.y);
    var w = Math.abs(current.x - current.ax);
    var h = Math.abs(current.y - current.ay);

    if (w < project.snap - 1e-9 || h < project.snap - 1e-9) {
      render();   // too small to be a real piece — treat it as a cancel
      return;
    }

    var piece = S.newPiece(w, h);
    piece.x = x;
    piece.y = y;
    piece.color = nextColor();
    record();
    board.pieces.push(piece);
    selectedId = piece.id;
    commit();
  }

  function nextColor() {
    var count = 0;
    project.boards.forEach(function (b) { count += b.pieces.length; });
    return S.COLORS[count % S.COLORS.length];
  }

  /* ---------------------------------------------------------- drag & resize */

  function startDrag(event, board, piece, kind) {
    var surface = doc.querySelector('.board-surface[data-board="' + board.id + '"]');
    var p = pointIn(surface, event);
    drag = {
      kind: kind,
      pieceId: piece.id,
      boardId: board.id,
      grabX: p.x - piece.x,
      grabY: p.y - piece.y,
      moved: false,
      recorded: false
    };
    doc.body.classList.add(kind === 'resize' ? 'is-resizing' : 'is-dragging');
    global.addEventListener('pointermove', onDragMove);
    global.addEventListener('pointerup', onDragEnd);
    global.addEventListener('pointercancel', onDragEnd);
  }

  function surfaceUnder(event) {
    var surfaces = doc.querySelectorAll('.board-surface');
    for (var i = 0; i < surfaces.length; i++) {
      var rect = surfaces[i].getBoundingClientRect();
      if (event.clientX >= rect.left && event.clientX <= rect.right &&
          event.clientY >= rect.top && event.clientY <= rect.bottom) {
        return surfaces[i];
      }
    }
    return null;
  }

  function onDragMove(event) {
    if (!drag) return;
    var found = S.findPiece(project, drag.pieceId);
    if (!found) return;
    var piece = found.piece;
    var board = found.board;

    if (!drag.recorded) { record(); drag.recorded = true; }
    drag.moved = true;

    if (drag.kind === 'resize') {
      var surface = doc.querySelector('.board-surface[data-board="' + board.id + '"]');
      var corner = snapPoint(board, pointIn(surface, event), { x: piece.x, y: piece.y }, piece.id);
      setFootprint(piece,
        Math.max(project.snap, corner.x - piece.x),
        Math.max(project.snap, corner.y - piece.y));
      paintGuides(board.id, corner.guideX, corner.guideY);
      refreshDragged(board, piece);
      return;
    }

    // Moving: the board under the pointer wins, so pieces can hop boards.
    var targetSurface = surfaceUnder(event) ||
      doc.querySelector('.board-surface[data-board="' + board.id + '"]');
    var targetBoard = S.findBoard(project, targetSurface.dataset.board);

    if (targetBoard && targetBoard.id !== board.id) {
      found.board.pieces.splice(found.index, 1);
      targetBoard.pieces.push(piece);
      var node = doc.querySelector('.piece[data-piece="' + piece.id + '"]');
      if (node) targetSurface.appendChild(node);
      board = targetBoard;
    }

    var pt = pointIn(targetSurface, event);
    var f = S.footprint(piece);
    var snapped = S.snapMove(board, piece, pt.x - drag.grabX, pt.y - drag.grabY, snapOpts());
    piece.x = S.clamp(snapped.x, 0, Math.max(0, board.w - f.w));
    piece.y = S.clamp(snapped.y, 0, Math.max(0, board.h - f.h));
    paintGuides(board.id, snapped.guideX, snapped.guideY);
    refreshDragged(board, piece);
  }

  /* During a drag only the moving piece and its neighbours need repainting;
     a full re-render would drop the pointer capture. */
  function refreshDragged(board, piece) {
    var node = doc.querySelector('.piece[data-piece="' + piece.id + '"]');
    if (node) updatePieceVisual(node, board, piece);
    project.boards.forEach(function (b) {
      b.pieces.forEach(function (other) {
        if (other.id === piece.id) return;
        var otherNode = doc.querySelector('.piece[data-piece="' + other.id + '"]');
        if (otherNode) updatePieceVisual(otherNode, b, other);
      });
    });
    renderSelection();
  }

  function onDragEnd() {
    if (!drag) return;
    var moved = drag.moved;
    doc.body.classList.remove('is-dragging', 'is-resizing');
    global.removeEventListener('pointermove', onDragMove);
    global.removeEventListener('pointerup', onDragEnd);
    global.removeEventListener('pointercancel', onDragEnd);
    drag = null;
    clearGuides();
    if (moved) commit();
    else render();
  }

  function setFootprint(piece, fw, fh) {
    var turned = piece.rot === 90 || piece.rot === 270;
    if (turned) { piece.w = fh; piece.h = fw; }
    else { piece.w = fw; piece.h = fh; }
  }

  /* -------------------------------------------------------- selection panel */

  function select(id) {
    selectedId = id;
    render();
  }

  function selected() {
    return selectedId ? S.findPiece(project, selectedId) : null;
  }

  function renderSelection() {
    var found = selected();
    if (!found) {
      els.selPanel.classList.add('hidden');
      return;
    }
    els.selPanel.classList.remove('hidden');
    var piece = found.piece, board = found.board;
    if (doc.activeElement !== els.selLabel) els.selLabel.value = piece.label || '';
    setIfIdle(els.selW, round(piece.w));
    setIfIdle(els.selH, round(piece.h));
    setIfIdle(els.selX, round(piece.x));
    setIfIdle(els.selY, round(piece.y));

    els.selBoard.innerHTML = '';
    project.boards.forEach(function (b) {
      var opt = el('option', null, b.name);
      opt.value = b.id;
      els.selBoard.appendChild(opt);
    });
    els.selBoard.value = board.id;

    var outside = S.outOfBounds(piece, board);
    var clash = S.overlapping(board, piece, project.kerf);
    els.selStatus.textContent = outside ? 'Hanging off the board — rotate or move it back on.'
      : clash ? 'Overlapping another piece (or too tight for the kerf).'
      : 'Fits, with room around it.';
    els.selStatus.className = 'sel-status' + (outside ? ' is-bad' : clash ? ' is-warn' : ' is-ok');
  }

  function setIfIdle(input, value) {
    if (doc.activeElement !== input) input.value = value;
  }

  function round(v) {
    return Math.round(v * 1000) / 1000;
  }

  function wireSidebar() {
    on(els.qaAdd, 'click', quickAdd);
    [els.qaW, els.qaH, els.qaLabel].forEach(function (input) {
      on(input, 'keydown', function (event) {
        if (event.key === 'Enter') { event.preventDefault(); quickAdd(); }
      });
    });

    on(els.selLabel, 'input', function () {
      var found = selected();
      if (!found) return;
      found.piece.label = els.selLabel.value;
      var node = doc.querySelector('.piece[data-piece="' + found.piece.id + '"] .piece-label');
      if (node) node.textContent = found.piece.label;
      S.save(project);
    });
    on(els.selLabel, 'change', function () { record(); commit(); });

    [['selW', 'w'], ['selH', 'h'], ['selX', 'x'], ['selY', 'y']].forEach(function (pair) {
      on(els[pair[0]], 'change', function () {
        var found = selected();
        if (!found) return;
        var value = S.num(els[pair[0]].value, found.piece[pair[1]]);
        if ((pair[1] === 'w' || pair[1] === 'h') && value <= 0) { render(); return; }
        record();
        found.piece[pair[1]] = value;
        commit();
      });
    });

    on(els.selBoard, 'change', function () {
      var found = selected();
      var target = S.findBoard(project, els.selBoard.value);
      if (!found || !target || target.id === found.board.id) return;
      record();
      found.board.pieces.splice(found.index, 1);
      target.pieces.push(found.piece);
      commit();
    });

    on(els.selRotate, 'click', rotateSelected);
    on(els.selDupe, 'click', duplicateSelected);
    on(els.selDelete, 'click', deleteSelected);
  }

  function quickAdd() {
    var w = S.num(els.qaW.value, 0);
    var h = S.num(els.qaH.value, 0);
    var qty = Math.max(1, Math.round(S.num(els.qaQty.value, 1)));
    if (w <= 0 || h <= 0) {
      els.qaW.focus();
      return;
    }
    record();
    var lastId = null;
    for (var i = 0; i < qty; i++) {
      var piece = S.newPiece(w, h, els.qaLabel.value.trim());
      piece.color = nextColor();
      var home = placeSomewhere(piece);
      home.pieces.push(piece);
      lastId = piece.id;
    }
    selectedId = lastId;
    els.qaLabel.value = '';
    commit();
  }

  /* Drops a piece into the first board with room, turning it a quarter turn if
     that is what makes it fit. When no board has room we start a new one —
     the same thing you would do at the timber yard. */
  function placeSomewhere(piece) {
    var i, board, spot;

    for (i = 0; i < project.boards.length; i++) {
      board = project.boards[i];
      spot = S.findFreeSpot(board, piece.w, piece.h, project.snap, project.kerf);
      if (spot) {
        piece.x = spot.x;
        piece.y = spot.y;
        return board;
      }
    }

    for (i = 0; i < project.boards.length; i++) {
      board = project.boards[i];
      spot = S.findFreeSpot(board, piece.h, piece.w, project.snap, project.kerf);
      if (spot) {
        piece.rot = (piece.rot + 90) % 360;
        piece.x = spot.x;
        piece.y = spot.y;
        return board;
      }
    }

    var last = project.boards[project.boards.length - 1];
    var f = S.footprint(piece);
    piece.x = 0;
    piece.y = 0;
    // Only open a new board if the piece could actually live on one; an
    // oversized piece stays put and is flagged instead.
    if (f.w <= last.w + 1e-6 && f.h <= last.h + 1e-6) {
      var fresh = S.newBoard(last.w, last.h, 'Board ' + (project.boards.length + 1));
      project.boards.push(fresh);
      return fresh;
    }
    return last;
  }

  function rotateSelected() {
    var found = selected();
    if (!found) return;
    record();
    S.rotate(found.piece, project.snap);
    commit();
  }

  function duplicateSelected() {
    var found = selected();
    if (!found) return;
    record();
    var copy = S.newPiece(found.piece.w, found.piece.h, found.piece.label);
    copy.rot = found.piece.rot;
    copy.color = found.piece.color;
    var board = placeSomewhere(copy);
    board.pieces.push(copy);
    selectedId = copy.id;
    commit();
  }

  function deleteSelected() {
    var found = selected();
    if (!found) return;
    record();
    found.board.pieces.splice(found.index, 1);
    selectedId = null;
    commit();
  }

  function nudge(dx, dy) {
    var found = selected();
    if (!found) return;
    record();
    found.piece.x = round(found.piece.x + dx);
    found.piece.y = round(found.piece.y + dy);
    commit();
  }

  /* -------------------------------------------------------------- cut list */

  function renderCutList() {
    els.cutlist.innerHTML = '';
    var groups = {};
    var total = 0;

    project.boards.forEach(function (board) {
      board.pieces.forEach(function (piece) {
        var a = Math.max(piece.w, piece.h);
        var b = Math.min(piece.w, piece.h);
        var key = a.toFixed(4) + 'x' + b.toFixed(4);
        if (!groups[key]) groups[key] = { w: a, h: b, count: 0, color: piece.color };
        groups[key].count++;
        total++;
      });
    });

    if (!total) {
      els.cutlist.appendChild(el('p', 'hint', 'No pieces yet. Draw one on the board, or use Quick add.'));
      return;
    }

    var list = el('ul', 'cut-groups');
    Object.keys(groups).sort(function (a, b) {
      return groups[b].w * groups[b].h - groups[a].w * groups[a].h;
    }).forEach(function (key) {
      var g = groups[key];
      var item = el('li', 'cut-group');
      var swatch = el('span', 'cut-swatch');
      swatch.style.background = g.color;
      item.appendChild(swatch);
      item.appendChild(el('span', 'cut-dims', units.formatPair(g.w, g.h, project.system)));
      item.appendChild(el('span', 'cut-count', '× ' + g.count));
      list.appendChild(item);
    });
    els.cutlist.appendChild(list);

    var boardList = el('ul', 'board-summary');
    project.boards.forEach(function (board) {
      var stats = S.boardStats(board, project.kerf);
      var item = el('li', 'board-summary-row');
      item.appendChild(el('span', 'bs-name', board.name));
      item.appendChild(el('span', 'bs-pct', stats.pct + '%'));
      var bar = el('span', 'bs-bar');
      var fill = el('span', 'bs-fill');
      fill.style.width = stats.pct + '%';
      bar.appendChild(fill);
      item.appendChild(bar);
      if (stats.problems) {
        var flag = el('span', 'bs-flag', stats.problems + ' to fix');
        item.appendChild(flag);
      }
      boardList.appendChild(item);
    });
    els.cutlist.appendChild(boardList);
    els.cutlist.appendChild(el('p', 'cut-total', total + ' piece' + (total === 1 ? '' : 's') + ' in total'));
  }

  /* ------------------------------------------------------------- undo/redo */

  function undo() {
    var previous = history.undo(project);
    if (!previous) return;
    project = previous;
    if (selectedId && !S.findPiece(project, selectedId)) selectedId = null;
    commit();
  }

  function redo() {
    var next = history.redo(project);
    if (!next) return;
    project = next;
    if (selectedId && !S.findPiece(project, selectedId)) selectedId = null;
    commit();
  }

  /* ------------------------------------------------------- import / export */

  function exportPlan() {
    closeMenus();
    var blob = new global.Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    var url = global.URL.createObjectURL(blob);
    var link = el('a');
    link.href = url;
    link.download = 'crosscut-plan.json';
    doc.body.appendChild(link);
    link.click();
    doc.body.removeChild(link);
    global.setTimeout(function () { global.URL.revokeObjectURL(url); }, 1000);
  }

  function importPlan(event) {
    var file = event.target.files && event.target.files[0];
    if (!file) return;
    var reader = new global.FileReader();
    reader.onload = function () {
      var loaded = null;
      try {
        loaded = S.sanitise(JSON.parse(String(reader.result)));
      } catch (err) {
        loaded = null;
      }
      if (!loaded) {
        global.alert('That file does not look like a Crosscut plan.');
        return;
      }
      project = loaded;
      history = new S.History();
      selectedId = null;
      closeMenus();
      openPlanner();
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  /* ------------------------------------------------------------- shortcuts */

  function wireGlobalKeys() {
    on(doc, 'keydown', function (event) {
      if (!project || els.app.classList.contains('hidden')) return;
      var tag = event.target.tagName;
      var typing = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || event.target.isContentEditable;

      if (event.key === 'Escape') {
        if (draw) cancelDraw();
        else if (selectedId) select(null);
        if (typing) event.target.blur();
        return;
      }
      if (typing) return;

      var meta = event.ctrlKey || event.metaKey;
      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
        return;
      }
      if (meta && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        duplicateSelected();
        return;
      }
      if (meta) return;

      var step = event.shiftKey ? project.snap * 10 : project.snap;
      switch (event.key) {
        case 'r': case 'R': rotateSelected(); break;
        case 'Delete': case 'Backspace':
          if (selectedId) { event.preventDefault(); deleteSelected(); }
          break;
        case 'ArrowLeft': if (selectedId) { event.preventDefault(); nudge(-step, 0); } break;
        case 'ArrowRight': if (selectedId) { event.preventDefault(); nudge(step, 0); } break;
        case 'ArrowUp': if (selectedId) { event.preventDefault(); nudge(0, -step); } break;
        case 'ArrowDown': if (selectedId) { event.preventDefault(); nudge(0, step); } break;
      }
    });
  }

  /* Last line of defence: whatever goes wrong at startup, say so on the page
     rather than leaving a blank one with the reason buried in the console. */
  function boot() {
    try {
      init();
    } catch (err) {
      var note = doc.createElement('p');
      note.className = 'load-error';
      note.textContent = 'Crosscut could not start. If it worked before, the browser is ' +
        'probably holding an old copy of the page — reload with Ctrl+Shift+R ' +
        '(⌘+Shift+R on a Mac). Details are in the console.';
      doc.body.insertBefore(note, doc.body.firstChild);
      if (global.console && global.console.error) global.console.error(err);
    }
  }

  if (doc.readyState === 'loading') {
    on(doc, 'DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
