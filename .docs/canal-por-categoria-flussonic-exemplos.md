# Canal por categoria no Flussonic - exemplos praticos

Este documento traz apenas exemplos praticos para montar uma categoria no Flussonic.

Exemplo usado:

- Categoria: `ANO NA ESCOLA`
- 10 canais
- 5 videos em cada canal

Os tres blocos abaixo sao:

1. um `flussonic.conf` completo para os 10 canais
2. um script para criar automaticamente pastas e playlists
3. uma versao em HTML para abrir direto no painel do site

## 1) Exemplo completo de `flussonic.conf`

```conf
http 80;
rtmp 1935;
pulsedb /var/lib/flussonic;
session_log /var/lib/flussonic;
edit_auth admin admin;

vod vod {
  storage /opt/flussonic/priv;
}

stream ano-na-escola-canal-01 {
  input playlist:///opt/flussonic/priv/ano-na-escola/canal-01/playlist.txt;
}

stream ano-na-escola-canal-02 {
  input playlist:///opt/flussonic/priv/ano-na-escola/canal-02/playlist.txt;
}

stream ano-na-escola-canal-03 {
  input playlist:///opt/flussonic/priv/ano-na-escola/canal-03/playlist.txt;
}

stream ano-na-escola-canal-04 {
  input playlist:///opt/flussonic/priv/ano-na-escola/canal-04/playlist.txt;
}

stream ano-na-escola-canal-05 {
  input playlist:///opt/flussonic/priv/ano-na-escola/canal-05/playlist.txt;
}

stream ano-na-escola-canal-06 {
  input playlist:///opt/flussonic/priv/ano-na-escola/canal-06/playlist.txt;
}

stream ano-na-escola-canal-07 {
  input playlist:///opt/flussonic/priv/ano-na-escola/canal-07/playlist.txt;
}

stream ano-na-escola-canal-08 {
  input playlist:///opt/flussonic/priv/ano-na-escola/canal-08/playlist.txt;
}

stream ano-na-escola-canal-09 {
  input playlist:///opt/flussonic/priv/ano-na-escola/canal-09/playlist.txt;
}

stream ano-na-escola-canal-10 {
  input playlist:///opt/flussonic/priv/ano-na-escola/canal-10/playlist.txt;
}
```

## 2) Script para criar pastas e playlists automaticamente

Este script cria:

- a pasta da categoria
- as 10 pastas de canal
- a `playlist.txt` de cada canal

Ele assume que os videos de cada canal ja estao dentro da pasta do canal com estes nomes:

- `video01.mp4`
- `video02.mp4`
- `video03.mp4`
- `video04.mp4`
- `video05.mp4`

```bash
#!/usr/bin/env bash
set -euo pipefail

BASE="/opt/flussonic/priv/ano-na-escola"
CHANNELS=(
  "canal-01"
  "canal-02"
  "canal-03"
  "canal-04"
  "canal-05"
  "canal-06"
  "canal-07"
  "canal-08"
  "canal-09"
  "canal-10"
)

mkdir -p "$BASE"

for channel in "${CHANNELS[@]}"; do
  channel_dir="$BASE/$channel"
  mkdir -p "$channel_dir"

  cat > "$channel_dir/playlist.txt" <<EOF
vod/ano-na-escola/$channel/video01.mp4
vod/ano-na-escola/$channel/video02.mp4
vod/ano-na-escola/$channel/video03.mp4
vod/ano-na-escola/$channel/video04.mp4
vod/ano-na-escola/$channel/video05.mp4
EOF
done

echo "Pastas e playlists criadas em $BASE"
```

Se quiser, voce pode adaptar o script para copiar os arquivos de uma pasta origem antes de gerar a playlist.

## 3) Versao em HTML para abrir direto no painel

Arquivo sugerido:

```text
/www/wwwroot/flutes.vr766.com/docs/canal-por-categoria-flussonic-exemplos.html
```

O HTML abaixo contem a mesma ideia do documento e pode ser aberto direto no navegador:

```html
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Canal por categoria no Flussonic - exemplos praticos</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #0f172a;
      --panel: #111827;
      --text: #e5e7eb;
      --muted: #94a3b8;
      --accent: #38bdf8;
      --code-bg: #020617;
      --border: #334155;
    }

    body {
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      background: linear-gradient(180deg, #020617 0%, #0f172a 100%);
      color: var(--text);
      line-height: 1.6;
    }

    .wrap {
      max-width: 1100px;
      margin: 0 auto;
      padding: 32px 20px 64px;
    }

    header {
      padding: 24px;
      border: 1px solid var(--border);
      border-radius: 16px;
      background: rgba(17, 24, 39, 0.9);
      margin-bottom: 24px;
    }

    h1, h2, h3 {
      margin-top: 0;
    }

    h1 {
      font-size: 32px;
      margin-bottom: 8px;
    }

    .muted {
      color: var(--muted);
    }

    section {
      margin-bottom: 24px;
      padding: 24px;
      border: 1px solid var(--border);
      border-radius: 16px;
      background: rgba(17, 24, 39, 0.85);
    }

    pre {
      overflow: auto;
      padding: 16px;
      border-radius: 12px;
      background: var(--code-bg);
      border: 1px solid #1e293b;
      color: #cbd5e1;
    }

    code {
      font-family: Consolas, Monaco, monospace;
      font-size: 0.95em;
    }

    .tag {
      display: inline-block;
      padding: 4px 10px;
      margin-right: 8px;
      margin-bottom: 8px;
      border-radius: 999px;
      background: rgba(56, 189, 248, 0.15);
      color: #7dd3fc;
      border: 1px solid rgba(56, 189, 248, 0.35);
      font-size: 12px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    ul {
      padding-left: 20px;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <span class="tag">Flussonic</span>
      <span class="tag">Categoria</span>
      <span class="tag">24h</span>
      <h1>Canal por categoria no Flussonic - exemplos praticos</h1>
      <p class="muted">Categoria exemplo: <strong>ANO NA ESCOLA</strong>, com 10 canais e 5 videos em cada canal.</p>
    </header>

    <section>
      <h2>1) Exemplo completo de <code>flussonic.conf</code></h2>
      <pre><code>http 80;
rtmp 1935;
pulsedb /var/lib/flussonic;
session_log /var/lib/flussonic;
edit_auth admin admin;

vod vod {
  storage /opt/flussonic/priv;
}

stream ano-na-escola-canal-01 {
  input playlist:///opt/flussonic/priv/ano-na-escola/canal-01/playlist.txt;
}

stream ano-na-escola-canal-02 {
  input playlist:///opt/flussonic/priv/ano-na-escola/canal-02/playlist.txt;
}

stream ano-na-escola-canal-03 {
  input playlist:///opt/flussonic/priv/ano-na-escola/canal-03/playlist.txt;
}

stream ano-na-escola-canal-04 {
  input playlist:///opt/flussonic/priv/ano-na-escola/canal-04/playlist.txt;
}

stream ano-na-escola-canal-05 {
  input playlist:///opt/flussonic/priv/ano-na-escola/canal-05/playlist.txt;
}

stream ano-na-escola-canal-06 {
  input playlist:///opt/flussonic/priv/ano-na-escola/canal-06/playlist.txt;
}

stream ano-na-escola-canal-07 {
  input playlist:///opt/flussonic/priv/ano-na-escola/canal-07/playlist.txt;
}

stream ano-na-escola-canal-08 {
  input playlist:///opt/flussonic/priv/ano-na-escola/canal-08/playlist.txt;
}

stream ano-na-escola-canal-09 {
  input playlist:///opt/flussonic/priv/ano-na-escola/canal-09/playlist.txt;
}

stream ano-na-escola-canal-10 {
  input playlist:///opt/flussonic/priv/ano-na-escola/canal-10/playlist.txt;
}</code></pre>
    </section>

    <section>
      <h2>2) Script para criar pastas e playlists automaticamente</h2>
      <pre><code>#!/usr/bin/env bash
set -euo pipefail

BASE="/opt/flussonic/priv/ano-na-escola"
CHANNELS=(
  "canal-01"
  "canal-02"
  "canal-03"
  "canal-04"
  "canal-05"
  "canal-06"
  "canal-07"
  "canal-08"
  "canal-09"
  "canal-10"
)

mkdir -p "$BASE"

for channel in "${CHANNELS[@]}"; do
  channel_dir="$BASE/$channel"
  mkdir -p "$channel_dir"

  cat > "$channel_dir/playlist.txt" <<EOF
vod/ano-na-escola/$channel/video01.mp4
vod/ano-na-escola/$channel/video02.mp4
vod/ano-na-escola/$channel/video03.mp4
vod/ano-na-escola/$channel/video04.mp4
vod/ano-na-escola/$channel/video05.mp4
EOF
done

echo "Pastas e playlists criadas em $BASE"</code></pre>
    </section>

    <section>
      <h2>3) Versao em HTML para abrir direto no painel</h2>
      <p>Arquivo sugerido:</p>
      <pre><code>/www/wwwroot/flutes.vr766.com/docs/canal-por-categoria-flussonic-exemplos.html</code></pre>
      <p>Essa versao pode ser servida pelo painel e aberta direto no navegador.</p>
    </section>
  </div>
</body>
</html>
```

## Resumo rapido

Se voce quer criar uma categoria `ANO NA ESCOLA` com 10 canais, o caminho pratico e:

- uma pasta raiz da categoria
- uma pasta por canal
- 5 videos por canal
- uma `playlist.txt` por canal
- um stream por canal
- um HTML para consulta rapida no navegador
