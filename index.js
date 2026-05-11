/**
 * index.js
 * ─────────────────────────────────────────────────────────────────
 * Bot de WhatsApp para narração de CS2 via HLTV (HTTP Polling).
 * ─────────────────────────────────────────────────────────────────
 */
 
require('dotenv').config();
 
const { Client, LocalAuth } = require('whatsapp-web.js');
const {
  getFormattedNews,
  getFormattedResults,
  getLiveMatchByTeam,
  buscarJogosDoTime,
  startPolling,
} = require('./hltv-service');
 
// ─── Configuração ─────────────────────────────────────────────────
 
const PHONE_NUMBER = process.env.PHONE_NUMBER; // Ex: 5547999999999
const TEAM_NAME    = process.env.TEAM_NAME || 'Furia';
 
// ─── Estado Global ────────────────────────────────────────────────
 
let narracaoAtiva  = false;
let stopPolling    = null;   // função retornada por startPolling() para cancelar
let ultimaExecucao = 0;      // cooldown anti-spam
 
// ─── Cliente WhatsApp ─────────────────────────────────────────────
 
const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'cs2-bot' }),
  webVersionCache: {
    type: 'remote',
    remotePath:
      'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
  },
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  },
});
 
// ─── Eventos do Cliente ───────────────────────────────────────────
 
client.on('qr', async () => {
  if (!PHONE_NUMBER) {
    console.log('\n⚠️  PHONE_NUMBER não definido no .env!');
    console.log('   Adicione PHONE_NUMBER=55XXXXXXXXXXX no .env e reinicie.\n');
    return;
  }
  try {
    const code = await client.requestPairingCode(PHONE_NUMBER);
    console.log(`\n╔══════════════════════════════════════╗`);
    console.log(`║  CÓDIGO DE CONEXÃO: ${code.padEnd(16)} ║`);
    console.log(`╚══════════════════════════════════════╝`);
    console.log('   WhatsApp → Dispositivos → Conectar → Código de 8 dígitos\n');
  } catch (err) {
    console.error('❌ Erro ao gerar código de pareamento:', err.message);
  }
});
 
client.on('authenticated', () => console.log('✅ Autenticado com sucesso!'));
 
client.on('ready', () => {
  console.log('\n─────────────────────────────────────────');
  console.log('🤖 Bot CS2 ONLINE');
  console.log(`🎯 Time padrão (.env): ${TEAM_NAME}`);
  console.log('Comandos: !ajuda | !news | !resultados | !jogo | !narrar | !parar');
  console.log('─────────────────────────────────────────\n');
});
 
client.on('disconnected', reason => console.warn('⚠️  Desconectado:', reason));
 
// ─── Handler de Mensagens ─────────────────────────────────────────
 
client.on('message_create', async (msg) => {
  const texto = (msg.body || '').trim().toLowerCase();
  if (!texto.startsWith('!')) return;
 
  // Cooldown de 5s por usuário (baseado no chat)
  const agora = Date.now();
  if (agora - ultimaExecucao < 5000) return;
  ultimaExecucao = agora;
 
  const args    = texto.split(' ');
  const comando = args[0];
  const argTime = args.slice(1).join(' ').trim();
 
  console.log(`[Bot] Comando: "${texto}"`);
 
  // ── !ajuda ────────────────────────────────────────────────────
  if (comando === '!ajuda' || comando === '!help') {
    return msg.reply(
      `🤖 *Bot de Narração CS2*\n━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📰 *!news* — Últimas notícias CS2\n` +
      `🏆 *!resultados* — Últimos 5 placares\n` +
      `🔍 *!jogo [time]* — Agenda de partidas\n` +
      `🔴 *!narrar [time]* — Narração ao vivo (placar + KDA a cada 2 rounds)\n` +
      `🛑 *!parar* — Interrompe a narração\n\n` +
      `_Time padrão: ${TEAM_NAME}_\n` +
      `_Atualização: a cada ~45 segundos_`
    );
  }
 
  // ── !news ─────────────────────────────────────────────────────
  if (comando === '!news' || comando === '!noticias') {
    await msg.reply('⏳ Buscando notícias...');
    return msg.reply(await getFormattedNews());
  }
 
  // ── !resultados ───────────────────────────────────────────────
  if (comando === '!resultados' || comando === '!results') {
    await msg.reply('⏳ Buscando resultados...');
    return msg.reply(await getFormattedResults());
  }
 
  // ── !jogo ─────────────────────────────────────────────────────
  if (comando === '!jogo' || comando === '!partida') {
    const time = argTime || TEAM_NAME;
    await msg.reply(`🔍 Buscando agenda de *${time}*...`);
    return msg.reply(await buscarJogosDoTime(time));
  }
 
  // ── !parar ────────────────────────────────────────────────────
  if (comando === '!parar') {
    if (!narracaoAtiva) return msg.reply('⚠️ Nenhuma narração está rodando.');
    narracaoAtiva = false;
    if (stopPolling) { stopPolling(); stopPolling = null; }
    return msg.reply('🛑 *Narração encerrada!*');
  }
 
  // ── !narrar ───────────────────────────────────────────────────
  if (comando === '!narrar') {
    const time = argTime || TEAM_NAME;
 
    if (narracaoAtiva) {
      return msg.reply(
        `⚠️ Já existe uma narração ativa!\nUse *!parar* antes de iniciar outra.`
      );
    }
 
    await msg.reply(`🔍 Buscando partida ao vivo de *${time}*...`);
    console.log(`[Bot] Buscando partida ao vivo: "${time}"`);
 
    // 1. Localiza a partida ao vivo
    const partida = await getLiveMatchByTeam(time);
 
    if (!partida) {
      console.log(`[Bot] Nenhuma partida ao vivo encontrada para "${time}".`);
      return msg.reply(
        `😴 *${time}* não está jogando ao vivo agora.\n\nUse *!jogo ${time}* para ver a agenda.`
      );
    }
 
    const t1     = partida.team1?.name || 'Time 1';
    const t2     = partida.team2?.name || 'Time 2';
    const evento = partida.event?.name || 'Evento';
 
    // liveScore vem direto do getMatches() — placar imediato sem request extra
    const s1 = partida.liveScore?.team1 ?? 0;
    const s2 = partida.liveScore?.team2 ?? 0;
 
    console.log(`[Bot] ✅ Partida encontrada! ${t1} vs ${t2} | ID: ${partida.id} | Placar inicial: ${s1}x${s2}`);
 
    const chat = await msg.getChat();
 
    await chat.sendMessage(
      `🎮 *PARTIDA ENCONTRADA!*\n━━━━━━━━━━━━━━━━━━━━━━\n` +
      `⚔️ *${t1}* vs *${t2}*\n` +
      `📍 ${evento}\n` +
      `📊 Placar atual: *${t1} ${s1} x ${s2} ${t2}*\n\n` +
      `🔄 Iniciando monitoramento por polling...\n` +
      `_KDA a cada 2 rounds (~45s de delay)_`
    );
 
    narracaoAtiva = true;
 
    // 2. Inicia o polling e armazena a função stop()
    stopPolling = startPolling(
      partida.id,
 
      // onUpdate — chamado a cada 2 rounds com o pacote formatado
      async (mensagem) => {
        if (!narracaoAtiva) return;
        try {
          await chat.sendMessage(mensagem);
        } catch (err) {
          console.error('[Bot] Erro ao enviar mensagem de update:', err.message);
        }
      },
 
      // onEnd — chamado quando a partida encerra ou ocorre erro fatal
      async (errMsg) => {
        narracaoAtiva = false;
        stopPolling   = null;
 
        const textoFinal = errMsg
          ? `❌ *Narração encerrada por erro:*\n_${errMsg}_`
          : `🏁 *Partida encerrada!*\nNarração finalizada automaticamente.`;
 
        console.log(`[Bot] Narração encerrada. Erro: ${errMsg || 'nenhum'}`);
 
        try {
          await chat.sendMessage(textoFinal);
        } catch (err) {
          console.error('[Bot] Erro ao enviar mensagem final:', err.message);
        }
      }
    );
 
    return;
  }
});
 
// ─── Inicialização ────────────────────────────────────────────────
 
console.log('🚀 Iniciando Bot CS2...');
console.log(`🎯 Time padrão: ${TEAM_NAME}`);
if (!PHONE_NUMBER) console.warn('⚠️  PHONE_NUMBER não definido no .env — código de pareamento não funcionará.');
client.initialize();
 