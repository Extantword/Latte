# Latte — LaTeX Editor

A minimal, high-quality in-browser LaTeX editor with real-time preview.

---

## Vision & UX

- **Two-column layout**: left column is a plain CodeMirror source editor; right column is a live preview rendered from the same LaTeX source.
- **Hidden chrome**: all UI controls (file management, view settings) are tucked into side panels that only appear when the user hovers near the left or right edge of the viewport (44 px invisible hit zones).
- **Aesthetic**: Windows Vista "Aero" glass — beige palette (`#ede7d5` background), translucent panels with `backdrop-filter: blur`, white-rim glass highlights, subtle animated grain texture, gold accent (`#b8912a`).

---

## File Structure

```
index.html   — HTML skeleton: import-map, two columns, side panels, modal
style.css    — All styling; design tokens in :root; ~500 lines
main.js      — All behaviour: CodeMirror setup, LaTeX rendering, file system
CLAUDE.md    — This file
```

---

## Tech Stack

| Concern | Library | How it's loaded |
|---|---|---|
| Source editor | CodeMirror 6 (`@codemirror/*@6`) | ESM import-map → esm.sh CDN |
| LaTeX syntax highlighting | `codemirror-lang-latex` | same import-map |
| LaTeX → HTML compilation | `latex.js@0.12.6` | dynamic `import()` at first render (cached in `latexModule`) |
| Math rendering inside latex.js | KaTeX (bundled inside latex.js) | needs **katex CSS** linked in iframe head |
| File storage | Browser `localStorage` | keys `latte_files_v1` / `latte_current_v1` |

---

## Math Rendering — Critical Detail

`latex.js` uses **KaTeX internally** to render `$...$` and `\[...\]` blocks.
It emits KaTeX HTML into the generated document, but does **not** bundle the KaTeX
stylesheet. Without it, all math renders as unstyled or broken text.

The fix (already in place in `renderLatex`, `main.js`): inject two `<link>` tags
into the generated iframe `<head>` **before** setting `frame.srcdoc`:

```js
// KaTeX CSS — must come first
katexCSS.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css'
// latex.js document CSS — sectioning, lists, spacing
latexCSS.href = 'https://cdn.jsdelivr.net/npm/latex.js@0.12.6/dist/latex.css'
```

Do not remove these or math will break again.

---

## Design Tokens (`:root` in style.css)

```css
--bg-page      #ede7d5
--bg-gradient  linear-gradient(135deg, #f0ead8, #e8dfc8, #f2ebd9)
--bg-col       rgba(255,250,238,0.55)   /* column backgrounds */
--glass-bg     rgba(255,246,220,0.32)   /* side panels */
--glass-border rgba(255,255,255,0.52)
--glass-shadow 0 6px 40px rgba(60,40,10,0.20) + inset highlight
--text         #2c2416
--text-muted   #7a6a4e
--accent       #b8912a                  /* gold */
--panel-w      260px
--radius       14px
--transition   0.28s cubic-bezier(.4,0,.2,1)
```

---

## Key Behaviours to Preserve

1. **Hover panels** (`makePanelHover`): hover-zone `mouseenter` → add `.open`; `mouseleave` starts a 220 ms close timer that is cancelled if the pointer enters the panel itself.
2. **Debounced render** (`scheduleRender`): 450 ms after the last keystroke, calls `renderLatex`. The latex.js module is imported once and cached.
3. **Auto-save** (`scheduleAutoSave`): 1000 ms debounce writes current editor content back to the matching `files[]` entry and persists to `localStorage`.
4. **Iframe isolation**: `sandbox="allow-same-origin allow-scripts"`. The preview is always set via `frame.srcdoc`, never `frame.src`. External CSS (KaTeX, latex.js) loads fine through `<link>` elements.
5. **Error display**: any exception from `latex.js parse()` is caught; the error message appears in `#error-box` at the bottom of the preview column.

---

## Templates (in `TEMPLATES` object, `main.js`)

| Key | Description |
|---|---|
| `blank` | Minimal `\documentclass{article}` skeleton |
| `article` | Default doc — title, sections, inline + display math |
| `math` | amsmath/amssymb heavy: calculus, quadratic formula, Euler, Taylor |
| `letter` | `\documentclass{letter}` with opening/closing macros |

---

## localStorage Schema

```json
latte_files_v1:   [ { id, name, folder, content } ]
latte_current_v1: "<id string>"
```

IDs: `Date.now().toString(36) + random`. Folders are plain strings; hierarchy is
inferred by splitting on `/` in the file-tree renderer.

---

## What "looks right" means

- Math (`$E = mc^2$`, display `\[...\]`) should render with proper symbols, fractions, superscripts — identical to KaTeX output.
- Document has Georgia serif body, generous padding, max-width 780 px.
- No visible browser scrollbars on the outer page (both `html` and `body` are `overflow: hidden`); each column scrolls independently.
- Side panels slide in/out with a smooth transform — never a jump or flash.
