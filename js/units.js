/* Crosscut — unit handling.
   Everything in the model is stored in a system's base unit:
   inches for imperial, centimetres for metric. */
(function (global) {
  'use strict';

  var SYSTEMS = {
    imperial: {
      id: 'imperial',
      base: 'in',
      baseLabel: 'in',
      // Snap increments offered for imperial work.
      snaps: [
        { value: 1, label: '1 in' },
        { value: 0.5, label: '1/2 in' },
        { value: 0.25, label: '1/4 in' },
        { value: 0.125, label: '1/8 in' }
      ],
      defaultSnap: 0.25,
      minorGrid: 1,   // one inch
      majorGrid: 12   // one foot
    },
    metric: {
      id: 'metric',
      base: 'cm',
      baseLabel: 'cm',
      // Centimetres: whole or half only, as requested.
      snaps: [
        { value: 1, label: '1 cm' },
        { value: 0.5, label: '0.5 cm' }
      ],
      defaultSnap: 1,
      minorGrid: 1,   // one centimetre
      majorGrid: 10   // ten centimetres
    }
  };

  // Units offered in the setup drop-down, with their conversion to the base unit.
  var INPUT_UNITS = [
    { id: 'ft', label: 'Feet', system: 'imperial', toBase: 12 },
    { id: 'in', label: 'Inches', system: 'imperial', toBase: 1 },
    { id: 'cm', label: 'Centimetres', system: 'metric', toBase: 1 },
    { id: 'm', label: 'Metres', system: 'metric', toBase: 100 }
  ];

  function system(id) {
    return SYSTEMS[id] || SYSTEMS.imperial;
  }

  function inputUnit(id) {
    for (var i = 0; i < INPUT_UNITS.length; i++) {
      if (INPUT_UNITS[i].id === id) return INPUT_UNITS[i];
    }
    return INPUT_UNITS[0];
  }

  function snap(value, increment) {
    if (!increment) return value;
    return Math.round(value / increment) * increment;
  }

  /* 12.125 -> `12 1/8"`, 0.5 -> `1/2"`, 12 -> `12"` */
  function formatImperial(value, opts) {
    opts = opts || {};
    var sign = value < 0 ? '-' : '';
    var v = Math.abs(value);
    var den = 16;
    var whole = Math.floor(v + 1e-9);
    var num = Math.round((v - whole) * den);
    if (num >= den) { whole += 1; num = 0; }
    while (num && num % 2 === 0) { num /= 2; den /= 2; }

    var text;
    if (!num) text = String(whole);
    else if (!whole) text = num + '/' + den;
    else text = whole + ' ' + num + '/' + den;

    return sign + text + (opts.bare ? '' : '"');
  }

  function formatMetric(value, opts) {
    opts = opts || {};
    var rounded = Math.round(value * 10) / 10;
    var text = String(rounded).replace(/\.0$/, '');
    return text + (opts.bare ? '' : ' cm');
  }

  var GLYPHS = { '1/8': '⅛', '1/4': '¼', '3/8': '⅜', '1/2': '½', '5/8': '⅝', '3/4': '¾', '7/8': '⅞' };

  /* A tighter rendering for captions inside small pieces: `5¾` not `5 3/4"`. */
  function formatCompact(value, systemId) {
    if (systemId === 'metric') return formatMetric(value, { bare: true });
    var text = formatImperial(value, { bare: true });
    var parts = text.split(' ');
    var fraction = parts[parts.length - 1];
    if (GLYPHS[fraction]) {
      parts[parts.length - 1] = GLYPHS[fraction];
      return parts.join('');
    }
    return text;
  }

  function formatPairCompact(w, h, systemId) {
    return formatCompact(w, systemId) + '×' + formatCompact(h, systemId);
  }

  function format(value, systemId, opts) {
    return systemId === 'metric' ? formatMetric(value, opts) : formatImperial(value, opts);
  }

  /* The same length in the bigger unit people quote boards in:
     48 -> `4'`, 54 -> `4' 6"`, 240 -> `2.4 m`. */
  function formatLong(value, systemId) {
    if (systemId === 'metric') {
      if (value >= 100) {
        var metres = Math.round(value) / 100;
        return String(metres).replace(/\.0+$/, '') + ' m';
      }
      return formatMetric(value);
    }
    if (value >= 12) {
      var feet = Math.floor(value / 12 + 1e-9);
      var rest = value - feet * 12;
      var inches = rest > 1e-9 ? ' ' + formatImperial(rest) : '';
      return feet + "'" + inches;
    }
    return formatImperial(value);
  }

  function formatPair(w, h, systemId) {
    return format(w, systemId) + ' × ' + format(h, systemId);
  }

  /* Area, reported in the unit people actually think in (sq ft / m²). */
  function formatArea(areaInBase, systemId) {
    if (systemId === 'metric') {
      var m2 = areaInBase / 10000;
      if (m2 >= 0.1) return (Math.round(m2 * 100) / 100) + ' m²';
      return Math.round(areaInBase) + ' cm²';
    }
    var sqft = areaInBase / 144;
    if (sqft >= 0.5) return (Math.round(sqft * 100) / 100) + ' sq ft';
    return (Math.round(areaInBase * 10) / 10) + ' sq in';
  }

  global.CC = global.CC || {};
  global.CC.units = {
    SYSTEMS: SYSTEMS,
    INPUT_UNITS: INPUT_UNITS,
    system: system,
    inputUnit: inputUnit,
    snap: snap,
    format: format,
    formatCompact: formatCompact,
    formatPairCompact: formatPairCompact,
    formatLong: formatLong,
    formatPair: formatPair,
    formatArea: formatArea
  };
})(window);
