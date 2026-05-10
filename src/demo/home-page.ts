export function homePageHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Rialto - Quote Comparison</title>
  <style>
    :root {
      color: #1f2523;
      background: #eef2ef;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-synthesis: none;
      text-rendering: optimizeLegibility;
      --green: #23764f;
      --green-dark: #1f6b4f;
      --grid-border: #e2e8e4;
      --grid-head: #edf2ef;
      --grid-head-border: #cbd7d0;
      --chrome: #f8faf7;
      --chrome-border: #ccd8d1;
      --text-muted: #66736d;
      --orange: #fa6b04;
      --orange-bg: #fff0d9;
      --warning-bg: #ffe3df;
      --source-bg: #e4f2ec;
    }

    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body { margin: 0; min-width: 320px; min-height: 100vh; overflow: hidden; }
    button, input, textarea { font: inherit; }
    button {
      border: 1px solid #b8c8bf;
      background: #ffffff;
      color: #1d3029;
      cursor: pointer;
    }
    button:disabled { cursor: not-allowed; opacity: .6; }

    .app {
      height: 100vh;
      display: grid;
      grid-template-rows: 58px 48px minmax(0, 1fr) 38px;
      overflow: hidden;
      background: #ffffff;
    }

    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 0 18px;
      background: var(--chrome);
      border-bottom: 1px solid var(--chrome-border);
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 11px;
      min-width: 0;
    }

    .brand img {
      width: 30px;
      height: 30px;
      object-fit: contain;
    }

    .brand div { display: grid; gap: 1px; min-width: 0; }
    .brand strong { font-size: 15px; white-space: nowrap; }
    .brand span {
      color: var(--text-muted);
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      overflow-x: auto;
    }

    .toolbar button,
    .quick-actions button,
    .icon-button {
      height: 32px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      padding: 0 11px;
      border-radius: 5px;
      white-space: nowrap;
    }

    .toolbar button:hover,
    .quick-actions button:hover,
    .icon-button:hover { background: #edf4ef; }

    .toolbar .primary {
      background: var(--green);
      color: #ffffff;
      border-color: var(--green);
      font-weight: 700;
    }

    .ribbon {
      display: flex;
      align-items: center;
      gap: 22px;
      padding: 0 18px;
      background: #ffffff;
      border-bottom: 1px solid var(--chrome-border);
      overflow-x: auto;
    }

    .ribbon-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 700;
      color: #27463a;
      white-space: nowrap;
    }

    .metric {
      display: flex;
      align-items: baseline;
      gap: 7px;
      white-space: nowrap;
    }

    .metric strong {
      color: #255f4b;
      font-size: 14px;
      max-width: 240px;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .metric span {
      color: var(--text-muted);
      font-size: 12px;
    }

    .workspace {
      position: relative;
      min-height: 0;
      overflow: hidden;
      background: #ffffff;
    }

    .sheet-shell {
      height: 100%;
      display: grid;
      grid-template-rows: 38px minmax(0, 1fr);
      background: #ffffff;
    }

    .formula-bar {
      display: grid;
      grid-template-columns: 88px 36px minmax(0, 1fr);
      align-items: center;
      border-bottom: 1px solid #d4ddd8;
      background: var(--chrome);
    }

    .name-box,
    .fx {
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      border-right: 1px solid #d4ddd8;
      color: #51635b;
      font-size: 12px;
    }

    .fx {
      font-style: italic;
      font-weight: 700;
    }

    .formula-bar input {
      height: 100%;
      border: 0;
      padding: 0 12px;
      outline: none;
      background: #ffffff;
    }

    .grid-wrap { overflow: auto; }

    .spreadsheet {
      border-collapse: separate;
      border-spacing: 0;
      min-width: 1280px;
      width: max-content;
    }

    .spreadsheet th {
      position: sticky;
      top: 0;
      z-index: 2;
      height: 28px;
      min-width: 112px;
      padding: 0 6px;
      border-right: 1px solid #d8e0db;
      border-bottom: 1px solid var(--grid-head-border);
      background: var(--grid-head);
      color: #51635b;
      font-size: 12px;
      font-weight: 650;
      text-align: center;
    }

    .spreadsheet .corner {
      left: 0;
      z-index: 4;
      min-width: 46px;
      width: 46px;
    }

    .spreadsheet .row-head {
      position: sticky;
      left: 0;
      z-index: 1;
      min-width: 46px;
      width: 46px;
      background: var(--grid-head);
    }

    .spreadsheet td {
      height: 30px;
      min-width: 112px;
      max-width: 230px;
      padding: 0;
      border-right: 1px solid var(--grid-border);
      border-bottom: 1px solid var(--grid-border);
      background: #ffffff;
    }

    .spreadsheet td:nth-child(3) { min-width: 250px; }
    .spreadsheet td:nth-child(6),
    .spreadsheet td:nth-child(7),
    .spreadsheet td:nth-child(8) { min-width: 150px; }
    .spreadsheet td.money input { text-align: right; font-variant-numeric: tabular-nums; }

    .spreadsheet td input {
      width: 100%;
      height: 100%;
      border: 0;
      outline: none;
      padding: 0 7px;
      background: transparent;
      color: #1f2523;
      font-size: 13px;
    }

    .spreadsheet td.cell-header {
      background: #f3f6f4;
      font-weight: 700;
    }

    .spreadsheet td.cell-ai { background: var(--orange-bg); }
    .spreadsheet td.cell-warning { background: var(--warning-bg); }
    .spreadsheet td.cell-source { background: var(--source-bg); }
    .spreadsheet td.cell-good { background: #e4f2ec; }

    .spreadsheet td.cell-selected {
      box-shadow: inset 0 0 0 2px var(--green);
    }

    .spreadsheet td.cell-selected input {
      color: #10251d;
    }

    .sheet-tabs {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 0 12px;
      background: #f7faf8;
      border-top: 1px solid var(--chrome-border);
    }

    .sheet-tabs button {
      height: 28px;
      min-width: 88px;
      padding: 0 14px;
      border-radius: 5px 5px 0 0;
      border-bottom: 0;
      background: #e8eee9;
      color: #3f4f48;
    }

    .sheet-tabs button.active {
      background: #ffffff;
      color: var(--green-dark);
      font-weight: 700;
    }

    .assistant {
      position: fixed;
      left: 50%;
      bottom: 48px;
      z-index: 10;
      width: min(820px, calc(100vw - 32px));
      transform: translateX(-50%);
    }

    .assistant-log {
      position: absolute;
      left: 56px;
      right: 0;
      bottom: calc(100% + 12px);
      max-height: min(260px, 34vh);
      display: none;
      overflow: auto;
      padding: 16px;
      border: 1px solid rgba(255, 255, 255, .55);
      border-radius: 16px;
      background: rgba(255, 255, 255, .78);
      backdrop-filter: blur(20px) saturate(1.4);
      box-shadow: 0 18px 48px rgba(32, 44, 39, .16);
      -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 16%);
      mask-image: linear-gradient(to bottom, transparent 0%, black 16%);
    }

    .assistant.open .assistant-log { display: block; }

    .quick-actions {
      position: absolute;
      left: 56px;
      right: 0;
      bottom: calc(100% + 8px);
      display: none;
      gap: 6px;
      overflow-x: auto;
      padding-bottom: 4px;
    }

    .assistant:not(.open) .quick-actions { display: flex; }
    .quick-actions button {
      flex: 0 0 auto;
      height: 30px;
      padding: 0 11px;
      border-radius: 999px;
      border-color: rgba(250, 107, 4, .35);
      background: rgba(255, 255, 255, .92);
      color: #384a42;
      font-size: 12px;
      box-shadow: 0 8px 24px rgba(32, 44, 39, .08);
    }

    .message {
      width: fit-content;
      max-width: 75%;
      margin: 8px 0;
      padding: 9px 10px;
      border-radius: 16px;
      color: #ffffff;
      font-size: 13px;
      line-height: 1.35;
      white-space: pre-wrap;
      box-shadow: 0 12px 28px rgba(30, 58, 47, .16);
    }

    .message.agent {
      background: var(--orange);
    }

    .message.user {
      margin-left: auto;
      background: #1e3a2f;
    }

    .assistant-compose {
      position: relative;
      display: flex;
      height: 48px;
      align-items: center;
      gap: 8px;
    }

    .assistant-orb {
      width: 48px;
      height: 48px;
      flex: 0 0 auto;
      display: grid;
      place-items: center;
      border: 0;
      border-radius: 999px;
      background: var(--orange);
      color: #ffffff;
      font-weight: 900;
      box-shadow: 0 18px 38px rgba(250, 107, 4, .22);
    }

    .assistant-bar {
      height: 48px;
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 8px 0 12px;
      border: 1.5px solid var(--orange);
      border-radius: 999px;
      background: #ffffff;
      box-shadow: 0 18px 38px rgba(30, 58, 47, .16);
    }

    .assistant-bar input {
      flex: 1;
      min-width: 0;
      height: 100%;
      border: 0;
      outline: 0;
      color: #1e3a2f;
      font-size: 13px;
    }

    .circle-btn {
      width: 34px;
      height: 34px;
      padding: 0;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: #8a9e96;
      font-weight: 900;
    }

    .send-button {
      height: 34px;
      padding: 0 18px;
      border: 0;
      border-radius: 999px;
      background: #1e3a2f;
      color: #ffffff;
      font-size: 13px;
      font-weight: 800;
    }

    .output-drawer {
      position: fixed;
      left: 18px;
      bottom: 52px;
      z-index: 9;
      width: min(520px, calc(100vw - 28px));
      max-height: min(460px, calc(100vh - 130px));
      display: none;
      border: 1px solid #b7c9c0;
      border-radius: 8px;
      background: #ffffff;
      box-shadow: 0 15px 38px rgba(32, 44, 39, .16);
      overflow: hidden;
    }

    .output-drawer.open { display: grid; grid-template-rows: 42px minmax(0, 1fr); }
    .output-drawer header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 12px;
      border-bottom: 1px solid #d5dfda;
      background: #f8faf7;
    }
    .output-drawer pre {
      margin: 0;
      padding: 12px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
      font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      color: #173126;
    }

    .hidden-input { display: none; }

    @media (max-width: 760px) {
      .app { grid-template-rows: auto auto minmax(0, 1fr) 38px; }
      .topbar { align-items: flex-start; flex-direction: column; padding: 10px 12px; }
      .toolbar { width: 100%; }
      .ribbon { gap: 14px; padding: 8px 12px; }
      .assistant {
        left: 8px;
        right: 8px;
        bottom: 46px;
        width: auto;
        transform: none;
      }
      .output-drawer {
        left: 8px;
        bottom: 46px;
        width: calc(100vw - 16px);
      }
    }
  </style>
</head>
<body>
  <main class="app">
    <input class="hidden-input" id="chatFileInput" type="file" accept=".pdf,.xlsx,.csv,.tsv,.txt,.docx" />
    <header class="topbar">
      <div class="brand">
        <img src="/assets/Rialto_Icon_CLEAR.png" alt="" />
        <div>
          <strong>Rialto Quote Comparison</strong>
          <span>Door Hardware Package - Riverton Commons Office Park.xlsx</span>
        </div>
      </div>
      <div class="toolbar" aria-label="Workbook tools">
        <button type="button" id="evalComparison">Evaluate</button>
        <button type="button" id="analyzeSheet">Analyze partial quotes</button>
        <button type="button" id="extractSample">Import file</button>
        <button type="button" class="primary" id="runAgent">Ask Rialto</button>
      </div>
    </header>

    <section class="ribbon" aria-label="Analysis summary">
      <div class="ribbon-title">
        <span>▦</span>
        <span>Bid Comparison</span>
      </div>
      <div class="metric"><strong id="vendorCount">3</strong><span>vendors</span></div>
      <div class="metric"><strong id="missingQuotes">2</strong><span>missing quotes</span></div>
      <div class="metric"><strong id="lowestComplete">Acme Supply</strong><span>lowest complete</span></div>
      <div class="metric"><strong id="selectedTotal">$49,855</strong><span>selected priced total</span></div>
      <div class="metric"><strong id="packageState">Unresolved</strong><span>package state</span></div>
    </section>

    <div class="workspace">
      <section class="sheet-shell" aria-label="Quote comparison workbook">
        <div class="formula-bar">
          <div class="name-box" id="nameBox">A1</div>
          <div class="fx">fx</div>
          <input id="formulaInput" aria-label="Formula bar" value="Item" />
        </div>
        <div class="grid-wrap">
          <table class="spreadsheet" id="sheet"></table>
        </div>
      </section>
    </div>

    <nav class="sheet-tabs" aria-label="Sheet tabs">
      <button type="button" class="active">Bid Comparison</button>
      <button type="button">Vendor Sources</button>
      <button type="button">Review Log</button>
      <button type="button">+</button>
    </nav>

    <section class="assistant" id="assistant" aria-label="Rialto assistant">
      <div class="quick-actions">
        <button type="button" data-prompt="highlight the lowest complete comparable quote in the comparison sheet">Highlight lowest complete</button>
        <button type="button" data-prompt="explain which quotes are partial and why">Explain partials</button>
        <button type="button" data-prompt="draft an email to Acme Supply for the Door Hardware Package">Draft email</button>
      </div>
      <div class="assistant-log" id="assistantLog">
        <div class="message agent">I can review the quote comparison, call out partial totals, and keep edits visible in the sheet.</div>
      </div>
      <form class="assistant-compose" id="agentForm">
        <button class="assistant-orb" id="toggleAssistant" type="button" aria-label="Toggle Rialto assistant">R</button>
        <div class="assistant-bar">
          <button type="button" class="circle-btn" id="extractFromChat" title="Extract sample CSV">+</button>
          <input id="prompt" aria-label="Ask Rialto Agent" value="highlight the lowest complete comparable quote in the comparison sheet" />
          <button class="send-button" type="submit">Send</button>
        </div>
      </form>
    </section>

    <section class="output-drawer" id="outputDrawer" aria-label="Backend output">
      <header>
        <strong>Backend Output</strong>
        <button class="icon-button" id="closeOutput" type="button" aria-label="Close output">×</button>
      </header>
      <pre id="output">Ready.</pre>
    </section>
  </main>

  <script>
    const user = { id:'u1', contractorOrganizationId:'org1', role:'estimator', name:'Tomasz', email:'tomasz@example.com' };
    const output = document.getElementById('output');
    const outputDrawer = document.getElementById('outputDrawer');
    const assistant = document.getElementById('assistant');
    const log = document.getElementById('assistantLog');
    const prompt = document.getElementById('prompt');
    const chatFileInput = document.getElementById('chatFileInput');
    const formulaInput = document.getElementById('formulaInput');
    const nameBox = document.getElementById('nameBox');
    const sheetEl = document.getElementById('sheet');

    const MIN_ROWS = 30;
    const MIN_COLS = 14;
    let selected = { row: 0, col: 0 };
    const highlights = {
      '0:0': 'header', '0:1': 'header', '0:2': 'header', '0:3': 'header', '0:4': 'header', '0:5': 'header', '0:6': 'header', '0:7': 'header', '0:8': 'header', '0:9': 'header',
      '1:5': 'warning', '1:6': 'warning',
      '2:4': 'source', '2:5': 'warning',
      '3:6': 'warning',
      '6:5': 'warning',
      '8:6': 'warning',
      '11:6': 'warning',
      '13:4': 'good', '13:5': 'warning', '13:6': 'warning', '13:7': 'ai', '13:8': 'warning',
    };
    const notes = {
      '1:5': 'Normalized from 50 EA to requested 100 EA.',
      '1:6': 'Vendor quoted 120 EA; accepted vendor quantity differs from request.',
      '2:5': 'Explicit no-bid from vendor.',
      '3:6': 'Blank or missing quote value.',
      '6:5': 'Cannot supply panic exit devices.',
      '8:6': 'Blank or missing weatherstripping value.',
      '11:6': 'Explicit no-bid for accessory kits.',
      '13:5': 'Lower partial total, not complete.',
      '13:6': 'Partial total, missing multiple lines.',
      '13:7': 'Selected priced total across line-level choices; closers remain deferred.',
    };
    let data = ensureGrid([
      ['Item', 'Description', 'Quantity', 'Unit', 'Acme Supply', 'BuildPro Materials', 'Northstar Hardware', 'Selection', 'Status', 'Notes'],
      ['DOOR-HW', 'Door hardware set', '100', 'EA', '$8,200', '$7,400', '$9,480', 'BuildPro', 'Review', 'BuildPro normalized up from 50 EA; Northstar quoted 120 EA.'],
      ['FRAME-HM', 'Hollow metal frames', '40', 'EA', '$5,800', 'No bid', '$6,080', 'Acme', 'Selected', 'BuildPro explicitly declined this line.'],
      ['CLOSER', 'Door closers', '60', 'EA', '$3,660', '$3,480', 'Missing', 'Deferred', 'Open', 'Northstar missing quote value.'],
      ['LOCK-CL', 'Classroom locksets', '95', 'EA', '$12,160', '$11,495', '$12,540', 'BuildPro', 'Selected', 'BuildPro is lower and complete on this line.'],
      ['HINGE-BB', 'Ball bearing hinges', '320', 'EA', '$3,040', '$2,800', '$2,960', 'BuildPro', 'Selected', 'All vendors quoted requested quantity.'],
      ['PANIC-ED', 'Panic exit devices', '18', 'EA', '$7,380', 'Cannot supply', '$7,110', 'Northstar', 'Selected', 'BuildPro excluded panic hardware from scope.'],
      ['THRESH-AL', 'Aluminum thresholds', '42', 'EA', '$1,512', '$1,428', '$1,638', 'BuildPro', 'Selected', 'Lowest complete line quote selected.'],
      ['WTHR-LF', 'Weatherstripping sets', '240', 'LF', '$1,392', '$1,308', 'Missing', 'Acme', 'Selected', 'Northstar did not include weatherstripping.'],
      ['KICK-SS', 'Stainless kick plates', '55', 'EA', '$2,640', '$2,475', '$2,585', 'BuildPro', 'Selected', 'No review issue.'],
      ['STOP-W', 'Wall stops', '110', 'EA', '$798', '$765', '$825', 'BuildPro', 'Selected', 'Rounded from unit pricing.'],
      ['BATH-ACC', 'Bathroom accessory kits', '12', 'SET', '$7,440', '$7,080', 'No bid', 'Acme', 'Selected', 'Northstar explicitly declined accessory kits.'],
      ['KEY-LS', 'Master keying allowance', '1', 'LS', '$1,850', '$2,100', '$1,750', 'Northstar', 'Selected', 'Allowance captured as lump sum.'],
      ['', 'Vendor total', '', '', '$55,872', '$40,331', '$44,968', '$49,855', 'Unresolved', 'Partial vendor totals cannot beat complete quotes; closers remain deferred.'],
      ['', '', '', '', '', '', '', '', '', ''],
      ['Review flag', 'Lowest complete comparable quote', '', '', 'TRUE', '', '', '', '', 'Acme is the only complete comparable quote.'],
      ['Review flag', 'Lower partial total', '', '', '', 'TRUE', 'TRUE', '', '', 'Partial totals remain visible but caveated.'],
    ]);

    function ensureGrid(rows) {
      const width = Math.max(MIN_COLS, rows.reduce((max, row) => Math.max(max, row.length), 0));
      const height = Math.max(MIN_ROWS, rows.length);
      return Array.from({ length: height }, (_, row) =>
        Array.from({ length: width }, (_, col) => rows[row] && rows[row][col] ? rows[row][col] : '')
      );
    }

    function columnName(index) {
      let name = '';
      let n = index + 1;
      while (n > 0) {
        const remainder = (n - 1) % 26;
        name = String.fromCharCode(65 + remainder) + name;
        n = Math.floor((n - 1) / 26);
      }
      return name;
    }

    function cellKey(row, col) {
      return String(row) + ':' + String(col);
    }

    function show(value) {
      output.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
      outputDrawer.classList.add('open');
    }

    function say(role, text) {
      const div = document.createElement('div');
      div.className = 'message ' + role;
      div.textContent = text;
      log.appendChild(div);
      log.scrollTop = log.scrollHeight;
    }

    function updateFormulaBar() {
      nameBox.textContent = columnName(selected.col) + String(selected.row + 1);
      formulaInput.value = data[selected.row][selected.col] || '';
    }

    function selectCell(row, col) {
      selected = { row, col };
      updateFormulaBar();
      renderSheet();
    }

    function setCell(row, col, value, markAi) {
      data[row][col] = value;
      if (markAi) highlights[cellKey(row, col)] = 'ai';
      updateFormulaBar();
      renderSheet();
    }

    function isMoneyColumn(col) {
      return col >= 4 && col <= 7;
    }

    function renderSheet() {
      const columnCount = data[0].length;
      let html = '<thead><tr><th class="corner"></th>';
      for (let col = 0; col < columnCount; col += 1) html += '<th>' + columnName(col) + '</th>';
      html += '</tr></thead><tbody>';

      for (let row = 0; row < data.length; row += 1) {
        html += '<tr><th class="row-head">' + String(row + 1) + '</th>';
        for (let col = 0; col < columnCount; col += 1) {
          const key = cellKey(row, col);
          const selectedClass = selected.row === row && selected.col === col ? ' cell-selected' : '';
          const highlightClass = highlights[key] ? ' cell-' + highlights[key] : '';
          const moneyClass = isMoneyColumn(col) ? ' money' : '';
          const title = notes[key] ? notes[key].replace(/"/g, '&quot;') : '';
          html += '<td class="' + (highlightClass + selectedClass + moneyClass).trim() + '" title="' + title + '">';
          html += '<input aria-label="' + columnName(col) + String(row + 1) + '" value="' + String(data[row][col]).replace(/"/g, '&quot;') + '" data-row="' + row + '" data-col="' + col + '" />';
          html += '</td>';
        }
        html += '</tr>';
      }
      html += '</tbody>';
      sheetEl.innerHTML = html;
      sheetEl.querySelectorAll('input').forEach((input) => {
        input.addEventListener('focus', (event) => selectCell(Number(event.target.dataset.row), Number(event.target.dataset.col)));
        input.addEventListener('input', (event) => {
          const row = Number(event.target.dataset.row);
          const col = Number(event.target.dataset.col);
          data[row][col] = event.target.value;
          if (selected.row === row && selected.col === col) formulaInput.value = event.target.value;
        });
      });
    }

    async function getJson(url, options) {
      const res = await fetch(url, options);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || res.statusText);
      return json;
    }

    async function evaluateComparison(revealOutput) {
      const json = await getJson('/demo/comparison/evaluate');
      document.getElementById('vendorCount').textContent = String(json.vendors.length);
      document.getElementById('missingQuotes').textContent = String(json.vendors.reduce((sum, vendor) => sum + vendor.missingLineItemIds.length, 0));
      document.getElementById('lowestComplete').textContent = json.lowestCompleteComparableQuote ? json.lowestCompleteComparableQuote.vendorName : 'None';
      document.getElementById('selectedTotal').textContent = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(json.selectedPackageTotal.total);
      document.getElementById('packageState').textContent = json.selectedPackageTotal.resolved ? 'Resolved with caveats' : 'Unresolved';
      if (revealOutput) show(json);
    }

    function analyzeSheet(revealOutput) {
      highlights['13:4'] = 'good';
      highlights['13:5'] = 'warning';
      highlights['13:6'] = 'warning';
      highlights['15:4'] = 'source';
      highlights['16:5'] = 'warning';
      highlights['16:6'] = 'warning';
      setCell(15, 4, 'TRUE', false);
      setCell(16, 5, 'TRUE', false);
      setCell(16, 6, 'TRUE', false);
      say('agent', 'I marked Acme as the lowest complete comparable quote and kept the lower BuildPro and Northstar totals flagged as partial.');
      if (revealOutput) show('Analysis applied to the workbook view.');
    }

    async function runAgent(message) {
      const cleanMessage = message.trim();
      if (!cleanMessage) return;
      assistant.classList.add('open');
      prompt.value = '';
      say('user', cleanMessage);
      const json = await getJson('/agent/turn', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user, messages: [{ role: 'user', content: cleanMessage }] }),
      });
      say('agent', json.reply);
      if (cleanMessage.toLowerCase().includes('highlight') || cleanMessage.toLowerCase().includes('partial')) analyzeSheet(false);
    }

    function moneyValue(value) {
      const number = Number(String(value).replace(/[$,]/g, ''));
      return Number.isFinite(number) ? number : 0;
    }

    function parseExtractedQuoteRows(text) {
      const rows = [];
      const lines = text.split('\\n').map(line => line.replace(/\\s+/g, ' ').trim()).filter(Boolean);
      const itemPattern = /^(\\d+)\\s+([A-Z0-9][A-Z0-9.\\-/]*)\\s+(.+?)\\s+(-?\\d[\\d,]*\\.\\d{2})\\s+([A-Za-z]+)\\s+(-?\\d[\\d,]*\\.\\d{3}|\\d[\\d,]*\\.\\d{2}|\\d[\\d,]*)\\s+(?:\\d[\\d,]*\\.\\d{2}\\s+)?([A-Za-z]+)\\s+\\$?(-?[\\d,]+\\.\\d{2})$/;
      for (const line of lines) {
        const match = line.match(itemPattern);
        if (!match) continue;
        rows.push({
          item: match[2].trim(),
          description: match[3].trim(),
          quantity: match[4].replace(/,/g, ''),
          unit: match[5],
          pricePer: '$' + match[6],
          total: (match[8].startsWith('-') ? '-$' + match[8].slice(1) : '$' + match[8]),
        });
        if (rows.length >= 22) break;
      }
      return rows;
    }

    function loadExtractedRowsIntoSheet(filename, extractedText) {
      const rows = parseExtractedQuoteRows(extractedText);
      if (!rows.length) {
        say('agent', 'I extracted text from ' + filename + ', but I could not confidently shape line items into the sheet yet.');
        return;
      }

      const supplierMatch = extractedText.match(/Supplier:\\s*([^\\n]+)/);
      const total = rows.reduce((sum, row) => sum + moneyValue(row.total), 0);
      const vendorName = supplierMatch ? supplierMatch[1].replace(/\\s+Expected Delivery Date:.*/, '').trim() : 'Imported Vendor';
      data = ensureGrid([
        ['Item', 'Description', 'Quantity', 'Unit', vendorName, 'Price Per', 'Selection', 'Status', 'Notes'],
        ...rows.map(row => [
          row.item,
          row.description,
          row.quantity,
          row.unit,
          row.total,
          row.pricePer + ' / ' + row.unit,
          '',
          'Imported',
          filename,
        ]),
        ['', 'Imported visible subtotal', '', '', new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(total), '', '', 'Review', 'First ' + rows.length + ' confidently parsed lines from source PDF.'],
      ]);
      Object.keys(highlights).forEach(key => delete highlights[key]);
      Object.keys(notes).forEach(key => delete notes[key]);
      for (let col = 0; col < data[0].length; col += 1) highlights[cellKey(0, col)] = 'header';
      for (let row = 1; row <= rows.length; row += 1) highlights[cellKey(row, 4)] = 'source';
      highlights[cellKey(rows.length + 1, 4)] = 'ai';
      document.getElementById('vendorCount').textContent = '1';
      document.getElementById('missingQuotes').textContent = '0';
      document.getElementById('lowestComplete').textContent = vendorName;
      document.getElementById('selectedTotal').textContent = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(total);
      document.getElementById('packageState').textContent = 'Imported for review';
      selectCell(0, 0);
      say('agent', 'Imported ' + rows.length + ' line items from ' + filename + ' into the workbook. I used the existing offline document extractor, then shaped the confident rows into editable cells.');
    }

    async function extractFile(file, revealOutput) {
      if (!file) return;
      assistant.classList.add('open');
      say('user', 'Import ' + file.name);
      const form = new FormData();
      form.append('file', file);
      const json = await fetch('/tools/document/extract', { method:'POST', headers:{ 'x-rialto-user': JSON.stringify(user) }, body: form }).then(r => r.json());
      const extracted = json.data || json;
      if (extracted.text) loadExtractedRowsIntoSheet(file.name, extracted.text);
      else say('agent', 'I tried to import ' + file.name + ', but the extractor did not return usable text.');
      if (revealOutput) show(json);
    }

    async function extractSample(revealOutput) {
      const file = new File(['Description,Qty,Unit\\nDoor hardware set,100,EA\\nHollow metal frames,40,EA'], 'sample-takeoff.csv', { type: 'text/csv' });
      await extractFile(file, revealOutput);
    }

    formulaInput.addEventListener('input', (event) => setCell(selected.row, selected.col, event.target.value, false));
    document.getElementById('toggleAssistant').onclick = () => assistant.classList.toggle('open');
    document.getElementById('closeOutput').onclick = () => outputDrawer.classList.remove('open');
    document.getElementById('evalComparison').onclick = () => evaluateComparison(true).catch(err => show(err.message));
    document.getElementById('analyzeSheet').onclick = () => analyzeSheet(true);
    document.getElementById('extractSample').onclick = () => chatFileInput.click();
    document.getElementById('extractFromChat').onclick = () => {
      assistant.classList.add('open');
      chatFileInput.click();
    };
    chatFileInput.onchange = () => {
      const file = chatFileInput.files && chatFileInput.files[0];
      extractFile(file, false).catch(err => show(err.message));
      chatFileInput.value = '';
    };
    document.getElementById('runAgent').onclick = () => runAgent(prompt.value).catch(err => show(err.message));
    document.getElementById('agentForm').onsubmit = event => { event.preventDefault(); runAgent(prompt.value).catch(err => show(err.message)); };
    document.querySelectorAll('[data-prompt]').forEach((button) => {
      button.addEventListener('click', () => {
        prompt.value = button.dataset.prompt;
        runAgent(prompt.value).catch(err => show(err.message));
      });
    });

    renderSheet();
    updateFormulaBar();
    evaluateComparison(false).catch(err => show(err.message));
  </script>
</body>
</html>`
}
