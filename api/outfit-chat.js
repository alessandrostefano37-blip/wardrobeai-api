function normalize(text) {
  return (text || '').toLowerCase().trim();
}

function capitalizeWords(text) {
  return (text || '')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function extractRequestedCity(request) {
  const text = normalize(request);

  const patterns = [
    /\b(?:a|ad|in)\s+([a-zà-öø-ÿ]+(?:\s+[a-zà-öø-ÿ]+)?)/i,
  ];

  const blocked = [
    'casa',
    'ufficio',
    'lavoro',
    'scuola',
    'sera',
    'mattina',
    'pomeriggio',
    'pranzo',
    'cena',
    'weekend',
    'look',
    'outfit',
    'chat',
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;

    const candidate = match[1].trim();
    const firstWord = candidate.split(' ')[0];

    if (!blocked.includes(firstWord)) {
      return capitalizeWords(candidate);
    }
  }

  return '';
}

function detectRequestedMoment(request) {
  const text = normalize(request);

  if (text.includes('domani sera')) return 'domani sera';
  if (text.includes('stasera') || text.includes('questa sera')) return 'stasera';
  if (text.includes('domani mattina')) return 'domani mattina';
  if (text.includes('domani pomeriggio')) return 'domani pomeriggio';
  if (text.includes('domani')) return 'domani';
  if (text.includes('mattina')) return 'mattina';
  if (text.includes('pomeriggio')) return 'pomeriggio';
  if (text.includes('sera')) return 'sera';

  return 'adesso';
}

function mapWeatherCodeToCondition(code) {
  if (code == null) return '';

  if (code === 0) return 'sereno';
  if ([1, 2, 3, 45, 48].includes(code)) return 'nuvoloso';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 80, 81, 82].includes(code)) {
    return 'pioggia';
  }
  if ([66, 67, 71, 73, 75, 77, 85, 86].includes(code)) {
    return 'freddo';
  }
  if ([95, 96, 99].includes(code)) {
    return 'vento';
  }

  return 'nuvoloso';
}

function temperatureToExtraCondition(temperature, baseCondition) {
  if (typeof temperature !== 'number') {
    return baseCondition || '';
  }

  if (temperature >= 26) {
    return 'caldo';
  }

  if (temperature <= 8) {
    return 'freddo';
  }

  return baseCondition;
}

function formatHourForMoment(moment) {
  if (moment === 'mattina' || moment === 'domani mattina') return 9;
  if (moment === 'pomeriggio' || moment === 'domani pomeriggio') return 15;
  if (moment === 'sera' || moment === 'stasera' || moment === 'domani sera') {
    return 20;
  }
  return null;
}

function getDatePartsInTimeZone(timeZone) {
  const now = new Date();

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(now);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;

  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
  };
}

function addDaysToDateParts(dateParts, daysToAdd, timeZone) {
  const utcDate = new Date(
    Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day + daysToAdd)
  );

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(utcDate);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;

  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
  };
}

function buildLocalIso(dateParts, hour) {
  const month = String(dateParts.month).padStart(2, '0');
  const day = String(dateParts.day).padStart(2, '0');
  const hh = String(hour).padStart(2, '0');
  return `${dateParts.year}-${month}-${day}T${hh}:00`;
}

function getClosestHourlyIndex(hourlyTimes, targetIso) {
  return hourlyTimes.findIndex((item) => item === targetIso);
}

async function getRequestedCityWeather(requestedCity) {
  const geoUrl =
    `https://geocoding-api.open-meteo.com/v1/search` +
    `?name=${encodeURIComponent(requestedCity)}` +
    `&count=1&language=it&format=json`;

  const geoResponse = await fetch(geoUrl);

  if (!geoResponse.ok) {
    throw new Error('Errore geocoding città');
  }

  const geoData = await geoResponse.json();
  const first = geoData?.results?.[0];

  if (!first) {
    throw new Error('Città non trovata');
  }

  const cityName = first.name;
  const latitude = first.latitude;
  const longitude = first.longitude;
  const timezone = first.timezone || 'Europe/Rome';

  const weatherUrl =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${latitude}` +
    `&longitude=${longitude}` +
    `&current=temperature_2m,weather_code` +
    `&hourly=temperature_2m,weather_code` +
    `&timezone=auto`;

  const weatherResponse = await fetch(weatherUrl);

  if (!weatherResponse.ok) {
    throw new Error('Errore meteo città richiesta');
  }

  const weatherData = await weatherResponse.json();

  return {
    city: cityName,
    latitude,
    longitude,
    timezone,
    current: weatherData.current || {},
    hourly: weatherData.hourly || {},
  };
}

function buildWeatherPayloadFromRequestedCity(cityWeather, requestedMoment) {
  const currentTemp = cityWeather.current?.temperature_2m;
  const currentCode = cityWeather.current?.weather_code;

  let selectedTemp = currentTemp;
  let selectedCode = currentCode;
  let label = 'adesso';

  const targetHour = formatHourForMoment(requestedMoment);

  if (targetHour !== null && Array.isArray(cityWeather.hourly?.time)) {
    const baseDate = getDatePartsInTimeZone(cityWeather.timezone);
    const needsTomorrow =
      requestedMoment === 'domani' ||
      requestedMoment === 'domani sera' ||
      requestedMoment === 'domani mattina' ||
      requestedMoment === 'domani pomeriggio';

    const finalDate = addDaysToDateParts(
      baseDate,
      needsTomorrow ? 1 : 0,
      cityWeather.timezone
    );

    const targetIso = buildLocalIso(finalDate, targetHour);
    const targetIndex = getClosestHourlyIndex(cityWeather.hourly.time, targetIso);

    if (targetIndex >= 0) {
      const tempCandidate = cityWeather.hourly.temperature_2m?.[targetIndex];
      const codeCandidate = cityWeather.hourly.weather_code?.[targetIndex];

      if (typeof tempCandidate === 'number') {
        selectedTemp = tempCandidate;
      }

      if (typeof codeCandidate === 'number') {
        selectedCode = codeCandidate;
      }

      label = requestedMoment;
    }
  }

  const baseCondition = mapWeatherCodeToCondition(selectedCode);
  const condition = temperatureToExtraCondition(selectedTemp, baseCondition);

  return {
    city: cityWeather.city,
    temperature:
      typeof selectedTemp === 'number' ? String(Math.round(selectedTemp)) : '',
    condition,
    source: 'requested-city',
    contextLabel: label,
  };
}

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

    const requestedCity = extractRequestedCity(request);
    const requestedMoment = detectRequestedMoment(request);

    let weatherForAI = weather || {};
    let weatherNote = '';

    if (requestedCity) {
      try {
        const cityWeather = await getRequestedCityWeather(requestedCity);
        const liveWeather = buildWeatherPayloadFromRequestedCity(
          cityWeather,
          requestedMoment
        );

        weatherForAI = liveWeather;
        weatherNote = `Sto usando il meteo della città richiesta: ${liveWeather.city}, ${liveWeather.temperature}°, ${liveWeather.condition}, contesto: ${liveWeather.contextLabel}.`;
      } catch (error) {
        weatherNote = `Non sono riuscito a recuperare il meteo per ${requestedCity}. Uso il meteo salvato disponibile nell'app.`;
      }
    } else {
      weatherNote = `Sto usando il meteo salvato disponibile nell'app.`;
    }

    const compactPayload = {
      request: request || '',
      profile: profile || {},
      weather: weatherForAI || {},
      weatherNote,
      garments: Array.isArray(garments) ? garments.slice(0, 24) : [],
    };

    const instructions = `
Sei WardrobeAI, uno stylist personale pratico, concreto e credibile.
Rispondi sempre in italiano.

Regole fondamentali:
- Usa SOLO i dati ricevuti.
- Non inventare capi non presenti.
- Non usare markdown.
- Non usare simboli come #, ##, ###, **, *.
- Scrivi in testo pulito, naturale e leggibile.
- Spiega chiaramente quale meteo stai usando.
- Se fa fresco, piove, c'è vento o è sera, dai un consiglio pratico su giacca, maglioncino, soprabito o layer.
- Se manca un capo utile per il meteo, dillo chiaramente.

Formato risposta:
Introduzione breve.

Meteo considerato: ...

Proposta 1
Capi consigliati: ...
Perché funziona: ...

Proposta 2
Capi consigliati: ...
Perché funziona: ...

Proposta 3
Capi consigliati: ...
Perché funziona: ...

Consiglio pratico: ...
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
      usedWeather: weatherForAI,
      weatherNote,
    });
  } catch (error) {
    console.error('Errore outfit-chat:', error);
    return res.status(500).json({
      error: 'Errore interno backend',
      details: error?.message || 'unknown_error',
    });
  }
};
