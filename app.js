/* =========================================================
   ジム通い記録 - フロントエンドロジック
   ========================================================= */

// ★ GAS を「ウェブアプリ」としてデプロイした後に発行される URL をここに設定してください
const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzSywGVmH1bkaeVHCaE7ZpibAbMtqG77qzs8aKH4c7CAqLNJ5-JFwdsNO0m3mucbm4PVA/exec';

const state = {
  monthlyCount: 0,
  goalText: '',
  records: [],       // 過去1年分 {date, weight, walking, walkingMin, swim, swimMin, aero, aeroMin, note}
  recordsByDate: {},
  currentRange: 30,
  editingDate: null,  // フォームが既存日付を編集中なら日付文字列、新規なら null
  chart: null
};

/* ---------- DOM ---------- */
const el = {
  monthlyCount: document.getElementById('monthlyCount'),
  goalText: document.getElementById('goalText'),
  editGoalBtn: document.getElementById('editGoalBtn'),

  dateInput: document.getElementById('dateInput'),
  weightInput: document.getElementById('weightInput'),
  noteInput: document.getElementById('noteInput'),
  entryMode: document.getElementById('entryMode'),

  walkingCheck: document.getElementById('walkingCheck'),
  walkingMin: document.getElementById('walkingMin'),
  swimCheck: document.getElementById('swimCheck'),
  swimMin: document.getElementById('swimMin'),
  aeroCheck: document.getElementById('aeroCheck'),
  aeroMin: document.getElementById('aeroMin'),

  saveBtn: document.getElementById('saveBtn'),
  deleteBtn: document.getElementById('deleteBtn'),

  rangeSwitch: document.getElementById('rangeSwitch'),
  chartCanvas: document.getElementById('weightChart'),
  chartEmpty: document.getElementById('chartEmpty'),

  aiAnalyzeBtn: document.getElementById('aiAnalyzeBtn'),
  aiHint: document.getElementById('aiHint'),
  aiResult: document.getElementById('aiResult'),

  toast: document.getElementById('toast'),
  loadingOverlay: document.getElementById('loadingOverlay')
};

/* ---------- ユーティリティ ---------- */

function showLoading(show) {
  el.loadingOverlay.classList.toggle('is-visible', !!show);
}

function showToast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add('is-visible');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(function () {
    el.toast.classList.remove('is-visible');
  }, 2600);
}

// "2026-07-19"(input[date]) <-> "2026/07/19"(保存形式)
function inputToStoreDate(v) { return v.replaceAll('-', '/'); }
function storeToInputDate(v) { return v.replaceAll('/', '-'); }

function todayInputValue() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

async function callGet(action) {
  const res = await fetch(GAS_WEB_APP_URL + '?action=' + encodeURIComponent(action));
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || '通信エラーが発生しました');
  return json.data;
}

// CORSプリフライトを避けるため text/plain で送信し、GAS側でJSON.parseする
async function callPost(action, body) {
  const res = await fetch(GAS_WEB_APP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ action: action }, body))
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || '通信エラーが発生しました');
  return json.data;
}

/* ---------- 初期化 ---------- */

function populateTimeSelect(selectEl) {
  selectEl.innerHTML = '';
  for (let m = 30; m <= 120; m += 30) {
    const opt = document.createElement('option');
    opt.value = String(m);
    opt.textContent = m + '分';
    selectEl.appendChild(opt);
  }
  selectEl.value = '0';
}

function setupTimeSyncRow(checkboxEl, selectEl) {
  checkboxEl.addEventListener('change', function () {
    if (checkboxEl.checked) {
      selectEl.disabled = false;
      if (selectEl.value === '0') selectEl.value = '30';
    } else {
      selectEl.disabled = true;
      selectEl.value = '0';
    }
  });

  selectEl.addEventListener('change', function () {
    const minutes = Number(selectEl.value);
    if (minutes > 0 && !checkboxEl.checked) {
      checkboxEl.checked = true;
      selectEl.disabled = false;
    }
  });
}

function initForm() {
  [el.walkingMin, el.swimMin, el.aeroMin].forEach(populateTimeSelect);
  setupTimeSyncRow(el.walkingCheck, el.walkingMin);
  setupTimeSyncRow(el.swimCheck, el.swimMin);
  setupTimeSyncRow(el.aeroCheck, el.aeroMin);

  el.dateInput.value = todayInputValue();
  el.dateInput.addEventListener('change', onDateChange);

  el.saveBtn.addEventListener('click', onSave);
  el.deleteBtn.addEventListener('click', onDelete);
  el.editGoalBtn.addEventListener('click', onEditGoal);

  el.rangeSwitch.addEventListener('click', function (e) {
    const btn = e.target.closest('.range-switch__btn');
    if (!btn) return;
    state.currentRange = Number(btn.dataset.range);
    Array.from(el.rangeSwitch.children).forEach(function (b) {
      b.classList.toggle('is-active', b === btn);
    });
    renderChart();
  });

  el.aiAnalyzeBtn.addEventListener('click', onAiAnalyze);
}

async function loadInitData() {
  showLoading(true);
  try {
    const data = await callGet('init');
    applyData(data);
    onDateChange(); // 今日の日付に既存データがあれば読み込む
  } catch (err) {
    showToast('データの読み込みに失敗しました: ' + err.message);
  } finally {
    showLoading(false);
  }
}

function applyData(data) {
  state.monthlyCount = data.monthlyCount || 0;
  state.goalText = data.goalText || '';
  state.records = data.records || [];
  state.recordsByDate = {};
  state.records.forEach(function (r) { state.recordsByDate[r.date] = r; });

  el.monthlyCount.textContent = state.monthlyCount;
  renderGoal();
  renderChart();
  renderAiAvailability();
}

function renderGoal() {
  if (state.goalText) {
    el.goalText.textContent = state.goalText;
    el.goalText.classList.add('is-set');
  } else {
    el.goalText.textContent = 'まだ目標が設定されていません';
    el.goalText.classList.remove('is-set');
  }
}

/* ---------- 目標編集 ---------- */

async function onEditGoal() {
  const input = prompt('目標を入力してください（例：月に2kg減らしたい）', state.goalText || '');
  if (input === null) return; // キャンセル
  showLoading(true);
  try {
    await callPost('saveGoal', { goal: input });
    state.goalText = input;
    renderGoal();
    showToast('目標を保存しました');
  } catch (err) {
    showToast('目標の保存に失敗しました: ' + err.message);
  } finally {
    showLoading(false);
  }
}

/* ---------- 日付選択 → 既存データの読み込み ---------- */

function onDateChange() {
  const dateStr = inputToStoreDate(el.dateInput.value);
  const record = state.recordsByDate[dateStr];

  if (record) {
    state.editingDate = dateStr;
    el.entryMode.textContent = '編集中（既存データあり）';
    el.entryMode.classList.add('is-edit');
    el.deleteBtn.hidden = false;

    el.weightInput.value = record.weight != null ? record.weight : '';
    el.noteInput.value = record.note || '';

    setExerciseUI(el.walkingCheck, el.walkingMin, record.walking, record.walkingMin);
    setExerciseUI(el.swimCheck, el.swimMin, record.swim, record.swimMin);
    setExerciseUI(el.aeroCheck, el.aeroMin, record.aero, record.aeroMin);
  } else {
    state.editingDate = null;
    el.entryMode.textContent = '新規登録';
    el.entryMode.classList.remove('is-edit');
    el.deleteBtn.hidden = true;

    el.weightInput.value = '';
    el.noteInput.value = '';
    setExerciseUI(el.walkingCheck, el.walkingMin, false, 0);
    setExerciseUI(el.swimCheck, el.swimMin, false, 0);
    setExerciseUI(el.aeroCheck, el.aeroMin, false, 0);
  }
}

function setExerciseUI(checkboxEl, selectEl, checked, minutes) {
  checkboxEl.checked = !!checked;
  selectEl.disabled = !checked;
  selectEl.value = String(checked ? (minutes || 0) : 0);
}

/* ---------- 保存・削除 ---------- */

function buildRecordFromForm() {
  const dateStr = inputToStoreDate(el.dateInput.value);
  const weight = parseFloat(el.weightInput.value);

  return {
    date: dateStr,
    weight: isNaN(weight) ? null : Math.round(weight * 100) / 100,
    walking: el.walkingCheck.checked,
    walkingMin: el.walkingCheck.checked ? Number(el.walkingMin.value) : 0,
    swim: el.swimCheck.checked,
    swimMin: el.swimCheck.checked ? Number(el.swimMin.value) : 0,
    aero: el.aeroCheck.checked,
    aeroMin: el.aeroCheck.checked ? Number(el.aeroMin.value) : 0,
    note: el.noteInput.value || ''
  };
}

async function onSave() {
  const record = buildRecordFromForm();

  if (!el.dateInput.value) {
    showToast('日付を選択してください');
    return;
  }
  if (record.weight === null) {
    showToast('体重を入力してください');
    return;
  }

  showLoading(true);
  try {
    const data = await callPost('saveRecord', { record: record });
    applyData(data);
    onDateChange();
    showToast('保存しました');
  } catch (err) {
    showToast('保存に失敗しました: ' + err.message);
  } finally {
    showLoading(false);
  }
}

async function onDelete() {
  if (!state.editingDate) return;
  if (!confirm(state.editingDate + ' の記録を削除しますか？')) return;

  showLoading(true);
  try {
    const data = await callPost('deleteRecord', { date: state.editingDate });
    applyData(data);
    onDateChange();
    showToast('削除しました');
  } catch (err) {
    showToast('削除に失敗しました: ' + err.message);
  } finally {
    showLoading(false);
  }
}

/* ---------- グラフ ---------- */

function renderChart() {
  const days = state.currentRange;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const filtered = state.records.filter(function (r) {
    if (r.weight == null) return false;
    const d = new Date(r.date.replaceAll('/', '-'));
    return d >= cutoff;
  });

  if (filtered.length === 0) {
    el.chartCanvas.parentElement.style.display = 'none';
    el.chartEmpty.hidden = false;
    if (state.chart) { state.chart.destroy(); state.chart = null; }
    return;
  }
  el.chartCanvas.parentElement.style.display = '';
  el.chartEmpty.hidden = true;

  const labels = filtered.map(function (r) { return r.date.slice(5); }); // MM/dd
  const weights = filtered.map(function (r) { return r.weight; });

  const minW = Math.min.apply(null, weights);
  const maxW = Math.max.apply(null, weights);

  if (state.chart) state.chart.destroy();

  state.chart = new Chart(el.chartCanvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: '体重(kg)',
        data: weights,
        borderColor: '#5B8DEF',
        backgroundColor: 'rgba(91,141,239,0.15)',
        pointBackgroundColor: '#5B8DEF',
        pointRadius: 3,
        tension: 0.3,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: { color: '#9AA1B4', maxRotation: 0, autoSkip: true, maxTicksLimit: 6 },
          grid: { color: 'rgba(255,255,255,0.05)' }
        },
        y: {
          min: Math.floor(minW - 2),
          max: Math.ceil(maxW + 2),
          ticks: { color: '#9AA1B4' },
          grid: { color: 'rgba(255,255,255,0.05)' }
        }
      }
    }
  });
  el.chartCanvas.parentElement.style.height = '240px';
}

/* ---------- AI分析 ---------- */

function renderAiAvailability() {
  const enough = state.records.length >= 10;
  el.aiAnalyzeBtn.disabled = !enough;
  el.aiHint.hidden = enough;
  if (!enough) el.aiResult.hidden = true;
}

async function onAiAnalyze() {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 3);
  const recent = state.records.filter(function (r) {
    const d = new Date(r.date.replaceAll('/', '-'));
    return d >= cutoff;
  });

  showLoading(true);
  el.aiAnalyzeBtn.disabled = true;
  try {
    const data = await callPost('aiAnalyze', {
      payload: { goalText: state.goalText, records: recent }
    });
    el.aiResult.hidden = false;
    el.aiResult.textContent = data.analysis;
  } catch (err) {
    showToast('AI分析に失敗しました: ' + err.message);
  } finally {
    showLoading(false);
    el.aiAnalyzeBtn.disabled = false;
  }
}

/* ---------- 起動 ---------- */

initForm();
loadInitData();
