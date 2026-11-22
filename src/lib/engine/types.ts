import type { Ore } from "../money";

export interface Reservation {
  id: string;
  name: string;
  maxOre: Ore;
}

/** Läget i en budgetkategori för en viss månad. */
export interface CategorySnapshot {
  id: string;
  name: string;
  /** null = ingen budget satt den här månaden */
  budgetOre: Ore | null;
  /** köp minus återbetalningar */
  spentOre: Ore;
  /** planerade köp som ännu inte är gjorda */
  reservations: Reservation[];
}

export interface CategoryFigures {
  budgetOre: Ore;
  spentOre: Ore;
  reservedOre: Ore;
  /** budget − förbrukat */
  remainingOre: Ore;
  /** budget − förbrukat − reserverat */
  freeOre: Ore;
}

export interface TimelineEvent {
  id: string;
  type: "bill" | "inflow";
  label: string;
  date: string;
  /** alltid positivt belopp; typen avgör riktning */
  amountOre: Ore;
  overdue?: boolean;
}

export interface SavingLine {
  goalId: string;
  name: string;
  plannedOre: Ore;
  savedOre: Ore;
  remainingOre: Ore;
}

export interface CashAdjustment {
  label: string;
  amountOre: Ore;
}

/** Pengar på kontot och vad som ska hända med dem före lön. */
export interface CashSnapshot {
  /** false = vi vet inte saldot (inget konto, inget angivet saldo) */
  known: boolean;
  /** disponibelt just nu, efter justeringar */
  cashOre: Ore;
  baseOre: Ore;
  adjustments: CashAdjustment[];
  estimate: boolean;
  notes: string[];
  today: string;
  /** nästa lönedag; null om okänd (då räknar vi till månadens slut) */
  payday: string | null;
  horizon: string;
  events: TimelineEvent[];
  savings: SavingLine[];
}

export interface LeftUntilPayday {
  known: boolean;
  amountOre: Ore;
  cashOre: Ore;
  billsOre: Ore;
  inflowOre: Ore;
  savingOre: Ore;
}

export type CategoryStatus =
  | "fits"
  | "fits_planned"
  | "over_planned"
  | "uses_reservation"
  | "short"
  | "no_budget"
  | "no_category";

export type CashStatus = "ok" | "bill_short" | "already_short" | "saving_short" | "unknown";

export interface CheckInput {
  itemName: string;
  priceOre: Ore;
  category: CategorySnapshot | null;
  /** id för det planerade köp som användaren bekräftat att det gäller */
  plannedPurchaseId?: string | null;
  cash: CashSnapshot;
  /** övriga kategorier samma månad – används bara för flyttförslag */
  otherCategories?: CategorySnapshot[];
}

export interface CheckResult {
  verdict: "yes" | "caution" | "no";
  priceOre: Ore;
  category: {
    status: CategoryStatus;
    name: string | null;
    figures: CategoryFigures | null;
    /** vad som finns att använda för just det här köpet */
    availableOre: Ore;
    afterOre: Ore;
    shortfallOre: Ore;
    usesReservedOre: Ore;
    reservedFor: Reservation[];
    planned: Reservation | null;
    overPlannedOre: Ore;
  };
  cash: {
    status: CashStatus;
    leftBeforeOre: Ore;
    leftAfterOre: Ore;
    bill: TimelineEvent | null;
    shortfallOre: Ore;
    savingShortOre: Ore;
    savingPlannedOre: Ore;
  };
  move: { fromCategoryId: string; fromName: string; toCategoryId: string; amountOre: Ore; fromFreeOre: Ore } | null;
}
