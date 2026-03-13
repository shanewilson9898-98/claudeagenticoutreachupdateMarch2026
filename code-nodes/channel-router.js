// ─────────────────────────────────────────────────────────────────────────────
// CHANNEL ROUTER
// n8n Code node — used in both Workflow 1 (after LinkedIn enrichment) and
// Workflow 2 (to route items into the Switch node).
//
// Assigns a `channel` field to each record:
//   email_linkedin  — has both email and a valid LinkedIn /in/ URL
//   linkedin_only   — has LinkedIn but no email
//   email_only      — has email but no LinkedIn
//   none            — has neither; do not send to campaign
// ─────────────────────────────────────────────────────────────────────────────

function isValidLinkedInProfile(s) {
  if (!s) return false;
  const v = String(s).toLowerCase().trim();
  return v.includes('linkedin.com/in/') || v.includes('linkedin.com/pub/');
}

function getChannel(record) {
  const hasEmail    = !!(record.email || '').trim();
  const hasLinkedIn = isValidLinkedInProfile(record.linkedin_url);

  if (hasEmail && hasLinkedIn)  return 'email_linkedin';
  if (hasLinkedIn && !hasEmail) return 'linkedin_only';
  if (hasEmail && !hasLinkedIn) return 'email_only';
  return 'none';
}

return items.map(item => {
  const channel = getChannel(item.json);
  return {
    json: {
      ...item.json,
      channel,
    },
  };
});
