import type { HTMLAttributes } from "react";

export function Card({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-2xl border border-ink/10 bg-white shadow-[0_1px_2px_rgba(27,36,49,0.06)] ${className}`} {...rest} />;
}
