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

No teste feito neste servidor, os arquivos de exemplo ja existentes eram:

```text
/opt/flussonic/priv/bunny.mp4
/opt/flussonic/priv/beepbop.mp4
```

## Passo 1. Criar a VOD location

No arquivo `/etc/flussonic/flussonic.conf`, a base minima usada no teste foi:

```conf
vod vod {
  storage /opt/flussonic/priv;
}
```

Essa configuracao faz o Flussonic enxergar os arquivos locais como VOD.

## Passo 2. Criar a pasta do canal

Exemplo:

```bash
mkdir -p /opt/flussonic/priv/escola_24h
```

Depois copie os videos do seu canal para essa pasta.

## Passo 3. Criar a playlist

Crie o arquivo:

```bash
/opt/flussonic/priv/escola_24h/playlist.txt
```

Conteudo exemplo:

```text
vod/bunny.mp4
vod/beepbop.mp4
```

Para seus proprios videos, o padrao fica assim:

```text
vod/escola_24h/video1.mp4
vod/escola_24h/video2.mp4
vod/escola_24h/video3.mp4
vod/escola_24h/video4.mp4
vod/escola_24h/video5.mp4
```

Se quiser repetir a grade, basta listar os arquivos em mais de uma ordem.

## Passo 4. Criar o stream

No mesmo arquivo `/etc/flussonic/flussonic.conf`, o stream de teste usado foi:

```conf
stream escola_24h_teste {
  input playlist:///opt/flussonic/priv/escola_24h_teste/playlist.txt;
}
```

Ponto importante:

- o nome do stream e o nome que voce vai usar no player
- a source precisa apontar para o caminho absoluto da playlist

## Passo 5. Recarregar o Flussonic

Depois de alterar o config:

```bash
service flussonic reload
```

## Passo 6. Verificar se subiu

No teste feito neste servidor, o log mostrou:

- abertura da source `playlist:///opt/flussonic/priv/escola_24h_teste/playlist.txt`
- troca para o arquivo `vod/bunny.mp4`

Isso confirma que o canal entrou em execucao.

### Endpoint HLS

O canal ficou acessivel em:

```text
http://127.0.0.1/escola_24h_teste/index.m3u8
```

Em producao, troque `127.0.0.1` pelo IP ou dominio do seu Flussonic.

## Teste realizado

No servidor de teste, eu confirmei:

1. o Flussonic estava ativo
2. os arquivos locais em `/opt/flussonic/priv` existiam
3. a config com `vod vod { storage /opt/flussonic/priv; }` foi recarregada com sucesso
4. o stream `escola_24h_teste` abriu com `playlist:///opt/flussonic/priv/escola_24h_teste/playlist.txt`
5. o endpoint `http://127.0.0.1/escola_24h_teste/index.m3u8` respondeu `200 OK`

## Boas praticas

- use videos com codec, resolucao e bitrate parecidos
- prefira arquivos em `mp4` com H.264 e AAC
- deixe a playlist organizada na ordem certa
- se quiser um canal longo, repita a lista na ordem desejada
- mantenha todos os arquivos no proprio servidor do Flussonic

## Resumo curto

Se voce quer um canal 24h com videos proprios, o melhor caminho e:

1. subir os videos para `/opt/flussonic/priv/<canal>/`
2. criar `playlist.txt`
3. criar `stream <nome> { input playlist:///caminho/da/playlist.txt; }`
4. rodar `service flussonic reload`

Esse foi o fluxo que funcionou neste servidor.
