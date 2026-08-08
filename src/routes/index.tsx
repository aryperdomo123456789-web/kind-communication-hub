import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { parseM3U, M3UParsed, M3UItem } from "@/lib/m3u";
import { Play, Film, Tv, ChevronLeft, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const [data, setData] = useState<M3UParsed | null>(null);
  const [m3uText, setM3uText] = useState("http://servicedovod.shop:80//get.php?username=TesteCompanyHOST&password=392380odasw&type=m3u_plus&output=hls");
  const [activeView, setActiveView] = useState<"movies" | "series" | "live">("movies");
  
  // Navigation State
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);

  const handleProcess = async () => {
    const parsed = await parseM3U(m3uText);
    setData(parsed);
  };

  const resetNav = () => {
    setSelectedCat(null);
    setSelectedSeries(null);
    setSelectedSeason(null);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-6 pb-20">
      <div className="max-w-5xl mx-auto">
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
            <button onClick={() => {setActiveView("movies"); resetNav();}} className={`flex items-center gap-2 p-3 rounded-lg ${activeView === "movies" ? "bg-blue-900" : "bg-neutral-800"}`}><Film/> Filmes</button>
            <button onClick={() => {setActiveView("series"); resetNav();}} className={`flex items-center gap-2 p-3 rounded-lg ${activeView === "series" ? "bg-blue-900" : "bg-neutral-800"}`}><Tv/> Séries</button>
            <button onClick={() => {setActiveView("live"); resetNav();}} className={`flex items-center gap-2 p-3 rounded-lg ${activeView === "live" ? "bg-blue-900" : "bg-neutral-800"}`}><Play/> Ao Vivo</button>
          </div>
        )}

        {/* Dynamic Content Renderer */}
        <div className="bg-neutral-900 p-6 rounded-xl border border-neutral-800">
          
          {/* Filmes/Live: Categories -> List */}
          {(activeView === "movies" || activeView === "live") && !selectedCat && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {(activeView === "movies" ? data?.movies : data?.live)?.map((c, i) => (
                <button key={i} onClick={() => setSelectedCat(c.name)} className="p-4 bg-neutral-800 rounded-lg text-left hover:bg-blue-900">{c.name} ({c.items.length})</button>
              ))}
            </div>
          )}

          {(activeView === "movies" || activeView === "live") && selectedCat && (
            <div>
              <button onClick={() => setSelectedCat(null)} className="mb-4 text-blue-400 flex items-center gap-2"><ChevronLeft /> Voltar</button>
              <div className="space-y-2">
                {(activeView === "movies" ? data?.movies : data?.live)?.find(c => c.name === selectedCat)?.items.map((it, i) => (
                  <div key={i} className="p-3 bg-neutral-800 rounded border border-neutral-700 flex items-center justify-between">
                    <span>{it.name}</span>
                    <a href={it.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300"><Play size={18} /></a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Series: Series -> Season -> Episodes */}
          {activeView === "series" && !selectedSeries && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {data?.series.map((s, i) => (
                <button key={i} onClick={() => setSelectedSeries(s.name)} className="p-4 bg-neutral-800 rounded-lg text-left hover:bg-blue-900">{s.name}</button>
              ))}
            </div>
          )}

          {activeView === "series" && selectedSeries && !selectedSeason && (
            <div>
              <button onClick={() => setSelectedSeries(null)} className="mb-4 text-blue-400 flex items-center gap-2"><ChevronLeft /> Voltar</button>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {data?.series.find(s => s.name === selectedSeries)?.seasons.map((s, i) => (
                  <button key={i} onClick={() => setSelectedSeason(s.number)} className="p-4 bg-neutral-800 rounded-lg text-center hover:bg-blue-900">Temp {s.number}</button>
                ))}
              </div>
            </div>
          )}

          {activeView === "series" && selectedSeries && selectedSeason && (
            <div>
              <button onClick={() => setSelectedSeason(null)} className="mb-4 text-blue-400 flex items-center gap-2"><ChevronLeft /> Voltar</button>
              <div className="space-y-2">
                {data?.series.find(s => s.name === selectedSeries)?.seasons.find(sea => sea.number === selectedSeason)?.episodes.map((ep, i) => (
                  <div key={i} className="p-3 bg-neutral-800 rounded border border-neutral-700 flex items-center justify-between">
                    <span>Ep {ep.episode} - {ep.name}</span>
                    <a href={ep.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300"><Play size={18} /></a>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
