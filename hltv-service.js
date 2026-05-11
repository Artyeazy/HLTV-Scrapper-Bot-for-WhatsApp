/**
 * hltv-service.js
 * ─────────────────────────────────────────────────────────────────
 * Módulo de comunicação com a HLTV via hltv-next.
 * ─────────────────────────────────────────────────────────────────
 */
 
const { HLTV } = require('hltv-next');
 
const POLL_INTERVAL_MS = 45_000;
 
async function getFormattedNews() {
  try {
    const news = await HLTV.getNews({ categoryName: 'CS2' });
    if (!news?.length) return '❌ Nenhuma notícia encontrada.';
 
    let msg = `📰 *Últimas Notícias CS2 - HLTV*\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    news.slice(0, 5).forEach((item, i) => {
      const data = item.date ? new Date(item.date).toLocaleDateString('pt-BR') : '';
      msg += `*${i + 1}.* ${item.title}\n${data ? `   🗓️ ${data}\n` : ''}\n`;
    });
    msg += `🔗 https://www.hltv.org/news`;
    return msg;
  } catch (e) {
    console.error('[HLTV] getFormattedNews:', e.message);
    return '❌ Erro ao buscar notícias (Cloudflare/HLTV).';
  }
}
 
async function getFormattedResults() {
  try {
    const results = await HLTV.getResults({ pages: 1 });
    if (!results?.length) return '❌ Nenhum resultado encontrado.';
 
    let msg = `🏆 *Últimos Resultados CS2 - HLTV*\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    results.slice(0, 5).forEach((m, i) => {
      const t1     = m.team1?.name || 'Time 1';
      const t2     = m.team2?.name || 'Time 2';
      const s1     = m.result?.team1 ?? '-';
      const s2     = m.result?.team2 ?? '-';
      const evento = m.event?.name   || 'Evento';
 
      if (m.result) {
        const w = Number(s1) > Number(s2) ? t1 : t2;
        msg += `*${i + 1}.* *${t1}* ${s1} x ${s2} *${t2}*\n   ✅ ${w} | 📍 ${evento}\n\n`;
      } else {
        msg += `*${i + 1}.* *${t1}* vs *${t2}*\n   📍 ${evento}\n\n`;
      }
    });
    return msg;
  } catch (e) {
    console.error('[HLTV] getFormattedResults:', e.message);
    return '❌ Erro ao buscar resultados (Cloudflare/HLTV).';
  }
}
 
async function buscarJogosDoTime(nomeDoTime) {
  try {
    const matches = await HLTV.getMatches();
    const busca   = nomeDoTime.trim().toLowerCase();
 
    const partidas = matches.filter(m => {
      const t1 = (m.team1?.name || '').toLowerCase();
      const t2 = (m.team2?.name || '').toLowerCase();
      return t1.includes(busca) || t2.includes(busca);
    });
 
    if (!partidas.length)
      return `❌ Nenhuma partida encontrada para *${nomeDoTime}* nos próximos dias.`;
 
    let msg = `🎮 *Agenda: ${nomeDoTime.toUpperCase()}*\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    partidas.slice(0, 5).forEach(m => {
      const t1     = m.team1?.name || 'TBD';
      const t2     = m.team2?.name || 'TBD';
      const evento = m.event?.name || 'Evento';
 
      if (m.live) {
        msg += `🔴 *AO VIVO AGORA*\n⚔️ ${t1} vs ${t2}\n📍 ${evento}\n\n`;
      } else if (m.date) {
        const d    = new Date(m.date);
        const data = d.toLocaleDateString('pt-BR');
        const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        msg += `🗓️ *${data} às ${hora}*\n⚔️ ${t1} vs ${t2}\n📍 ${evento}\n\n`;
      }
    });
    return msg;
  } catch (e) {
    console.error('[HLTV] buscarJogosDoTime:', e.message);
    return '❌ Erro ao buscar agenda (Cloudflare/HLTV).';
  }
}
 
async function getLiveMatchByTeam(nomeDoTime) {
  try {
    const matches = await HLTV.getMatches();
    const busca   = nomeDoTime.trim().toLowerCase();
 
    return matches.find(m => {
      const t1 = (m.team1?.name || '').toLowerCase();
      const t2 = (m.team2?.name || '').toLowerCase();
      return m.live === true && (t1.includes(busca) || t2.includes(busca));
    }) || null;
  } catch (e) {
    console.error('[HLTV] getLiveMatchByTeam:', e.message);
    return null;
  }
}
 
function startPolling(matchId, onUpdate, onEnd) {
  let ultimoTotalRounds = -1;
  let ativo = true;
  let scorebotConectado = false;

  console.log(`[HLTV] Iniciando narração para partida ${matchId}`);

  const tentarScorebot = () => {
    if (!ativo) return;
    
    try {
      HLTV.connectToScorebot({
        id: matchId,
        onScoreboardUpdate: (data) => {
          if (!ativo) return;
          scorebotConectado = true;

          const totalRounds = data.ctScore + data.tScore;
          const ehPrimeira = ultimoTotalRounds === -1;
          const doisNovos  = totalRounds >= ultimoTotalRounds + 2;
          
          if (ehPrimeira || doisNovos) {
            ultimoTotalRounds = totalRounds;
            
            const emIntervalo = data.frozen; 
            const mapaNome = data.mapName || 'Mapa';

            let msg = `🔥 *PLACAR — Round ${totalRounds} | ${mapaNome.toUpperCase()}*\n`;
            msg    += `━━━━━━━━━━━━━━━━━━━━━━\n`;
            msg    += `📊 *${data.ctTeamName}* ${data.ctScore} x ${data.tScore} *${data.tTeamName}*\n`;
            if (emIntervalo) msg += `⏳ *STATUS:* EM INTERVALO\n`;
            msg    += `\n`;

            msg += `🔵 *${data.ctTeamName} (CT) — K/D/A*\n`;
            data.ctPlayers.sort((a,b) => b.kills - a.kills).forEach(p => {
              msg += `▪️ *${p.name}* — ${p.kills}/${p.deaths}/${p.assists}\n`;
            });

            msg += `\n🔴 *${data.tTeamName} (T) — K/D/A*\n`;
            data.tPlayers.sort((a,b) => b.kills - a.kills).forEach(p => {
              msg += `▪️ *${p.name}* — ${p.kills}/${p.deaths}/${p.assists}\n`;
            });

            onUpdate(msg);
          }
        },
        onConnect: () => {
          console.log('[Scorebot] Conectado.');
        },
        onDisconnect: () => {
          console.log('[Scorebot] Desconectado.');
          scorebotConectado = false;
          if (ativo) setTimeout(tentarScorebot, 5000); // Tenta reconectar
        }
      });
    } catch (e) {
      console.error('[Scorebot] Erro:', e.message);
    }
  };

  tentarScorebot();

  // Fallback Polling HTTP (caso Scorebot não envie dados)
  const fallback = setInterval(async () => {
    if (!ativo || scorebotConectado) return;

    try {
      const match = await HLTV.getMatch({ id: matchId });
      if (!match) return;

      if (match.status === 'Over' || match.status === 'Finished') {
        ativo = false;
        clearInterval(fallback);
        onEnd(null);
        return;
      }

      const liveMap = match.maps.find(m => m.result && !m.result.team1TotalRounds === undefined) || match.maps[0];
      const s1 = liveMap.result?.team1TotalRounds || 0;
      const s2 = liveMap.result?.team2TotalRounds || 0;
      const total = s1 + s2;

      if (ultimoTotalRounds === -1 || total >= ultimoTotalRounds + 2) {
        ultimoTotalRounds = total;
        let msg = `🔥 *PLACAR — Round ${total} | ${liveMap.name || 'Mapa'}*\n`;
        msg    += `━━━━━━━━━━━━━━━━━━━━━━\n`;
        msg    += `📊 *${match.team1.name}* ${s1} x ${s2} *${match.team2.name}*\n\n`;
        msg    += `_Aguardando conexão com Scorebot para KDA detalhado..._`;
        onUpdate(msg);
      }
    } catch (e) {
      console.error('[Fallback] Erro:', e.message);
    }
  }, POLL_INTERVAL_MS);

  return function stop() {
    ativo = false;
    clearInterval(fallback);
    console.log('[HLTV] Narração parada.');
  };
}
 
module.exports = {
  getFormattedNews,
  getFormattedResults,
  getLiveMatchByTeam,
  buscarJogosDoTime,
  startPolling,
};
