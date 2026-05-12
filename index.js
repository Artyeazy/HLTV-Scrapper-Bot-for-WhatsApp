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
  getTeamInfo, // <-- Importação da nova função
  startPolling,
} = require('./hltv-service');
 
// ─── Configuração ─────────────────────────────────────────────────
 
const PHONE_NUMBER = process.env.PHONE_NUMBER; 
const TEAM_NAME    = process.env.TEAM_NAME || '';
 
// ─── Estado Global ────────────────────────────────────────────────
 
let narracaoAtiva  = false;
let stopPolling    = null;   
let ultimaExecucao = 0;      
 
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
  console.log(`🎯 Time padrão (.env): ${TEAM_NAME || 'Nenhum'}`);
  console.log('Comandos: !ajuda | !news | !resultados | !agenda | !time | !narrar | !parar');
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
 
  console.log(`[Bot] Comando recebido: "${texto}"`);
 
  // ── !ajuda ────────────────────────────────────────────────────
  if (comando === '!ajuda' || comando === '!help') {
    return msg.reply(
      `🤖 *Bot de Informações sobre CS2*\n━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📰 *!news* — Últimas notícias CS2\n` +
      `🏆 *!resultados* — Jogos ao vivo + Últimos placares\n` +
      `🛡️ *!time [nome]* — Ranking, Line-up e Últimos jogos\n` +
      `📅 *!agenda [nome]* — Próximas partidas\n` +
      `⚠️ *!narrar* — Função temporariamente desativada\n`
    );
  }
 
  // ── !news ─────────────────────────────────────────────────────
  if (comando === '!news' || comando === '!noticias') {
    await msg.reply('⏳ Buscando notícias...');
    return msg.reply(await getFormattedNews());
  }
 
  // ── !resultados ───────────────────────────────────────────────
  if (comando === '!resultados' || comando === '!results') {
    await msg.reply('⏳ Analisando a HLTV...');
    return msg.reply(await getFormattedResults());
  }
 
  // ── !agenda (Antigo !jogo) ────────────────────────────────────
  if (comando === '!agenda') {
    const time = argTime || TEAM_NAME;
    if (!time) return msg.reply('⚠️ Especifique o time! Ex: *!agenda furia*');
    await msg.reply(`🔍 Buscando agenda de *${time}*...`);
    return msg.reply(await buscarJogosDoTime(time));
  }

  // ── !time ─────────────────────────────────────────────────────
  if (comando === '!time') {
    const time = argTime || TEAM_NAME;
    if (!time) return msg.reply('⚠️ Especifique o time! Ex: *!time navi*');
    await msg.reply(`🔍 Puxando a ficha do time *${time}*...`);
    return msg.reply(await getTeamInfo(time));
  }
 
  // ── !parar ────────────────────────────────────────────────────
  if (comando === '!parar') {
    if (!narracaoAtiva) return msg.reply('⚠️ Nenhuma narração está rodando.');
    narracaoAtiva = false;
    if (stopPolling) { stopPolling(); stopPolling = null; }
    return msg.reply('🛑 *Narração encerrada!*');
  }
 
   //── !narrar ───────────────────────────────────────────────────
  if (comando === '!narrar') {
    const time = argTime || TEAM_NAME;
 
    if (narracaoAtiva) {
      return msg.reply(
        `⚠️ Já existe uma narração ativa!\nUse *!parar* antes de iniciar outra.`
      );
    }
 
    await msg.reply(`🔍 Buscando partida ao vivo de *${time}*...`);
    console.log(`[Bot] Buscando partida ao vivo: "${time}"`);
 
    const partida = await getLiveMatchByTeam(time);
 
    if (!partida) {
      console.log(`[Bot] Nenhuma partida ao vivo encontrada para "${time}".`);
      return msg.reply(
        `😴 *${time}* não está jogando ao vivo agora.\n\nUse *!agenda ${time}* para ver os próximos jogos.`
      );
    }
 
    const chat = await msg.getChat();
    narracaoAtiva = true;
 
    stopPolling = startPolling(
      partida.id,
      async (mensagem) => {
        if (!narracaoAtiva) return;
        try {
          await chat.sendMessage(mensagem);
        } catch (err) {
          console.error('[Bot] Erro ao enviar mensagem de update:', err.message);
        }
      },
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
client.initialize();