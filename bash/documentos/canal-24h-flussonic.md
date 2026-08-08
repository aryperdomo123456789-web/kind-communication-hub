# Canal 24h no Flussonic com videos proprios

Este guia foi validado no servidor `173.208.244.141` com o Flussonic `23.08.1`.

## O que funciona melhor

A melhor forma de montar um canal 24h com videos proprios e:

1. enviar os arquivos para o disco local do Flussonic
2. criar uma VOD location apontando para essa pasta
3. criar um arquivo `playlist.txt` com a ordem dos videos
4. criar um stream `playlist://` apontando para essa playlist
5. recarregar o Flussonic

Isso e mais estavel do que depender de URLs externas.

## Estrutura recomendada

Use uma pasta por canal, por exemplo:

```text
/opt/flussonic/priv/escola_24h/
  video1.mp4
  video2.mp4
  video3.mp4
  video4.mp4
  video5.mp4
  playlist.txt
```

## Passo 1. Criar a VOD location

No arquivo `/etc/flussonic/flussonic.conf`, a base minima usada no teste foi:

```conf
vod vod {
  storage /opt/flussonic/priv;
}
```

## Passo 2. Criar a pasta do canal

```bash
mkdir -p /opt/flussonic/priv/escola_24h
```

## Passo 3. Criar a playlist

```text
vod/escola_24h/video1.mp4
vod/escola_24h/video2.mp4
vod/escola_24h/video3.mp4
vod/escola_24h/video4.mp4
vod/escola_24h/video5.mp4
```

## Passo 4. Criar o stream

```conf
stream escola_24h_teste {
  input playlist:///opt/flussonic/priv/escola_24h_teste/playlist.txt;
}
```

## Passo 5. Recarregar o Flussonic

```bash
service flussonic reload
```

## Passo 6. Verificar

Endpoint de teste:

```text
http://127.0.0.1/escola_24h_teste/index.m3u8
```

## Resumo curto

1. subir os videos para `/opt/flussonic/priv/<canal>/`
2. criar `playlist.txt`
3. criar `stream` usando `playlist://`
4. rodar `service flussonic reload`
