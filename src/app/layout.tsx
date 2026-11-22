import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource/castoro/400.css";
import "@fontsource-variable/geist";
import "./globals.css";
import { LocaleProvider } from "@/components/Locale";
import { getCurrency, getLocale } from "@/lib/locale";
import { CURRENCIES } from "@/lib/money";
import type { CSSProperties } from "react";

export const metadata: Metadata = {
  title: "Ryms – ryms det i budgeten?",
  description: "Ryms svarar på frågan du ställer i butiken: ryms det här köpet i min budget?",
  appleWebApp: { capable: true, title: "Ryms", statusBarStyle: "black-translucent" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0b0e0d",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const currency = await getCurrency();
  return (
    <html lang={locale} style={{ "--cur": JSON.stringify(CURRENCIES[currency].symbol) } as CSSProperties}>
      <body>
        <LocaleProvider locale={locale} currency={currency}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
