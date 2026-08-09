import { Film, Tv, Play, CheckCircle2 } from "lucide-react";
import { M3UItem } from "@/lib/m3u/types";
import { cn } from "@/lib/utils";

interface ContentItemProps {
  item: M3UItem;
  isSelected: boolean;
  selectionMode: boolean;
  onToggle: (id: string) => void;
}

export function ContentItem({ item, isSelected, selectionMode, onToggle }: ContentItemProps) {
  return (
    <div
      className={cn(
        "group relative aspect-[2/3] bg-[#1a1a1a] rounded-xl overflow-hidden border transition-all cursor-pointer",
        isSelected
          ? "border-blue-500 ring-2 ring-blue-600/50"
          : "border-neutral-800 hover:border-neutral-600",
      )}
      style={{ contentVisibility: "auto", containIntrinsicSize: "320px 480px" }}
      onClick={() => (selectionMode ? onToggle(item.id) : null)}
    >
      {item.logo ? (
        <img
          src={item.logo}
          alt={item.name}
          className={`w-full h-full object-cover transition-transform duration-500 ${selectionMode ? "" : "group-hover:scale-110"}`}
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-neutral-800">
          {item.type === "movie" ? (
            <Film size={48} />
          ) : item.type === "series" ? (
            <Tv size={48} />
          ) : (
            <Play size={48} />
          )}
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-80" />

      {isSelected && (
        <div className="absolute top-2 right-2 bg-blue-600 rounded-full p-1 shadow-lg">
          <CheckCircle2 size={16} />
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 p-2 md:p-3">
        <p className="text-[9px] md:text-[11px] font-bold leading-tight line-clamp-2 text-white group-hover:text-blue-400 transition-colors">
          {item.name}
        </p>
        {item.type === "series" && (
          <p className="text-[8px] md:text-[9px] text-neutral-400 mt-1 uppercase tracking-tighter">
            S{item.season} • E{item.episode}
          </p>
        )}
      </div>

      {!selectionMode && (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 backdrop-blur-sm"
        >
          <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center shadow-xl transform scale-75 group-hover:scale-100 transition-all">
            <Play fill="white" size={24} className="ml-1" />
          </div>
        </a>
      )}
    </div>
  );
}
