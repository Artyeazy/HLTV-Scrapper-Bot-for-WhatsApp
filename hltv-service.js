/**
 * hltv-service.js
 * ─────────────────────────────────────────────────────────────────
 * Módulo de comunicação com a HLTV via hltv-next e Scraping Nativo.
 * ─────────────────────────────────────────────────────────────────
 */
 
const { HLTV } = require('hltv-next');
 
const POLL_INTERVAL_MS = 45_000;

// ─────────────────────────────────────────────────────────────────
// SCRAPER NATIVO (Busca placares focando na estrutura atual da HLTV)
// ─────────────────────────────────────────────────────────────────
async function getStaticLiveMatches() {
    try {
        const res = await fetch('https://www.hltv.org/matches', {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html'
            }
        });
        const html = await res.text();
        const liveMatches = [];

        const aRegex = /<a[^>]*href="(\/matches\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
        const matchesByHref = {};
        let match;
        
        while ((match = aRegex.exec(html)) !== null) {
            const href = match[1];
            const linkContent = match[2];
            
            if (linkContent.includes('matchLive') || linkContent.includes('match-meta-live')) {
                if (!matchesByHref[href]) {
                    matchesByHref[href] = {
                        event: 'Evento',
                        team1: 'TBD',
                        team2: 'TBD',
                        score1: '0',
                        score2: '0',
                        maps1: '0',
                        maps2: '0'
                    };
                }
            }
            
            if (matchesByHref[href]) {
                if (linkContent.includes('match-event')) {
                    const eventMatch = linkContent.match(/>([^<]+)</);
                    if (eventMatch) matchesByHref[href].event = eventMatch[1].trim();
                }
                
                if (linkContent.includes('match-team') && !linkContent.includes('livescore')) {
                    const teamMatches = [...linkContent.matchAll(/>([^<]+)</g)];
                    const names = teamMatches.map(m => m[1].trim()).filter(n => n && n !== '|' && n !== '(' && n !== ')');
                    if (names.length >= 2) {
                        matchesByHref[href].team1 = names[0];
                        matchesByHref[href].team2 = names[1];
                    }
                }
                
                if (linkContent.includes('match-team-livescore')) {
                    const scoreText = linkContent.replace(/<[^>]*>/g, ' ');
                    const nums = scoreText.match(/\d+/g);
                    if (nums && nums.length >= 4) {
                        matchesByHref[href].score1 = nums[0];
                        matchesByHref[href].maps1 = nums[1];
                        matchesByHref[href].score2 = nums[2];
                        matchesByHref[href].maps2 = nums[3];
                    }
                }
            }
        }

        for (const href in matchesByHref) {
            const m = matchesByHref[href];
            if (m.team1 !== 'TBD') liveMatches.push(m);
        }

        return liveMatches;
    } catch (e) {
        console.error('[Scraper] Erro ao extrair HTML estático:', e.message);
        return [];
    }
}

// ─────────────────────────────────────────────────────────────────
// SCRAPER DE RESULTADOS RECENTES DO TIME (ROBUSTO)
// ─────────────────────────────────────────────────────────────────
async function getRecentTeamResults(teamId) {
    try {
        const url = `https://www.hltv.org/team/${teamId}/_#tab-matches`;
        const res = await fetch(url, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html'
            }
        });
        const html = await res.text();
        const results = [];

        // Regex para capturar as linhas de resultados (tr class="team-row")
        const trRegex = /<tr class="team-row">([\s\S]*?)<\/tr>/g;
        let match;
        
        while ((match = trRegex.exec(html)) !== null) {
            const content = match[1];
            
            // Extrair data
            const dateMatch = content.match(/<span[^>]*data-time-format="dd\/MM\/yyyy"[^>]*>([^<]+)<\/span>/);
            const date = dateMatch ? dateMatch[1].trim() : null;
            
            // Extrair placar
            const scoreMatch = content.match(/<div class="score-cell">([\s\S]*?)<\/div>/);
            let score = "0 x 0";
            let win = false;
            
            if (scoreMatch) {
                const scoreText = scoreMatch[1].replace(/<[^>]*>/g, '').trim(); // Ex: "1 : 2"
                const parts = scoreText.split(':').map(s => s.trim());
                if (parts.length >= 2) {
                    score = `${parts[0]} x ${parts[1]}`;
                    // Vitória se o primeiro time (do perfil) marcou mais que o segundo
                    win = parseInt(parts[0]) > parseInt(parts[1]);
                }
            }
            
            // Extrair adversário (segundo time na linha)
            const teamMatches = [...content.matchAll(/<a[^>]*class="team-name team-\d"[^>]*>([^<]+)<\/a>/g)];
            let opponent = "Desconhecido";
            if (teamMatches.length >= 2) {
                opponent = teamMatches[1][1].trim();
            }

            if (date && score !== "0 x 0") {
                results.push({ date, opponent, score, win });
            }
            
            if (results.length >= 5) break;
        }

        return results;
    } catch (e) {
        console.error('[Scraper] Erro ao buscar resultados recentes do time:', e.message);
        return [];
    }
}
 
// ─────────────────────────────────────────────────────────────────
// FUNÇÕES DE COMANDOS DO BOT
// ─────────────────────────────────────────────────────────────────

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
    return '❌ Erro ao buscar notícias.';
  }
}
 
async function getFormattedResults() {
  try {
    const liveMatches = await getStaticLiveMatches();
    const results = await HLTV.getResults({ pages: 1 });
 
    let msg = `🏆 *Placares e Resultados CS2*\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (liveMatches.length > 0) {
      msg += `🔴 *PARTIDAS EM ANDAMENTO*\n`;
      liveMatches.forEach(m => {
        msg += `⚔️ *${m.team1}* (${m.maps1}) ${m.score1} x ${m.score2} (${m.maps2}) *${m.team2}*\n📍 ${m.event}\n\n`;
      });
      msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    }
 
    if (!results?.length) {
      if (liveMatches.length === 0) msg += `❌ Nenhum resultado recente encontrado.\n`;
      return msg;
    }

    msg += `🏁 *ÚLTIMOS RESULTADOS*\n`;
    results.slice(0, 25).forEach((m) => {
      const t1     = m.team1?.name || 'Time 1';
      const t2     = m.team2?.name || 'Time 2';
      const s1     = m.result?.team1 ?? '-';
      const s2     = m.result?.team2 ?? '-';
 
      if (m.result) {
        const w = Number(s1) > Number(s2) ? t1 : t2;
        msg += `▪️ *${t1}* ${s1} x ${s2} *${t2}* (✅ ${w})\n`;
      }
    });

    return msg;
  } catch (e) {
    console.error('[HLTV] getFormattedResults:', e.message);
    return '❌ Erro ao buscar resultados da HLTV.';
  }
}
 
async function buscarJogosDoTime(nomeDoTime) {
  try {
    const matches = await HLTV.getMatches();
    const busca   = nomeDoTime.trim().toLowerCase();
 
    let partidas = matches.filter(m => {
      const t1 = (m.team1?.name || '').toLowerCase();
      const t2 = (m.team2?.name || '').toLowerCase();
      return t1.includes(busca) || t2.includes(busca);
    });

    partidas = partidas.filter((partida, index, self) =>
      index === self.findIndex((p) => p.id === partida.id)
    );
 
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
    return '❌ Erro ao buscar agenda.';
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

// ─────────────────────────────────────────────────────────────────
// INFORMAÇÕES DO TIME (!time) 
// ─────────────────────────────────────────────────────────────────
async function getTeamInfo(nomeDoTime) {
  try {
    const busca = nomeDoTime.trim().toLowerCase();
    let teamId = null;
    let rankHLTV = 'Sem rank';
    
    const ranking = await HLTV.getTeamRanking();
    const timeNoRanking = ranking.find(t => t.team.name.toLowerCase().includes(busca));
    
    if (timeNoRanking) {
        teamId = timeNoRanking.team.id;
        rankHLTV = timeNoRanking.place; 
    } else {
        const matches = await HLTV.getMatches();
        const match = matches.find(m => 
            (m.team1?.name || '').toLowerCase().includes(busca) || 
            (m.team2?.name || '').toLowerCase().includes(busca)
        );
        if (match) {
            teamId = (match.team1?.name || '').toLowerCase().includes(busca) ? match.team1.id : match.team2.id;
        }
    }

    if (!teamId) {
        return `❌ Não encontrei o time *${nomeDoTime}*. Verifique se o nome está correto.`;
    }

    const team = await HLTV.getTeam({ id: teamId });
    const rankValve = team.rank || 'Sem rank';
    
    const allMatches = await HLTV.getMatches();
    const now = Date.now();
    const upcomingMatches = allMatches.filter(m => 
        (m.team1?.id === teamId || m.team2?.id === teamId) && 
        !m.live && 
        m.date && 
        m.date > now
    );
    
    upcomingMatches.sort((a, b) => a.date - b.date);
    const nextMatch = upcomingMatches[0];

    // BUSCAR RESULTADOS RECENTES VIA SCRAPER ROBUSTO
    const recentResults = await getRecentTeamResults(teamId);

    let msg = `🛡️ *Raio-X: ${team.name}*\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `🏆 *Ranking HLTV:* #${rankHLTV}\n`;
    msg += `🏅 *Ranking Valve:* #${rankValve}\n\n`;

    if (nextMatch) {
        const isTeam1 = nextMatch.team1?.id === teamId;
        const enemy = isTeam1 ? nextMatch.team2?.name : nextMatch.team1?.name;
        const d = new Date(nextMatch.date);
        const dataStr = d.toLocaleDateString('pt-BR');
        const horaStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        msg += `⏭️ *Próxima Partida:*\n▪️ vs ${enemy || 'TBD'} (${dataStr} às ${horaStr})\n\n`;
    } else {
        msg += `⏭️ *Próxima Partida:*\n▪️ Nenhuma partida agendada no momento.\n\n`;
    }

    if (recentResults.length > 0) {
        msg += `🏁 *Últimos 5 Resultados:*\n`;
        recentResults.forEach(r => {
            const winIcon = r.win ? '✅ V' : '❌ D';
            msg += `▪️ ${winIcon} | ${r.score} vs ${r.opponent} (${r.date})\n`;
        });
        msg += `\n`;
    }

    if (team.players && team.players.length > 0) {
        msg += `👥 *Line-up Atual:*\n`;
        team.players.forEach(p => {
            msg += `▪️ ${p.name || 'Desconhecido'}\n`;
        });
    }

    return msg;
  } catch (e) {
      console.error('[HLTV] getTeamInfo:', e.message);
      return '❌ Erro ao buscar informações do time na página da HLTV.';
  }
}

function startPolling(matchId, onUpdate, onEnd) {
  let ativo = true;
  const interval = setInterval(async () => {
    if (!ativo) {
        clearInterval(interval);
        return;
    }
  }, POLL_INTERVAL_MS);

  return () => {
    ativo = false;
    clearInterval(interval);
  };
}

module.exports = {
  getFormattedNews,
  getFormattedResults,
  buscarJogosDoTime,
  getLiveMatchByTeam,
  getTeamInfo,
  startPolling
};
