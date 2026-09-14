/* Crosscut — the plan itself: model, geometry, persistence, undo. */
(function (global) {
  'use strict';

  var units = global.CC.units;
  var STORAGE_KEY = 'crosscut.plan.v1';
  var EPS = 1e-6;

  var COLORS = [
    '#c98a4b', '#7d9c73', '#6d8bab', '#b0736f',
    '#9a86ae', '#7fa39b', '#b58f5e', '#8d9bb5'
  ];

  var nextId = 1;
  function uid(prefix) {
    return prefix + '-' + Date.now().toString(36) + '-' + (nextId++).toString(36);
  }

  /* ---------------------------------------------------------------- model */

  function newPiece(w, h, label) {
    return {
      id: uid('p'),
      x: 0,
      y: 0,
      w: w,
      h: h,
      rot: 0,
      label: label || '',
      color: COLORS[Math.floor(Math.random() * COLORS.length)]
    };
  }

  function newBoard(w, h, name) {
    return { id: uid('b'), name: name || 'Board', w: w, h: h, pieces: [] };
  }

  function newProject(w, h, systemId) {
    var sys = units.system(systemId);
    return {
      version: 1,
      system: sys.id,
      snap: sys.defaultSnap,
      kerf: 0,
      zoom: 1,
      boards: [newBoard(w, h, 'Board 1')]
    };
  }

  /* ------------------------------------------------------------- geometry */

  /* The footprint is the piece's size *as it sits on the board* — a 90° or
     270° rotation swaps width and height. */
  function footprint(piece) {
    var turned = piece.rot === 90 || piece.rot === 270;
    return { w: turned ? piece.h : piece.w, h: turned ? piece.w : piece.h };
  }

  function rectOf(piece) {
    var f = footprint(piece);
    return { x: piece.x, y: piece.y, w: f.w, h: f.h };
  }

  function outOfBounds(piece, board) {
    var r = rectOf(piece);
    return r.x < -EPS || r.y < -EPS ||
           r.x + r.w > board.w + EPS ||
           r.y + r.h > board.h + EPS;
  }

  /* Two pieces clash when their footprints overlap, or sit closer together
     than the saw kerf — there has to be room for the blade. */
  function clashes(a, b, kerf) {
    var ra = rectOf(a), rb = rectOf(b);
    var gap = kerf || 0;
    // Apart means the space between them is at least a kerf wide.
    var apart = ra.x + ra.w + gap <= rb.x + EPS ||
                rb.x + rb.w + gap <= ra.x + EPS ||
                ra.y + ra.h + gap <= rb.y + EPS ||
                rb.y + rb.h + gap <= ra.y + EPS;
    return !apart;
  }

  function overlapping(board, piece, kerf) {
    for (var i = 0; i < board.pieces.length; i++) {
      var other = board.pieces[i];
      if (other.id !== piece.id && clashes(piece, other, kerf)) return true;
    }
    return false;
  }

  function rotate(piece, snapInc) {
    var before = footprint(piece);
    var cx = piece.x + before.w / 2;
    var cy = piece.y + before.h / 2;
    piece.rot = (piece.rot + 90) % 360;
    var after = footprint(piece);
    piece.x = units.snap(cx - after.w / 2, snapInc);
    piece.y = units.snap(cy - after.h / 2, snapInc);
  }

  /* First-fit placement. Candidate corners come from the board's top-left plus
     the trailing edges of pieces already down, which is fast and puts new
     pieces snugly against what is already there. */
  function findFreeSpot(board, w, h, snapInc, kerf) {
    var gap = kerf || 0;
    var xs = [0], ys = [0];
    board.pieces.forEach(function (p) {
      var r = rectOf(p);
      xs.push(r.x, r.x + r.w + gap);
      ys.push(r.y, r.y + r.h + gap);
    });
    xs = dedupe(xs.map(function (v) { return units.snap(v, snapInc); }));
    ys = dedupe(ys.map(function (v) { return units.snap(v, snapInc); }));

    var probe = { id: '__probe__', x: 0, y: 0, w: w, h: h, rot: 0 };
    for (var yi = 0; yi < ys.length; yi++) {
      for (var xi = 0; xi < xs.length; xi++) {
        probe.x = xs[xi];
        probe.y = ys[yi];
        if (probe.x < -EPS || probe.y < -EPS) continue;
        if (probe.x + w > board.w + EPS || probe.y + h > board.h + EPS) continue;
        if (!overlapping(board, probe, gap)) return { x: probe.x, y: probe.y };
      }
    }
    return null;
  }

  function dedupe(values) {
    var seen = {}, out = [];
    values.forEach(function (v) {
      var key = v.toFixed(4);
      if (!seen[key]) { seen[key] = true; out.push(v); }
    });
    return out.sort(function (a, b) { return a - b; });
  }

  /* ------------------------------------------------------------- snapping */

  /* Grid snapping gets you close; these guides make an edge land exactly flush
     with the board, hard against a neighbour, or at a size already cut. */
  function guidesFor(board, excludeId, kerf) {
    var xs = [0, board.w], ys = [0, board.h], ws = [], hs = [];
    board.pieces.forEach(function (p) {
      if (p.id === excludeId) return;
      var r = rectOf(p);
      xs.push(r.x, r.x + r.w);
      ys.push(r.y, r.y + r.h);
      if (kerf) {
        xs.push(r.x - kerf, r.x + r.w + kerf);
        ys.push(r.y - kerf, r.y + r.h + kerf);
      }
      ws.push(r.w);
      hs.push(r.h);
    });
    return { xs: xs, ys: ys, ws: ws, hs: hs };
  }

  function nearest(values, target, tolerance) {
    var best = null, bestDelta = tolerance;
    for (var i = 0; i < values.length; i++) {
      var delta = Math.abs(values[i] - target);
      if (delta < bestDelta - EPS) { bestDelta = delta; best = values[i]; }
    }
    return best === null ? null : { value: best, delta: bestDelta };
  }

  /* A moving piece can snap by either of its edges — whichever lands closer. */
  function snapSpan(values, low, size, tolerance) {
    var byLow = nearest(values, low, tolerance);
    var byHigh = nearest(values, low + size, tolerance);
    if (byLow && (!byHigh || byLow.delta <= byHigh.delta)) {
      return { low: byLow.value, guide: byLow.value };
    }
    if (byHigh) return { low: byHigh.value - size, guide: byHigh.value };
    return null;
  }

  function snapMove(board, piece, x, y, opts) {
    var f = footprint(piece);
    var g = guidesFor(board, piece.id, opts.kerf);
    var out = {
      x: units.snap(x, opts.snap),
      y: units.snap(y, opts.snap),
      guideX: null,
      guideY: null
    };
    var sx = snapSpan(g.xs, x, f.w, opts.tolerance);
    if (sx) { out.x = sx.low; out.guideX = sx.guide; }
    var sy = snapSpan(g.ys, y, f.h, opts.tolerance);
    if (sy) { out.y = sy.low; out.guideY = sy.guide; }
    return out;
  }

  /* Snapping for a corner being dragged out — the free corner of a new piece,
     or the resize handle. With an anchor, the span between the two corners can
     also snap to the width or height of a piece already on the board. */
  function snapCorner(board, point, anchor, opts, excludeId) {
    var g = guidesFor(board, excludeId, opts.kerf);
    var out = {
      x: units.snap(point.x, opts.snap),
      y: units.snap(point.y, opts.snap),
      guideX: null,
      guideY: null,
      matchW: false,
      matchH: false
    };

    out.x = resolveAxis(point.x, anchor ? anchor.x : null, g.xs, g.ws, opts, out, 'x');
    out.y = resolveAxis(point.y, anchor ? anchor.y : null, g.ys, g.hs, opts, out, 'y');
    return out;
  }

  function resolveAxis(value, anchor, edges, sizes, opts, out, axis) {
    var edge = nearest(edges, value, opts.tolerance);
    var size = null;

    if (anchor !== null) {
      var direction = value >= anchor ? 1 : -1;
      var targets = sizes.map(function (s) { return anchor + direction * s; });
      size = nearest(targets, value, opts.tolerance);
    }

    if (edge && (!size || edge.delta <= size.delta)) {
      out[axis === 'x' ? 'guideX' : 'guideY'] = edge.value;
      return edge.value;
    }
    if (size) {
      out[axis === 'x' ? 'matchW' : 'matchH'] = true;
      return size.value;
    }
    return units.snap(value, opts.snap);
  }

  function boardStats(board, kerf) {
    var used = 0, bad = 0;
    board.pieces.forEach(function (p) {
      var f = footprint(p);
      used += f.w * f.h;
      if (outOfBounds(p, board) || overlapping(board, p, kerf)) bad++;
    });
    var total = board.w * board.h;
    return {
      count: board.pieces.length,
      used: used,
      total: total,
      waste: Math.max(0, total - used),
      pct: total ? Math.min(100, Math.round((used / total) * 100)) : 0,
      problems: bad
    };
  }

  function findPiece(project, pieceId) {
    for (var i = 0; i < project.boards.length; i++) {
      var board = project.boards[i];
      for (var j = 0; j < board.pieces.length; j++) {
        if (board.pieces[j].id === pieceId) {
          return { board: board, piece: board.pieces[j], index: j };
        }
      }
    }
    return null;
  }

  function findBoard(project, boardId) {
    for (var i = 0; i < project.boards.length; i++) {
      if (project.boards[i].id === boardId) return project.boards[i];
    }
    return null;
  }

  /* ---------------------------------------------------------- persistence */

  function save(project) {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    } catch (err) {
      /* Private browsing, storage full — the plan still works in-page. */
    }
  }

  function load() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return sanitise(JSON.parse(raw));
    } catch (err) {
      return null;
    }
  }

  function clearSaved() {
    try { global.localStorage.removeItem(STORAGE_KEY); } catch (err) { /* ignore */ }
  }

  /* Anything arriving from storage or an imported file gets checked before we
     trust it enough to render. */
  function sanitise(data) {
    if (!data || typeof data !== 'object') return null;
    if (!Array.isArray(data.boards) || !data.boards.length) return null;

    var sys = units.system(data.system === 'metric' ? 'metric' : 'imperial');
    var project = {
      version: 1,
      system: sys.id,
      snap: num(data.snap, sys.defaultSnap),
      kerf: Math.max(0, num(data.kerf, 0)),
      zoom: clamp(num(data.zoom, 1), 0.3, 3),
      boards: []
    };

    var validSnap = sys.snaps.some(function (s) { return Math.abs(s.value - project.snap) < EPS; });
    if (!validSnap) project.snap = sys.defaultSnap;

    data.boards.forEach(function (b, i) {
      if (!b || typeof b !== 'object') return;
      var board = newBoard(Math.max(0.1, num(b.w, 48)), Math.max(0.1, num(b.h, 48)),
                           typeof b.name === 'string' && b.name ? b.name : 'Board ' + (i + 1));
      if (typeof b.id === 'string' && b.id) board.id = b.id;
      if (Array.isArray(b.pieces)) {
        b.pieces.forEach(function (p) {
          if (!p || typeof p !== 'object') return;
          var w = num(p.w, 0), h = num(p.h, 0);
          if (w <= 0 || h <= 0) return;
          var piece = newPiece(w, h, typeof p.label === 'string' ? p.label : '');
          if (typeof p.id === 'string' && p.id) piece.id = p.id;
          piece.x = num(p.x, 0);
          piece.y = num(p.y, 0);
          piece.rot = [0, 90, 180, 270].indexOf(p.rot) >= 0 ? p.rot : 0;
          if (typeof p.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(p.color)) piece.color = p.color;
          board.pieces.push(piece);
        });
      }
      project.boards.push(board);
    });

    return project.boards.length ? project : null;
  }

  function num(value, fallback) {
    var n = typeof value === 'number' ? value : parseFloat(value);
    return isFinite(n) ? n : fallback;
  }

  function clamp(value, lo, hi) {
    return Math.min(hi, Math.max(lo, value));
  }

  /* ---------------------------------------------------------------- undo */

  function History(limit) {
    this.limit = limit || 60;
    this.past = [];
    this.future = [];
  }
  History.prototype.push = function (project) {
    this.past.push(JSON.stringify(project));
    if (this.past.length > this.limit) this.past.shift();
    this.future.length = 0;
  };
  History.prototype.undo = function (current) {
    if (!this.past.length) return null;
    this.future.push(JSON.stringify(current));
    return JSON.parse(this.past.pop());
  };
  History.prototype.redo = function (current) {
    if (!this.future.length) return null;
    this.past.push(JSON.stringify(current));
    return JSON.parse(this.future.pop());
  };
  History.prototype.canUndo = function () { return this.past.length > 0; };
  History.prototype.canRedo = function () { return this.future.length > 0; };

  global.CC.state = {
    COLORS: COLORS,
    uid: uid,
    newPiece: newPiece,
    newBoard: newBoard,
    newProject: newProject,
    footprint: footprint,
    rectOf: rectOf,
    outOfBounds: outOfBounds,
    overlapping: overlapping,
    rotate: rotate,
    guidesFor: guidesFor,
    snapMove: snapMove,
    snapCorner: snapCorner,
    findFreeSpot: findFreeSpot,
    boardStats: boardStats,
    findPiece: findPiece,
    findBoard: findBoard,
    save: save,
    load: load,
    clearSaved: clearSaved,
    sanitise: sanitise,
    clamp: clamp,
    num: num,
    History: History
  };
})(window);
