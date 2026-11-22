import {
  ArrowsClockwise,
  Bank,
  BookmarkSimple,
  CalendarDots,
  Camera,
  CaretLeft,
  CaretRight,
  Check,
  Confetti,
  ForkKnife,
  Heart,
  House,
  ImageSquare,
  Info,
  List,
  PencilSimple,
  Plus,
  Receipt,
  ShieldCheck,
  SignOut,
  Sun,
  Tag,
  Train,
  Trash,
  TShirt,
  UserCircle,
  Wallet,
  X,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon, IconWeight } from "@phosphor-icons/react";

/** Ikonerna i Ryms: Phosphor, i en lätt linjevikt. Aktiva lägen kan använda fylld vikt. */
type P = { size?: number; weight?: IconWeight };
const make = (C: Icon) =>
  function RymsIcon({ size = 20, weight = "regular" }: P) {
    return <C className="ico" size={size} weight={weight} aria-hidden />;
  };

export const MenuIcon = make(List);
export const CloseIcon = make(X);
export const BackIcon = make(CaretLeft);
export const NextIcon = make(CaretRight);
export const UserIcon = make(UserCircle);
export const SunIcon = make(Sun);
export const PlanIcon = make(CalendarDots);
export const SavedIcon = make(BookmarkSimple);
export const CameraIcon = make(Camera);
export const ImageIcon = make(ImageSquare);
export const PenIcon = make(PencilSimple);
export const InfoIcon = make(Info);
export const BankIcon = make(Bank);
export const ListIcon = make(Receipt);
export const ShieldIcon = make(ShieldCheck);
export const LogoutIcon = make(SignOut);
export const CheckIcon = make(Check);
export const PlusIcon = make(Plus);
export const TrashIcon = make(Trash);
export const SyncIcon = make(ArrowsClockwise);
export const WalletIcon = make(Wallet);

/** "Ryms det?": en sökarram med ett frågetecken – fota och fråga. Ryms egen symbol. */
export function AskIcon({ size = 24 }: { size?: number }) {
  return (
    <svg className="ask-ico" width={size} height={size} viewBox="0 0 256 256" fill="none" stroke="currentColor" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M40 88V56a16 16 0 0 1 16-16h32M168 40h32a16 16 0 0 1 16 16v32M216 168v32a16 16 0 0 1-16 16h-32M88 216H56a16 16 0 0 1-16-16v-32" />
      <path d="M104 106a24 24 0 1 1 36 20.800c-7.400 4.300-12 9.200-12 17.200" />
      <circle cx="128" cy="172" r="6" fill="currentColor" strokeWidth="10" />
    </svg>
  );
}

const CATEGORY: Record<string, Icon> = { mat: ForkKnife, klader: TShirt, noje: Confetti, transport: Train, hem: House, halsa: Heart, dot: Tag };
export function CategoryIcon({ icon, size = 18, weight = "regular" }: { icon: string; size?: number; weight?: IconWeight }) {
  const C = CATEGORY[icon] ?? CATEGORY.dot;
  return <C className="ico" size={size} weight={weight} aria-hidden />;
}
export const CATEGORY_ICONS = Object.keys(CATEGORY);
