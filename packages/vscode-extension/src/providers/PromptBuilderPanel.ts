import * as vscode from 'vscode';
import {
  PromptBuilderService,
  PromptTemplate,
  WorkspaceContext,
  PromptQuality,
} from '../services/PromptBuilderService';

// ═══════════════════════════════════════════════════════════════════════════════
// Prompt Builder Panel - World-Class Edition
// ═══════════════════════════════════════════════════════════════════════════════

export class PromptBuilderPanel {
  public static currentPanel: PromptBuilderPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _service: PromptBuilderService;
  private _disposables: vscode.Disposable[] = [];
  private _workspaceContext: WorkspaceContext | null = null;

  public static createOrShow(
    extensionUri: vscode.Uri,
    service: PromptBuilderService
  ): PromptBuilderPanel {
    const column = vscode.window.activeTextEditor?.viewColumn;

    if (PromptBuilderPanel.currentPanel) {
      PromptBuilderPanel.currentPanel._panel.reveal(column);
      return PromptBuilderPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'vibecheckPromptBuilder',
      'Prompt Builder',
      column || vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [extensionUri] }
    );

    PromptBuilderPanel.currentPanel = new PromptBuilderPanel(panel, extensionUri, service);
    return PromptBuilderPanel.currentPanel;
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, service: PromptBuilderService) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._service = service;
    void this._initialize();
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(msg => void this._handleMessage(msg), null, this._disposables);
  }

  private async _initialize(): Promise<void> {
    this._workspaceContext = await this._service.detectWorkspaceContext();
    this._panel.webview.html = this._getHtml();
  }

  private async _handleMessage(msg: { command: string; templateId?: string; input?: string; answers?: Record<string, string[]>; text?: string; promptId?: string; id?: string }): Promise<void> {
    switch (msg.command) {
      case 'ready':
        // Ensure workspace context is loaded before sending init
        if (!this._workspaceContext) {
          this._workspaceContext = await this._service.detectWorkspaceContext();
        }
        void this._panel.webview.postMessage({
          type: 'init',
          templates: this._service.getTemplates(),
          categories: this._service.getCategories(),
          context: this._workspaceContext,
          history: this._service.getHistory().slice(0, 20),
        });
        break;
      case 'build':
        try {
          // Ensure workspace context is available
          if (!this._workspaceContext) {
            this._workspaceContext = await this._service.detectWorkspaceContext();
          }

          const template = this._service.getTemplates().find(t => t.id === msg.templateId);

          if (!template) {
            void this._panel.webview.postMessage({
              type: 'error',
              message: 'Template not found. Please select a template from the list.'
            });
            return;
          }

          if (!msg.input || msg.input.trim().length === 0) {
            void this._panel.webview.postMessage({
              type: 'error',
              message: 'Please enter a description of what you want to build.'
            });
            return;
          }

          const result = this._service.buildPrompt(template, msg.input, msg.answers || {}, this._workspaceContext);
          void this._panel.webview.postMessage({ type: 'built', prompt: result });
        } catch (error) {
          void this._panel.webview.postMessage({
            type: 'error',
            message: `Failed to build prompt: ${error instanceof Error ? error.message : 'Unknown error'}`
          });
        }
        break;
      case 'copy':
        if (msg.text) {
          await vscode.env.clipboard.writeText(msg.text);
          void vscode.window.showInformationMessage('Prompt copied to clipboard!');
        }
        break;
      case 'favorite':
        if (msg.id) {
          const isFav = this._service.toggleFavorite(msg.id);
          void this._panel.webview.postMessage({ type: 'favoriteToggled', id: msg.id, isFavorite: isFav });
        }
        break;
    }
  }

  private _getHtml(): string {
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this._panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<title>Prompt Builder</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg-0:#0a0a0b;--bg-1:#0f0f10;--bg-2:#141415;--bg-3:#1a1a1c;--bg-4:#222224;
  --border:#1f1f22;--border-hover:#2a2a2e;
  --text:#e4e4e7;--text-2:#a1a1aa;--text-3:#71717a;--text-4:#52525b;
  --accent:#3b82f6;--success:#10b981;--warning:#f59e0b;--error:#ef4444;--purple:#8b5cf6;
}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--bg-0);color:var(--text);height:100vh;overflow:hidden;font-size:13px;letter-spacing:-0.01em}

/* Layout */
.app{display:grid;grid-template-columns:280px 1fr 400px;height:100vh}
.sidebar{background:var(--bg-1);border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden}
.main{display:flex;flex-direction:column;overflow:hidden;background:var(--bg-0)}
.preview{background:var(--bg-1);border-left:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden}

/* Header */
.header{padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px}
.logo{display:flex;align-items:center;gap:10px}
.logo-icon{width:28px;height:28px;background:var(--bg-3);border:1px solid var(--border);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:var(--accent)}
.logo span{font-size:14px;font-weight:500;color:var(--text-2)}
.logo b{color:var(--text);font-weight:600}

/* Search */
.search{padding:12px 16px}
.search input{width:100%;padding:9px 12px;background:var(--bg-0);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px}
.search input:focus{outline:none;border-color:var(--accent)}
.search input::placeholder{color:var(--text-4)}

/* Templates */
.templates{flex:1;overflow-y:auto;padding:8px}
.cat{margin-bottom:4px}
.cat-header{font-size:10px;font-weight:600;color:var(--text-4);text-transform:uppercase;letter-spacing:.4px;padding:10px 12px 6px;display:flex;align-items:center;gap:6px}
.tpl{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:6px;cursor:pointer;border:1px solid transparent;transition:all .1s}
.tpl:hover{background:var(--bg-3)}
.tpl.active{background:var(--bg-3);border-color:var(--border-hover)}
.tpl.detected{background:rgba(16,185,129,.06);border-color:rgba(16,185,129,.2)}
.tpl-icon{font-size:11px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:var(--bg-2);border-radius:5px;color:var(--text-3);font-weight:500}
.tpl-info{flex:1;min-width:0}
.tpl-name{font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tpl-desc{font-size:11px;color:var(--text-4);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}
.badge{font-size:9px;padding:2px 6px;border-radius:3px;font-weight:600;text-transform:uppercase;letter-spacing:.3px}
.badge-new{background:var(--purple);color:#fff}
.badge-match{background:var(--success);color:#000}

/* Main Area */
.main-header{padding:14px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between}
.main-title{font-size:12px;font-weight:500;color:var(--text-2)}
.live{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--success)}
.live-dot{width:6px;height:6px;background:var(--success);border-radius:50%;animation:pulse 2s ease infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}

.input-area{padding:20px;border-bottom:1px solid var(--border)}
.textarea{width:100%;min-height:100px;padding:14px;background:var(--bg-1);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;font-family:inherit;line-height:1.6;resize:none;transition:border .15s}
.textarea:focus{outline:none;border-color:var(--accent)}
.textarea::placeholder{color:var(--text-4)}

.detected{margin-top:12px;padding:10px 14px;background:rgba(16,185,129,.05);border:1px solid rgba(16,185,129,.2);border-radius:6px;display:none;align-items:center;gap:10px;animation:slideUp .15s ease}
.detected.show{display:flex}
@keyframes slideUp{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
.detected-icon{font-size:11px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;background:rgba(16,185,129,.1);border-radius:4px;color:var(--success);font-weight:600}
.detected-text{flex:1}
.detected-label{font-size:10px;color:var(--success);text-transform:uppercase;font-weight:600;letter-spacing:.4px}
.detected-name{font-size:12px;font-weight:500;margin-top:1px}

/* Options */
.options{flex:1;overflow-y:auto;padding:20px}
.options-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center;color:var(--text-3)}
.options-empty-icon{width:40px;height:40px;margin-bottom:12px;opacity:.2;border:2px solid var(--text-4);border-radius:8px}
.options-empty-title{font-size:13px;font-weight:500;color:var(--text-2);margin-bottom:4px}
.options-empty-desc{font-size:12px;max-width:260px;line-height:1.5;color:var(--text-4)}

.opt-group{margin-bottom:18px;animation:fadeIn .15s ease}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
.opt-label{font-size:12px;font-weight:500;margin-bottom:3px;display:flex;align-items:center;gap:4px}
.opt-label .req{color:var(--error)}
.opt-hint{font-size:11px;color:var(--text-4);margin-bottom:8px}
.opt-chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{padding:6px 12px;background:var(--bg-2);border:1px solid var(--border);border-radius:4px;font-size:11px;color:var(--text-2);cursor:pointer;transition:all .1s;user-select:none}
.chip:hover{border-color:var(--border-hover);color:var(--text)}
.chip.on{background:var(--accent);border-color:var(--accent);color:#fff}
.opt-input,.opt-select{width:100%;padding:9px 12px;background:var(--bg-0);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px}
.opt-input:focus,.opt-select:focus{outline:none;border-color:var(--accent)}

/* Preview */
.preview-header{padding:14px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between}
.preview-title{font-size:12px;font-weight:500;color:var(--text-2)}
.quality{display:flex;align-items:center;gap:8px}
.quality-score{font-size:18px;font-weight:600;font-family:'SF Mono',ui-monospace,monospace}
.quality-score.high{color:var(--success)}
.quality-score.mid{color:var(--warning)}
.quality-score.low{color:var(--error)}
.quality-label{font-size:10px;color:var(--text-4);text-transform:uppercase;letter-spacing:.3px}

.preview-content{flex:1;overflow:hidden;display:flex;flex-direction:column}
.preview-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px;color:var(--text-3)}
.preview-empty-icon{width:48px;height:48px;margin-bottom:16px;opacity:.15;border:2px solid var(--text-4);border-radius:10px}
.preview-empty-title{font-size:14px;font-weight:500;color:var(--text-2);margin-bottom:6px}
.preview-empty-desc{font-size:12px;max-width:280px;line-height:1.5;color:var(--text-4)}

.output{flex:1;overflow-y:auto;padding:16px;font-family:'SF Mono','JetBrains Mono',ui-monospace,monospace;font-size:11px;line-height:1.7;white-space:pre-wrap;word-break:break-word;color:var(--text-2);background:var(--bg-0)}
.output h2{color:var(--accent);font-size:12px;font-weight:600;margin:20px 0 10px;padding-bottom:6px;border-bottom:1px solid var(--border);font-family:inherit}
.output h2:first-child{margin-top:0}
.output code{background:var(--bg-3);padding:2px 5px;border-radius:3px;font-size:10px}
.output strong{color:var(--text);font-weight:500}

.preview-actions{padding:14px 20px;border-top:1px solid var(--border);display:flex;gap:8px}
.btn{display:flex;align-items:center;justify-content:center;gap:6px;padding:9px 16px;border:none;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;transition:all .1s}
.btn:disabled{opacity:.4;cursor:not-allowed}
.btn-generate{flex:1;background:var(--accent);color:#fff}
.btn-generate:hover:not(:disabled){background:#2563eb}
.btn-generate:active{transform:translateY(0)}
.btn-primary{flex:1;background:var(--accent);color:#fff}
.btn-primary:hover:not(:disabled){background:#2563eb}
.btn-secondary{background:var(--bg-3);border:1px solid var(--border);color:var(--text)}
.btn-secondary:hover:not(:disabled){border-color:var(--border-hover);background:var(--bg-4)}

.stats{padding:10px 20px;background:var(--bg-2);border-top:1px solid var(--border);display:flex;gap:20px;font-size:11px;color:var(--text-4)}
.stat{display:flex;align-items:center;gap:4px}
.stat b{color:var(--text-2);font-family:'SF Mono',ui-monospace,monospace}

/* Context Bar */
.context{padding:10px 20px;background:var(--bg-2);border-top:1px solid var(--border);display:flex;align-items:center;gap:16px;font-size:10px;color:var(--text-4)}
.context-item{display:flex;align-items:center;gap:4px}
.context-item b{color:var(--text-2)}

/* Keyboard Hints */
.kbd{font-size:10px;padding:2px 5px;background:var(--bg-3);border:1px solid var(--border);border-radius:4px;color:var(--text-3);font-family:'SF Mono',monospace}

/* Scrollbar */
::-webkit-scrollbar{width:6px;height:6px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}
::-webkit-scrollbar-thumb:hover{background:var(--border-hover)}

/* Responsive */
@media(max-width:1200px){.app{grid-template-columns:260px 1fr 360px}}
@media(max-width:1000px){.preview{display:none}.app{grid-template-columns:260px 1fr}}
</style>
</head>
<body>
<div class="app">
  <!-- Sidebar -->
  <aside class="sidebar">
    <div class="header">
      <div class="logo">
        <div class="logo-icon">PB</div>
        <span>Prompt <b>Builder</b></span>
      </div>
    </div>
    <div class="search">
      <input type="text" id="search" placeholder="Search templates...">
    </div>
    <div class="templates" id="templates"></div>
  </aside>

  <!-- Main -->
  <section class="main">
    <div class="main-header">
      <div class="main-title">Describe your requirements</div>
      <div class="live"><span class="live-dot"></span>Live</div>
    </div>
    <div class="input-area">
      <textarea class="textarea" id="input" placeholder="Describe what you want to build...

Examples:
  Add Google and GitHub login to my app
  Create a REST API for products with CRUD
  Build a data table with sorting and filtering"></textarea>
      <div class="detected" id="detected">
        <span class="detected-icon" id="detectedIcon">T</span>
        <div class="detected-text">
          <div class="detected-label">Auto-detected</div>
          <div class="detected-name" id="detectedName">OAuth Login</div>
        </div>
        <span class="badge badge-match">Match</span>
      </div>
    </div>
    <div class="options" id="options">
      <div class="options-empty">
        <div class="options-empty-icon"></div>
        <div class="options-empty-title">Start typing above</div>
        <div class="options-empty-desc">Template options will appear here based on your input</div>
      </div>
    </div>
  </section>

  <!-- Preview -->
  <aside class="preview">
    <div class="preview-header">
      <div class="preview-title">Preview</div>
      <div class="quality" id="quality" style="display:none">
        <div>
          <div class="quality-score high" id="score">95</div>
          <div class="quality-label">Quality</div>
        </div>
      </div>
    </div>
    <div class="preview-content" id="previewContent">
      <div class="preview-empty">
        <div class="preview-empty-icon"></div>
        <div class="preview-empty-title">Your prompt appears here</div>
        <div class="preview-empty-desc">Type a description and click Generate to create your prompt</div>
      </div>
    </div>
    <div class="stats" id="stats" style="display:none">
      <div class="stat"><b id="chars">0</b> chars</div>
      <div class="stat"><b id="words">0</b> words</div>
      <div class="stat"><b id="sections">0</b> sections</div>
    </div>
    <div class="preview-actions">
      <button class="btn btn-generate" id="generateBtn">Generate Prompt</button>
      <button class="btn btn-secondary" id="copyBtn" disabled>Copy</button>
    </div>
    <div class="context" id="contextBar">
      <div class="context-item">Framework: <b id="ctxFramework">-</b></div>
      <div class="context-item">Database: <b id="ctxDb">-</b></div>
      <div class="context-item">Language: <b id="ctxTs">-</b></div>
    </div>
  </aside>
</div>

<script nonce="${nonce}">
const vscode = acquireVsCodeApi();

// State
let templates = [], categories = [], context = null;
let selectedTpl = null, detectedTpl = null, currentPrompt = '', answers = {};

// Elements
const $ = id => document.getElementById(id);
const input = $('input'), searchEl = $('search'), templatesEl = $('templates');
const optionsEl = $('options'), detectedEl = $('detected'), detectedIcon = $('detectedIcon'), detectedName = $('detectedName');
const previewContent = $('previewContent'), quality = $('quality'), score = $('score');
const stats = $('stats'), chars = $('chars'), words = $('words'), sections = $('sections');
const generateBtn = $('generateBtn'), copyBtn = $('copyBtn');
const ctxFramework = $('ctxFramework'), ctxDb = $('ctxDb'), ctxTs = $('ctxTs');

// Init
vscode.postMessage({ command: 'ready' });

let isGenerating = false;

window.addEventListener('message', e => {
  const m = e.data;
  if (m.type === 'init') {
    templates = m.templates;
    categories = m.categories;
    context = m.context;
    renderTemplates();
    updateContext();
  } else if (m.type === 'built') {
    isGenerating = false;
    currentPrompt = m.prompt.expandedPrompt;
    renderPreview(m.prompt);
  } else if (m.type === 'error') {
    isGenerating = false;
    showError(m.message);
  }
});

function showError(message) {
  previewContent.innerHTML = '<div class="preview-empty" style="color:var(--error)"><div class="preview-empty-icon" style="border-color:var(--error)"></div><div class="preview-empty-title">Error</div><div class="preview-empty-desc">' + esc(message) + '</div></div>';
  generateBtn.textContent = 'Generate Prompt';
  generateBtn.disabled = false;
}

// Live typing - detect templates as user types (but don't auto-build)
let debounce = null;
input.addEventListener('input', () => {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    const val = input.value.trim();
    if (val.length > 5) {
      const det = detectLocal(val);
      if (det && det.id !== detectedTpl?.id) {
        detectedTpl = det;
        showDetected(det);
        highlightTpl(det.id);
        if (!selectedTpl) {
          selectedTpl = det;
          renderOptions();
        }
      }
      // Update generate button hint
      if (selectedTpl || detectedTpl) {
        if (!isGenerating && !currentPrompt) {
          generateBtn.textContent = 'Generate Prompt';
          generateBtn.disabled = false;
        }
      }
    } else {
      detectedTpl = null;
      hideDetected();
      if (!selectedTpl) {
        showEmptyPreview();
      }
    }
  }, 150);
});

function detectLocal(text) {
  const t = text.toLowerCase();
  let best = null, bestScore = 0;
  for (const tpl of templates) {
    let s = 0;
    for (const kw of tpl.keywords) {
      if (t.includes(kw)) {
        s += kw.length * 2;
        if (new RegExp('\\\\b' + kw + '\\\\b').test(t)) s += 5;
      }
    }
    if (s > bestScore) { bestScore = s; best = tpl; }
  }
  return bestScore > 8 ? best : null;
}

function showDetected(tpl) {
  detectedIcon.textContent = tpl.name.charAt(0).toUpperCase();
  detectedName.textContent = tpl.name;
  detectedEl.classList.add('show');
}

function hideDetected() {
  detectedEl.classList.remove('show');
}

function highlightTpl(id) {
  templatesEl.querySelectorAll('.tpl').forEach(el => {
    el.classList.remove('detected', 'active');
    if (el.dataset.id === id) el.classList.add('detected');
  });
}

function build() {
  const tpl = selectedTpl || detectedTpl;
  if (!tpl) return;
  vscode.postMessage({
    command: 'build',
    templateId: tpl.id,
    input: input.value,
    answers: collectAnswers()
  });
}

function collectAnswers() {
  const a = {};
  optionsEl.querySelectorAll('.opt-input').forEach(el => { if (el.value) a[el.dataset.id] = el.value; });
  optionsEl.querySelectorAll('.opt-select').forEach(el => a[el.dataset.id] = el.value);
  optionsEl.querySelectorAll('.opt-chips').forEach(c => {
    const sel = Array.from(c.querySelectorAll('.chip.on')).map(ch => ch.dataset.v);
    if (sel.length) a[c.dataset.id] = sel;
  });
  return a;
}

// Templates
function renderTemplates(filter = '') {
  const f = filter.toLowerCase();
  const filtered = f ? templates.filter(t => t.name.toLowerCase().includes(f) || t.keywords.some(k => k.includes(f))) : templates;
  const grouped = {};
  filtered.forEach(t => { if (!grouped[t.category]) grouped[t.category] = []; grouped[t.category].push(t); });
  
  let html = '';
  for (const cat of categories) {
    const items = grouped[cat.category];
    if (!items) continue;
    html += '<div class="cat"><div class="cat-header">' + formatCat(cat.category) + '</div>';
    items.forEach(t => {
      const isDet = detectedTpl?.id === t.id;
      const isSel = selectedTpl?.id === t.id;
      html += '<div class="tpl ' + (isDet ? 'detected' : '') + (isSel ? ' active' : '') + '" data-id="' + t.id + '">' +
        '<div class="tpl-icon">' + t.name.charAt(0).toUpperCase() + '</div>' +
        '<div class="tpl-info"><div class="tpl-name">' + t.name + '</div><div class="tpl-desc">' + t.description + '</div></div>' +
        (t.isNew ? '<span class="badge badge-new">New</span>' : '') +
        (isDet ? '<span class="badge badge-match">Match</span>' : '') +
        '</div>';
    });
    html += '</div>';
  }
  templatesEl.innerHTML = html;
  
  templatesEl.querySelectorAll('.tpl').forEach(el => {
    el.addEventListener('click', () => {
      selectedTpl = templates.find(t => t.id === el.dataset.id);
      templatesEl.querySelectorAll('.tpl').forEach(e => e.classList.remove('active'));
      el.classList.add('active');
      renderOptions();
      build();
    });
  });
}

searchEl.addEventListener('input', () => renderTemplates(searchEl.value));

// Options
function renderOptions() {
  if (!selectedTpl) {
    optionsEl.innerHTML = '<div class="options-empty"><div class="options-empty-icon"></div><div class="options-empty-title">Start typing above</div><div class="options-empty-desc">Template options will appear here</div></div>';
    return;
  }
  
  let html = '<div style="font-size:11px;font-weight:600;color:var(--text-4);text-transform:uppercase;letter-spacing:.4px;margin-bottom:16px">' + selectedTpl.name + ' Options</div>';
  
  selectedTpl.contextQuestions.forEach(q => {
    html += '<div class="opt-group"><div class="opt-label">' + q.label + (q.required ? ' <span class="req">*</span>' : '') + '</div><div class="opt-hint">' + q.placeholder + '</div>';
    
    if (q.type === 'text') {
      html += '<input class="opt-input" data-id="' + q.id + '" placeholder="' + q.placeholder + '" value="' + (answers[q.id] || '') + '">';
    } else if (q.type === 'select') {
      html += '<select class="opt-select" data-id="' + q.id + '">';
      q.options.forEach(o => html += '<option value="' + o.value + '"' + (o.default || answers[q.id] === o.value ? ' selected' : '') + '>' + o.label + '</option>');
      html += '</select>';
    } else if (q.type === 'multiselect') {
      html += '<div class="opt-chips" data-id="' + q.id + '">';
      q.options.forEach(o => {
        const on = answers[q.id]?.includes(o.value) || (!answers[q.id] && o.default);
        html += '<div class="chip' + (on ? ' on' : '') + '" data-v="' + o.value + '">' + o.label + '</div>';
      });
      html += '</div>';
    }
    html += '</div>';
  });
  
  optionsEl.innerHTML = html;
  
  optionsEl.querySelectorAll('.opt-input, .opt-select').forEach(el => {
    el.addEventListener('input', () => { answers[el.dataset.id] = el.value; build(); });
    el.addEventListener('change', () => { answers[el.dataset.id] = el.value; build(); });
  });
  
  optionsEl.querySelectorAll('.opt-chips').forEach(c => {
    c.querySelectorAll('.chip').forEach(ch => {
      ch.addEventListener('click', () => {
        ch.classList.toggle('on');
        const sel = Array.from(c.querySelectorAll('.chip.on')).map(x => x.dataset.v);
        answers[c.dataset.id] = sel;
        build();
      });
    });
  });
}

// Preview
function renderPreview(p) {
  let html = esc(p.expandedPrompt)
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
    .replace(/\\\`([^\\\`]+)\\\`/g, '<code>$1</code>');
  
  previewContent.innerHTML = '<div class="output">' + html + '</div>';
  
  // Quality
  quality.style.display = '';
  score.textContent = p.quality.score;
  score.className = 'quality-score ' + (p.quality.score >= 85 ? 'high' : p.quality.score >= 60 ? 'mid' : 'low');
  
  // Stats
  stats.style.display = '';
  chars.textContent = p.expandedPrompt.length.toLocaleString();
  words.textContent = p.expandedPrompt.split(/\\s+/).filter(w => w).length.toLocaleString();
  sections.textContent = (p.expandedPrompt.match(/^## /gm) || []).length;
  
  // Enable buttons and update generate button
  copyBtn.disabled = false;
  generateBtn.disabled = false;
  generateBtn.textContent = 'Regenerate';
}

function showEmptyPreview() {
  previewContent.innerHTML = '<div class="preview-empty"><div class="preview-empty-icon"></div><div class="preview-empty-title">Your prompt appears here</div><div class="preview-empty-desc">Type a description and click Generate to create your prompt</div></div>';
  quality.style.display = 'none';
  stats.style.display = 'none';
  copyBtn.disabled = true;
  generateBtn.textContent = 'Generate Prompt';
}

// Context
function updateContext() {
  if (!context) return;
  ctxFramework.textContent = context.framework !== 'unknown' ? context.framework : 'Auto';
  const db = [];
  if (context.hasPrisma) db.push('Prisma');
  if (context.hasSupabase) db.push('Supabase');
  if (context.hasPostgres) db.push('Postgres');
  ctxDb.textContent = db.length ? db.join('+') : 'Auto';
  ctxTs.textContent = context.hasTypeScript ? 'TypeScript' : 'JavaScript';
}

// Buttons
generateBtn.addEventListener('click', () => {
  if (isGenerating) return; // Prevent double-clicks
  
  const tpl = selectedTpl || detectedTpl;
  if (!tpl && input.value.trim().length > 5) {
    // Try to detect a template first
    const det = detectLocal(input.value);
    if (det) {
      detectedTpl = det;
      selectedTpl = det;
      showDetected(det);
      highlightTpl(det.id);
      renderOptions();
    }
  }
  
  if (selectedTpl || detectedTpl) {
    isGenerating = true;
    generateBtn.textContent = 'Generating...';
    generateBtn.disabled = true;
    build();
  } else if (input.value.trim().length <= 5) {
    // Show hint to user
    input.focus();
    input.placeholder = 'Enter at least 6 characters to describe what you want...';
  } else {
    // No template detected but user has input - show helpful message
    showError('Could not detect a template for your input. Try selecting a template from the sidebar or use keywords like "login", "API", "form", etc.');
  }
});
copyBtn.addEventListener('click', () => {
  if (currentPrompt) vscode.postMessage({ command: 'copy', text: currentPrompt });
});

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  // ⌘/Ctrl+Enter to generate
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    generateBtn.click();
  }
  // ⌘/Ctrl+C to copy (when no text selected)
  if ((e.metaKey || e.ctrlKey) && e.key === 'c' && !window.getSelection().toString()) {
    e.preventDefault();
    if (currentPrompt) vscode.postMessage({ command: 'copy', text: currentPrompt });
  }
  // ⌘/Ctrl+K for search
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    searchEl.focus();
  }
});

// Utils
function formatCat(c) { return c.charAt(0).toUpperCase() + c.slice(1).replace(/-/g, ' '); }
function esc(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
</script>
</body>
</html>`;
  }

  public dispose(): void {
    PromptBuilderPanel.currentPanel = undefined;
    this._panel.dispose();
    this._disposables.forEach(d => d.dispose());
  }
}

function getNonce(): string {
  let t = '';
  const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) t += c.charAt(Math.floor(Math.random() * c.length));
  return t;
}
