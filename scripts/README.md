# Atualizacao automatica direto da Wiki

Agora a atualizacao da base foi trocada por um crawler da propria AQW Wiki.

## Como usar

O jeito mais simples:

```bat
scripts\update-from-wiki.bat
```

Ao abrir, ele mostra um menu:

- `1` Atualizacao rapida
- `2` Atualizacao completa
- `3` Varredura completa
- `4` Sair

Normalmente voce vai usar a opcao `1`.

Isso faz o seguinte:

- abre varias paginas-base da AQW Wiki
- coleta links de itens
- compara com o seu `data/WikiItems.json`
- adiciona itens novos automaticamente
- cria backup em `data/backups`
- mostra o resultado na tela e espera voce apertar uma tecla

## Arquivos importantes

- `scripts/update-from-wiki.bat`
- `scripts/update-from-wiki.ps1`
- `scripts/crawl-config.json`

## Configuracao

As paginas-base que o crawler usa ficam em `scripts/crawl-config.json`.

Se um dia voce quiser ampliar a varredura, basta adicionar novas paginas nessa lista.

## Depois de atualizar

Recarregue a extensao em `chrome://extensions/` e atualize as abas da Wiki/CharPage.

## Diferenca entre os modos

### Atualizacao rapida

So adiciona itens que ainda nao existem na sua base.
E a melhor opcao para uso normal.

### Atualizacao completa

Tambem adiciona so itens novos, mas vai ate o fim da fila sem parar no limite rapido.
Use quando voce quiser atualizar mais a fundo antes de subir a base.

### Varredura completa

Faz uma revisao mais pesada da base usando `-FullRescan`.
Use so quando voce quiser forcar uma checagem maior.

## Observacao

Como a AQW Wiki nao oferece API oficial para isso, o crawler depende da estrutura atual do site.
Se a Wiki mudar o HTML, o script pode precisar de ajuste depois.
