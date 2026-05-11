/**
 * index.js
 * ─────────────────────────────────────────────────────────────────
 * Ponto de entrada do Bot de WhatsApp para narração de CS2.
 * Instancia o cliente do WhatsApp, registra os handlers de eventos
 * e processa os comandos enviados nos chats.
 * ─────────────────────────────────────────────────────────────────
 */

// Carrega as variáveis de ambiente do arquivo .env
require('dotenv').config();

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode                = require('qrcode-terminal');
const {
  getFormattedNews,
  getFormattedResults,
  getLiveMatchByTeam,
  connectScorebot,
  buscarJogosDoTime // <-- Adicione aqui também
} = require('./hltv-service');

// ─── Configuração ─────────────────────────────────────────────────

/** Time a ser monitorado pelo comando !narrar (definido no .env) */
const TEAM_NAME = process.env.TEAM_NAME || 'Furia';

/**
 * Controla se já existe uma narração ativa, evitando conexões
 * duplicadas ao Scorebot quando o usuário digita !narrar novamente.
 */
let narracaoAtiva = false;

// ─── Inicialização do Cliente WhatsApp ───────────────────────────

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: 'cs2-bot', 
  }),
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
  },
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',    
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--ignore-certificate-errors'
    ],
  },
}); // <--- O ERRO ESTAVA AQUI! Provavelmente faltou esse fechamento.

// ─── Eventos do Cliente ───────────────────────────────────────────

client.on('qr', (qr) => {
  console.log('\n📱 Escaneie o QR Code abaixo com seu WhatsApp:\n');
  qrcode.generate(qr, { small: true });
});

/**
 * Evento: 'authenticated'
 * Disparado quando o login é feito com sucesso.
 */
client.on('authenticated', () => {
  console.log('✅ Autenticado com sucesso!');
});

/**
 * Evento: 'auth_failure'
 * Disparado quando a autenticação falha (sessão expirada, etc.).
 */
client.on('auth_failure', (msg) => {
  console.error('❌ Falha na autenticação:', msg);
  console.log('   Apague a pasta .wwebjs_auth/ e reinicie para gerar um novo QR Code.');
});

/**
 * Evento: 'ready'
 * Disparado quando o cliente está pronto para enviar/receber mensagens.
 */
client.on('ready', () => {
  console.log('─────────────────────────────────────────');
  console.log('🤖 Bot CS2 está ONLINE e pronto!');
  console.log(`🎯 Time monitorado: ${TEAM_NAME}`);
  console.log('─────────────────────────────────────────');
  console.log('Comandos disponíveis:');
  console.log('  !news        → Últimas notícias CS2');
  console.log('  !resultados  → Últimos resultados');
  console.log('  !narrar      → Narração ao vivo da partida');
  console.log('  !jogo [time] → Busca agenda de um time específico');
  console.log('  !ajuda       → Lista de comandos');
  console.log('─────────────────────────────────────────\n');
});

/**
 * Evento: 'disconnected'
 * Disparado quando a sessão é desconectada.
 */
client.on('disconnected', (reason) => {
  console.warn('⚠️  Cliente desconectado:', reason);
});

// ─── Handler Principal de Mensagens ──────────────────────────────

/**
 * Evento: 'message'
 * Disparado para cada mensagem recebida em qualquer chat.
 * Aqui acontece o roteamento dos comandos do bot.
 */
client.on('message_create', async (msg) => {
  const texto  = (msg.body || '').trim().toLowerCase();
  const chatId = msg.from; // ID do chat para responder

  // Ignora mensagens que não são comandos (não começam com '!')
  if (!texto.startsWith('!')) return;

  console.log(`[Bot] Comando recebido: "${msg.body}" de ${chatId}`);

  // ── Comando: !ajuda ───────────────────────────────────────────
  if (texto === '!ajuda' || texto === '!help') {
    const ajuda =
      `🤖 *Bot de Narração CS2*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📰 *!news* — Últimas 5 notícias do CS2\n\n` +
      `🏆 *!resultados* — Últimos 5 placares\n\n` +
      `🔴 *!narrar* — Narração ao vivo da partida do *${TEAM_NAME}*\n\n` +
      `🔍 *!jogo [time]* — Mostra jogos ao vivo ou agenda de um time (Ex: !jogo NAVI)\n\n` +
      `❓ *!ajuda* — Exibe esta mensagem\n\n` +
      `_Fonte: HLTV.org_`;

    await msg.reply(ajuda);
    return;
  }

// ── Comando: !jogo [Time] ou !partida [Time] ──────────────────
  if (texto.startsWith('!jogo') || texto.startsWith('!partida')) {
    // Pega o que o usuário digitou depois do comando (ex: "navi" ou "imperial")
    const argumentoTime = msg.body.split(' ').slice(1).join(' ');

    if (!argumentoTime) {
      await msg.reply('⚠️ Por favor, diga qual time quer buscar.\nExemplo: *!jogo NAVI* ou *!partida Imperial*');
      return;
    }

    await msg.reply(`🔍 Buscando agenda do *${argumentoTime}* na HLTV...`);

    try {
      const resposta = await buscarJogosDoTime(argumentoTime);
      await msg.reply(resposta);
    } catch (erro) {
      console.error('[Bot] Erro no comando !jogo:', erro.message);
      await msg.reply('❌ Erro ao buscar os jogos. A HLTV pode estar bloqueando a conexão agora.');
    }
    return;
  }

  // ── Comando: !news ────────────────────────────────────────────
  if (texto === '!news' || texto === '!noticias') {
    await msg.reply('⏳ Buscando últimas notícias...');

    try {
      const resposta = await getFormattedNews();
      await msg.reply(resposta);
    } catch (erro) {
      console.error('[Bot] Erro no comando !news:', erro.message);
      await msg.reply('❌ Erro ao buscar notícias. Tente novamente.');
    }
    return;
  }

  // ── Comando: !resultados ──────────────────────────────────────
  if (texto === '!resultados' || texto === '!results') {
    await msg.reply('⏳ Buscando últimos resultados...');

    try {
      const resposta = await getFormattedResults();
      await msg.reply(resposta);
    } catch (erro) {
      console.error('[Bot] Erro no comando !resultados:', erro.message);
      await msg.reply('❌ Erro ao buscar resultados. Tente novamente.');
    }
    return;
  }

  // ── Comando: !narrar ──────────────────────────────────────────
  if (texto.startsWith('!narrar')) {
    if (narracaoAtiva) {
      await msg.reply('⚠️ Já existe uma narração ativa. Aguarde o fim da partida ou reinicie o bot.');
      return;
    }

    // Pega o nome do time digitado após o comando (ex: !narrar paiN)
    // Se não digitar nada, ele usa o TEAM_NAME do seu .env
    const args = msg.body.split(' ');
    const timeEscolhido = args.length > 1 ? args.slice(1).join(' ') : TEAM_NAME;

    await msg.reply(`🔍 Buscando partida ao vivo para: *${timeEscolhido}*...`);

    try {
      // Passamos o timeEscolhido para a função de busca
      const partida = await getLiveMatchByTeam(timeEscolhido);

      if (!partida) {
        await msg.reply(`❌ Não encontrei nenhuma partida ao vivo para *${timeEscolhido}* na HLTV agora.`);
        return;
      }

      const chat = await msg.getChat();
      narracaoAtiva = true;

      await msg.reply(`✅ Partida encontrada!\n🎮 *${partida.team1.name}* vs *${partida.team2.name}*\n🏆 ${partida.event.name}\n\n🛰️ Conectando ao Scorebot...`);

      await connectScorebot(partida.id, async (mensagem) => {
        try {
          await chat.sendMessage(mensagem);
        } catch (errEnvio) {
          console.error('[Bot] Erro ao enviar mensagem:', errEnvio.message);
        }

        if (mensagem.includes('Narração encerrada') || mensagem.includes('PARTIDA ENCERRADA')) {
          narracaoAtiva = false;
        }
      });

    } catch (erro) {
      narracaoAtiva = false;
      console.error('[Bot] Erro no comando !narrar:', erro.message);
      await msg.reply('❌ Erro ao iniciar a narração. Verifique os logs.');
    }
    return;
  }

  // ── Comando não reconhecido ───────────────────────────────────
  // Apenas comenta no log; não responde no chat para não ser intrusivo
  console.log(`[Bot] Comando desconhecido: "${msg.body}"`);
});

// ─── Inicialização ────────────────────────────────────────────────

/**
 * Inicia o cliente do WhatsApp.
 * O Puppeteer abrirá em background e, se necessário,
 * o QR Code será exibido no terminal.
 */
console.log('🚀 Iniciando Bot CS2 WhatsApp...');
console.log(`🎯 Monitorando time: ${TEAM_NAME}`);
console.log('   Aguarde o QR Code ou a confirmação de sessão salva...\n');

client.initialize();
