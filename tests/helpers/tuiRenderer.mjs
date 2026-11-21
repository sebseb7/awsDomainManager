import EventEmitter from 'events';
import { render } from 'ink';

const ANSI_16_COLORS = {
  30: '#1e293b',
  31: '#f87171',
  32: '#34d399',
  33: '#fbbf24',
  34: '#60a5fa',
  35: '#c084fc',
  36: '#22d3ee',
  37: '#e2e8f0',
  90: '#64748b',
  91: '#fca5a5',
  92: '#6ee7b7',
  93: '#fde68a',
  94: '#93c5fd',
  95: '#d8b4fe',
  96: '#67e8f9',
  97: '#ffffff',
};

const ANSI_BG_COLORS = {
  40: '#0f172a',
  41: '#ef4444',
  42: '#10b981',
  43: '#f59e0b',
  44: '#3b82f6',
  45: '#a855f7',
  46: '#06b6d4',
  47: '#ffffff',
  100: '#334155',
  101: '#f87171',
  102: '#34d399',
  103: '#fbbf24',
  104: '#60a5fa',
  105: '#c084fc',
  106: '#22d3ee',
  107: '#ffffff',
};

const escapeHtml = (str) =>
  str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/**
 * Strip all ANSI escape codes for plain-text test assertions.
 */
export const stripAnsi = (str) =>
  str.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '');

/**
 * Convert ANSI SGR text from Ink into styled HTML spans.
 */
export const ansiToHtml = (ansiText) => {
  // Remove non-SGR CSI sequences (cursor movement, erase line, etc.), preserving SGR (...m)
  const cleaned = ansiText
    .replace(/\r/g, '')
    .replace(/\x1b\[[0-9;?]*[A-Za-ln-z]/g, '');

  const parts = cleaned.split(/(\x1b\[[0-9;]*m)/g);
  let fg = null;
  let bg = null;
  let bold = false;
  let dim = false;
  let inverse = false;

  const out = [];
  for (const part of parts) {
    if (part.startsWith('\x1b[') && part.endsWith('m')) {
      const rawCodes = part.slice(2, -1);
      const codes = rawCodes ? rawCodes.split(';').map(Number) : [0];
      for (let i = 0; i < codes.length; i++) {
        const c = codes[i];
        if (c === 0) {
          fg = null;
          bg = null;
          bold = false;
          dim = false;
          inverse = false;
        } else if (c === 1) {
          bold = true;
        } else if (c === 2) {
          dim = true;
        } else if (c === 7) {
          inverse = true;
        } else if (c === 22) {
          bold = false;
          dim = false;
        } else if (c === 27) {
          inverse = false;
        } else if (c === 39) {
          fg = null;
        } else if (c === 49) {
          bg = null;
        } else if (ANSI_16_COLORS[c]) {
          fg = ANSI_16_COLORS[c];
        } else if (ANSI_BG_COLORS[c]) {
          bg = ANSI_BG_COLORS[c];
        } else if (c === 38 && codes[i + 1] === 2 && i + 4 < codes.length) {
          fg = `rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]})`;
          i += 4;
        } else if (c === 48 && codes[i + 1] === 2 && i + 4 < codes.length) {
          bg = `rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]})`;
          i += 4;
        }
      }
      continue;
    }

    if (!part) continue;

    const effFg = inverse ? bg || '#0f141c' : fg;
    const effBg = inverse ? fg || '#e2e8f0' : bg;

    const styles = [];
    if (effFg) styles.push(`color:${effFg}`);
    if (effBg) styles.push(`background-color:${effBg}`);
    if (bold) styles.push('font-weight:700');
    if (dim) styles.push('opacity:0.6');

    const escaped = escapeHtml(part);
    if (styles.length > 0) {
      out.push(`<span style="${styles.join(';')}">${escaped}</span>`);
    } else {
      out.push(escaped);
    }
  }

  return out.join('');
};

/**
 * Render an Ink React element to an ANSI string using a virtual TTY stdout.
 */
export const renderInkToAnsi = async (element, { columns = 104, rows = 36 } = {}) => {
  let lastFrame = '';

  const stdout = new EventEmitter();
  stdout.columns = columns;
  stdout.rows = rows;
  stdout.isTTY = true;
  stdout.getColorDepth = () => 24;
  stdout.hasColors = () => true;
  stdout.write = (chunk) => {
    const str = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    // Ignore pure cursor-hide/show control sequences
    if (stripAnsi(str).trim().length > 0) {
      lastFrame = str;
    }
    return true;
  };

  const stdin = new EventEmitter();
  stdin.isTTY = true;
  stdin.setRawMode = () => {};
  stdin.setEncoding = () => {};
  stdin.resume = () => {};
  stdin.pause = () => {};
  stdin.ref = () => {};
  stdin.unref = () => {};
  stdin.read = () => null;

  const instance = render(element, {
    stdout,
    stdin,
    debug: true,
    patchConsole: false,
  });

  // Allow React effects/memos to flush
  await new Promise((r) => setTimeout(r, 80));
  instance.unmount();

  return lastFrame;
};

/**
 * Render ANSI output inside a styled terminal window via Playwright and save a PNG screenshot.
 */
export const screenshotAnsiTerminal = async (page, ansiText, outputPath, title = 'aws-domain-manager — TUI') => {
  const htmlContent = ansiToHtml(ansiText);
  const fullHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #090d14;
    padding: 24px;
    display: inline-block;
    font-family: 'JetBrains Mono', 'Fira Code', 'SFMono-Regular', Menlo, Consolas, 'DejaVu Sans Mono', 'Liberation Mono', 'Noto Sans Symbols 2', 'Noto Sans Symbols', sans-serif, monospace;
  }
  .terminal {
    background: #0f141c;
    border: 1px solid #2a364a;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 22px 54px rgba(0, 0, 0, 0.55);
    min-width: 820px;
  }
  .titlebar {
    background: #161d28;
    border-bottom: 1px solid #2a364a;
    padding: 10px 14px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
  .dot-r { background: #ef4444; }
  .dot-y { background: #f59e0b; }
  .dot-g { background: #22c55e; }
  .title {
    margin-left: 8px;
    color: #92a1b8;
    font-size: 12.5px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif;
  }
  pre {
    padding: 18px 22px;
    color: #e8eef7;
    font-size: 13.5px;
    line-height: 1.15;
    white-space: pre;
    font-variant-ligatures: none;
  }
</style>
</head>
<body>
  <div class="terminal" id="term">
    <div class="titlebar">
      <span class="dot dot-r"></span>
      <span class="dot dot-y"></span>
      <span class="dot dot-g"></span>
      <span class="title">${escapeHtml(title)}</span>
    </div>
    <pre>${htmlContent}</pre>
  </div>
</body>
</html>`;

  await page.setViewportSize({ width: 1280, height: 960 });
  await page.setContent(fullHtml, { waitUntil: 'load' });
  const container = page.locator('body');
  await container.screenshot({ path: outputPath });
};
