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

// ── Templates ───────────────────────────────────────────────────────
const TEMPLATES = {
  blank: `\\documentclass{article}

\\begin{document}



\\end{document}`,

  article: DEFAULT_DOC,

  math: `\\documentclass{article}
\\usepackage{amsmath}
\\usepackage{amssymb}

\\title{Mathematics}
\\date{}

\\begin{document}

\\maketitle

\\section{Calculus}

The fundamental theorem of calculus:
\\[
  \\int_a^b f'(x)\\,dx = f(b) - f(a)
\\]

\\section{Algebra}

The quadratic formula: $x = \\dfrac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$

\\section{Series}

Euler's identity: $e^{i\\pi} + 1 = 0$

Taylor series: $e^x = \\sum_{n=0}^{\\infty} \\dfrac{x^n}{n!}$

\\end{document}`,

  letter: `\\documentclass{letter}

\\begin{document}

\\begin{letter}{Recipient Name\\\\Street Address\\\\City, Country}

\\opening{Dear Sir or Madam,}

I am writing to you regarding the matter discussed previously.
Please find my thoughts enclosed herein.

\\closing{Sincerely,}

\\end{letter}

\\end{document}`,
}

// ── File system (localStorage) ──────────────────────────────────────
const STORAGE_KEY = 'latte_files_v1'
const CURRENT_KEY = 'latte_current_v1'
let files = []
let currentFileId = null

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function loadFiles() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    files = raw ? JSON.parse(raw) : []
  } catch {
    files = []
  }
  try {
    currentFileId = localStorage.getItem(CURRENT_KEY) || null
  } catch {
    currentFileId = null
  }
}

function saveFiles() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(files))
  } catch { /* storage full or unavailable */ }
}

function saveCurrentId() {
  try {
    if (currentFileId) {
      localStorage.setItem(CURRENT_KEY, currentFileId)
    } else {
      localStorage.removeItem(CURRENT_KEY)
    }
  } catch { /* ignore */ }
}

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
  const frame    = document.getElementById('preview-frame')
  const errorBox = document.getElementById('error-box')
  try {
    const { parse, HtmlGenerator } = await getLatex()
    const generator = new HtmlGenerator({ hyphenate: false })
    const doc  = parse(src, { generator }).htmlDocument()
    // KaTeX CSS — latex.js uses KaTeX for math; without this stylesheet
    // all math symbols render as unstyled raw text
    const katexCSS = doc.createElement('link')
    katexCSS.rel  = 'stylesheet'
    katexCSS.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css'
    doc.head.appendChild(katexCSS)

    // latex.js document CSS — handles sectioning, lists, spacing, etc.
    const latexCSS = doc.createElement('link')
    latexCSS.rel  = 'stylesheet'
    latexCSS.href = 'https://cdn.jsdelivr.net/npm/latex.js@0.12.6/dist/latex.css'
    doc.head.appendChild(latexCSS)

    // Small style reset / typography overrides
    const style = doc.createElement('style')
    style.textContent = `
      body { font-family: 'Georgia', serif; padding: 3rem 4rem;
             max-width: 780px; margin: 0 auto; line-height: 1.65;
             color: #1a1208; background: #fff; }
      @media (max-width: 600px) { body { padding: 1.5rem 1rem; } }
    `
    doc.head.appendChild(style)
    frame.srcdoc = '<!DOCTYPE html>' + doc.documentElement.outerHTML
    // Clear any previous error
    errorBox.textContent = ''
    errorBox.classList.add('hidden')
  } catch (err) {
    // Show the parse error at the bottom of the preview column
    errorBox.textContent = err.message || String(err)
    errorBox.classList.remove('hidden')
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
          const src = update.state.doc.toString()
          scheduleRender(src)
          scheduleAutoSave(src)
        }
      }),
    ],
  }),
  parent: document.getElementById('editor-col'),
})

// Initial render
scheduleRender(DEFAULT_DOC)

// ── Auto-save ────────────────────────────────────────────────────────
let autoSaveTimer = null
function scheduleAutoSave(src) {
  clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(() => autoSave(src), 1000)
}

function autoSave(src) {
  if (!currentFileId) return
  const file = files.find(f => f.id === currentFileId)
  if (file) {
    file.content = src
    saveFiles()
  }
}

// ── File tree rendering ──────────────────────────────────────────────
function renderFileTree() {
  const container = document.getElementById('file-tree')
  if (!container) return

  if (files.length === 0) {
    container.innerHTML = '<p class="file-tree-empty">No saved files yet.</p>'
    return
  }

  // Group files by folder
  const root = []     // files with no folder
  const folders = {}  // folder name → array of files

  for (const file of files) {
    const folder = (file.folder || '').trim()
    if (!folder) {
      root.push(file)
    } else {
      if (!folders[folder]) folders[folder] = []
      folders[folder].push(file)
    }
  }

  const ul = document.createElement('ul')
  ul.className = 'file-tree-list'

  // Root-level files
  for (const file of root) {
    ul.appendChild(makeFileItem(file))
  }

  // Folders (sorted alphabetically)
  for (const folderName of Object.keys(folders).sort()) {
    const folderEl = makeFolderItem(folderName, folders[folderName])
    ul.appendChild(folderEl)
  }

  container.innerHTML = ''
  container.appendChild(ul)
}

function makeFileItem(file) {
  const li = document.createElement('li')
  li.className = 'file-tree-item' + (file.id === currentFileId ? ' active' : '')
  li.dataset.fileId = file.id
  li.textContent = '📄 ' + file.name
  li.addEventListener('click', () => openFile(file.id))
  return li
}

function makeFolderItem(folderName, folderFiles) {
  const li = document.createElement('li')
  li.className = 'file-tree-folder-item'

  // Folder header (clickable to toggle)
  const header = document.createElement('div')
  header.className = 'file-tree-folder-header'
  header.textContent = '📁 ' + folderName
  header.addEventListener('click', () => {
    li.classList.toggle('collapsed')
  })

  // Children list
  const children = document.createElement('ul')
  children.className = 'file-tree-list file-tree-children'
  for (const file of folderFiles) {
    children.appendChild(makeFileItem(file))
  }

  li.appendChild(header)
  li.appendChild(children)
  return li
}

// ── Open a file from the tree ────────────────────────────────────────
function openFile(id) {
  // Save the current file first
  if (currentFileId) {
    const cur = files.find(f => f.id === currentFileId)
    if (cur) {
      cur.content = view.state.doc.toString()
      saveFiles()
    }
  }

  const file = files.find(f => f.id === id)
  if (!file) return

  currentFileId = file.id
  saveCurrentId()

  // Load content into editor
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: file.content },
  })
  view.focus()

  // Re-render tree to update the active highlight
  renderFileTree()
}

// ── Create a new file ────────────────────────────────────────────────
function createFile(name, folder, templateKey) {
  const content = TEMPLATES[templateKey] || TEMPLATES.blank
  const file = {
    id:      generateId(),
    name:    name.trim() || 'Untitled',
    folder:  (folder || '').trim(),
    content,
  }
  files.push(file)
  saveFiles()
  openFile(file.id)
  renderFileTree()
}

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

// ── New Document dialog ──────────────────────────────────────────────
function showNewDocDialog() {
  const modal = document.getElementById('new-doc-modal')
  modal.classList.remove('hidden')
  document.getElementById('new-doc-name').value = ''
  document.getElementById('new-doc-folder').value = ''
  // Reset template radio to blank
  const radios = modal.querySelectorAll('input[name="tpl"]')
  radios.forEach(r => { r.checked = r.value === 'blank' })
  // Focus the name field
  document.getElementById('new-doc-name').focus()
}

function hideNewDocDialog() {
  document.getElementById('new-doc-modal').classList.add('hidden')
}

document.getElementById('btn-new').addEventListener('click', showNewDocDialog)

document.getElementById('btn-create-doc').addEventListener('click', () => {
  const name   = document.getElementById('new-doc-name').value
  const folder = document.getElementById('new-doc-folder').value
  const tpl    = document.querySelector('input[name="tpl"]:checked')?.value || 'blank'
  hideNewDocDialog()
  createFile(name, folder, tpl)
})

document.getElementById('btn-cancel-doc').addEventListener('click', hideNewDocDialog)

// Close modal on backdrop click
document.getElementById('new-doc-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) hideNewDocDialog()
})

// Close modal on Escape key
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') hideNewDocDialog()
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

// ── Startup ──────────────────────────────────────────────────────────
loadFiles()

// If there was a previously open file, load it; otherwise use DEFAULT_DOC
if (currentFileId) {
  const file = files.find(f => f.id === currentFileId)
  if (file) {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: file.content },
    })
    scheduleRender(file.content)
  } else {
    currentFileId = null
  }
}

renderFileTree()
