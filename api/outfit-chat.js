module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OPENAI_API_KEY mancante' });
    }

    const OpenAI = (await import('openai')).default;
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    const {
      request,
      profile,
      weather,
      garments,
    } = body || {};

    if (!request) {
      return res.status(400).json({ error: 'Request mancante' });
    }

    const compactPayload = {
      request: request || '',
      profile: profile || {},
      weather: weather || {},
      garments: Array.isArray(garments) ? garments.slice(0, 24) : [],
    };

    const instructions = `
Sei WardrobeAI, uno stylist personale pratico, concreto e credibile.
Rispondi in italiano.
Usa SOLO i dati ricevuti.
Non inventare capi non presenti.
Dai una risposta utile e leggibile.

Struttura la risposta così:
- una breve introduzione
- 3 proposte outfit
- per ogni proposta: capi consigliati e perché funziona
- una chiusura con eventuale miglioramento guardaroba

Tono:
- chiaro
- sintetico ma non freddo
- utile davvero
`.trim();

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-5.5',
      instructions,
      input: JSON.stringify(compactPayload),
      max_output_tokens: 700,
    });

    return res.status(200).json({
      text: response.output_text || 'Non sono riuscito a generare una risposta utile.',
    });
  } catch (error) {
    console.error('Errore outfit-chat:', error);
    return res.status(500).json({
      error: 'Errore interno backend',
      details: error?.message || 'unknown_error',
    });
  }
};
