import { FiEye, FiFilter, FiLock } from "react-icons/fi";

type HintKind = "customer" | "filter" | "internal";

const HINT_META: Record<HintKind, { label: string; className: string; Icon: typeof FiEye }> = {
  customer: { label: "Shown on product page", className: "bg-blue-50 text-blue-700 border-blue-200", Icon: FiEye },
  filter: { label: "Used in search filters", className: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: FiFilter },
  internal: { label: "Internal only", className: "bg-slate-100 text-slate-500 border-slate-200", Icon: FiLock },
};

/** Small badge(s) next to a field/section label explaining where it actually surfaces. */
export function FieldHint({ kind }: { kind: HintKind | HintKind[] }) {
  const kinds = Array.isArray(kind) ? kind : [kind];
  return (
    <span className="inline-flex flex-wrap gap-1.5 ml-2 align-middle">
      {kinds.map((k) => {
        const { label, className, Icon } = HINT_META[k];
        return (
          <span
            key={k}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${className}`}
          >
            <Icon className="w-3 h-3" />
            {label}
          </span>
        );
      })}
    </span>
  );
}
