// ─────────────────────────────────────────────────────────────────────────────
// GET WEEKLY TAB NAME
// n8n Code node — runs ONCE at the start of Workflow 2.
//
// Returns { tabName: "W2026-11" } which downstream nodes reference as:
//   {{ $('Get Tab Name').first().json.tabName }}
//
// The ISO week label is stable within a week, so the same tab is used for
// all runs in a given week. The next week automatically starts a new tab.
// ─────────────────────────────────────────────────────────────────────────────

function getISOWeekLabel(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // Move to Thursday of current week (ISO week anchor)
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `W${d.getFullYear()}-${String(weekNo).padStart(2, '0')}`;
}

const tabName = getISOWeekLabel(new Date());

return [{ json: { tabName } }];

// Example output: { tabName: "W2026-11" }
