/**
 * Skill: Stock-Risk-Guard — stop-loss / risk framing (no live orders).
 * Live quotes require ALPHA_VANTAGE_KEY (not invent prices).
 */
function runStockRiskGuard({ message, lang }) {
  const code = String(lang || 'en').slice(0, 2);
  const body = {
    en: [
      'Stock-Risk-Guard (advisory only — no live trades from this harness).',
      '1. Define max loss % before entry (e.g. 1–2% of account).',
      '2. Place stop-loss below structure; avoid moving stops wider after entry.',
      '3. Size position from stop distance, not conviction.',
      '4. Sentiment is secondary to risk; wait for ALPHA_VANTAGE_KEY before live quotes.',
      '5. Never invent tickers, prices, or fill status.',
    ],
    fr: [
      'Stock-Risk-Guard (conseil seulement — aucun ordre live).',
      '1. Fixez une perte max % avant l’entrée.',
      '2. Stop-loss sous la structure; ne l’élargissez pas après coup.',
      '3. Dimensionnez via la distance du stop.',
      '4. Le sentiment est secondaire; ALPHA_VANTAGE_KEY requis pour cotations live.',
      '5. N’inventez pas de tickers, prix ou exécutions.',
    ],
    es: [
      'Stock-Risk-Guard (solo asesoría — sin órdenes en vivo).',
      '1. Defina pérdida máxima % antes de entrar.',
      '2. Stop-loss bajo la estructura; no lo amplíe después.',
      '3. Dimensioné por distancia al stop.',
      '4. El sentimiento es secundario; hace falta ALPHA_VANTAGE_KEY para cotizaciones.',
      '5. No invente tickers, precios ni fills.',
    ],
  };
  const list = body[code] || body.en;
  return {
    skill: 'stock-risk-guard',
    reply: `${list.join('\n')}\n\nQuery: ${String(message || '').slice(0, 200)}`,
  };
}

module.exports = { runStockRiskGuard };
