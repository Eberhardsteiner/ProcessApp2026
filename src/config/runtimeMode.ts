const FLAG_ENABLED = new Set(['1', 'true', 'yes', 'on']);

function hasQaQueryFlag(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('qa') === '1';
}

function readQaFlagFromEnv(): boolean {
  const raw = import.meta.env.VITE_ENABLE_QA_SURFACES;
  return typeof raw === 'string' && FLAG_ENABLED.has(raw.toLowerCase());
}

export const QA_SURFACES_ENABLED = Boolean(import.meta.env.DEV || readQaFlagFromEnv() || hasQaQueryFlag());
