'use strict';

/* ---------- Элементы ---------- */

const historyEl = document.getElementById('history');
const currentEl = document.getElementById('current');
const keysEl = document.getElementById('keys');
const memeEl = document.getElementById('meme');
const memeClose = document.getElementById('memeClose');

/* ---------- Состояние ---------- */

const state = {
  expr: '',        // сырое выражение, например "12+3*4"
  history: '',     // строка над числом
  display: '',     // отформатированный результат после "="
  evaluated: false,
  error: false,
  errorText: '',
};

/* ---------- Ошибки ---------- */

class CalcError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/* ---------- Парсер выражения ---------- */

function tokenize(src) {
  const tokens = [];
  let i = 0;

  while (i < src.length) {
    const ch = src[i];

    if (ch === ' ') {
      i++;
      continue;
    }

    if (/[0-9.]/.test(ch)) {
      let num = '';
      while (i < src.length && /[0-9.]/.test(src[i])) {
        num += src[i++];
      }
      if (num === '.' || (num.match(/\./g) || []).length > 1) {
        throw new CalcError('syntax');
      }
      tokens.push({ type: 'num', value: parseFloat(num) });
      continue;
    }

    if ('+-*/()'.includes(ch)) {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }

    throw new CalcError('syntax');
  }

  return tokens;
}

function evaluate(src) {
  const tokens = tokenize(src);
  let pos = 0;

  const peek = () => tokens[pos];

  function parsePrimary() {
    const token = peek();
    if (!token) throw new CalcError('syntax');

    if (token.type === 'num') {
      pos++;
      return token.value;
    }

    if (token.value === '(') {
      pos++;
      const value = parseExpression();
      if (!peek() || peek().value !== ')') throw new CalcError('syntax');
      pos++;
      return value;
    }

    throw new CalcError('syntax');
  }

  function parseUnary() {
    const token = peek();
    if (token && token.type === 'op' && (token.value === '-' || token.value === '+')) {
      pos++;
      const value = parseUnary();
      return token.value === '-' ? -value : value;
    }
    return parsePrimary();
  }

  function parseTerm() {
    let left = parseUnary();

    while (peek() && peek().type === 'op' && (peek().value === '*' || peek().value === '/')) {
      const op = tokens[pos++].value;
      const right = parseUnary();

      if (op === '/') {
        if (right === 0) throw new CalcError('div0');
        left = left / right;
      } else {
        left = left * right;
      }
    }

    return left;
  }

  function parseExpression() {
    let left = parseTerm();

    while (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
      const op = tokens[pos++].value;
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
    }

    return left;
  }

  const result = parseExpression();
  if (pos !== tokens.length) throw new CalcError('syntax');
  return result;
}

/* ---------- Форматирование ---------- */

function formatNumber(value) {
  if (!Number.isFinite(value)) return '∞';
  if (Object.is(value, -0)) value = 0;

  const abs = Math.abs(value);
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-9)) {
    return value.toExponential(6).replace('e', 'e');
  }

  const plain = parseFloat(value.toPrecision(12)).toString();
  if (plain.includes('e')) return plain;

  const [int, dec] = plain.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
  return dec ? `${grouped}.${dec}` : grouped;
}

function pretty(src) {
  if (!src) return '';
  return src
    .replace(/(^|[+\-*/(])-/g, '$1\u2212')
    .replace(/-/g, ' \u2212 ')
    .replace(/\*/g, ' \u00d7 ')
    .replace(/\//g, ' \u00f7 ')
    .replace(/\+/g, ' + ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ---------- Отрисовка ---------- */

function render() {
  currentEl.classList.toggle('error', state.error);

  if (state.error) {
    currentEl.textContent = state.errorText || 'Ошибка';
  } else if (state.evaluated) {
    currentEl.textContent = state.display;
  } else {
    currentEl.textContent = pretty(state.expr) || '0';
  }

  historyEl.textContent = state.history;
  currentEl.scrollLeft = currentEl.scrollWidth;
}

/* ---------- Ввод ---------- */

function resetAfterEquals() {
  if (state.evaluated) {
    state.expr = '';
    state.history = '';
    state.evaluated = false;
  }
}

function inputDigit(digit) {
  state.error = false;
  resetAfterEquals();

  if (state.expr.endsWith(')')) {
    state.expr += '*';
  }

  const tail = (state.expr.match(/(\d*\.?\d*)$/) || [''])[0];

  if (digit === '.') {
    if (tail.includes('.')) return;
    state.expr += tail === '' ? '0.' : '.';
    render();
    return;
  }

  if (tail === '0') {
    state.expr = `${state.expr.slice(0, -1)}${digit}`;
  } else {
    state.expr += digit;
  }

  if (state.expr.length > 60) {
    state.expr = state.expr.slice(-60);
  }

  render();
}

function inputOperator(op) {
  state.error = false;

  if (state.evaluated) {
    state.evaluated = false;
    state.history = '';
  }

  if (!state.expr) {
    if (op === '-') {
      state.expr = '-';
      render();
    }
    return;
  }

  if (state.expr.endsWith('(')) {
    if (op === '-') {
      state.expr += '-';
      render();
    }
    return;
  }

  state.expr = state.expr.replace(/[+\-*/]+$/, '');
  state.expr += op;
  render();
}

function inputParen(paren) {
  state.error = false;
  resetAfterEquals();

  if (paren === '(') {
    if (/[\d.)]$/.test(state.expr)) state.expr += '*';
    state.expr += '(';
    render();
    return;
  }

  const open = (state.expr.match(/\(/g) || []).length;
  const close = (state.expr.match(/\)/g) || []).length;

  if (close >= open) return;
  if (!/[\d.)]$/.test(state.expr)) return;

  state.expr += ')';
  render();
}

function percent() {
  state.error = false;

  if (state.evaluated) {
    state.evaluated = false;
    state.history = '';
  }

  const match = state.expr.match(/(\d+(?:\.\d+)?)$/);
  if (!match) return;

  state.expr = `${state.expr.slice(0, match.index)}${match[1]}/100`;
  render();
}

function backspace() {
  state.error = false;

  if (state.evaluated) {
    clearAll();
    return;
  }

  state.expr = state.expr.slice(0, -1);
  render();
}

function clearAll() {
  state.expr = '';
  state.history = '';
  state.display = '';
  state.evaluated = false;
  state.error = false;
  state.errorText = '';
  render();
}

function equals() {
  if (!state.expr) return;

  try {
    const value = evaluate(state.expr);

    if (!Number.isFinite(value)) throw new CalcError('div0');

    state.history = `${pretty(state.expr)} =`;
    state.display = formatNumber(value);
    state.expr = Object.is(value, -0) ? '0' : String(value);
    state.evaluated = true;
    state.error = false;
    render();
  } catch (err) {
    if (err instanceof CalcError && err.code === 'div0') {
      showMeme();
    } else {
      state.history = '';
      state.error = true;
      state.errorText = 'Ошибка';
      render();
    }
  }
}

/* ---------- Пасхалка ---------- */

function showMeme() {
  state.expr = '';
  state.history = 'деление на ноль';
  state.evaluated = false;
  state.error = true;
  state.errorText = '∞';
  render();

  memeEl.classList.add('show');
  memeEl.setAttribute('aria-hidden', 'false');

  document.body.classList.add('shaking');
  window.setTimeout(() => document.body.classList.remove('shaking'), 600);

  memeClose.focus({ preventScroll: true });
}

function hideMeme() {
  memeEl.classList.remove('show');
  memeEl.setAttribute('aria-hidden', 'true');
  clearAll();
}

/* ---------- События ---------- */

keysEl.addEventListener('click', (event) => {
  const button = event.target.closest('button.key');
  if (!button) return;

  const { action, value } = button.dataset;

  if (action === 'clear') return clearAll();
  if (action === 'backspace') return backspace();
  if (action === 'equals') return equals();
  if (action === 'percent') return percent();

  if (value === undefined) return;

  if (value === '.') return inputDigit('.');
  if ('+-*/'.includes(value)) return inputOperator(value);
  if (value === '(' || value === ')') return inputParen(value);
  return inputDigit(value);
});

memeClose.addEventListener('click', hideMeme);

memeEl.addEventListener('click', (event) => {
  if (event.target === memeEl) hideMeme();
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (memeEl.classList.contains('show')) hideMeme();
    else clearAll();
    return;
  }

  if (memeEl.classList.contains('show')) return;

  const key = event.key;

  if (/^[0-9]$/.test(key)) {
    inputDigit(key);
  } else if (key === '.' || key === ',') {
    inputDigit('.');
  } else if ('+-*/'.includes(key)) {
    inputOperator(key);
  } else if (key === '(' || key === ')') {
    inputParen(key);
  } else if (key === 'Enter' || key === '=') {
    equals();
  } else if (key === 'Backspace') {
    backspace();
  } else if (key === 'Delete') {
    clearAll();
  } else if (key === '%') {
    percent();
  } else if (key === 'x' || key === 'X') {
    inputOperator('*');
  } else if (key === ':') {
    inputOperator('/');
  } else {
    return;
  }

  event.preventDefault();
});

render();
