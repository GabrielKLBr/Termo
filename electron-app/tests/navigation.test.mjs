import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';

const dir = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(dir, '..', 'src', 'main.js'), 'utf8');
const beginning = src.indexOf('function nextEmptyAfter(');
const end = src.indexOf('function evaluate(', beginning);
assert.ok(beginning >= 0 && end > beginning, 'A lógica real de edição existe');
const functions = src.slice(beginning, end);

function fixture(values = ['', '', '', '', ''], cursor = 0) {
  const ctx = {
    game: { current: [...values], cursor, finished: false }, locked: false,
    NORM: c => c.toUpperCase(), saved: 0, rendered: 0, popped: [],
    save() {}, renderEditable() {}, popType() {}
  };
  // These mocks need no DOM; verifies the exact live game functions.
  ctx.save = () => { ctx.saved++; };
  ctx.renderEditable = () => { ctx.rendered++; };
  ctx.popType = position => { ctx.popped.push(position); };
  vm.createContext(ctx);
  vm.runInContext(functions, ctx);
  return ctx;
}

test('five letters consume all cells and hide highlight', () => {
  const g = fixture();
  for (const c of 'TRENS') g.typeLetter(c);
  assert.equal(g.game.current.join(''), 'TRENS');
  assert.equal(g.game.cursor, 5);
  assert.match(src, /game\.current\.includes\(''\)&&i===game\.cursor/);
});

test('typing jumps over occupied cells to next empty slot', () => {
  const g = fixture(['A', '', 'C', '', 'E'], 1);
  g.typeLetter('B');
  assert.deepEqual([...g.game.current], ['A', 'B', 'C', '', 'E']);
  assert.equal(g.game.cursor, 3);
});

test('typing wraps around to an earlier empty cell', () => {
  const g = fixture(['A', '', 'C', 'D', ''], 4);
  g.typeLetter('E');
  assert.equal(g.game.cursor, 1);
});

test('completing a last gap in the middle hides highlight', () => {
  const g = fixture(['A', 'B', '', 'D', 'E'], 2);
  g.typeLetter('C');
  assert.equal(g.game.current.join(''), 'ABCDE');
  assert.equal(g.game.cursor, 5);
});

test('Backspace on a fully populated row deletes last tile and selects it', () => {
  const g = fixture(['A', 'B', 'C', 'D', 'E'], 5);
  g.eraseLetter();
  assert.deepEqual([...g.game.current], ['A', 'B', 'C', 'D', '']);
  assert.equal(g.game.cursor, 4);
});

test('Backspace on a manually selected occupied cell does not go backward', () => {
  const g = fixture(['A', 'B', 'C', 'D', 'E'], 2);
  g.eraseLetter();
  assert.deepEqual([...g.game.current], ['A', 'B', '', 'D', 'E']);
  assert.equal(g.game.cursor, 2);
});

test('Backspace from an already empty selected cell finds previous filled tile', () => {
  const g = fixture(['A', '', 'C', '', 'E'], 3);
  g.eraseLetter();
  assert.deepEqual([...g.game.current], ['A', '', '', '', 'E']);
  assert.equal(g.game.cursor, 2);
});
