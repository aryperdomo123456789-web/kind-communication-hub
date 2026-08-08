import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { parseM3U, M3UParsed } from "@/lib/m3u";
import { Play, Film, Tv, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const [data, setData] = useState<M3UParsed | null>(null);
  const [m3uText, setM3uText] = useState("");
  const [activeView, setActiveView] = useState<"movies" | "series" | "live">("movies");
  
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);

  const handleProcess = () => {
    const parsed = parseM3U(m3uText);
    setData(parsed);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-blue-500">M3U Separator PRO</h1>
        <textarea
          className="w-full h-32 bg-neutral-900 border border-neutral-800 rounded-lg p-4 mb-4 text-sm font-mono text-white"
          placeholder="Cole seu conteúdo M3U aqui..."
          value={m3uText}
          onChange={(e) => setM3uText(e.target.value)}
        />
        <button
          onClick={handleProcess}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg mb-8"
        >
          Processar Lista
        </button>

        {data && (
          <div className="flex gap-4 mb-8">
            <button onClick={() => {setActiveView("movies"); setSelectedCategory(null);}} className={`flex items-center gap-2 p-3 rounded-lg ${activeView === "movies" ? "bg-blue-900" : "bg-neutral-800"}`}><Film/> Filmes</button>
            <button onClick={() => {setActiveView("series"); setSelectedCategory(null);}} className={`flex items-center gap-2 p-3 rounded-lg ${activeView === "series" ? "bg-blue-900" : "bg-neutral-800"}`}><Tv/> Séries</button>
            <button onClick={() => {setActiveView("live"); setSelectedCategory(null);}} className={`flex items-center gap-2 p-3 rounded-lg ${activeView === "live" ? "bg-blue-900" : "bg-neutral-800"}`}><Play/> Ao Vivo</button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {activeView === "movies" && data?.movies.map((cat, i) => (
            <button key={i} onClick={() => setSelectedCategory(cat.name)} className="p-4 bg-neutral-900 rounded-lg border border-neutral-800 text-left hover:border-blue-500">
              {cat.name} ({cat.items.length})
            </button>
          ))}
          {activeView === "series" && data?.series.map((s, i) => (
            <button key={i} onClick={() => setSelectedSeries(s.name)} className="p-4 bg-neutral-900 rounded-lg border border-neutral-800 text-left hover:border-blue-500">
              {s.name} ({s.seasons.length} temporadas)
            </button>
          ))}
          {activeView === "live" && data?.live.map((cat, i) => (
            <button key={i} onClick={() => setSelectedCategory(cat.name)} className="p-4 bg-neutral-900 rounded-lg border border-neutral-800 text-left hover:border-blue-500">
              {cat.name} ({cat.items.length})
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
