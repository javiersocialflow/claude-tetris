'use strict';

/**
 * highscores.js — persistencia de puntuaciones altas en localStorage.
 *
 * Módulo sin dependencias del DOM. Se auto-registra en `window.HighScores`
 * (patrón IIFE, sin exports ES / bundler, igual que el resto del proyecto).
 * Debe cargarse en `index.html` ANTES que `game.js` (u otro script que lo
 * consuma), ya que solo se auto-registra al evaluarse.
 *
 * API pública:
 *
 *   HighScores.load()
 *     → { scores: Entry[], bestCombo: number, maxLines: number }
 *     `scores` viene ordenado descendente por `score` y recortado a un
 *     máximo de 5 entradas. `bestCombo`/`maxLines` son agregados históricos
 *     (el mejor combo y las líneas máximas conseguidas en CUALQUIER
 *     partida, no solo en las que llegaron al top 5).
 *     No lanza excepciones nunca: si no hay datos guardados, o están
 *     corruptos/con forma inesperada, devuelve el estado vacío por defecto.
 *
 *   HighScores.qualifies(score)
 *     → boolean. true si `score` entraría en el top 5 actual (hay menos de
 *     5 entradas guardadas, o `score` supera a la entrada más baja del
 *     top 5 actual).
 *
 *   HighScores.add(entry)
 *     → { scores: Entry[], bestCombo: number, maxLines: number }
 *     Añade `entry` (mismo shape que las entradas de `scores`, ver abajo),
 *     normalizando/rellenando con valores por defecto los campos que
 *     falten o sean inválidos. Reordena, recorta a top 5, actualiza
 *     `bestCombo`/`maxLines` si `entry.combo`/`entry.lines` los superan
 *     (esto ocurre siempre que corresponda, incluso si `entry` no llega a
 *     entrar en el top 5), persiste el resultado y lo devuelve.
 *
 *   HighScores.reset()
 *     → { scores: [], bestCombo: 0, maxLines: 0 }
 *     Borra records y agregados, persiste el estado vacío y lo devuelve.
 *
 *   Entry shape: { name: string, score: number, lines: number,
 *                  level: number, combo: number, date: string(ISO) }
 *
 * Todo acceso a localStorage (lectura y escritura) está envuelto en
 * try/catch con fallback a un estado en memoria: el juego también se
 * puede abrir directamente con `file://`, donde `localStorage` puede
 * lanzar o no estar disponible. Si eso ocurre, el módulo sigue
 * funcionando dentro de la misma sesión de página (los datos no
 * sobreviven a un recargado), pero nunca revienta.
 */
(function (root) {
  var STORAGE_KEY = 'tetris.highscores';
  var STORAGE_VERSION = 1;
  var MAX_ENTRIES = 5;
  var DEFAULT_NAME = 'AAA';

  // Fallback en memoria usado cuando localStorage no existe o lanza
  // (file://, modo privado, cuotas agotadas, etc.). Se mantiene
  // sincronizado en cada persist() para que load() siga siendo coherente
  // dentro de la misma sesión aunque el storage real no funcione.
  var memoryState = defaultState();

  function defaultState() {
    return { v: STORAGE_VERSION, scores: [], bestCombo: 0, maxLines: 0 };
  }

  function isFiniteNumber(n) {
    return typeof n === 'number' && isFinite(n);
  }

  function toNonNegativeInt(value, fallback) {
    var n = Math.floor(Number(value));
    if (!isFinite(n) || n < 0) return fallback;
    return n;
  }

  function normalizeName(value) {
    var name = typeof value === 'string' ? value.trim() : '';
    if (!name) return DEFAULT_NAME;
    return name.slice(0, 10);
  }

  function normalizeDate(value) {
    if (typeof value === 'string' && value) {
      var d = new Date(value);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
    return new Date().toISOString();
  }

  // Normaliza una entrada "cruda" (potencialmente incompleta o con tipos
  // erróneos) a un Entry válido, rellenando con valores por defecto
  // razonables. Nunca lanza.
  function normalizeEntry(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    return {
      name: normalizeName(raw.name),
      score: toNonNegativeInt(raw.score, 0),
      lines: toNonNegativeInt(raw.lines, 0),
      level: toNonNegativeInt(raw.level, 1),
      combo: toNonNegativeInt(raw.combo, 0),
      date: normalizeDate(raw.date),
    };
  }

  // Comprueba que un objeto leído del storage tiene la forma esperada Y
  // pertenece a la versión de payload que este módulo sabe interpretar.
  // Cualquier desviación (incluida una `v` distinta, sin lógica de
  // migración todavía) se trata como "no hay datos guardados" en vez de
  // lanzar o propagar estructuras corruptas/incompatibles.
  function isPlausibleState(obj) {
    return !!obj &&
      typeof obj === 'object' &&
      obj.v === STORAGE_VERSION &&
      Array.isArray(obj.scores) &&
      isFiniteNumber(obj.bestCombo) &&
      isFiniteNumber(obj.maxLines);
  }

  function sanitizeState(obj) {
    if (!isPlausibleState(obj)) return defaultState();
    var scores = obj.scores
      .filter(function (e) { return e && typeof e === 'object'; })
      .map(normalizeEntry)
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, MAX_ENTRIES);
    return {
      v: STORAGE_VERSION,
      scores: scores,
      bestCombo: Math.max(0, Math.floor(obj.bestCombo) || 0),
      maxLines: Math.max(0, Math.floor(obj.maxLines) || 0),
    };
  }

  function readState() {
    try {
      if (typeof localStorage === 'undefined' || !localStorage) {
        return cloneState(memoryState);
      }
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return cloneState(memoryState);
      var parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (parseErr) {
        return defaultState();
      }
      return sanitizeState(parsed);
    } catch (err) {
      // localStorage no disponible o lanzando (file://, modo privado...)
      return cloneState(memoryState);
    }
  }

  function persistState(state) {
    var clean = sanitizeState(state);
    memoryState = cloneState(clean);
    try {
      if (typeof localStorage !== 'undefined' && localStorage) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
      }
    } catch (err) {
      // Ignorado a propósito: seguimos funcionando con memoryState.
    }
    return toPublicShape(clean);
  }

  function cloneState(state) {
    return {
      v: STORAGE_VERSION,
      scores: state.scores.map(function (e) { return Object.assign({}, e); }),
      bestCombo: state.bestCombo,
      maxLines: state.maxLines,
    };
  }

  function toPublicShape(state) {
    return {
      scores: state.scores.map(function (e) { return Object.assign({}, e); }),
      bestCombo: state.bestCombo,
      maxLines: state.maxLines,
    };
  }

  function load() {
    return toPublicShape(readState());
  }

  function qualifies(score) {
    var s = Number(score);
    if (!isFinite(s)) return false;
    var state = readState();
    if (state.scores.length < MAX_ENTRIES) return true;
    var lowest = state.scores[state.scores.length - 1];
    return s > lowest.score;
  }

  function add(entry) {
    var state = readState();
    var normalized = normalizeEntry(entry);

    state.scores.push(normalized);
    state.scores.sort(function (a, b) { return b.score - a.score; });
    state.scores = state.scores.slice(0, MAX_ENTRIES);

    // Los agregados históricos consideran TODA partida jugada, no solo
    // las que entraron al top 5 de puntuación.
    state.bestCombo = Math.max(state.bestCombo, normalized.combo);
    state.maxLines = Math.max(state.maxLines, normalized.lines);

    return persistState(state);
  }

  function reset() {
    return persistState(defaultState());
  }

  root.HighScores = {
    load: load,
    qualifies: qualifies,
    add: add,
    reset: reset,
  };
})(typeof window !== 'undefined' ? window : this);
