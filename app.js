let SCHEDULES = null;
let lookupReady = false;
let lookupSearchMode = "hs";
let selectedScheduleKey = "first_schedule_customs_tariffs";
let currentLookupRecord = null;

window.SCHEDULES = null;

init();

function normalizeTariffData(rawData) {
  if (!rawData) return null;

  const sourceSchedules = rawData.schedules && typeof rawData.schedules === "object" ? rawData.schedules : rawData;
  const normalized = {};

  Object.entries(sourceSchedules).forEach(([key, schedule]) => {
    const rawItems = Array.isArray(schedule?.items) ? schedule.items : [];
    const records = rawItems
      .filter((item) => item && (item?.type === "item" || item?.hs_code || item?.description || item?.subheading))
      .map((item) => {
        const isEighthSchedule = key === "eighth_schedule_industrial_rebates";
        const rates = item?.rates || {};
        return {
          subheading: item.hs_code || item.subheading || "",
          description: item.description || "",
          heading: item.heading_code || item.category || "",
          headingDesc: item.chapter_title || item.category || "",
          chapter: item.chapter || "",
          dutyGeneral: isEighthSchedule ? rates.duty_rate || null : (rates.general_rate || null),
          dutyPreferential: isEighthSchedule ? null : (rates.column6_rate || null),
          comesa: isEighthSchedule ? null : (rates.comesa_rate || null),
          afcfta: isEighthSchedule ? null : (rates.afcfta_rate || null),
          sadcOther: isEighthSchedule ? null : (rates.sadc_rate || null),
          sadcSa: isEighthSchedule ? null : (rates.sadc_rsa_rate || null),
          excise: rates.excise_rate || null,
          vat: rates.vat_rate || null,
          ait: rates.ait_rate || null,
          raw: item
        };
      });

    normalized[key] = {
      ...schedule,
      schedule: schedule?.title || schedule?.schedule || key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
      records
    };
  });

  return normalized;
}

function getScheduleRecords(scheduleKey) {
  return Array.isArray(SCHEDULES?.[scheduleKey]?.records) ? SCHEDULES[scheduleKey].records : [];
}

async function init() {
  try {
    const res = await fetch("malawi_customs_excise_tariffs_2025-2027.json");
    const data = await res.json();
    SCHEDULES = normalizeTariffData(data);
    window.SCHEDULES = SCHEDULES;
    lookupReady = true;
    const button = document.getElementById("lookup-search-button");
    if (button) button.disabled = false;
    initLookup();
  } catch (error) {
    console.error("Failed to load tariff schedules", error);
    const resultsEl = document.getElementById("lookup-results");
    if (resultsEl) {
      resultsEl.innerHTML = '<div class="lookup-empty">Unable to load tariff data.</div>';
    }
  }
}

function cleanDigits(s) {
  return (s || "").replace(/[^\d]/g, "");
}

function headingCodeMatches(code, querySubDigits) {
  if (!code) return false;
  if (code.includes("-")) {
    const [startRaw, endRaw] = code.split("-");
    const startNum = parseInt(cleanDigits(startRaw).padEnd(4, "0").slice(0, 4), 10);
    const endNum = parseInt(cleanDigits(endRaw).padEnd(4, "0").slice(0, 4), 10);
    const qNum = parseInt(querySubDigits.padEnd(4, "0").slice(0, 4), 10);
    return qNum >= startNum && qNum <= endNum;
  }
  const clean = cleanDigits(code.replace(/^ex\s*/i, ""));
  return clean.length > 0 && querySubDigits.startsWith(clean);
}

function initLookup() {
  const input = document.getElementById("lookup-input");
  const button = document.getElementById("lookup-search-button");
  const resultsEl = document.getElementById("lookup-results");
  const detailEl = document.getElementById("lookup-detail");
  const modeButtons = Array.from(document.querySelectorAll(".lookup-mode-toggle button"));
  const scheduleSelect = document.getElementById("lookup-schedule-select");
  const clearRecentButton = document.getElementById("clear-recent-searches");
  const clearBookmarksButton = document.getElementById("clear-bookmarks");

  const applyModeState = () => {
    modeButtons.forEach((btn) => {
      const active = btn.dataset.mode === lookupSearchMode;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  };

  const syncLookupControls = () => {
    applyModeState();
    if (scheduleSelect) {
      scheduleSelect.value = selectedScheduleKey;
    }
  };

  modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      lookupSearchMode = btn.dataset.mode;
      syncLookupControls();
      performLookup(input.value);
    });
  });

  if (scheduleSelect) {
    populateScheduleOptions(scheduleSelect);
    scheduleSelect.addEventListener("change", () => {
      selectedScheduleKey = scheduleSelect.value;
      syncLookupControls();
      performLookup(input.value);
    });
  }

  const performLookup = (value = input.value) => {
    if (!lookupReady || !SCHEDULES) {
      resultsEl.innerHTML = '<div class="lookup-empty">Loading tariff data…</div>';
      return;
    }
    if (detailEl) detailEl.innerHTML = "";
    runLookupSearch(value);
  };

  input.addEventListener("input", debounce(() => performLookup(), 150));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      performLookup();
    }
  });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    performLookup();
  });
  button.disabled = true;
  clearRecentButton?.addEventListener("click", () => {
    saveRecentSearches([]);
    renderQuickAccess();
  });
  clearBookmarksButton?.addEventListener("click", () => {
    saveBookmarkedCodes([]);
    renderQuickAccess();
  });
  syncLookupControls();
  renderQuickAccess();
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function jumpToLookup(hsCode) {
  const input = document.getElementById("lookup-input");
  input.value = hsCode;
  runLookupSearch(hsCode);
  document.getElementById("lookup-card").scrollIntoView({ behavior: "smooth", block: "start" });
}

function getLookupStorageItems(key, fallback = []) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.warn("Unable to read lookup storage", error);
    return fallback;
  }
}

function setLookupStorageItems(key, items) {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch (error) {
    console.warn("Unable to save lookup storage", error);
  }
}

function getRecentSearches() {
  return getLookupStorageItems("tariff-recent-searches", []);
}

function saveRecentSearches(items) {
  setLookupStorageItems("tariff-recent-searches", items);
}

function getBookmarkedCodes() {
  return getLookupStorageItems("tariff-bookmarks", []);
}

function saveBookmarkedCodes(items) {
  setLookupStorageItems("tariff-bookmarks", items);
}

function getDutyCalculatorSelection() {
  return getLookupStorageItems("duty-calculator-selection", null);
}

function saveDutyCalculatorSelection(record) {
  if (!record) return;

  const payload = {
    subheading: record.subheading || "",
    description: record.description || "",
    scheduleKey: selectedScheduleKey,
    record
  };

  setLookupStorageItems("duty-calculator-selection", payload);
}

function addRecentSearch(query) {
  const value = query.trim();
  if (value.length < 2) return;

  const nextItems = getRecentSearches().filter((item) => item.value !== value || item.mode !== lookupSearchMode || item.scheduleKey !== selectedScheduleKey);
  nextItems.unshift({
    value,
    mode: lookupSearchMode,
    scheduleKey: selectedScheduleKey,
    timestamp: Date.now()
  });

  saveRecentSearches(nextItems.slice(0, 8));
  renderQuickAccess();
}

function toggleBookmarkForCurrentRecord() {
  if (!currentLookupRecord) return;

  const bookmarks = getBookmarkedCodes();
  const code = currentLookupRecord.subheading;
  const hasBookmark = bookmarks.some((item) => item.code === code);

  const nextBookmarks = hasBookmark
    ? bookmarks.filter((item) => item.code !== code)
    : [{ code, description: currentLookupRecord.description, scheduleKey: selectedScheduleKey, timestamp: Date.now() }, ...bookmarks].slice(0, 10);

  saveBookmarkedCodes(nextBookmarks);
  renderQuickAccess();
}

function renderQuickAccess() {
  const recentEl = document.getElementById("recent-searches-list");
  const bookmarksEl = document.getElementById("bookmarked-codes-list");
  if (!recentEl || !bookmarksEl) return;

  const recent = getRecentSearches();
  const bookmarks = getBookmarkedCodes();

  recentEl.innerHTML = recent.length
    ? recent.map((item) => `
      <button type="button" class="quick-access-item" data-action="recent" data-value="${escapeHtml(item.value)}" data-mode="${escapeHtml(item.mode)}" data-schedule="${escapeHtml(item.scheduleKey)}">
        <span class="quick-access-title">${escapeHtml(item.value)}</span>
        <span class="quick-access-meta">${escapeHtml(item.mode === "hs" ? "HS code" : "Description")} · ${escapeHtml(item.scheduleKey.replace(/_/g, " "))}</span>
      </button>
    `).join("")
    : '<div class="quick-access-empty">No recent searches yet.</div>';

  bookmarksEl.innerHTML = bookmarks.length
    ? bookmarks.map((item) => `
      <button type="button" class="quick-access-item" data-action="bookmark" data-code="${escapeHtml(item.code)}">
        <span class="quick-access-title">${escapeHtml(item.code)}</span>
        <span class="quick-access-meta">${escapeHtml(item.description || "Bookmarked HS code")}</span>
      </button>
    `).join("")
    : '<div class="quick-access-empty">No bookmarked HS codes yet.</div>';

  recentEl.querySelectorAll(".quick-access-item[data-action='recent']").forEach((el) => {
    el.addEventListener("click", () => {
      const input = document.getElementById("lookup-input");
      lookupSearchMode = el.dataset.mode || "hs";
      selectedScheduleKey = el.dataset.schedule || selectedScheduleKey;
      if (input) {
        input.value = el.dataset.value || "";
      }
      syncLookupControls();
      runLookupSearch(el.dataset.value || "");
    });
  });

  bookmarksEl.querySelectorAll(".quick-access-item[data-action='bookmark']").forEach((el) => {
    el.addEventListener("click", () => {
      const code = el.dataset.code || "";
      if (code) {
        jumpToLookup(code);
      }
    });
  });
}

function populateScheduleOptions(select) {
  if (!SCHEDULES) return;

  const options = Object.entries(SCHEDULES)
    .filter(([, value]) => value && (Array.isArray(value.records) || value.title || value.schedule))
    .map(([key, value]) => ({
      key,
      label: value.schedule || key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
    }));

  if (!options.length) {
    select.innerHTML = '<option value="first_schedule_customs_tariffs">First Schedule</option>';
    return;
  }

  if (!options.some((option) => option.key === selectedScheduleKey)) {
    selectedScheduleKey = options[0].key;
  }

  const friendlyLabels = {
    first_schedule_customs_tariffs: "First Schedule",
    fourth_schedule_export_duties: "Fourth Schedule",
    fifth_schedule_surcharge: "Fifth Schedule",
    sixth_schedule_carbon_tax: "Sixth Schedule",
    eighth_schedule_industrial_rebates: "Eighth Schedule"
  };

  select.innerHTML = options.map(({ key, label }) => {
    const displayLabel = friendlyLabels[key] || label;
    return `<option value="${escapeHtml(key)}">${escapeHtml(displayLabel)}</option>`;
  }).join("");
  select.value = selectedScheduleKey;
}

function getActiveLookupSchedule() {
  return SCHEDULES?.[selectedScheduleKey] || SCHEDULES?.first_schedule_customs_tariffs || null;
}

function getActiveScheduleLabel(schedule) {
  return schedule?.schedule || "selected schedule";
}

function syncLookupControls() {
  const modeButtons = Array.from(document.querySelectorAll(".lookup-mode-toggle button"));
  const scheduleSelect = document.getElementById("lookup-schedule-select");

  modeButtons.forEach((btn) => {
    const active = btn.dataset.mode === lookupSearchMode;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });

  if (scheduleSelect) {
    scheduleSelect.value = selectedScheduleKey;
  }
}

function runLookupSearch(query) {
  const resultsEl = document.getElementById("lookup-results");
  const detailEl = document.getElementById("lookup-detail");
  detailEl.innerHTML = "";

  const q = query.trim();
  if (q.length < 2) {
    resultsEl.innerHTML = "";
    return;
  }

  const activeSchedule = getActiveLookupSchedule();
  const records = activeSchedule?.records || [];
  const scheduleLabel = getActiveScheduleLabel(activeSchedule);

  if (!records.length) {
    resultsEl.innerHTML = `<div class="lookup-empty">No lookup records available for ${escapeHtml(scheduleLabel)}.</div>`;
    return;
  }

  const qDigits = cleanDigits(q);
  const qLower = q.toLowerCase();

  let matches = [];
  if (lookupSearchMode === "hs") {
    if (qDigits.length >= 2) {
      matches = records.filter((r) => cleanDigits(r.subheading).startsWith(qDigits));
    }
  } else {
    matches = records.filter((r) =>
      (r.description || "").toLowerCase().includes(qLower) ||
      (r.headingDesc || "").toLowerCase().includes(qLower)
    );
  }

  matches = matches.slice(0, 25);

  if (matches.length === 0) {
    const modeLabel = lookupSearchMode === "hs" ? "HS code" : "description";
    resultsEl.innerHTML = `<div class="lookup-empty">No ${modeLabel} matches in ${escapeHtml(scheduleLabel)} for "${escapeHtml(q)}".</div>`;
    addRecentSearch(q);
    return;
  }

  resultsEl.innerHTML = `<div class="lookup-count">${matches.length} match${matches.length === 1 ? "" : "es"}${matches.length === 25 ? " (showing first 25)" : ""}</div>` +
    matches.map((r) => `
      <div class="lookup-row" data-sub="${r.subheading}">
        <span class="mono lookup-code">${r.subheading}</span>
        <span class="lookup-desc">${r.description}</span>
        <span class="mono lookup-rate">${r.dutyGeneral || "—"}</span>
      </div>
    `).join("");

  resultsEl.querySelectorAll(".lookup-row").forEach((el) => {
    el.addEventListener("click", () => renderLookupDetail(el.dataset.sub));
  });

  addRecentSearch(q);
  renderLookupDetail(matches[0].subheading);
}

function renderLookupDetail(subheading) {
  const detailEl = document.getElementById("lookup-detail");
  const activeSchedule = getActiveLookupSchedule();
  const record = activeSchedule?.records.find((r) => r.subheading === subheading);
  if (!record) return;

  currentLookupRecord = record;
  saveDutyCalculatorSelection(record);

  const qDigits = cleanDigits(subheading);
  const chapter = record.chapter;
  const exciseValue = formatRateDisplay(record.excise);
  const vatValue = formatRateDisplay(record.vat || "17.5%");
  const aitValue = formatRateDisplay(record.ait || "10%");

  const surcharge = getScheduleRecords("schedule5_surcharge").find((r) =>
    (r.headings || []).some((h) => headingCodeMatches(h, qDigits))
  );

  const exportDuty = getScheduleRecords("schedule4_export_duties").find((r) => {
    const codes = r.headings && r.headings.length ? r.headings : (r.heading ? [r.heading] : []);
    return codes.some((h) => headingCodeMatches(h, qDigits));
  });

  const carbonApplies = chapter === "87";
  const carbonRows = carbonApplies ? getScheduleRecords("schedule6_carbon_tax").filter((r) => r.rate_mwk) : [];
  const dumping = getScheduleRecords("schedule3_dumping")[0] || {};

  const isBookmarked = getBookmarkedCodes().some((item) => item.code === record.subheading);

  detailEl.innerHTML = `
    <div class="detail-card">
      <div class="detail-head">
        <div class="detail-title-block">
          <span class="mono detail-code">${record.subheading}</span>
          <span class="detail-desc">${record.description}</span>
        </div>
        <button type="button" class="bookmark-button ${isBookmarked ? "active" : ""}" data-action="bookmark-current" aria-label="Bookmark HS code">
          ${isBookmarked ? "★" : "☆"}
        </button>
      </div>
      <div class="detail-sub mono">${record.heading} — ${record.headingDesc || ""}</div>

      <div class="rate-grid">
        ${rateChip("General duty", record.dutyGeneral)}
        ${rateChip("Preferential", record.dutyPreferential)}
        ${rateChip("COMESA", record.comesa)}
        ${rateChip("AfCFTA", record.afcfta)}
        ${rateChip("SADC (other)", record.sadcOther)}
        ${rateChip("SADC (SA)", record.sadcSa)}
        ${rateChip("Excise", exciseValue)}
        ${rateChip("VAT", vatValue)}
        ${rateChip("AIT", aitValue)}
      </div>

      <div class="cross-refs">
        <div class="cross-ref-item ${surcharge ? "cross-ref-active" : ""}">
          <span class="cross-ref-label">Surcharge (5th Sch.)</span>
          <span class="cross-ref-value">${surcharge ? `${surcharge.rate} — ${surcharge.description}` : "Not listed"}</span>
        </div>
        <div class="cross-ref-item ${exportDuty ? "cross-ref-active" : ""}">
          <span class="cross-ref-label">Export duty (4th Sch.)</span>
          <span class="cross-ref-value">${exportDuty ? `${exportDuty.rate} — ${exportDuty.description}` : "Not listed"}</span>
        </div>
        <div class="cross-ref-item">
          <span class="cross-ref-label">Dumping duty (3rd Sch.)</span>
          <span class="cross-ref-value">${dumping.kind_and_rate_of_dumping_duty || "Not listed"} (default — check for a Ministerial Order specific to this line)</span>
        </div>
        ${carbonApplies ? `
        <div class="cross-ref-item cross-ref-active">
          <span class="cross-ref-label">Carbon tax (6th Sch.)</span>
          <span class="cross-ref-value">
            ${carbonRows.map((r) => `${r.engine_size}: MK ${Number(r.rate_mwk).toLocaleString()}`).join(" · ")}
            <span class="cross-ref-note">on TIP/transit issuance, Chapter 87</span>
          </span>
        </div>` : ""}
      </div>
    </div>
  `;

  detailEl.querySelector(".bookmark-button")?.addEventListener("click", () => {
    toggleBookmarkForCurrentRecord();
    renderLookupDetail(record.subheading);
  });
}

function formatRateDisplay(value) {
  if (value === null || value === undefined || value === "") return "—";

  const text = String(value).trim();
  if (!text) return "—";
  if (/^free$/i.test(text) || /^exempt$/i.test(text)) return "Exempt";
  return text;
}

function rateChip(label, value) {
  return `<div class="rate-chip"><span class="rate-label">${label}</span><span class="rate-value mono">${escapeHtml(formatRateDisplay(value))}</span></div>`;
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}
