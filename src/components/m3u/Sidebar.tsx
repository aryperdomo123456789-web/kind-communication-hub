import { Film, Tv, Play, List, Settings, X, Server } from "lucide-react";
import { M3UParsed, M3UCategory } from "@/lib/m3u/types";
import { ViewType } from "@/hooks/use-m3u";
import { cn } from "@/lib/utils";

interface SidebarProps {
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;
  data: M3UParsed | null;
  setSearchQuery: (query: string) => void;
  className?: string;
}

export function Sidebar({ activeView, setActiveView, data, setSearchQuery, className }: SidebarProps) {
  const navigate = (view: ViewType) => {
    setActiveView(view);
    setSearchQuery("");
  };

  const counts = {
    movies: data?.movies.reduce((acc: number, cat: M3UCategory) => acc + cat.items.length, 0) || 0,
    series: data?.series.length || 0,
    live: data?.live.reduce((acc: number, cat: M3UCategory) => acc + cat.items.length, 0) || 0,
  };

  return (
    <div className={cn(
      "w-64 bg-[#141414] border-r border-neutral-800 flex flex-col h-full",
      className
    )}>
      <div className="flex items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold">X</div>
          <div className="text-blue-500 font-bold text-xl tracking-tight">XCIPTV PRO</div>
        </div>
      </div>
      
      <nav className="flex flex-col gap-1 p-4">
        <button 
          onClick={() => navigate("movies")} 
          className={`p-3 rounded-xl transition-all flex items-center gap-3 ${activeView === "movies" ? "bg-blue-600 shadow-lg shadow-blue-600/20" : "text-neutral-400 hover:bg-neutral-800"}`}
        >
          <Film size={20}/> <span className="font-medium">Filmes ({counts.movies})</span>
        </button>
        <button 
          onClick={() => navigate("series")} 
          className={`p-3 rounded-xl transition-all flex items-center gap-3 ${activeView === "series" ? "bg-blue-600 shadow-lg shadow-blue-600/20" : "text-neutral-400 hover:bg-neutral-800"}`}
        >
          <Tv size={20}/> <span className="font-medium">Séries ({counts.series})</span>
        </button>
        <button 
          onClick={() => navigate("live")} 
          className={`p-3 rounded-xl transition-all flex items-center gap-3 ${activeView === "live" ? "bg-blue-600 shadow-lg shadow-blue-600/20" : "text-neutral-400 hover:bg-neutral-800"}`}
        >
          <Play size={20}/> <span className="font-medium">Ao Vivo ({counts.live})</span>
        </button>
        
        <div className="h-px bg-neutral-800 my-4" />
        
        <button 
          onClick={() => navigate("custom")} 
          className={`p-3 rounded-xl transition-all flex items-center gap-3 ${activeView === "custom" ? "bg-blue-600 shadow-lg shadow-blue-600/20" : "text-neutral-400 hover:bg-neutral-800"}`}
        >
          <List size={20}/> <span className="font-medium">Minhas Categorias</span>
        </button>
        <button 
          onClick={() => navigate("settings")} 
          className={`p-3 rounded-xl transition-all flex items-center gap-3 ${activeView === "settings" ? "bg-blue-600 shadow-lg shadow-blue-600/20" : "text-neutral-400 hover:bg-neutral-800"}`}
        >
          <Settings size={20}/> <span className="font-medium">Listas M3U</span>
        </button>
        <button 
          onClick={() => navigate("server")} 
          className={`p-3 rounded-xl transition-all flex items-center gap-3 ${activeView === "server" ? "bg-blue-600 shadow-lg shadow-blue-600/20" : "text-neutral-400 hover:bg-neutral-800"}`}
        >
          <Server size={20}/> <span className="font-medium">Conectar Servidor</span>
        </button>
      </nav>
    </div>
  );
}
