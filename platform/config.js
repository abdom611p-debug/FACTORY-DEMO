/*!
 * EGIC · runtime configuration
 *   apiBase : EGIC platform server (REST + live stream). '' = same origin (node server/server.js serves the UI).
 *             Set it when the UI is hosted elsewhere, e.g. Vercel → 'https://egic-platform.up.railway.app'
 *   aiUrl   : EGIC AI Engine (Python, app/main.py) used when «محرك الذكاء: خادم EGIC AI» is selected.
 *             '' = http://<this host>:8765 (local engine).
 * On Vercel this file is regenerated at build time from EGIC_API_BASE / EGIC_AI_URL (scripts/write-config.js).
 */
window.EGIC_CONFIG = window.EGIC_CONFIG || { apiBase: '', aiUrl: '' };
