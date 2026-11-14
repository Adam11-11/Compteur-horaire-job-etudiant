// Supabase Edge Function : gemini-proxy
// Proxy sécurisé pour l'assistant IA de Compteur Paella (voix & scan photo).
// La clé GEMINI_API_KEY est stockée uniquement côté serveur (Supabase Edge Function Secrets).

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

let cachedModels: string[] | null = null;
let cachedModelsAt = 0;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

function parseJsonFromGeminiText(rawText: string): unknown {
  if (!rawText) throw new Error("Réponse vide de l'IA.");
  const cleaned = String(rawText)
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw new Error('Réponse IA invalide (JSON non reconnu).');
  }
}

async function discoverModels(apiKey: string): Promise<string[]> {
  const now = Date.now();
  if (cachedModels && cachedModels.length > 0 && now - cachedModelsAt < 30 * 60 * 1000) {
    return cachedModels;
  }

  const preferredOrder = [
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-flash-latest',
    'gemini-2.5-pro',
    'gemini-pro-latest'
  ];

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
    );
    if (res.ok) {
      const data = await res.json();
      const rawModels = Array.isArray(data?.models) ? data.models : [];
      const supported: string[] = rawModels
        .filter((m: { name?: string; supportedGenerationMethods?: string[] }) => {
          const methods = m.supportedGenerationMethods || [];
          const name = String(m.name || '').replace(/^models\//, '');
          if (!methods.includes('generateContent')) return false;
          if (/embedding|imagen|veo|tts|aqa|bisheng|learnlm/i.test(name)) return false;
          return /^gemini-/i.test(name);
        })
        .map((m: { name?: string }) => String(m.name || '').replace(/^models\//, ''));

      if (supported.length > 0) {
        supported.sort((a, b) => {
          const idxA = preferredOrder.indexOf(a);
          const idxB = preferredOrder.indexOf(b);
          if (idxA !== -1 && idxB !== -1) return idxA - idxB;
          if (idxA !== -1) return -1;
          if (idxB !== -1) return 1;
          const isFlashA = a.includes('flash') ? 0 : 1;
          const isFlashB = b.includes('flash') ? 0 : 1;
          return isFlashA - isFlashB;
        });
        cachedModels = supported;
        cachedModelsAt = now;
        return supported;
      }
    }
  } catch {
    // Fallback silencieux sur les modèles connus
  }

  return ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-flash-latest'];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Méthode non autorisée.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const authHeader = req.headers.get('Authorization') || '';

  if (!authHeader.startsWith('Bearer ') || !supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: 'Authentification requise.' }, 401);
  }

  // Vérifier auprès de Supabase Auth que l'appelant est bien un utilisateur connecté valide
  try {
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: authHeader
      }
    });
    if (!userRes.ok) {
      return jsonResponse({ error: 'Session expirée ou non autorisée.' }, 401);
    }
  } catch {
    return jsonResponse({ error: 'Impossible de vérifier la session utilisateur.' }, 502);
  }

  const geminiApiKey = (Deno.env.get('GEMINI_API_KEY') || '').trim();
  if (!geminiApiKey) {
    return jsonResponse(
      { error: 'Clé GEMINI_API_KEY non configurée dans les Secrets Supabase.' },
      500
    );
  }

  let body: { parts?: unknown[]; systemInstruction?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Corps JSON invalide.' }, 400);
  }

  const parts = Array.isArray(body?.parts) ? body.parts : [];
  const systemInstruction = typeof body?.systemInstruction === 'string' ? body.systemInstruction : '';

  if (parts.length === 0 || !systemInstruction) {
    return jsonResponse({ error: 'Paramètres manquants pour la requête IA.' }, 400);
  }

  const combinedParts = [
    { text: `${systemInstruction}\n\nIMPORTANT : Réponds uniquement avec l'objet JSON brut, sans texte autour.` },
    ...parts
  ];

  const models = await discoverModels(geminiApiKey);
  let primaryError = 'Impossible de joindre Gemini.';

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;
      const geminiRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: combinedParts }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json'
          }
        })
      });

      if (!geminiRes.ok) {
        const errBody = await geminiRes.json().catch(() => ({}));
        const msg = errBody?.error?.message || `Erreur Gemini HTTP ${geminiRes.status}`;
        if (geminiRes.status === 400 && /API_KEY_INVALID|key not valid/i.test(msg)) {
          return jsonResponse({ error: 'Clé GEMINI_API_KEY invalide côté serveur Supabase.' }, 500);
        }
        primaryError = msg;
        continue;
      }

      const data = await geminiRes.json();
      const rawText = (data?.candidates?.[0]?.content?.parts || [])
        .map((p: { text?: string }) => p.text || '')
        .join('\n')
        .trim();

      if (!rawText) {
        primaryError = "Réponse vide de l'IA.";
        continue;
      }

      const parsed = parseJsonFromGeminiText(rawText);
      return jsonResponse({ result: parsed, model }, 200);
    } catch (err) {
      primaryError = err instanceof Error ? err.message : 'Erreur Gemini.';
    }
  }

  return jsonResponse({ error: primaryError }, 502);
});
