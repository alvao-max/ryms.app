import type { AnchorHTMLAttributes, ReactNode } from "react";
import { state } from "./runtime";
export default function Link({ href, children, ...rest }: { href: string; children?: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      href={href}
      {...rest}
      onClick={(e) => {
        e.preventDefault();
        state.navigate(href);
      }}
    >
      {children}
    </a>
  );
}
(Link as unknown as { $$client: boolean }).$$client = true;
