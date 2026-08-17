/**
 * Shared Earth Engine setup.
 *
 * Authentication is a process-wide handshake rather than a per-request one, so
 * the promise is cached: concurrent requests share one sign-in instead of
 * racing, and later requests skip it entirely. A rejected handshake is
 * deliberately not cached, so the server recovers once a bad key or an
 * unregistered project is put right, without needing a restart.
 */

import ee from "@google/earthengine";

export class GeeNotConfiguredError extends Error {
  constructor() {
    super(
      "Earth Engine is not configured. Create Glacier_Website_MAIN/.env.local " +
        "containing GEE_CREDENTIALS_JSON set to the full JSON of a service-account key.",
    );
    this.name = "GeeNotConfiguredError";
  }
}

let authPromise: Promise<void> | null = null;

export function authenticateEarthEngine(): Promise<void> {
  if (authPromise) return authPromise;

  authPromise = new Promise<void>((resolve, reject) => {
    try {
      const raw = process.env.GEE_CREDENTIALS_JSON;
      if (!raw) throw new GeeNotConfiguredError();

      let key: any;
      try {
        key = JSON.parse(raw);
      } catch {
        throw new Error("GEE_CREDENTIALS_JSON is set but is not valid JSON.");
      }
      if (!key.private_key || !key.client_email) {
        throw new Error(
          "GEE_CREDENTIALS_JSON is missing private_key or client_email — it should be the whole service-account key file.",
        );
      }
      // Tolerate keys stored with literal \n sequences rather than newlines.
      key.private_key = key.private_key.replace(/\\n/g, "\n");

      ee.data.authenticateViaPrivateKey(
        key,
        () => ee.initialize(null, null, resolve, reject),
        (error: string) => reject(new Error(`Earth Engine authentication failed: ${error}`)),
      );
    } catch (e) {
      reject(e);
    }
  });

  authPromise.catch(() => {
    authPromise = null;
  });
  return authPromise;
}

/** Evaluate one Earth Engine object, rejecting on error. */
export function evaluateEe<T>(obj: any): Promise<T> {
  return new Promise((resolve, reject) => {
    obj.evaluate((data: T, error: any) =>
      error ? reject(new Error(String(error))) : resolve(data),
    );
  });
}

/**
 * True when a failure means Earth Engine is not set up rather than broken.
 *
 * A missing key is the obvious case, but a valid key whose Cloud project was
 * never registered, whose API is disabled, or which lacks permission fails at
 * the first call. Those are configuration gaps too, and callers rely on the
 * distinction to fall back instead of surfacing an outage.
 */
export function isGeeSetupProblem(message: string): boolean {
  return (
    /GEE_CREDENTIALS_JSON/i.test(message) ||
    /not registered to use Earth Engine/i.test(message) ||
    /authentication failed/i.test(message) ||
    /permission|forbidden|not authorized|403/i.test(message) ||
    /has not been used in project|API .* disabled/i.test(message)
  );
}
