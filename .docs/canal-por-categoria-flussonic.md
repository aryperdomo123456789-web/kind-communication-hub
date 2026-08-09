# Canal por categoria no Flussonic

Este documento explica como organizar um canal 24h por categoria no Flussonic usando apenas videos proprios.

O exemplo desta documentacao usa a categoria `ANO NA ESCOLA` com:

- 10 canais dentro da categoria
- 5 videos em cada canal

## Ideia principal

No Flussonic, a forma mais confiavel de montar um canal 24h com videos proprios e:

1. guardar os arquivos no disco local do servidor
2. criar uma VOD location
3. criar uma playlist para cada canal
4. criar um stream `playlist://` para cada canal

A categoria, neste caso, nao precisa ser uma funcao interna do Flussonic. Ela pode ser apenas a forma de organizar pastas, nomes e playlists.

## Estrutura recomendada

Use uma pasta principal para a categoria e, dentro dela, uma pasta para cada canal.

Exemplo:

```text
/opt/flussonic/priv/ano-na-escola/
  canal-01/
    video01.mp4
    video02.mp4
    video03.mp4
    video04.mp4
    video05.mp4
    playlist.txt
  canal-02/
    video01.mp4
    video02.mp4
    video03.mp4
    video04.mp4
    video05.mp4
    playlist.txt
  canal-03/
    ...
  canal-10/
    ...
```

## Como pensar a categoria

A categoria `ANO NA ESCOLA` pode representar o tema geral do conjunto de canais.

Exemplos de canais dentro da mesma categoria:

- `ano-na-escola-canal-01`
- `ano-na-escola-canal-02`
- `ano-na-escola-canal-03`
- `ano-na-escola-canal-04`
- `ano-na-escola-canal-05`
- `ano-na-escola-canal-06`
- `ano-na-escola-canal-07`
- `ano-na-escola-canal-08`
- `ano-na-escola-canal-09`
- `ano-na-escola-canal-10`

Cada canal pode ter sua propria sequencia de 5 videos.

## Passo 1. Criar a VOD location

No `flussonic.conf`, crie ou mantenha uma VOD location apontando para o diretorio raiz dos videos.

Exemplo:

```conf
vod vod {
  storage /opt/flussonic/priv;
}
```

Com isso, qualquer arquivo dentro de `/opt/flussonic/priv` pode ser referenciado como `vod/...`.

## Passo 2. Criar a pasta da categoria

Exemplo:

```bash
mkdir -p /opt/flussonic/priv/ano-na-escola
```

Depois crie uma pasta para cada canal:

```bash
mkdir -p /opt/flussonic/priv/ano-na-escola/canal-01
mkdir -p /opt/flussonic/priv/ano-na-escola/canal-02
mkdir -p /opt/flussonic/priv/ano-na-escola/canal-03
mkdir -p /opt/flussonic/priv/ano-na-escola/canal-04
mkdir -p /opt/flussonic/priv/ano-na-escola/canal-05
mkdir -p /opt/flussonic/priv/ano-na-escola/canal-06
mkdir -p /opt/flussonic/priv/ano-na-escola/canal-07
mkdir -p /opt/flussonic/priv/ano-na-escola/canal-08
mkdir -p /opt/flussonic/priv/ano-na-escola/canal-09
mkdir -p /opt/flussonic/priv/ano-na-escola/canal-10
```

## Passo 3. Copiar os videos

Em cada canal, coloque 5 videos proprios.

Exemplo para o canal 01:

```text
video01.mp4
video02.mp4
video03.mp4
video04.mp4
video05.mp4
```

Exemplo para o canal 02:

```text
video01.mp4
video02.mp4
video03.mp4
video04.mp4
video05.mp4
```

Os nomes podem ser diferentes, desde que sejam consistentes com a playlist.

## Passo 4. Criar a playlist de cada canal

Dentro de cada pasta do canal, crie um arquivo `playlist.txt`.

Exemplo para `canal-01`:

```text
vod/ano-na-escola/canal-01/video01.mp4
vod/ano-na-escola/canal-01/video02.mp4
vod/ano-na-escola/canal-01/video03.mp4
vod/ano-na-escola/canal-01/video04.mp4
vod/ano-na-escola/canal-01/video05.mp4
```

Exemplo para `canal-02`:

```text
vod/ano-na-escola/canal-02/video01.mp4
vod/ano-na-escola/canal-02/video02.mp4
vod/ano-na-escola/canal-02/video03.mp4
vod/ano-na-escola/canal-02/video04.mp4
vod/ano-na-escola/canal-02/video05.mp4
```

O Flussonic vai tocar a playlist em loop.

## Passo 5. Criar os streams

Cada canal precisa de um stream proprio.

Exemplo de configuracao:

```conf
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

## Passo 6. Recarregar o Flussonic

Depois de salvar a configuracao:

```bash
service flussonic reload
```

## Passo 7. Testar o canal

O HLS do canal costuma ficar assim:

```text
http://SEU-SERVIDOR/flussonic/stream-name/index.m3u8
```

No servidor que eu testei, o endpoint valido para o stream de exemplo foi:

```text
http://127.0.0.1/escola_24h_teste/index.m3u8
```

Em producao, substitua `127.0.0.1` pelo dominio ou IP publico do seu Flussonic.

## Exemplo de fluxo completo

Se a categoria for `ANO NA ESCOLA`, um fluxo real pode ser:

1. criar `/opt/flussonic/priv/ano-na-escola/`
2. criar `canal-01` ate `canal-10`
3. colocar 5 videos em cada canal
4. escrever uma `playlist.txt` em cada pasta
5. registrar os 10 streams no `flussonic.conf`
6. rodar `service flussonic reload`
7. abrir cada stream no player

## Boas praticas

- use arquivos de video com codec parecido entre si
- tente manter resolucao, audio e bitrate consistentes
- prefira `mp4` com H.264 e AAC
- se um canal tiver menos de 5 videos, repita os arquivos na playlist para fechar a grade
- nomeie os canais de forma clara, para facilitar manutencao

## Modelo rapido para escalar

Se voce quiser criar varias categorias depois, repita este mesmo padrao:

```text
/opt/flussonic/priv/<categoria>/<canal>/playlist.txt
```

Exemplos:

```text
/opt/flussonic/priv/ano-na-escola/canal-01/playlist.txt
/opt/flussonic/priv/ano-na-escola/canal-02/playlist.txt
/opt/flussonic/priv/ferias-escolares/canal-01/playlist.txt
/opt/flussonic/priv/projetos-da-turma/canal-01/playlist.txt
```

## Resumo curto

Para criar canal por categoria no Flussonic, a melhor organizacao e:

1. pasta raiz da categoria
2. subpasta por canal
3. 5 videos por canal
4. `playlist.txt` por canal
5. `stream` por canal usando `playlist://`
6. `service flussonic reload`

Esse modelo e simples de manter e escala bem quando voce tiver varias categorias.
