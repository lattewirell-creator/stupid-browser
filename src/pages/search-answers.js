'use strict';
/* Instant answers for Stupid Search, worked out on this computer: sums ("12*4+3", "20% of 150", "sqrt(2)") and unit
   conversions ("5 km in miles", "72 f to c", "3 mil i km"). No network, nothing leaves the browser.
   Plain script (also loaded by tests with node): defines window.searchAnswers / module.exports. */
(function (root) {
  /* ---------- sums ---------- */
  const FN = { sqrt: Math.sqrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil, sin: Math.sin, cos: Math.cos, tan: Math.tan, log: Math.log10, ln: Math.log, exp: Math.exp };
  const CONST = { pi: Math.PI, e: Math.E };
  /** Tiny recursive-descent calculator. Only numbers, + - * / ^ %, brackets, a few functions and constants. */
  function calc(expr) {
    let s = String(expr).toLowerCase().replace(/\s+/g, ' ').trim();
    // Not sums: times (10:30), ratios (16:9), dates (2024-11-08), year ranges (2024-2025), phone numbers (08-123 456).
    if (/^\d+(?:[-:\s]\d+)+$/.test(s) || /\d:\d/.test(s)) return null;
    // "20% of 150" / "20 % av 150" → 150*20/100. "150 + 20%" → 150*(1+20/100).
    s = s.replace(/(\d+(?:[.,]\d+)?)\s*%\s*(?:of|av)\s*(\d+(?:[.,]\d+)?)/g, '($2)*($1)/100');
    s = s.replace(/(\d+(?:[.,]\d+)?)\s*([+-])\s*(\d+(?:[.,]\d+)?)\s*%(?!\s*[\d(])/g, '($1)*(1$2($3)/100)');
    // Decimal comma (Swedish) when there's no decimal point; thousands separators "1 000" / "1,000.5".
    // "1,000 + 500" is a thousand in English and "1,5" a decimal in Swedish: exactly three digits after the comma reads as
    // thousands unless the browser is Swedish-ish (sv, nb, da, fi), where 1,000 is one point zero zero zero.
    const nordic = typeof navigator !== 'undefined' && /^(sv|nb|nn|no|da|fi)\b/i.test(navigator.language || '');
    if (!s.includes('.') && /\d,\d/.test(s) && (nordic || !/\d,\d{3}(?!\d)/.test(s))) s = s.replace(/(\d),(\d)/g, '$1.$2'); else s = s.replace(/(\d),(\d{3})(?!\d)/g, '$1$2');
    s = s.replace(/(\d) (\d{3})(?!\d)/g, '$1$2').replace(/×|x(?=\s*[\d(])/g, '*').replace(/÷/g, '/').replace(/,/g, '');
    if (!/^[\d.+\-*/^%() a-z]+$/.test(s) || !/\d/.test(s) || !/[+\-*/^%]|sqrt|\(/.test(s)) return null;
    if (/^[\d.]+$/.test(s)) return null;   // a lone number is not a sum
    let i = 0;
    const peek = () => s[i], skip = () => { while (s[i] === ' ') i++; };
    function number() {
      skip();
      if (peek() === '(') { i++; const v = expr0(); skip(); if (peek() !== ')') throw 0; i++; return v; }
      if (peek() === '-') { i++; return -number(); }
      if (peek() === '+') { i++; return number(); }
      const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i)); if (m) { i += m[0].length; return parseFloat(m[0]); }
      const w = /^[a-z]+/.exec(s.slice(i)); if (!w) throw 0;
      i += w[0].length;
      if (w[0] in CONST) return CONST[w[0]];
      if (w[0] in FN) { skip(); if (peek() !== '(') throw 0; i++; const v = expr0(); skip(); if (peek() !== ')') throw 0; i++; return FN[w[0]](v); }
      throw 0;
    }
    // -2^2 is -(2^2): the minus binds looser than the power, like on a calculator.
    function power() { skip(); if (peek() === '-') { i++; return -power(); } let v = number(); skip(); if (peek() === '^') { i++; return Math.pow(v, power()); } return v; }
    function term() { let v = power(); for (;;) { skip(); const c = peek(); if (c === '*') { i++; v *= power(); } else if (c === '/') { i++; v /= power(); } else if (c === '%') { i++; v %= power(); } else return v; } }
    function expr0() { let v = term(); for (;;) { skip(); const c = peek(); if (c === '+') { i++; v += term(); } else if (c === '-') { i++; v -= term(); } else return v; } }
    try { const v = expr0(); skip(); if (i !== s.length || !isFinite(v)) return null; return v; } catch { return null; }
  }
  /** 1234.5678 → "1 234.57", 0.333333 → "0.3333", tiny or huge numbers in e-notation. */
  function fmt(v) {
    if (!isFinite(v)) return String(v);
    const a = Math.abs(v);
    if (a !== 0 && (a >= 1e15 || a < 1e-6)) return v.toExponential(4).replace(/\.?0+e/, 'e');
    const t = String(+v.toFixed(a >= 100 ? 2 : 4));
    const [int, dec] = t.split('.');
    return int.replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009') + (dec ? '.' + dec : '');
  }

  /* ---------- units ---------- */
  // Each unit: [kind, factor to the kind's base unit]. Temperatures are special-cased.
  const U = {};
  const add = (kind, names, f) => { for (const n of names) U[n] = [kind, f]; };
  add('length', ['mm', 'millimeter', 'millimetre', 'millimeters'], 0.001); add('length', ['cm', 'centimeter', 'centimetre', 'centimeters'], 0.01);
  add('length', ['m', 'meter', 'metre', 'meters', 'metres'], 1); add('length', ['km', 'kilometer', 'kilometre', 'kilometers', 'kilometres'], 1000);
  add('length', ['mil', 'swedish mile', 'svenska mil'], 10000);   // the Swedish mil is 10 km
  add('length', ['in', 'inch', 'inches', 'tum', '"'], 0.0254); add('length', ['ft', 'foot', 'feet', 'fot'], 0.3048); add('length', ['yd', 'yard', 'yards'], 0.9144);
  add('length', ['mi', 'mile', 'miles', 'engelska mil'], 1609.344); add('length', ['nmi', 'nautical mile', 'nautical miles', 'sjömil'], 1852);
  add('mass', ['mg'], 1e-6); add('mass', ['g', 'gram', 'grams'], 0.001); add('mass', ['hg', 'hekto', 'hektogram'], 0.1); add('mass', ['kg', 'kilo', 'kilogram', 'kilograms', 'kilos'], 1);
  add('mass', ['t', 'ton', 'tonne', 'tonnes', 'tons'], 1000); add('mass', ['lb', 'lbs', 'pound', 'pounds'], 0.45359237); add('mass', ['oz', 'ounce', 'ounces'], 0.028349523125); add('mass', ['st', 'stone'], 6.35029318);
  add('volume', ['ml', 'milliliter', 'millilitre', 'milliliters'], 0.001); add('volume', ['cl', 'centiliter', 'centilitre'], 0.01); add('volume', ['dl', 'deciliter', 'decilitre'], 0.1);
  add('volume', ['l', 'liter', 'litre', 'liters', 'litres'], 1); add('volume', ['gal', 'gallon', 'gallons'], 3.785411784); add('volume', ['qt', 'quart', 'quarts'], 0.946352946);
  add('volume', ['pt', 'pint', 'pints'], 0.473176473); add('volume', ['cup', 'cups'], 0.2365882365); add('volume', ['floz', 'fl oz', 'fluid ounce', 'fluid ounces'], 0.0295735295625);
  add('volume', ['tbsp', 'tablespoon', 'tablespoons', 'msk', 'matsked'], 0.015); add('volume', ['tsp', 'teaspoon', 'teaspoons', 'tsk', 'tesked'], 0.005);
  add('speed', ['km/h', 'kmh', 'kph'], 1 / 3.6); add('speed', ['m/s', 'mps'], 1); add('speed', ['mph', 'miles per hour'], 0.44704); add('speed', ['kn', 'knot', 'knots', 'knop'], 0.514444);
  add('time', ['ms', 'millisecond', 'milliseconds'], 0.001); add('time', ['s', 'sec', 'second', 'seconds', 'sekunder'], 1); add('time', ['min', 'minute', 'minutes', 'minuter'], 60);
  add('time', ['h', 'hr', 'hour', 'hours', 'timmar', 'timme'], 3600); add('time', ['d', 'day', 'days', 'dagar', 'dag'], 86400); add('time', ['wk', 'week', 'weeks', 'veckor', 'vecka'], 604800); add('time', ['year', 'years', 'år'], 31557600);
  add('data', ['b', 'byte', 'bytes'], 1); add('data', ['kb', 'kilobyte', 'kilobytes'], 1e3); add('data', ['mb', 'megabyte', 'megabytes'], 1e6); add('data', ['gb', 'gigabyte', 'gigabytes'], 1e9); add('data', ['tb', 'terabyte', 'terabytes'], 1e12);
  add('data', ['kib'], 1024); add('data', ['mib'], 1024 ** 2); add('data', ['gib'], 1024 ** 3); add('data', ['tib'], 1024 ** 4);
  add('area', ['m2', 'm²', 'sqm', 'square meter', 'square meters', 'kvm', 'kvadratmeter'], 1); add('area', ['km2', 'km²'], 1e6); add('area', ['ha', 'hectare', 'hectares', 'hektar'], 1e4);
  add('area', ['acre', 'acres'], 4046.8564224); add('area', ['sqft', 'ft2', 'ft²', 'square feet', 'square foot'], 0.09290304);
  const TEMP = { c: 'c', '°c': 'c', celsius: 'c', f: 'f', '°f': 'f', fahrenheit: 'f', k: 'k', kelvin: 'k' };
  const toC = (v, u) => (u === 'c' ? v : u === 'f' ? (v - 32) * 5 / 9 : v - 273.15);
  const fromC = (v, u) => (u === 'c' ? v : u === 'f' ? v * 9 / 5 + 32 : v + 273.15);
  const TEMP_NAME = { c: '°C', f: '°F', k: 'K' };
  const unitName = (u) => (TEMP[u] ? TEMP_NAME[TEMP[u]] : u);
  function convert(q) {
    const m = /^(-?\d+(?:[.,]\d+)?)\s*([a-zA-Zåäö°²/"]+(?: [a-zA-Zåäö]+)?)\s+(?:to|in|into|i|till|=|->|→)\s+([a-zA-Zåäö°²/"]+(?: [a-zA-Zåäö]+)?)\s*\??$/i.exec(String(q).trim());
    if (!m) return null;
    const v = parseFloat(m[1].replace(',', '.')), a = m[2].toLowerCase(), b = m[3].toLowerCase();
    if (TEMP[a] && TEMP[b]) { const r = fromC(toC(v, TEMP[a]), TEMP[b]); return { value: r, from: `${fmt(v)} ${unitName(a)}`, to: `${fmt(r)} ${unitName(b)}` }; }
    const ua = U[a], ub = U[b];
    if (!ua || !ub || ua[0] !== ub[0]) return null;
    const r = v * ua[1] / ub[1];
    return { value: r, from: `${fmt(v)} ${a}`, to: `${fmt(r)} ${b}` };
  }

  /** The instant answer for a query, or null: { kind: 'sum'|'convert', big, sub }. */
  function answer(q) {
    q = String(q || '').trim();
    if (!q) return null;
    const c = convert(q);
    if (c) return { kind: 'convert', big: c.to, sub: c.from };
    const v = calc(q.replace(/^(?:what is|what's|vad är|räkna ut|calculate)\s+/i, '').replace(/[?=]+$/, ''));
    if (v != null) return { kind: 'sum', big: fmt(v), sub: q };
    return null;
  }
  const api = { answer, calc, convert, fmt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.searchAnswers = api;
})(typeof window !== 'undefined' ? window : globalThis);
