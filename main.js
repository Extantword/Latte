import { EditorState }                               from '@codemirror/state'
import { EditorView, keymap, drawSelection,
         highlightActiveLine, dropCursor }           from '@codemirror/view'
import { defaultKeymap, history, historyKeymap,
         indentWithTab }                             from '@codemirror/commands'
import { syntaxHighlighting, defaultHighlightStyle,
         indentOnInput, bracketMatching }            from '@codemirror/language'
import { latex }                                     from 'codemirror-lang-latex'

// ── Default LaTeX document ──────────────────────────────────────────
const DEFAULT_DOC = `\\documentclass{article}

\\title{Latte}
\\author{}
\\date{}

\\begin{document}

\\maketitle

Welcome to \\textbf{Latte} — a high-quality \\LaTeX{} editor.

\\section{Introduction}
Start writing your document here. The preview on the right
updates automatically as you type.

\\section{Mathematics}
Inline math: $E = mc^2$

Display math:
\\[
  \\int_{-\\infty}^{\\infty} e^{-x^2}\\, dx = \\sqrt{\\pi}
\\]

\\end{document}`

// ── latex.js — cached import so we only fetch it once ───────────────
let latexModule = null
async function getLatex() {
  if (!latexModule) {
    latexModule = await import(
      'https://cdn.jsdelivr.net/npm/latex.js@0.12.6/dist/latex.mjs'
    )
  }
  return latexModule
}

// ── Render LaTeX into the preview iframe ────────────────────────────
async function renderLatex(src) {
  const frame = document.getElementById('preview-frame')
  try {
    const { parse, HtmlGenerator } = await getLatex()
    const generator = new HtmlGenerator({ hyphenate: false })
    const doc  = parse(src, { generator }).htmlDocument()
    // Inject a small style reset so the iframe looks clean
    const style = doc.createElement('style')
    style.textContent = `
      body { font-family: 'Georgia', serif; padding: 3rem 4rem;
             max-width: 780px; margin: 0 auto; line-height: 1.65;
             color: #1a1208; background: #fff; }
      @media (max-width: 600px) { body { padding: 1.5rem 1rem; } }
    `
    doc.head.appendChild(style)
    frame.srcdoc = '<!DOCTYPE html>' + doc.documentElement.outerHTML
  } catch (err) {
    // On parse error keep the previous render; log quietly
    console.debug('[Latte] LaTeX parse error:', err.message)
  }
}

// ── Debounced render trigger ─────────────────────────────────────────
let renderTimer = null
function scheduleRender(src) {
  clearTimeout(renderTimer)
  renderTimer = setTimeout(() => renderLatex(src), 450)
}

// ── CodeMirror 6 editor ─────────────────────────────────────────────
const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    background: 'transparent',
    fontSize: '15px',
  },
  '.cm-scroller': {
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
    lineHeight: '1.75',
    overflow: 'auto',
    padding: '2rem 2.5rem',
  },
  '.cm-content': {
    caretColor: '#5c4a1e',
    minHeight: '100%',
  },
  '.cm-cursor': {
    borderLeftColor: '#5c4a1e',
    borderLeftWidth: '2px',
  },
  '.cm-activeLine':      { background: 'rgba(200,175,100,0.10)' },
  '.cm-selectionMatch':  { background: 'rgba(200,175,100,0.22)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground':
                         { background: 'rgba(190,160,80,0.28)' },
  '.cm-gutters': {
    background: 'transparent',
    border: 'none',
    color: 'rgba(120,100,60,0.4)',
    paddingRight: '0.5rem',
  },
})

const view = new EditorView({
  state: EditorState.create({
    doc: DEFAULT_DOC,
    extensions: [
      history(),
      drawSelection(),
      dropCursor(),
      indentOnInput(),
      bracketMatching(),
      highlightActiveLine(),
      syntaxHighlighting(defaultHighlightStyle),
      latex(),
      keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
      EditorView.lineWrapping,
      editorTheme,
      EditorView.updateListener.of(update => {
        if (update.docChanged) {
          scheduleRender(update.state.doc.toString())
        }
      }),
    ],
  }),
  parent: document.getElementById('editor-col'),
})

// Initial render
scheduleRender(DEFAULT_DOC)

// ── Hover-triggered side panels ─────────────────────────────────────
function makePanelHover(zoneId, panelId) {
  const zone  = document.getElementById(zoneId)
  const panel = document.getElementById(panelId)
  let closeTimer = null

  const open  = () => { clearTimeout(closeTimer); panel.classList.add('open') }
  const close = () => { closeTimer = setTimeout(() => panel.classList.remove('open'), 220) }

  zone.addEventListener('mouseenter',  open)
  zone.addEventListener('mouseleave',  close)
  panel.addEventListener('mouseenter', () => clearTimeout(closeTimer))
  panel.addEventListener('mouseleave', close)
}

makePanelHover('hover-left',  'panel-left')
makePanelHover('hover-right', 'panel-right')

// ── Button: New document ────────────────────────────────────────────
document.getElementById('btn-new').addEventListener('click', () => {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: DEFAULT_DOC },
  })
  view.focus()
})

// ── Button: Copy LaTeX source ────────────────────────────────────────
document.getElementById('btn-copy').addEventListener('click', () => {
  navigator.clipboard.writeText(view.state.doc.toString())
})

// ── Button: Copy rendered HTML ───────────────────────────────────────
document.getElementById('btn-copy-html').addEventListener('click', () => {
  const frame = document.getElementById('preview-frame')
  navigator.clipboard.writeText(frame.srcdoc || '')
})

// ── Slider: Editor font size ─────────────────────────────────────────
document.getElementById('font-size').addEventListener('input', e => {
  const col = document.getElementById('editor-col')
  col.style.fontSize = e.target.value + 'px'
})
