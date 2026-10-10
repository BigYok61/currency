/** SemVer der App. Einzige Quelle für Cache, Anzeige und Abgleich der Asset-URLs. */
const APP_VERSION = '2.1.0';

function appVersionLabel() {
  const [major, minor, patch] = String(APP_VERSION).split('.');
  const shown = patch === '0' ? `${major}.${minor}` : APP_VERSION;
  return `Version ${shown}`;
}
