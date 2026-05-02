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

    const { request, profile, weather, garments } = body || {};

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
Rispondi sempre in italiano.

Regole fondamentali:
- Usa SOLO i dati ricevuti.
- Non inventare capi non presenti.
- Non usare markdown.
- Non usare simboli come #, ##, ###, **, *, - ripetuti in stile markdown.
- Scrivi in testo pulito, leggibile, naturale.
- Non fare promesse su meteo live se non lo hai davvero nei dati.
- Se la richiesta cita una città o un momento specifico, confrontali con il meteo ricevuto.
- Se il meteo ricevuto non sembra riferito alla città richiesta, dichiaralo chiaramente in una frase breve.
- Se temperatura, pioggia, vento o fresco lo suggeriscono, dai un consiglio pratico tipo giacca, maglioncino, soprabito o layer.
- Se nel guardaroba non esiste un capo adatto al freddo o alla pioggia, dillo chiaramente.

Formato risposta:
Introduzione breve di 2-3 righe massimo.

Poi scrivi:
Proposta 1
Capi consigliati: ...
Perché funziona: ...

Proposta 2
Capi consigliati: ...
Perché funziona: ...

Proposta 3
Capi consigliati: ...
Perché funziona: ...

Chiudi con:
Consiglio pratico: ...

Nella risposta inserisci sempre una frase chiara sul meteo usato, per esempio:
"Meteo considerato: Torino, 14°, pioggia leggera."
oppure
"Hai chiesto Torino, ma nei dati ricevuti ho solo il meteo salvato di Breganzona: userò quello come riferimento."

Tono:
- elegante ma semplice
- utile davvero
- concreto
- niente testo troppo lungo
`.trim();

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-5.4-mini',
      instructions,
      input: JSON.stringify(compactPayload),
      max_output_tokens: 700,
    });

    const rawText =
      response.output_text || 'Non sono riuscito a generare una risposta utile.';

    const cleanedText = rawText
      .replace(/^#{1,6}\s*/gm, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/```/g, '')
      .trim();

    return res.status(200).json({
      text: cleanedText,
    });
  } catch (error) {
    console.error('Errore outfit-chat:', error);
    return res.status(500).json({
      error: 'Errore interno backend',
      details: error?.message || 'unknown_error',
    });
  }
};
