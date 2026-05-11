/**
 * hltv-service.js
 * ─────────────────────────────────────────────────────────────────
 * Módulo responsável por toda a comunicação com a API da HLTV.
 * Centraliza as chamadas para facilitar manutenção e tratamento de erros.
 * ─────────────────────────────────────────────────────────────────
 */

const { HLTV } = require('hltv-next');
const fetch = require('node-fetch');

// Configuração para evitar ECONNRESET e bloqueios do Cloudflare
HLTV.createInstance({
    hltvUrl: 'https://www.hltv.org',
    loadPage: async (url) => {
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                    'Referer': 'https://www.google.com/',
                    'Sec-Ch-Ua': '"Not-A.Brand";v="99", "Chromium";v="124", "Google Chrome";v="124"',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'cross-site'
                }
            });

            if (!response.ok) throw new Error(`Status: ${response.status}`);
            return response.text();
        } catch (error) {
            console.error(`[HLTV-Fix] Erro de conexão: ${error.message}`);
            throw error;
        }
    }
});

// ─── Emojis usados na formatação das mensagens ───────────────────
const EMOJI = {
  news:      '📰',
  trophy:    '🏆',
  skull:     '💀',
  headshot:  '🎯',
  bomb:      '💣',
  explosion: '💥',
  ct:        '🔵',
  t:         '🔴',
  win:       '✅',
  score:     '📊',
  live:      '🔴',
  wait:      '⏳',
  error:     '❌',
  fire:      '🔥',
  knife:     '🔪',
};

// ─── Mapeamento de armas para emojis ─────────────────────────────
const WEAPON_EMOJI = {
  ak47:         '🔫',
  m4a1:         '🔫',
  m4a4:         '🔫',
  awp:          '🎯',
  deagle:       '🔫',
  knife:        '🔪',
  bomb:         '💣',
  grenade:      '💥',
  molotov:      '🔥',
  incgrenade:   '🔥',
  default:      '🔫',
};

/**
 * Retorna o emoji correspondente à arma informada.
 * @param {string} weapon - Nome da arma (em minúsculas)
 * @returns {string} Emoji da arma
 */
function getWeaponEmoji(weapon) {
  if (!weapon) return WEAPON_EMOJI.default;
  const key = weapon.toLowerCase().replace(/[^a-z0-9]/g, '');
  return WEAPON_EMOJI[key] || WEAPON_EMOJI.default;
}

// ─────────────────────────────────────────────────────────────────
// NOTÍCIAS
// ─────────────────────────────────────────────────────────────────

/**
 * Busca as últimas notícias da HLTV e retorna uma mensagem formatada
 * com as 5 mais recentes.
 * @returns {Promise<string>} Mensagem formatada com as notícias
 */
async function getFormattedNews() {
  try {
    const news = await HLTV.getNews({ categoryName: 'CS2' });
    
    if (!news || news.length === 0) {
      return `${EMOJI.error} Nenhuma notícia encontrada no momento.`;
    }

    // Pega as 5 primeiras notícias
    const topNews = news.slice(0, 5);

    let mensagem = `${EMOJI.news} *Últimas Notícias CS2 - HLTV*\n`;
    mensagem += '━━━━━━━━━━━━━━━━━━━━━━\n\n';

    topNews.forEach((item, index) => {
      mensagem += `*${index + 1}.* ${item.title}\n`;
      if (item.date) {
        // Formata a data de forma legível
        const data = new Date(item.date);
        mensagem += `   🗓️ ${data.toLocaleDateString('pt-BR')}\n`;
      }
      mensagem += '\n';
    });

    mensagem += `🔗 Mais em: https://www.hltv.org/news`;
    return mensagem;

  } catch (erro) {
    console.error('[HLTV] Erro ao buscar notícias:', erro.message);
    return `${EMOJI.error} Erro ao buscar notícias. Tente novamente em instantes.`;
  }
}

// ─────────────────────────────────────────────────────────────────
// RESULTADOS RECENTES
// ─────────────────────────────────────────────────────────────────

/**
 * Busca os resultados recentes de partidas na HLTV e retorna
 * uma mensagem formatada com os 5 últimos placares.
 * @returns {Promise<string>} Mensagem formatada com os resultados
 */
async function getFormattedResults() {
  try {
    const results = await HLTV.getResults({ pages: 1 });

    if (!results || results.length === 0) {
      return `${EMOJI.error} Nenhum resultado encontrado no momento.`;
    }

    // Pega os 5 primeiros resultados
    const topResults = results.slice(0, 5);

    let mensagem = `${EMOJI.trophy} *Últimos Resultados CS2 - HLTV*\n`;
    mensagem += '━━━━━━━━━━━━━━━━━━━━━━\n\n';

    topResults.forEach((match, index) => {
      const time1   = match.team1?.name || 'Time 1';
      const time2   = match.team2?.name || 'Time 2';
      const placar1 = match.result?.team1 ?? '-';
      const placar2 = match.result?.team2 ?? '-';
      const evento  = match.event?.name || 'Evento desconhecido';

      // Determina o vencedor com emoji
      let linha = '';
      if (match.result) {
        const vencedor = placar1 > placar2 ? time1 : time2;
        linha = `*${time1}* ${placar1} x ${placar2} *${time2}*\n`;
        linha += `   ${EMOJI.win} ${vencedor} | 📍 ${evento}\n`;
      } else {
        linha = `*${time1}* vs *${time2}*\n`;
        linha += `   📍 ${evento}\n`;
      }

      mensagem += `*${index + 1}.* ${linha}\n`;
    });

    return mensagem;

  } catch (erro) {
    console.error('[HLTV] Erro ao buscar resultados:', erro.message);
    return `${EMOJI.error} Erro ao buscar resultados. Tente novamente em instantes.`;
  }
}

// ─────────────────────────────────────────────────────────────────
// PARTIDAS AO VIVO
// ─────────────────────────────────────────────────────────────────

/**
 * Busca as partidas ao vivo na HLTV e filtra pelo time configurado no .env.
 * @param {string} teamName - Nome do time a procurar (ex: "Furia")
 * @returns {Promise<Object|null>} Objeto da partida encontrada ou null
 */
async function getLiveMatchByTeam(nomeDoTime) {
    const matches = await HLTV.getMatches();
    
    // Filtra apenas as que estão AO VIVO (Live)
    const liveMatches = matches.filter(m => m.status === 'Live');
    
    // Procura o time dentro das partidas ao vivo
    return liveMatches.find(m => 
        (m.team1?.name.toLowerCase().includes(nomeDoTime.toLowerCase()) || 
         m.team2?.name.toLowerCase().includes(nomeDoTime.toLowerCase()))
    );
}

// ─────────────────────────────────────────────────────────────────
// FORMATAÇÃO DOS EVENTOS DO SCOREBOT (WebSocket)
// ─────────────────────────────────────────────────────────────────

/**
 * Processa um array de logs recebidos do WebSocket do Scorebot da HLTV
 * e retorna um array de mensagens formatadas prontas para enviar no WhatsApp.
 *
 * @param {Array} logs - Array de eventos recebidos via onLogUpdate
 * @returns {string[]} Array de mensagens formatadas
 */
function formatLogEvents(logs) {
  const mensagens = [];

  if (!Array.isArray(logs)) return mensagens;

  logs.forEach(evento => {
    const tipo = evento.type || evento.Type || '';

    // ── Kill ──────────────────────────────────────────────────────
    if (tipo === 'Kill' || tipo === 'kill') {
      const atacante  = evento.attacker  || evento.Attacker  || 'Desconhecido';
      const vitima    = evento.victim    || evento.Victim    || 'Desconhecido';
      const arma      = evento.weapon    || evento.Weapon    || '';
      const headshot  = evento.headshot  || evento.Headshot  || false;
      const weaponEmoji = getWeaponEmoji(arma);
      const hsTag     = headshot ? ` ${EMOJI.headshot} *HEADSHOT!*` : '';
      const armaLabel = arma ? ` (${arma})` : '';

      mensagens.push(
        `${EMOJI.skull} *${atacante}* eliminou *${vitima}*${armaLabel} ${weaponEmoji}${hsTag}`
      );
    }

    // ── Bomb Planted ──────────────────────────────────────────────
    else if (tipo === 'BombPlanted' || tipo === 'bomb_planted' || tipo === 'BombPlant') {
      const plantador = evento.player || evento.Player || 'um jogador';
      const site      = evento.site   || evento.Site   || '';
      const siteLabel = site ? ` no site *${site.toUpperCase()}*` : '';

      mensagens.push(
        `${EMOJI.bomb} *BOMBA PLANTADA${siteLabel}* por ${plantador}! ${EMOJI.explosion}`
      );
    }

    // ── Round End ─────────────────────────────────────────────────
    else if (tipo === 'RoundEnd' || tipo === 'round_end' || tipo === 'RoundWin') {
      const winner    = evento.winner    || evento.Winner    || '';
      const winnerStr = evento.winnerString || evento.WinnerString || '';
      const ctScore   = evento.ctScore   || evento.CTScore   || 0;
      const tScore    = evento.tScore    || evento.TScore    || 0;

      // Determina lado vencedor
      let ladoEmoji = EMOJI.win;
      let ladoLabel = winner || winnerStr || 'Lado desconhecido';

      if (ladoLabel.toUpperCase().includes('CT')) {
        ladoEmoji = EMOJI.ct;
        ladoLabel = 'Counter-Terrorists (CT)';
      } else if (ladoLabel.toUpperCase().includes('T')) {
        ladoEmoji = EMOJI.t;
        ladoLabel = 'Terrorists (T)';
      }

      mensagens.push(
        `\n${ladoEmoji} *FIM DE ROUND!*\n` +
        `${EMOJI.win} Vencedor: *${ladoLabel}*\n` +
        `${EMOJI.score} Placar: CT *${ctScore}* x T *${tScore}*\n`
      );
    }

    // ── Match End (bonus) ─────────────────────────────────────────
    else if (tipo === 'MatchEnd' || tipo === 'match_end') {
      const winnerTeam = evento.winner || evento.Winner || 'Time vencedor';
      mensagens.push(
        `\n${EMOJI.trophy} *PARTIDA ENCERRADA!*\n` +
        `🥇 Vencedor: *${winnerTeam}*\n`
      );
    }
  });

  return mensagens;
}

// ─────────────────────────────────────────────────────────────────
// SCOREBOT — CONEXÃO WEBSOCKET
// ─────────────────────────────────────────────────────────────────

/**
 * Conecta ao Scorebot da HLTV para uma partida específica e chama
 * o callback `onMessage` sempre que houver eventos para narrar.
 *
 * @param {number}   matchId   - ID da partida na HLTV
 * @param {Function} onMessage - Callback chamado com a mensagem formatada (string)
 * @returns {Promise<void>}
 */
async function connectScorebot(matchId, callback) {
    HLTV.connectToScorebot({
        id: matchId,
        // 👇 AQUI ESTÁ A MÁGICA DA CONFIRMAÇÃO 👇
        onConnect: () => {
            console.log(`[Scorebot] Conectado na partida ${matchId}!`);
            callback('📡 *Conexão estabelecida com sucesso!* Ouvindo o servidor da HLTV...');
        },
        onDisconnect: () => {
            console.log(`[Scorebot] Desconectado da partida ${matchId}.`);
            callback('🛑 *Narração encerrada* (Partida acabou ou conexão caiu).');
        },
        // 👇 LOG DE EVENTOS (KILLS, BOMBA, ETC) 👇
        onLogUpdate: (data) => {
            if (!data || !data.log || data.log.length === 0) return;
            
            // Pega o último evento que aconteceu
            const evento = Object.values(data.log[0])[0]; 
            const tipo = Object.keys(data.log[0])[0];

            if (tipo === 'Kill') {
                const headshot = evento.headShot ? "🎯 (HS)" : "";
                callback(`💀 *${evento.killerName}* matou ${evento.victimName} com ${evento.weapon} ${headshot}`);
            } 
            else if (tipo === 'BombPlanted') {
                callback(`💣 *BOMBA PLANTADA* pelo(a) ${evento.playerName}!`);
            }
            else if (tipo === 'RoundEnd') {
                const vencedor = evento.winner === 'Terrorist' ? 'TRs' : 'CTs';
                callback(`🏁 *FIM DE ROUND:* ${vencedor} ganharam!\nPlacar: CT ${evento.counterTerroristScore} - ${evento.terroristScore} TR`);
            }
        }
    });
}

async function buscarJogosDoTime(nomeDoTime) {
    try {
        const matches = await HLTV.getMatches();
        
        // Limpa o nome buscado (remove espaços e coloca em minúsculo)
        const buscaLimpa = nomeDoTime.trim().toLowerCase();
        
        // Filtra garantindo que existam os nomes dos times antes de comparar
        const partidas = matches.filter(m => {
            const t1 = (m.team1?.name || '').toLowerCase();
            const t2 = (m.team2?.name || '').toLowerCase();
            return t1.includes(buscaLimpa) || t2.includes(buscaLimpa);
        });

        if (partidas.length === 0) {
            return `❌ Nenhuma partida encontrada para *${nomeDoTime}* nos próximos dias.`;
        }

        let resposta = `🎮 *Busca: ${nomeDoTime.toUpperCase()}*\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        partidas.slice(0, 3).forEach(m => {
            const t1 = m.team1?.name || 'TBD';
            const t2 = m.team2?.name || 'TBD';
            const evento = m.event?.name || 'Evento';

            if (m.status === 'Live' || m.live) {
                resposta += `🔴 *AO VIVO AGORA*\n⚔️ ${t1} vs ${t2}\n📍 ${evento}\n\n`;
            } else if (m.date) {
                const dataObj = new Date(m.date);
                const dataFormatada = dataObj.toLocaleDateString('pt-BR');
                const horaFormatada = dataObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                
                resposta += `🗓️ *${dataFormatada} - ${horaFormatada}*\n⚔️ ${t1} vs ${t2}\n📍 ${evento}\n\n`;
            }
        });

        return resposta;
    } catch (erro) {
        console.error('[HLTV] Erro ao buscar agenda:', erro.message);
        return '❌ Erro ao acessar a agenda da HLTV.';
    }
}
// ─────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────
module.exports = {
  getFormattedNews,
  getFormattedResults,
  getLiveMatchByTeam,
  connectScorebot,
  buscarJogosDoTime // <-- Adicione ela aqui na lista de exportação!
};
