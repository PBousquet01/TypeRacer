import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("frame grid gap-3.5 bg-window px-5 py-[18px]", className)}>{children}</div>;
}

export function PanelTitle({ children, as: Tag = "h3" }: { children: ReactNode; as?: "h2" | "h3" }) {
  return (
    <Tag className="text-xs/normal text-accent uppercase after:mt-3 after:block after:h-0.5 after:bg-edge/25 after:content-['']">
      {children}
    </Tag>
  );
}

export function FinePrint({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("font-body text-xs/[1.6] text-muted uppercase", className)}>{children}</p>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="font-display text-label tracking-[0.08em] text-accent">{children}</span>;
}

export function MonoNote({ children }: { children: ReactNode }) {
  return <span className="font-display text-tiny text-green">{children}</span>;
}

export function Spec({ children }: { children: ReactNode }) {
  return <dl className="m-0 grid gap-[11px] font-body text-[13px]/[1.3]">{children}</dl>;
}

export function SpecRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted uppercase">{label}</dt>
      <dd className="m-0 text-right text-strong">{children}</dd>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2">
      <FieldLabel>{label}</FieldLabel>
      {children}
    </label>
  );
}

export function FieldLabel({ children, as: Tag = "span" }: { children: ReactNode; as?: "span" | "legend" }) {
  return <Tag className="p-0 font-display text-tiny text-muted uppercase">{children}</Tag>;
}

export function Stat({ value, label, accent = false }: { value: ReactNode; label: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline gap-[9px] max-wide:flex-col max-wide:items-start max-wide:gap-1">
      <span className={cn("font-display text-xl/none", accent ? "text-accent" : "text-strong")}>{value}</span>
      <span className="font-display text-tiny text-muted">{label}</span>
    </div>
  );
}

export function StatsBar({ children }: { children: ReactNode }) {
  return (
    <div className="frame flex flex-wrap items-center justify-end gap-[30px] bg-bar px-[22px] py-3.5 max-wide:justify-between max-wide:gap-3.5 max-wide:px-3.5 max-wide:py-3">
      {children}
    </div>
  );
}

export function StatusTag({ children }: { children: ReactNode }) {
  return <span className="mr-auto font-display text-tiny text-accent">{children}</span>;
}

export function OrRule({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 font-display text-tiny text-muted uppercase before:h-0.5 before:flex-1 before:bg-edge/22 before:content-[''] after:h-0.5 after:flex-1 after:bg-edge/22 after:content-['']">
      <span>{children}</span>
    </div>
  );
}

export function HostTag({ children }: { children: ReactNode }) {
  return (
    <span className="bg-accent px-2 py-[5px] font-display text-tiny/[1.4] text-ink light:text-white">{children}</span>
  );
}

export function Loading({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto max-w-[560px] px-[18px] pt-6 pb-[60px]">
      <p className="py-[60px] text-center text-muted uppercase">{children}</p>
    </main>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <p className="text-[13px] text-ember">{children}</p>;
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="border-2 border-accent bg-accent/12 px-4 py-3 font-body text-xs/normal text-strong uppercase light:bg-accent/14">
      {children}
    </p>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return <table className="w-full border-collapse font-body text-[13.5px]/[1.3]">{children}</table>;
}

export function Th({ num = false, className, ...props }: ThHTMLAttributes<HTMLTableCellElement> & { num?: boolean }) {
  return (
    <th
      {...props}
      className={cn(
        "border-b-2 border-edge/25 px-1.5 pb-3 font-body text-label/[1.4] font-normal text-muted uppercase",
        num ? "text-right" : "text-left",
        className,
      )}
    />
  );
}

export function Td({ num = false, className, ...props }: TdHTMLAttributes<HTMLTableCellElement> & { num?: boolean }) {
  return <td {...props} className={cn("px-1.5 py-[11px]", num && "text-right", className)} />;
}
