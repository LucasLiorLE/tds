const dataUrl = "tds.json";
const workflowUrl = "https://github.com/LucasLiorLE/tds/actions/workflows/add.yaml";
const localRowsKey = "tds-local-rows";
const patDraftRowsKey = "tds-pat-drafts";

const elements = {
  totalRecords: document.getElementById("total-records"),
  viewNote: document.getElementById("view-note"),
  status: document.getElementById("status"),
  toggleView: document.getElementById("toggle-view"),
  recordSelect: document.getElementById("record-select"),
  detailTimestamp: document.getElementById("detail-timestamp"),
  detailLevel: document.getElementById("detail-level"),
  detailExp: document.getElementById("detail-exp"),
  chart: document.getElementById("chart"),
  zoomStart: document.getElementById("zoom-start"),
  zoomEnd: document.getElementById("zoom-end"),
  zoomStartLabel: document.getElementById("zoom-start-label"),
  zoomEndLabel: document.getElementById("zoom-end-label"),
  resetZoom: document.getElementById("reset-zoom"),
  expPerDay: document.getElementById("exp-per-day"),
  expGained: document.getElementById("exp-gained"),
  wantedLevel: document.getElementById("wanted-level"),
  estimatedDate: document.getElementById("estimated-date"),
  newLevel: document.getElementById("new-level"),
  newExp: document.getElementById("new-exp"),
  newPassword: document.getElementById("new-password"),
  saveRecord: document.getElementById("save-record"),
  addStatus: document.getElementById("add-status"),
};

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const numberFormatter = new Intl.NumberFormat();
const chartContext = elements.chart.getContext("2d");
const millisecondsPerDay = 24 * 60 * 60 * 1000;

let baseRows = [];
let localRows = [];
let patDraftRows = [];
let rows = [];
let viewMode = "repo";
let selectedIndex = 0;
let zoomStartIndex = 0;
let zoomEndIndex = 0;

function formatDate(timestamp) {
  return dateFormatter.format(new Date(timestamp * 1000));
}

function formatNumber(value) {
  return numberFormatter.format(value);
}

function normalizeRow(row) {
  const level = Number(row.level);
  const exp = Number(row.exp);
  const timestamp = Number(row.timestamp);

  if (!Number.isFinite(level) || !Number.isFinite(exp) || !Number.isFinite(timestamp)) {
    return null;
  }

  return { level, exp, timestamp };
}

function loadStoredRows(storageKey) {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map(normalizeRow).filter(Boolean);
  } catch {
    return [];
  }
}

function saveStoredRows(storageKey, storedRows) {
  localStorage.setItem(storageKey, JSON.stringify(storedRows));
}

function getVisibleRows() {
  if (viewMode === "local") {
    return [...localRows].sort((left, right) => left.timestamp - right.timestamp);
  }

  return [...baseRows, ...patDraftRows].sort((left, right) => left.timestamp - right.timestamp);
}

function requiredExpForLevel(nextLevel) {
  if (nextLevel <= 10) {
    return 45 + nextLevel * 3.5;
  }

  if (nextLevel <= 40) {
    return nextLevel * 8;
  }

  return 260 + nextLevel * 1.5;
}

function totalExpToReachLevel(level) {
  let total = 0;

  for (let nextLevel = 1; nextLevel <= level; nextLevel += 1) {
    total += requiredExpForLevel(nextLevel);
  }

  return total;
}

function absoluteExpAtRow(row) {
  return totalExpToReachLevel(row.level) + row.exp;
}

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const width = elements.chart.clientWidth;
  const height = elements.chart.clientHeight;

  elements.chart.width = Math.max(1, Math.round(width * ratio));
  elements.chart.height = Math.max(1, Math.round(height * ratio));
  chartContext.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function setMessage(message, isError = false) {
  elements.addStatus.textContent = message;
  elements.addStatus.style.color = isError ? "#ff9b9b" : "var(--muted)";
}

function updateViewButton() {
  elements.toggleView.textContent = viewMode === "local" ? "Show repo data" : "Show local data";
  elements.viewNote.textContent =
    viewMode === "local"
      ? "Showing local stuff"
      : "Showing my json data";
}

function clampZoom() {
  if (!rows.length) {
    zoomStartIndex = 0;
    zoomEndIndex = 0;
    elements.zoomStart.value = "0";
    elements.zoomEnd.value = "0";
    elements.zoomStart.max = "0";
    elements.zoomEnd.max = "0";
    elements.zoomStartLabel.textContent = "-";
    elements.zoomEndLabel.textContent = "-";
    return;
  }

  zoomStartIndex = Math.max(0, Math.min(zoomStartIndex, rows.length - 1));
  zoomEndIndex = Math.max(0, Math.min(zoomEndIndex, rows.length - 1));

  if (zoomStartIndex > zoomEndIndex) {
    [zoomStartIndex, zoomEndIndex] = [zoomEndIndex, zoomStartIndex];
  }

  elements.zoomStart.value = String(zoomStartIndex);
  elements.zoomEnd.value = String(zoomEndIndex);
  elements.zoomStart.max = String(rows.length - 1);
  elements.zoomEnd.max = String(rows.length - 1);
  elements.zoomStartLabel.textContent = formatDate(rows[zoomStartIndex].timestamp);
  elements.zoomEndLabel.textContent = formatDate(rows[zoomEndIndex].timestamp);
}

function drawChart() {
  const width = elements.chart.clientWidth;
  const height = elements.chart.clientHeight;
  const padding = { top: 20, right: 20, bottom: 40, left: 56 };
  const visibleRows = rows.slice(zoomStartIndex, zoomEndIndex + 1);

  chartContext.clearRect(0, 0, width, height);
  chartContext.fillStyle = "#10131a";
  chartContext.fillRect(0, 0, width, height);

  if (visibleRows.length < 2) {
    chartContext.fillStyle = "#a2aab8";
    chartContext.font = "14px system-ui, sans-serif";
    chartContext.fillText("Not enough data to draw chart", padding.left, padding.top + 20);
    return;
  }

  const levels = visibleRows.map((row) => row.level);
  const minLevel = Math.min(...levels);
  const maxLevel = Math.max(...levels);
  const levelSpan = Math.max(1, maxLevel - minLevel);
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  chartContext.strokeStyle = "#495264";
  chartContext.lineWidth = 1;
  chartContext.beginPath();
  chartContext.moveTo(padding.left, padding.top);
  chartContext.lineTo(padding.left, height - padding.bottom);
  chartContext.lineTo(width - padding.right, height - padding.bottom);
  chartContext.stroke();

  chartContext.strokeStyle = "#f1f3f5";
  chartContext.lineWidth = 2;
  chartContext.beginPath();

  visibleRows.forEach((row, index) => {
    const x = padding.left + (chartWidth * index) / (visibleRows.length - 1);
    const y = padding.top + chartHeight * (1 - (row.level - minLevel) / levelSpan);

    if (index === 0) {
      chartContext.moveTo(x, y);
    } else {
      chartContext.lineTo(x, y);
    }
  });

  chartContext.stroke();

  chartContext.fillStyle = "#a2aab8";
  chartContext.font = "12px system-ui, sans-serif";
  chartContext.fillText(`Min ${formatNumber(minLevel)}`, padding.left, 14);
  chartContext.fillText(`Max ${formatNumber(maxLevel)}`, padding.left + 96, 14);

  const firstRow = visibleRows[0];
  const lastRow = visibleRows[visibleRows.length - 1];
  const firstLabel = formatDate(firstRow.timestamp);
  const lastLabel = formatDate(lastRow.timestamp);

  chartContext.fillText(firstLabel, padding.left, height - 14);
  chartContext.fillText(lastLabel, width - padding.right - chartContext.measureText(lastLabel).width, height - 14);
}

function updateAnalysis() {
  if (rows.length < 2) {
    elements.expPerDay.textContent = "-";
    elements.expGained.textContent = "-";
    elements.estimatedDate.textContent = "-";
    return;
  }

  const visibleRows = rows.slice(zoomStartIndex, zoomEndIndex + 1);

  if (visibleRows.length < 2) {
    elements.expPerDay.textContent = "-";
    elements.expGained.textContent = "-";
    elements.estimatedDate.textContent = "-";
    return;
  }

  const firstRow = visibleRows[0];
  const lastRow = visibleRows[visibleRows.length - 1];
  const expGained = absoluteExpAtRow(lastRow) - absoluteExpAtRow(firstRow);
  const days = (lastRow.timestamp - firstRow.timestamp) / 86400;
  const expPerDay = days > 0 ? expGained / days : 0;

  elements.expGained.textContent = formatNumber(Math.round(expGained));
  elements.expPerDay.textContent = days > 0 ? `${formatNumber(Number(expPerDay.toFixed(2)))} / day` : "-";

  const wantedLevel = Number(elements.wantedLevel.value);
  const currentRow = rows[selectedIndex];

  if (!Number.isFinite(wantedLevel) || wantedLevel <= 0 || !currentRow) {
    elements.estimatedDate.textContent = "-";
    return;
  }

  const currentAbsoluteExp = absoluteExpAtRow(currentRow);
  const targetAbsoluteExp = totalExpToReachLevel(wantedLevel);
  const remainingExp = targetAbsoluteExp - currentAbsoluteExp;

  if (remainingExp <= 0) {
    elements.estimatedDate.textContent = `Already level ${wantedLevel} or higher`;
    return;
  }

  if (expPerDay <= 0) {
    elements.estimatedDate.textContent = "No progress in selected range";
    return;
  }

  const estimatedDate = new Date(currentRow.timestamp * 1000 + (remainingExp / expPerDay) * millisecondsPerDay);
  elements.estimatedDate.textContent = dateFormatter.format(estimatedDate);
}

function populateSelect() {
  elements.recordSelect.innerHTML = rows
    .map((row, index) => {
      return `<option value="${index}">${formatDate(row.timestamp)} - level ${formatNumber(row.level)}</option>`;
    })
    .join("");
}

function updateDetails(index) {
  const row = rows[index];

  if (!row) {
    elements.detailTimestamp.textContent = "-";
    elements.detailLevel.textContent = "-";
    elements.detailExp.textContent = "-";
    return;
  }

  selectedIndex = index;
  elements.recordSelect.value = String(index);
  elements.detailTimestamp.textContent = formatDate(row.timestamp);
  elements.detailLevel.textContent = formatNumber(row.level);
  elements.detailExp.textContent = formatNumber(row.exp);
}

function refreshView() {
  rows = getVisibleRows();
  populateSelect();
  updateViewButton();

  if (!rows.length) {
    selectedIndex = 0;
    zoomStartIndex = 0;
    zoomEndIndex = 0;
    elements.totalRecords.textContent = "0 records";
    updateDetails(0);
    clampZoom();
    drawChart();
    updateAnalysis();
    return;
  }

  selectedIndex = Math.min(selectedIndex, rows.length - 1);
  zoomStartIndex = 0;
  zoomEndIndex = rows.length - 1;

  elements.totalRecords.textContent = `${formatNumber(rows.length)} records`;
  updateDetails(selectedIndex);
  clampZoom();
  resizeCanvas();
  drawChart();
  updateAnalysis();
}

function setViewMode(nextMode) {
  viewMode = nextMode;
  refreshView();
}

function toggleViewMode() {
  setViewMode(viewMode === "local" ? "repo" : "local");
}

function saveRecord() {
  const level = Number(elements.newLevel.value);
  const exp = Number(elements.newExp.value);
  const password = elements.newPassword.value.trim();

  if (!Number.isFinite(level) || level < 0 || !Number.isFinite(exp) || exp < 0) {
    setMessage("Enter valid level and exp values.", true);
    return;
  }

  const newRow = {
    level: Math.trunc(level),
    exp,
    timestamp: Date.now() / 1000,
  };

  if (!password) {
    localRows = [...localRows, newRow];
    saveStoredRows(localRowsKey, localRows);
    viewMode = "local";
    setMessage("Saved to localstorage and switched to local view.");
  } else {
    patDraftRows = [...patDraftRows, newRow];
    saveStoredRows(patDraftRowsKey, patDraftRows);
    viewMode = "repo";
    setMessage("Saved a PAT draft. The workflow page opened so you can commit it.");
    window.open(workflowUrl, "_blank", "noopener,noreferrer");
  }

  elements.newLevel.value = "";
  elements.newExp.value = "";
  elements.newPassword.value = "";
  refreshView();
}

async function loadData() {
  try {
    const response = await fetch(dataUrl, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const loadedRows = await response.json();

    if (!Array.isArray(loadedRows)) {
      throw new Error("Unexpected JSON shape");
    }

    baseRows = loadedRows.map(normalizeRow).filter(Boolean).sort((left, right) => left.timestamp - right.timestamp);
    localRows = loadStoredRows(localRowsKey);
    patDraftRows = loadStoredRows(patDraftRowsKey);

    elements.status.textContent = `Loaded ${baseRows.length} entries from ${dataUrl}`;
    refreshView();
    setMessage(viewMode === "local" ? "Showing local stuff" : "Showing my json data");
  } catch (error) {
    elements.status.textContent = "Unable to load tds.json";
    elements.totalRecords.textContent = "0 records";
    elements.detailTimestamp.textContent = "-";
    elements.detailLevel.textContent = "-";
    elements.detailExp.textContent = "-";
    chartContext.clearRect(0, 0, elements.chart.clientWidth, elements.chart.clientHeight);
    chartContext.fillStyle = "#a2aab8";
    chartContext.font = "14px system-ui, sans-serif";
    chartContext.fillText(error.message, 20, 30);
  }
}

elements.toggleView.addEventListener("click", toggleViewMode);
elements.recordSelect.addEventListener("change", (event) => {
  updateDetails(Number(event.target.value));
  updateAnalysis();
});
elements.zoomStart.addEventListener("input", (event) => {
  zoomStartIndex = Number(event.target.value);
  clampZoom();
  drawChart();
  updateAnalysis();
});
elements.zoomEnd.addEventListener("input", (event) => {
  zoomEndIndex = Number(event.target.value);
  clampZoom();
  drawChart();
  updateAnalysis();
});
elements.resetZoom.addEventListener("click", () => {
  zoomStartIndex = 0;
  zoomEndIndex = rows.length - 1;
  clampZoom();
  drawChart();
  updateAnalysis();
});
elements.wantedLevel.addEventListener("input", updateAnalysis);
elements.saveRecord.addEventListener("click", saveRecord);

window.addEventListener("resize", () => {
  resizeCanvas();
  drawChart();
});

resizeCanvas();
loadData();
