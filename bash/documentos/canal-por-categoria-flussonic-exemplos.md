# Canal por categoria no Flussonic - exemplos praticos

Categoria exemplo:

- `ANO NA ESCOLA`
- 10 canais
- 5 videos em cada canal

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
```

## 2) Script para criar pastas e playlists automaticamente

```bash
#!/usr/bin/env bash
set -euo pipefail

BASE="/opt/flussonic/priv/ano-na-escola"
CHANNELS=("canal-01" "canal-02" "canal-03" "canal-04" "canal-05" "canal-06" "canal-07" "canal-08" "canal-09" "canal-10")

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
```

## 3) HTML para abrir no navegador

```html
<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Flussonic</title></head>
<body>
<h1>Canal por categoria no Flussonic</h1>
<p>Exemplo pratico com 10 canais e 5 videos por canal.</p>
</body>
</html>
```
