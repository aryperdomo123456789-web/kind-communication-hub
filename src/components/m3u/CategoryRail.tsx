import { cn } from "@/lib/utils";

export interface CategoryRailItem {
  name: string;
  count: number;
}

interface CategoryRailProps {
  label: string;
  items: CategoryRailItem[];
  activeCategory: string;
  onChange: (category: string) => void;
}

export function CategoryRail({ label, items, activeCategory, onChange }: CategoryRailProps) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className="text-xs uppercase tracking-[0.24em] text-neutral-500 font-bold">
            {label}
          </h3>
          <p className="text-[11px] text-neutral-600 mt-1">
            Navegue pela categoria antes de pesquisar.
          </p>
        </div>
        <button
          onClick={() => onChange("ALL")}
          className={cn(
            "text-xs font-bold px-3 py-1.5 rounded-full border transition-colors",
            activeCategory === "ALL"
              ? "bg-blue-600 text-white border-blue-500"
              : "bg-white/5 text-neutral-300 border-white/10 hover:bg-white/10",
          )}
        >
          Ver tudo
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-neutral-700 scrollbar-track-transparent">
        {items.map((item) => {
          const active = activeCategory === item.name;
          return (
            <button
              key={item.name}
              onClick={() => onChange(item.name)}
              className={cn(
                "shrink-0 min-w-max px-4 py-2 rounded-full border transition-all text-sm font-medium",
                active
                  ? "bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-600/20"
                  : "bg-[#141414] text-neutral-300 border-white/10 hover:border-white/20 hover:bg-white/5",
              )}
            >
              <span>{item.name}</span>
              <span className="ml-2 text-xs opacity-70">({item.count})</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
