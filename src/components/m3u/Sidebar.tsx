import { Film, Tv, Play, List, Settings } from "lucide-react";
import { M3UParsed } from "@/lib/m3u";
import { ViewType } from "@/hooks/use-m3u";

interface SidebarProps {
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;
  data: M3UParsed | null;
  setSearchQuery: (query: string) => void;
}

export function Sidebar({ activeView, setActiveView, data, setSearchQuery }: SidebarProps) {
  const navigate = (view: ViewType) => {
    setActiveView(view);
    setSearchQuery("");
  };

  const counts = {
    movies: data?.movies.reduce((acc, cat) => acc + cat.items.length, 0) || 0,
    series: data?.series.length || 0,
    live: data?.live.reduce((acc, cat) => acc + cat.items.length, 0) || 0,
  };

  return (
    <div className="w-64 bg-[#141414] border-r border-neutral-800 flex flex-col p-4 gap-4">
      <div className="flex items-center gap-2 px-2 py-4">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold">X</div>
        <div className="text-blue-500 font-bold text-xl tracking-tight">XCIPTV PRO</div>
      </div>
      
      <nav className="flex flex-col gap-1">
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
      </nav>
    </div>
  );
}
