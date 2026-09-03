/**
 * Skill: market sentiment placeholder (Global Stock).
 * No live market API calls until ALPHA_VANTAGE_KEY is wired intentionally.
 */
function runMarketSentiment({ message, lang }) {
  const code = String(lang || 'en').slice(0, 2);
  const body = {
    en: 'Market sentiment skill is a placeholder. Configure ALPHA_VANTAGE_KEY before live quotes. Do not invent prices.',
    fr: 'Le sentiment de marché est un placeholder. Configurez ALPHA_VANTAGE_KEY avant les cotations. N’inventez pas de prix.',
    es: 'El sentimiento de mercado es un marcador. Configure ALPHA_VANTAGE_KEY antes de cotizaciones. No invente precios.',
  };
  return {
    skill: 'market-sentiment',
    reply: `${body[code] || body.en}\nQuery: ${String(message || '').slice(0, 200)}`,
  };
}

module.exports = { runMarketSentiment };
