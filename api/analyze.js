export const config = {
  maxDuration: 30,
};

const MODELS = [
  'gemini-3.6-flash',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY is not configured in environment variables.',
    });
  }

  try {
    const { image, text, language = 'cs' } = req.body || {};

    if (!image && !text) {
      return res.status(400).json({ error: 'Either image or text is required.' });
    }

    const langMap = {
      cs: 'Czech (čeština)',
      en: 'English',
      de: 'German (Deutsch)',
    };
    const targetLang = langMap[language] || 'Czech (čeština)';

    const systemPrompt = `You are a specialist food additive and ingredient analyst.
Your task is to analyze food packaging labels to extract food additives and E-numbers.

CRITICAL RULES:
1. Locate the INGREDIENTS list ("Složení", "Zutaten", "Ingredients", "Ingrédients", "Sastojci", etc.).
2. IGNORE nutritional value tables (calories, fat, carbs, protein, fiber, sodium, vitamins, mg, kJ/kcal), packaging dates, storage info, manufacturer addresses, and marketing claims.
3. Identify all food additives (E-numbers / Éčka), preservatives, colorings, artificial sweeteners, flavor enhancers, stabilizers, and emulsifiers.
4. Translate named additives into their standardized official E-number if known (e.g. "dusitan sodný" -> "E250", "kyselina citronová" -> "E330", "aspartam" -> "E951", "kurkumin" -> "E100", "karagenan" -> "E407").
5. Do NOT include basic culinary whole foods (e.g., water, wheat flour, sugar, salt, milk, vegetable oil) unless they are specifically processed functional additives.
6. Provide names, category, and health risk explanation strictly in ${targetLang}.
7. Score health impact strictly on a scale from 0 to 6 (matching the official Fér Potravina 0–6 risk scale):
   - 0: Natural / completely safe (e.g., Vitamin C E300, Curcumin E100, Citric acid E330, Lecithin)
   - 1: Harmless / negligible concern
   - 2: Low concern / generally safe
   - 3: Moderate concern (e.g., Diphosphates E450, Caramel E150d)
   - 4: Elevated concern / allergens / hyperactivity in children (e.g., Tartrazine E102, Carrageenan E407, Sodium benzoate E211)
   - 5: High concern / controversial / carcinogenic risks in higher consumption (e.g., Sodium nitrite E250, Aspartame E951, Ponceau 4R E124)
   - 6: Extreme concern / hazardous or banned additives

OUTPUT FORMAT:
Output ONLY valid JSON matching this schema:
{
  "additives": [
    {
      "id": "E-number (e.g. E250, E102, E330)",
      "name": "Additive name in ${targetLang}",
      "original_text": "Exact text or snippet from the packaging",
      "category": "Additive role (e.g. Konzervant / Barvivo / Zahušťovadlo)",
      "rating": 0 to 6 (integer),
      "reason": "Short 1-sentence health impact explanation in ${targetLang}"
    }
  ],
  "ingredients_summary": "Extracted raw ingredients snippet in original text",
  "total_detected": 0
}`;

    const parts = [];

    if (text) {
      parts.push({ text: `Analyze the following ingredients text:\n${text}` });
    }

    if (image) {
      const match = image.match(/^data:(image\/[a-zA-Z0-9.-]+);base64,(.+)$/);
      if (match) {
        parts.push({
          inline_data: {
            mime_type: match[1],
            data: match[2],
          },
        });
      } else {
        // Plain base64 string, default to jpeg
        parts.push({
          inline_data: {
            mime_type: 'image/jpeg',
            data: image,
          },
        });
      }

      if (!text) {
        parts.push({
          text: 'Read and extract all ingredients and identify all food additives/E-numbers from this packaging image. Return valid JSON only.',
        });
      }
    }

    const requestBody = JSON.stringify({
      system_instruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [{ parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    let geminiResponse = null;
    let lastError = '';

    for (const model of MODELS) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8500);

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: requestBody,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          geminiResponse = response;
          break;
        }

        const errText = await response.text();
        lastError = `Model ${model} returned ${response.status}: ${errText}`;
        console.warn(`[analyze] ${lastError}`);
      } catch (err) {
        lastError = err.message || String(err);
        console.warn(`[analyze] Model ${model} exception: ${lastError}`);
      }
    }

    if (!geminiResponse) {
      return res.status(502).json({
        error: 'Gemini Vision API request failed on all models.',
        details: lastError,
      });
    }

    const data = await geminiResponse.json();
    let candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText) {
      const partsArr = data.candidates?.[0]?.content?.parts || [];
      const textPart = partsArr.find((p) => p.text);
      if (textPart) {
        candidateText = textPart.text;
      }
    }

    if (!candidateText) {
      return res.status(500).json({ error: 'No content returned from Gemini' });
    }

    let cleanedText = candidateText.trim();
    if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    }

    const parsedResult = JSON.parse(cleanedText);
    return res.status(200).json({
      success: true,
      ...parsedResult,
    });
  } catch (error) {
    console.error('[analyze error]', error);
    return res.status(500).json({
      error: 'Failed to process ingredient analysis.',
      details: error.message,
    });
  }
}
