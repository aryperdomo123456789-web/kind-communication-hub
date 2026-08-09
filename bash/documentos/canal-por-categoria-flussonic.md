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

## Estrutura recomendada

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

## Exemplo de canais

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

## Exemplo de configuracao

```conf
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

## Resumo curto

1. pasta raiz da categoria
2. pasta por canal
3. 5 videos por canal
4. playlist.txt por canal
5. stream por canal usando playlist://
