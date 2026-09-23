import { useEffect } from "react";
import { Icon } from "./ui";

export function Sheet({ title, subtitle, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 animate-fade bg-slate-950/50 backdrop-blur-[2px] dark:bg-black/65" onClick={onClose} />
      <div className={`relative max-h-[92dvh] w-full overflow-y-auto thin-scroll rounded-t-[24px] border border-slate-200 bg-white p-5 shadow-[var(--shadow-overlay)] animate-sheet sm:mx-auto sm:rounded-[24px] sm:p-6 sm:animate-rise dark:border-white/10 dark:bg-[#0e1621] ${wide ? "sm:max-w-xl" : "sm:max-w-md"}`}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200 sm:hidden dark:bg-white/15" aria-hidden="true" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Close dialog"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 cursor-pointer dark:hover:bg-white/10 dark:hover:text-slate-200">
            <Icon.X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
