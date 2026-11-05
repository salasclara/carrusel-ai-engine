/**
 * Carrusel Social AI Engine — Backend Node.js
 * Deploy en Railway · Variables de entorno requeridas: OPENAI_API_KEY
 */

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Railway (y la mayoría de PaaS) usan un proxy inverso que añade X-Forwarded-For.
// Sin esto, express-rate-limit lanza ERR_ERL_UNEXPECTED_X_FORWARDED_FOR.
app.set('trust proxy', 1);

// ─── Validar entorno ────────────────────────────────────────────────────
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY no está configurada. Define la variable de entorno antes de iniciar.');
  process.exit(1);
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── CORS ───────────────────────────────────────────────────────────────
// En producción, reemplaza '*' con tus dominios autorizados:
// ['https://claude.ai', 'https://tudominio.com']
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : '*';

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

app.use(express.json({ limit: '64kb' }));

// ─── Rate limiting ───────────────────────────────────────────────────────
const textLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minuto
  max: 10,
  message: { error: 'Demasiadas solicitudes de texto. Espera un momento.' },
});
const imageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Demasiadas solicitudes de imagen. Espera un momento.' },
});

// ─── Tipos de diapositiva por posición ──────────────────────────────────
const SLIDE_TYPES = {
  1: 'cover',
  2: 'content',
  3: 'bullets',
  4: 'content',
  5: 'cta',
  6: 'content',
  7: 'cta',
  8: 'cta',
};

// ─── Instrucciones por categoría ─────────────────────────────────────────
const CAT_INSTRUCTIONS = {
  noticias: `Estás redactando un carrusel periodístico.
REGLAS ESTRICTAS:
- No inventar hechos, cifras, fechas, declaraciones ni fuentes que no estén en el texto proporcionado.
- Si el texto no tiene suficiente información para una diapositiva, indica brevemente lo que se sabe.
- Mantén tono informativo y neutral.`,
  publicidad: `Estás redactando un carrusel de publicidad para redes sociales.
REGLAS ESTRICTAS:
- No inventar ofertas, descuentos, testimonios, garantías ni promesas que no estén confirmadas.
- No usar afirmaciones superlativas sin evidencia ("el mejor", "el más reconocido").
- Usa información verificada o frases neutras como "descubre más", "solicita información".`,
  historia: 'Estás redactando un carrusel tipo historia personal o narrativa. Tono empático y conversacional.',
  mensaje: 'Estás redactando un carrusel de mensaje directo a la comunidad. Tono cercano y auténtico.',
  reflexion: 'Estás redactando un carrusel de reflexión o frase inspiradora. Tono profundo y motivador.',
};

// ─── POST /api/carousel/text ─────────────────────────────────────────────
app.post('/api/carousel/text', textLimiter, async (req, res) => {
  const { brand, brandName, category, topic, slideCount = 5, tone = 'Profesional', audience = 'General', cta } = req.body;

  if (!topic || topic.trim().length < 5) {
    return res.status(400).json({ error: 'El campo "topic" es obligatorio y debe tener al menos 5 caracteres.' });
  }
  if (!category) {
    return res.status(400).json({ error: 'El campo "category" es obligatorio.' });
  }
  const count = Math.min(Math.max(parseInt(slideCount) || 5, 3), 8);

  const catInstructions = CAT_INSTRUCTIONS[category] || CAT_INSTRUCTIONS.publicidad;
  const slideTypesDesc = Array.from({ length: count }, (_, i) => SLIDE_TYPES[i + 1] || 'content').join(', ');

  const systemPrompt = `Eres un experto en comunicación visual para Instagram y Facebook. Generas contenido profesional en español para carruseles de ${count} diapositivas.

${catInstructions}

MARCA: ${brandName || brand}
CATEGORÍA: ${category}
TONO: ${tone}
AUDIENCIA: ${audience}
${cta ? `LLAMADO A LA ACCIÓN OFICIAL: ${cta}` : ''}

ESTRUCTURA ESPERADA DE DIAPOSITIVAS (${count} en total):
${slideTypesDesc}

REGLAS DE FORMATO:
- Etiquetas (label): 2–5 palabras en MAYÚSCULAS, sin puntuación final.
- Titulares (headline): máximo 12 palabras, frase completa con sentido, puede tener punto final.
- Texto secundario (body): 1–3 oraciones cortas, máximo 30 palabras por diapositiva.
- Puntos destacados (bullets): solo para tipo "bullets", máximo 3 ítems de 8 palabras cada uno.
- Descripción de imagen (imagePrompt): describe la escena visual en inglés para DALL-E: ambiente, iluminación, composición. SIN texto, logos ni tipografía. Para noticias, indica que debe ser "editorial illustration" no fotografía documental.
- Para diapositivas tipo "cta": incluye el llamado a la acción en body.
- Responde ÚNICAMENTE con el JSON. Sin explicaciones ni texto adicional.`;

  const userPrompt = `Genera el carrusel sobre este tema/contenido:

---
${topic.slice(0, 3000)}
---

Devuelve exactamente este JSON (${count} objetos en el array):
{
  "slides": [
    {
      "type": "cover|content|bullets|cta",
      "label": "ETIQUETA EN MAYÚSCULAS",
      "headline": "Titular profesional.",
      "body": "Texto secundario o null.",
      "bullets": ["Punto 1", "Punto 2", "Punto 3"] o null,
      "imagePrompt": "Visual description for DALL-E in English."
    }
  ]
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0].message.content;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return res.status(502).json({ error: 'La IA devolvió un formato inesperado. Intenta de nuevo.' });
    }

    if (!parsed.slides || !Array.isArray(parsed.slides)) {
      return res.status(502).json({ error: 'La respuesta de la IA no contiene el array "slides". Intenta de nuevo.' });
    }

    // Normalizar y validar cada slide
    const slides = parsed.slides.slice(0, count).map((sl, i) => ({
      type: sl.type || SLIDE_TYPES[i + 1] || 'content',
      label: (sl.label || '').toUpperCase().slice(0, 50),
      headline: (sl.headline || '').slice(0, 150),
      body: sl.body || null,
      bullets: Array.isArray(sl.bullets) ? sl.bullets.slice(0, 3).map(b => String(b).slice(0, 100)) : null,
      imagePrompt: sl.imagePrompt || null,
      photo: null,
    }));

    return res.json({
      slides,
      model: 'gpt-4o-mini',
      usage: completion.usage,
    });

  } catch (err) {
    console.error('Error OpenAI text:', err.status, err.message);
    if (err.status === 401) return res.status(401).json({ error: 'API key de OpenAI inválida o sin permisos.' });
    if (err.status === 429) return res.status(429).json({ error: 'Límite de OpenAI alcanzado. Espera un momento.' });
    if (err.status === 400) return res.status(400).json({ error: 'Solicitud rechazada por OpenAI: ' + err.message });
    return res.status(500).json({ error: 'Error del servidor: ' + err.message });
  }
});

// ─── POST /api/carousel/image ─────────────────────────────────────────────
// v1.6 — gpt-image-2 · 1024×1024 · b64_json nativo
// dall-e-2 y dall-e-3 retirados el 12 mayo 2026.
// gpt-image-2 devuelve b64_json directamente; no hay URL temporal que descargar.
app.post('/api/carousel/image', imageLimiter, async (req, res) => {
  const { prompt, slideIndex = 0, brandCategory = 'editorial' } = req.body;

  if (!prompt || prompt.trim().length < 10) {
    return res.status(400).json({ error: 'El campo "prompt" es obligatorio.' });
  }

  const safePrompt = `${prompt.slice(0, 900)}. Editorial photography style, professional, cinematic lighting, high quality. NO text, NO logos, NO typography, NO watermarks. Square composition.`;

  try {
    const response = await openai.images.generate({
      model: 'gpt-image-2',
      prompt: safePrompt,
      n: 1,
      size: '1024x1024',
      // response_format no soportado en gpt-image-2 — devuelve b64_json por defecto
    });

    const b64 = response.data[0].b64_json;
    if (!b64) {
      return res.status(502).json({ error: 'La API no devolvió imagen en base64.' });
    }

    return res.json({
      imageData: `data:image/png;base64,${b64}`,
      slideIndex,
      model: 'gpt-image-2',
      quality: 'standard',
      estimatedCost: 0.040,
      note: 'Imagen generada con gpt-image-2 — base64 nativo, compatible con Canvas/ZIP.',
    });

  } catch (err) {
    console.error('Error OpenAI image:', err.status, err.message);
    if (err.status === 400 && (err.message.includes('safety') || err.message.includes('content_policy'))) {
      return res.status(400).json({ error: 'El prompt fue rechazado por las políticas de contenido de OpenAI. Reformula la descripción de la imagen.' });
    }
    if (err.status === 401) return res.status(401).json({ error: 'API key de OpenAI inválida o sin permisos.' });
    if (err.status === 429) return res.status(429).json({ error: 'Límite de OpenAI alcanzado. Espera un momento.' });
    return res.status(500).json({ error: 'Error generando imagen: ' + err.message });
  }
});

// ─── GET /api/health ──────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Carrusel Social AI Engine',
    version: '1.6.0',
    openai: !!process.env.OPENAI_API_KEY,
    timestamp: new Date().toISOString(),
  });
});

// ─── 404 ──────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

// ─── Error handler ────────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

app.listen(PORT, () => {
  console.log(`✅ Carrusel AI Engine corriendo en puerto ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
});
