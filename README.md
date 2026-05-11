# 🤖 Bot CS2 WhatsApp — Narração Ao Vivo via HLTV

Bot de WhatsApp que narra partidas de CS2 em tempo real usando dados da HLTV.org.

---

## 📋 Pré-requisitos

- **Node.js** v18 ou superior
- **npm** v9 ou superior
- **WhatsApp** instalado no celular para o primeiro login (QR Code)
- Conexão com a internet

---

## 🚀 Instalação e Execução

### 1. Clone ou copie o projeto
```bash
cd cs2-whatsapp-bot
```

### 2. Instale as dependências
```bash
npm install
```
> ⚠️ O `whatsapp-web.js` baixa o Chromium automaticamente. Pode demorar alguns minutos.

### 3. Configure o time no `.env`
Edite o arquivo `.env` e defina o time que deseja monitorar:
```env
TEAM_NAME=Furia
```

### 4. Inicie o bot
```bash
npm start
```

### 5. Escaneie o QR Code
Na primeira execução, um QR Code aparecerá no terminal.  
Abra o WhatsApp no celular → Dispositivos conectados → Conectar dispositivo → Escaneie.

> ✅ Após o primeiro login, a sessão é salva na pasta `.wwebjs_auth/` e você **não precisará** escanear novamente.

---

## 💬 Comandos Disponíveis

| Comando        | Descrição                                             |
|----------------|-------------------------------------------------------|
| `!ajuda`       | Lista todos os comandos disponíveis                   |
| `!news`        | Exibe as 5 últimas notícias do CS2 na HLTV           |
| `!resultados`  | Exibe os 5 últimos placares de partidas              |
| `!narrar`      | Inicia narração ao vivo da partida do time do `.env` |

---

## 🗂️ Estrutura do Projeto

```
cs2-whatsapp-bot/
├── index.js          # Ponto de entrada; cliente WhatsApp e roteamento de comandos
├── hltv-service.js   # Módulo da API HLTV (notícias, resultados, scorebot)
├── package.json      # Dependências e scripts
├── .env              # Variável TEAM_NAME (não commitar)
├── .gitignore        # Ignora node_modules, sessão e .env
└── README.md         # Esta documentação
```

---

## ⚙️ Como funciona o `!narrar`

1. Busca todas as partidas ao vivo na HLTV via `HLTV.getMatches()`
2. Filtra pela partida onde o time do `.env` está jogando
3. Conecta ao **Scorebot WebSocket** da HLTV via `HLTV.connectToScorebot()`
4. Para cada evento recebido (`onLogUpdate`), formata e envia no WhatsApp:
   - 💀 **Kill** → Quem matou quem, arma utilizada e se foi headshot
   - 💣 **Bomba Plantada** → Player e site (A ou B)
   - 🔵🔴 **Fim de Round** → Lado vencedor e placar atualizado

---

## 🔧 Solução de Problemas

| Problema | Solução |
|---|---|
| QR Code não aparece | Aguarde ~30s; o Puppeteer demora para iniciar |
| Sessão expirada | Apague `.wwebjs_auth/` e reinicie |
| Erro de sandbox | O `--no-sandbox` já está configurado; se persistir, rode como root |
| `!narrar` não encontra a partida | Verifique se o nome no `.env` bate com o nome exato na HLTV |
| Narração não inicia | A partida pode ter encerrado ou o ID mudou; tente novamente |

---

## 🛠️ Tecnologias

- [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) — Cliente não-oficial do WhatsApp Web
- [hltv](https://github.com/gigobyte/HLTV) — API não-oficial da HLTV
- [dotenv](https://github.com/motdotla/dotenv) — Variáveis de ambiente
- [qrcode-terminal](https://github.com/gtanner/qrcode-terminal) — QR Code no terminal
