// Hata raporlama kullanıcı izniyle – madde 4

import { getFlag } from './featureFlags';
import { loadLocalConfig, saveLocalConfig } from './config';

type ErrorReport = {
  ts: number;
  where: string;
  message: string;
  stack?: string;
  extractor?: string;
  url?: string;
};

let userConsent: boolean | null = null;

export async function initErrorReporter() {
  const saved = await loadLocalConfig<{consent:boolean}>('error_consent');
  userConsent = saved?.consent ?? null;
  return userConsent;
}

export async function askErrorConsent(): Promise<boolean> {
  // UI'da sorulacak – ilk açılışta
  return userConsent === true;
}

export async function setErrorConsent(consent: boolean) {
  userConsent = consent;
  await saveLocalConfig('error_consent', { consent });
}

export async function reportError(where: string, err: any, meta?: {extractor?:string, url?:string}) {
  if (!getFlag('error_reporting')) return;
  if (userConsent !== true) {
    // local only
    console.warn('[TubeNest Error]', where, err);
    return;
  }
  const report: ErrorReport = {
    ts: Date.now(),
    where,
    message: err?.message || String(err),
    stack: err?.stack,
    extractor: meta?.extractor,
    url: meta?.url,
  };
  // local log
  const logs = (await loadLocalConfig<ErrorReport[]>('error_logs')) || [];
  logs.unshift(report);
  await saveLocalConfig('error_logs', logs.slice(0, 100));

  // İstersen Sentry / kendi endpoint
  // fetch('https://your-log-endpoint', {method:'POST', body:JSON.stringify(report)})
}

export async function getErrorLogs() {
  return (await loadLocalConfig<ErrorReport[]>('error_logs')) || [];
}
