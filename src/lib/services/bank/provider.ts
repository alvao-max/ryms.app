import type { BankTx } from "../transactions";

export type BankErrorCode = "expired" | "unavailable" | "rate_limited" | "cancelled" | "config" | "other";
export class BankError extends Error {
  constructor(
    public code: BankErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface BankInfo {
  name: string;
  country: string;
  /** längsta samtyckestid banken tillåter, i sekunder */
  maxConsentSeconds: number | null;
}
export interface ProviderAccount {
  /** leverantörens konto-id, giltigt under sessionen */
  externalId: string;
  /** stabil nyckel mellan sessioner, om leverantören har en */
  stableKey: string | null;
  name: string;
  numberMasked: string | null;
  currency: string;
  typeGuess: "spending" | "savings";
}
/** Uppgifter om att användaren själv är närvarande (PSD2). Skickas bara vid användarstartad hämtning. */
export interface PsuContext {
  ip?: string;
  userAgent?: string;
}

/**
 * Endast kontoinformation (AIS). Gränssnittet har medvetet inga metoder för betalningar,
 * överföringar eller kortinställningar – Ryms kan inte flytta pengar.
 */
export interface BankProvider {
  readonly id: string;
  readonly displayName: string;
  configured(): boolean;
  listBanks(): Promise<BankInfo[]>;
  startAuth(input: { bank: BankInfo; state: string; redirectUrl: string }): Promise<{ url: string; validUntil: string }>;
  createSession(code: string): Promise<{ sessionId: string; accounts: ProviderAccount[] }>;
  fetchBalance(sessionId: string, accountExternalId: string, psu?: PsuContext): Promise<{ balanceOre: number; kind: "available" | "booked" }>;
  fetchTransactions(sessionId: string, accountExternalId: string, dateFrom: string, psu?: PsuContext): Promise<BankTx[]>;
  /** Avslutar sessionen hos leverantören så att bankens samtycke stängs. */
  revoke(sessionId: string): Promise<void>;
}
