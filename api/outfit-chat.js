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

function detectLanguage(request, profile) {
  const text = normalize(request);
  const profileLanguage = normalize(profile?.language || '');

  const englishMarkers = [
    'what',
    'how',
    'wear',
    'outfit',
    'tonight',
    'tomorrow',
    'night',
    'evening',
    'morning',
    'afternoon',
    'dinner',
    'aperitif',
    'office',
    'weekend',
    'please',
    'with',
    'for',
  ];

  const italianMarkers = [
    'cosa',
    'come',
    'metto',
    'indosso',
    'stasera',
    'domani',
    'notte',
    'sera',
    'mattina',
    'pomeriggio',
    'cena',
    'aperitivo',
    'ufficio',
    'weekend',
    'con',
    'per',
  ];

  let enScore = 0;
  let itScore = 0;

  englishMarkers.forEach((word) => {
    if (text.includes(word)) enScore += 1;
  });

  italianMarkers.forEach((word) => {
    if (text.includes(word)) itScore += 1;
  });

  if (enScore !== itScore) {
    return enScore > itScore ? 'en' : 'it';
  }

  if (profileLanguage.includes('english')) return 'en';
  if (profileLanguage.includes('ital')) return 'it';

  return 'it';
}

function cleanCityCandidate(candidate) {
  const trailingStopWords = [
    'tonight',
    'tomorrow',
    'night',
    'evening',
    'morning',
    'afternoon',
    'now',
    'stasera',
    'domani',
    'notte',
    'sera',
    'mattina',
    'pomeriggio',
    'adesso',
  ];

  let words = (candidate || '')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);

  while (
    words.length > 0 &&
    trailingStopWords.includes(normalize(words[words.length - 1]))
  ) {
    words.pop();
  }

  if (words.length > 2) {
    words = words.slice(0, 2);
  }

  return capitalizeWords(words.join(' '));
}

function extractRequestedCity(request) {
  const text = normalize(request);

  const patterns = [
    /\b(?:a|ad|in)\s+([a-zà-öø-ÿ]+(?:\s+[a-zà-öø-ÿ]+){0,2})/i,
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
    'home',
    'office',
    'work',
    'school',
    'tonight',
    'tomorrow',
    'night',
    'morning',
    'afternoon',
    'evening',
    'dinner',
    'aperitif',
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;

    const rawCandidate = match[1].trim();
    const cleanedCandidate = cleanCityCandidate(rawCandidate);

    if (!cleanedCandidate) continue;

    const firstWord = normalize(cleanedCandidate.split(' ')[0]);

    if (!blocked.includes(firstWord)) {
      return cleanedCandidate;
    }
  }

  return '';
}

function detectRequestedMoment(request) {
  const text = normalize(request);

  if (text.includes('domani notte') || text.includes('tomorrow night')) {
    return 'tomorrow night';
  }
  if (text.includes('domani sera') || text.includes('tomorrow evening')) {
    return 'tomorrow evening';
  }
  if (
    text.includes('stasera') ||
    text.includes('questa sera') ||
    text.includes('tonight')
  ) {
    return 'tonight';
  }
  if (text.includes('domani mattina') || text.includes('tomorrow morning')) {
    return 'tomorrow morning';
  }
  if (
    text.includes('domani pomeriggio') ||
    text.includes('tomorrow afternoon')
  ) {
    return 'tomorrow afternoon';
  }
  if (text.includes('domani') || text.includes('tomorrow')) {
    return 'tomorrow';
  }
  if (text.includes('mattina') || text.includes('morning')) {
    return 'morning';
  }
  if (text.includes('pomeriggio') || text.includes('afternoon')) {
    return 'afternoon';
  }
  if (text.includes('notte') || text.includes('night')) {
    return 'night';
  }
  if (text.includes('sera') || text.includes('evening')) {
    return 'evening';
  }

  return 'now';
}

function mapWeatherCodeToCondition(code) {
  if (code == null) return '';

  if (code === 0) return 'clear';
  if ([1, 2, 3, 45, 48].includes(code)) return 'cloudy';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 80, 81, 82].includes(code)) {
    return 'rain';
  }
  if ([66, 67, 71, 73, 75, 77, 85, 86].includes(code)) {
    return 'cold';
  }
  if ([95, 96, 99].includes(code)) {
    return 'wind';
  }

  return 'cloudy';
}

function localizeCondition(condition, language) {
  const map = {
    clear: language === 'en' ? 'clear' : 'sereno',
    cloudy: language === 'en' ? 'cloudy' : 'nuvoloso',
    rain: language === 'en' ? 'rain' : 'pioggia',
    cold: language === 'en' ? 'cold' : 'freddo',
    hot: language === 'en' ? 'hot' : 'caldo',
    wind: language === 'en' ? 'windy' : 'vento',
    '': '',
  };

  return map[condition] ?? condition;
}

function temperatureToExtraCondition(temperature, baseCondition) {
  if (typeof temperature !== 'number') {
    return baseCondition || '';
  }

  if (temperature >= 26) {
    return 'hot';
  }

  if (temperature <= 8) {
    return 'cold';
  }

  return baseCondition;
}

function formatHourForMoment(moment) {
  if (moment === 'morning' || moment === 'tomorrow morning') return 9;
  if (moment === 'afternoon' || moment === 'tomorrow afternoon') return 15;
  if (
    moment === 'evening' ||
    moment === 'tonight' ||
    moment === 'tomorrow evening'
  ) {
    return 20;
  }
  if (moment === 'night' || moment === 'tomorrow night') {
    return 22;
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
    `&count=1&format=json`;

  const geoResponse = await fetch(geoUrl);

  if (!geoResponse.ok) {
    throw new Error('City geocoding failed');
  }

  const geoData = await geoResponse.json();
  const first = geoData?.results?.[0];

  if (!first) {
    throw new Error('City not found');
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
    throw new Error('Weather fetch failed');
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

function buildWeatherPayloadFromRequestedCity(
  cityWeather,
  requestedMoment,
  language
) {
  const currentTemp = cityWeather.current?.temperature_2m;
  const currentCode = cityWeather.current?.weather_code;

  let selectedTemp = currentTemp;
  let selectedCode = currentCode;
  let label = language === 'en' ? 'now' : 'adesso';

  const targetHour = formatHourForMoment(requestedMoment);

  if (targetHour !== null && Array.isArray(cityWeather.hourly?.time)) {
    const baseDate = getDatePartsInTimeZone(cityWeather.timezone);
    const needsTomorrow =
      requestedMoment === 'tomorrow' ||
      requestedMoment === 'tomorrow evening' ||
      requestedMoment === 'tomorrow morning' ||
      requestedMoment === 'tomorrow afternoon' ||
      requestedMoment === 'tomorrow night';

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
    condition: localizeCondition(condition, language),
    source: 'requested-city',
    contextLabel: label,
  };
}

function cleanText(text) {
  return (text || '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/```/g, '')
    .trim();
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OPENAI_API_KEY missing' });
    }

    const OpenAI = (await import('openai')).default;
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { request, profile, weather, garments } = body || {};

    if (!request) {
      return res.status(400).json({ error: 'Missing request' });
    }

    const language = detectLanguage(request, profile);
    const requestedCity = extractRequestedCity(request);
    const requestedMoment = detectRequestedMoment(request);

    let weatherForAI = weather || {};
    let weatherNote = '';

    if (requestedCity) {
      try {
        const cityWeather = await getRequestedCityWeather(requestedCity);
        const liveWeather = buildWeatherPayloadFromRequestedCity(
          cityWeather,
          requestedMoment,
          language
        );

        weatherForAI = liveWeather;

        weatherNote =
          language === 'en'
            ? `I am using the weather for the requested city: ${liveWeather.city}, ${liveWeather.temperature}°, ${liveWeather.condition}, context: ${liveWeather.contextLabel}.`
            : `Sto usando il meteo della città richiesta: ${liveWeather.city}, ${liveWeather.temperature}°, ${liveWeather.condition}, contesto: ${liveWeather.contextLabel}.`;
      } catch (error) {
        weatherNote =
          language === 'en'
            ? `I could not retrieve the weather for ${requestedCity}. I will use the weather currently saved in the app.`
            : `Non sono riuscito a recuperare il meteo per ${requestedCity}. Userò il meteo salvato disponibile nell'app.`;
      }
    } else {
      weatherNote =
        language === 'en'
          ? `I am using the weather currently saved in the app.`
          : `Sto usando il meteo salvato disponibile nell'app.`;
    }

    const compactPayload = {
      language,
      request: request || '',
      profile: profile || {},
      weather: weatherForAI || {},
      weatherNote,
      garments: Array.isArray(garments) ? garments.slice(0, 24) : [],
    };

    const instructions =
      language === 'en'
        ? `
You are WardrobeAI, a practical, credible and style-aware personal stylist.
Reply only in English.

Rules:
- Use ONLY the provided data.
- Do not invent garments that are not present.
- Do not use markdown.
- Do not use symbols such as #, ##, ###, **, *.
- Write clean, natural text.
- Clearly explain which weather you are using.
- If it is cool, rainy, windy or it is an evening plan, give a practical layer suggestion such as jacket, knitwear, coat or overshirt.
- If a useful garment is missing, say it clearly.

Reply format:
Brief introduction.

Weather considered: ...

Proposal 1
Suggested garments: ...
Why it works: ...

Proposal 2
Suggested garments: ...
Why it works: ...

Proposal 3
Suggested garments: ...
Why it works: ...

Practical advice: ...
`.trim()
        : `
Sei WardrobeAI, uno stylist personale pratico, concreto e credibile.
Rispondi solo in italiano.

Regole:
- Usa SOLO i dati ricevuti.
- Non inventare capi non presenti.
- Non usare markdown.
- Non usare simboli come #, ##, ###, **, *.
- Scrivi in testo pulito e naturale.
- Spiega chiaramente quale meteo stai usando.
- Se fa fresco, piove, c'è vento o è una situazione serale, dai un consiglio pratico su giacca, maglioncino, soprabito o layer.
- Se manca un capo utile, dillo chiaramente.

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
      response.output_text ||
      (language === 'en'
        ? 'I could not generate a useful answer.'
        : 'Non sono riuscito a generare una risposta utile.');

    const cleanedText = cleanText(rawText);

    return res.status(200).json({
      text: cleanedText,
      usedWeather: weatherForAI,
      weatherNote,
      language,
    });
  } catch (error) {
    console.error('Errore outfit-chat:', error);
    return res.status(500).json({
      error: 'Errore interno backend',
      details: error?.message || 'unknown_error',
    });
  }
};
