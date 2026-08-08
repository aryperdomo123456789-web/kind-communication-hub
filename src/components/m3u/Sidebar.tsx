import { useCallback, type MouseEvent } from "react";
import { Film, Tv, Play, List, Settings, Server, UserRound, LogOut } from "lucide-react";
import { M3UParsed, M3UCategory } from "@/lib/m3u/types";
import { ViewType } from "@/hooks/use-m3u";
import { cn } from "@/lib/utils";

type SeriesEpisode = {
  episodes: unknown[];
};

type SeriesSeason = {
  seasons: SeriesEpisode[];
};

type SeriesGroup = {
  series: SeriesSeason[];
};

interface SidebarProps {
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;
  data: M3UParsed | null;
  setSearchQuery: (query: string) => void;
  accountName?: string;
  onLogout?: () => void;
  className?: string;
}

export function Sidebar({
  activeView,
  setActiveView,
  data,
  setSearchQuery,
  accountName,
  onLogout,
  className,
}: SidebarProps) {
  const handleNavigate = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const view = event.currentTarget.dataset.view as ViewType | undefined;
      if (!view) return;

      setActiveView(view);
      setSearchQuery("");
    },
    [setActiveView, setSearchQuery],
  );

  const counts = {
    movies: data?.movies.reduce((acc: number, cat: M3UCategory) => acc + cat.items.length, 0) || 0,
    series:
      data?.series.reduce(
        (acc: number, group: SeriesGroup) =>
          acc +
          group.series.reduce(
            (seriesAcc: number, series: SeriesSeason) =>
              seriesAcc +
              series.seasons.reduce(
                (seasonAcc: number, season: SeriesEpisode) => seasonAcc + season.episodes.length,
                0,
              ),
            0,
          ),
        0,
      ) || 0,
    live: data?.live.reduce((acc: number, cat: M3UCategory) => acc + cat.items.length, 0) || 0,
  };

  return (
    <div
      className={cn(
        "w-64 bg-[#141414] border-r border-neutral-800 flex flex-col h-full",
        className,
      )}
    >
      <div className="flex items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold">
            M
          </div>
          <div className="text-blue-500 font-bold text-xl tracking-tight">MAGO FLUSSONIC</div>
        </div>
      </div>

      <nav className="flex flex-col gap-1 p-4">
        <button
          data-view="movies"
          onClick={handleNavigate}
          className={`p-3 rounded-xl transition-all flex items-center gap-3 ${activeView === "movies" ? "bg-blue-600 shadow-lg shadow-blue-600/20" : "text-neutral-400 hover:bg-neutral-800"}`}
        >
          <Film size={20} /> <span className="font-medium">Filmes ({counts.movies})</span>
        </button>
        <button
          data-view="series"
          onClick={handleNavigate}
          className={`p-3 rounded-xl transition-all flex items-center gap-3 ${activeView === "series" ? "bg-blue-600 shadow-lg shadow-blue-600/20" : "text-neutral-400 hover:bg-neutral-800"}`}
        >
          <Tv size={20} /> <span className="font-medium">Séries ({counts.series})</span>
        </button>
        <button
          data-view="live"
          onClick={handleNavigate}
          className={`p-3 rounded-xl transition-all flex items-center gap-3 ${activeView === "live" ? "bg-blue-600 shadow-lg shadow-blue-600/20" : "text-neutral-400 hover:bg-neutral-800"}`}
        >
          <Play size={20} /> <span className="font-medium">Ao Vivo ({counts.live})</span>
        </button>

        <div className="h-px bg-neutral-800 my-4" />

        <button
          data-view="custom"
          onClick={handleNavigate}
          className={`p-3 rounded-xl transition-all flex items-center gap-3 ${activeView === "custom" ? "bg-blue-600 shadow-lg shadow-blue-600/20" : "text-neutral-400 hover:bg-neutral-800"}`}
        >
          <List size={20} /> <span className="font-medium">Minhas Categorias</span>
        </button>
        <button
          data-view="settings"
          onClick={handleNavigate}
          className={`p-3 rounded-xl transition-all flex items-center gap-3 ${activeView === "settings" ? "bg-blue-600 shadow-lg shadow-blue-600/20" : "text-neutral-400 hover:bg-neutral-800"}`}
        >
          <Settings size={20} /> <span className="font-medium">Listas M3U</span>
        </button>
        <button
          data-view="server"
          onClick={handleNavigate}
          className={`p-3 rounded-xl transition-all flex items-center gap-3 ${activeView === "server" ? "bg-blue-600 shadow-lg shadow-blue-600/20" : "text-neutral-400 hover:bg-neutral-800"}`}
        >
          <Server size={20} /> <span className="font-medium">Conectar Servidor</span>
        </button>
        <button
          data-view="account"
          onClick={handleNavigate}
          className={`p-3 rounded-xl transition-all flex items-center gap-3 ${activeView === "account" ? "bg-blue-600 shadow-lg shadow-blue-600/20" : "text-neutral-400 hover:bg-neutral-800"}`}
        >
          <UserRound size={20} /> <span className="font-medium">Conta</span>
        </button>
      </nav>

      <div className="mt-auto p-4 border-t border-neutral-800">
        <div className="rounded-2xl bg-black/30 border border-white/5 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center text-blue-400">
              <UserRound size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold truncate">{accountName || "Conta ativa"}</div>
              <div className="text-xs text-neutral-500">Sessão do painel</div>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm font-bold text-red-300 hover:bg-red-500/20 transition-colors"
          >
            <LogOut size={16} />
            Sair da conta
          </button>
        </div>
      </div>
    </div>
  );
}
