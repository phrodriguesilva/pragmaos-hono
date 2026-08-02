# PragmaOS — Extensão PJe

Extensão de navegador (Chrome/Firefox/Edge) para capturar andamentos e documentos do PJe e enviar para o PragmaOS.

## Instalação (desenvolvedor)

1. Abra `chrome://extensions` (ou `edge://extensions`)
2. Ative "Modo do desenvolvedor"
3. Clique em "Carregar sem compactação"
4. Selecione a pasta `extension/`

## Configuração

1. Clique no ícone da extensão
2. Vá em "Configurações"
3. Informe:
   - **URL do PragmaOS**: `https://app.pragmaos.com.br` (ou sua instância)
   - **API Key**: gere em PragmaOS > Administração > API e Webhooks
     - Escopos necessários: `cases:read` e `cases:write`

## Uso

1. Abra uma página de processo no PJe
2. Clique no ícone da extensão
3. O número CNJ será detectado automaticamente
4. Clique em "Capturar Andamentos"
5. Os movimentos e documentos serão enviados para o caso correspondente no PragmaOS

## Como funciona

- **content.js**: roda nas páginas do PJe, detecta o número CNJ e extrai movimentos da tabela
- **popup.js**: interface do popup, coordena a captura e envio para a API
- **background.js**: service worker para lifecycle
- **API**: `POST /api/v1/extension/capture` recebe os dados capturados

## Requisitos

- O caso deve existir no PragmaOS com o número CNJ correspondente
- A API key deve ter escopos `cases:read` e `cases:write`
- A extensão só ativa em domínios `*.pje.jus.br`, `*.pje.trt.jus.br`, `*.pje.tj.jus.br`, `*.pje.trf.jus.br`
