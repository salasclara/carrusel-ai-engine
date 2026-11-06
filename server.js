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

  publicidad: `Eres un director creativo y copywriter especialista en publicidad para redes sociales con alto poder de conversión.
Tu objetivo es crear carruseles publicitarios que interrumpan el scroll, generen deseo y provoquen acción.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ESTRUCTURA NARRATIVA OBLIGATORIA (5 láminas)
Cada lámina tiene una función publicitaria específica. Respeta este orden:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

LÁMINA 1 — GANCHO (type: "cover")
Función: Captar atención inmediata. Interrumpir el scroll en 2 segundos.
Regla: El headline debe ser una frase corta (máx. 7 palabras), impactante, que genere curiosidad o deseo instantáneo.
NO describas el negocio todavía. NO uses el nombre de la marca en el titular.
El gancho debe hablar de TRANSFORMACIÓN, POSIBILIDAD o IDENTIDAD.

LÁMINA 2 — INTERÉS / DESEO (type: "content")
Función: Despertar el deseo de pertenecer, transformarse o lograr algo.
Regla: Habla a la EMOCIÓN, no al producto. ¿Cómo se va a sentir el cliente después?
Usa "tú" y conecta con el sueño o la aspiración del cliente ideal.

LÁMINA 3 — PROPUESTA DE VALOR (type: "bullets")
Función: Mostrar específicamente qué obtiene el cliente.
Regla: Exactamente 3 beneficios concretos, tangibles. Sin palabras genéricas como "calidad", "excelencia" o "metodología" sin respaldo.
Los bullets deben responder: ¿qué aprende / logra / obtiene?

LÁMINA 4 — CONEXIÓN EMOCIONAL (type: "content")
Función: Crear identificación. El cliente debe verse reflejado.
Regla: Una sola idea poderosa. Breve y directa. Puede ser un pensamiento, una verdad o un desafío.
Evita el tono corporativo. Esta lámina debe sonar humana.

LÁMINA 5 — CIERRE / CTA (type: "cta")
Función: Provocar la acción inmediata. No dejar dudas sobre el siguiente paso.
Regla: Clara, directa, sin rodeos. Incluye el CTA oficial de la marca en el body.
El headline puede crear urgencia (cupos, momento, oportunidad).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGLAS DE REDACCIÓN PUBLICITARIA (OBLIGATORIAS)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Titulares: máximo 8 palabras. Memorables, emocionalmente atractivos, UNA sola idea por lámina.
- Body: máximo 2 oraciones cortas (máx. 25 palabras total). Sin párrafos ni relleno.
- PROHIBIDO usar: "programas académicos", "comunidad educativa", "formación integral", "docentes altamente capacitados", "ambiente colaborativo", "aprendizaje significativo", "metodología innovadora" u otras frases institucionales genéricas.
- El tono y vocabulario deben reflejar EXACTAMENTE el estilo descrito en el perfil de la marca.
- Si el tema es corto (ej: "Inscripciones abiertas"), usa el perfil de marca para enriquecer el contexto. El tema es el punto de partida, no la limitación.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROHIBICIONES ABSOLUTAS DE VERACIDAD (aplica a TODAS las marcas)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NUNCA escribir las siguientes afirmaciones sin confirmación explícita en el texto del cliente:
- "cupos limitados" / "últimos lugares" / "solo quedan X plazas" (disponibilidad)
- "en pocos días" / "en X semanas" / "resultados en X tiempo" (plazos de resultado)
- "incluido" / "gratis" / "sin costo adicional" para servicios, sesiones o materiales no confirmados
- "certificado" / "acreditado" / "avalado por" / "reconocido a nivel nacional/internacional"
- "garantizamos" / "aseguramos" / "prometemos" cualquier resultado
- Precios, descuentos o porcentajes específicos no proporcionados
- Testimonios, casos de éxito o estadísticas no presentes en el texto
- Fechas específicas de inscripción, inicio o eventos no confirmadas
Cuando el tema no proporcione esa información, usa frases como: "descubre más", "solicita información", "conoce nuestros programas", "da el primer paso", "empieza hoy".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONCEPTO VISUAL (imagePrompt) POR LÁMINA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Genera un concepto fotográfico DIFERENTE para cada lámina, alineado con su función publicitaria.
- Escribe en inglés, específico y cinematográfico.
- Refleja el estilo visual de la marca (ver perfil arriba).
- FORMATO: Composición vertical 4:5, optimizada para Instagram y Facebook (retrato, no cuadrado).
- COHERENCIA VISUAL: Las 5 imágenes deben pertenecer al mismo universo visual (misma paleta de color, mismo estilo fotográfico, mismo nivel de producción), pero con escenarios y composiciones completamente DIFERENTES entre sí.
- Lámina 1 (gancho): imagen poderosa y aspiracional que detenga el scroll.
- Lámina 2 (deseo): imagen emocional, cálida, que conecte con el sueño del cliente.
- Lámina 3 (valor): imagen que muestre el proceso o el resultado tangible.
- Lámina 4 (emoción): imagen íntima, auténtica, de conexión humana.
- Lámina 5 (CTA): imagen de oportunidad, invitación, puerta que se abre.`,

  historia: 'Estás redactando un carrusel tipo historia personal o narrativa. Tono empático y conversacional.',
  mensaje: 'Estás redactando un carrusel de mensaje directo a la comunidad. Tono cercano y auténtico.',
  reflexion: 'Estás redactando un carrusel de reflexión o frase inspiradora. Tono profundo y motivador.',
};

// ─── POST /api/carousel/text ─────────────────────────────────────────────
app.post('/api/carousel/text', textLimiter, async (req, res) => {
  const { brand, brandName, category, topic, slideCount = 5, tone = 'Profesional', audience = 'General', cta, brandProfile } = req.body;

  if (!topic || topic.trim().length < 5) {
    return res.status(400).json({ error: 'El campo "topic" es obligatorio y debe tener al menos 5 caracteres.' });
  }
  if (!category) {
    return res.status(400).json({ error: 'El campo "category" es obligatorio.' });
  }
  const count = Math.min(Math.max(parseInt(slideCount) || 5, 3), 8);

  const catInstructions = CAT_INSTRUCTIONS[category] || CAT_INSTRUCTIONS.publicidad;
  const slideTypesDesc = Array.from({ length: count }, (_, i) => SLIDE_TYPES[i + 1] || 'content').join(', ');

  // Construir bloque de perfil de marca si viene del frontend
  const brandProfileBlock = brandProfile ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PERFIL DE IDENTIDAD DE MARCA (Brand AI Profile)
Usa esta información para contextualizar TODAS las diapositivas:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Negocio: ${brandProfile.businessDescription || ''}
Sector: ${brandProfile.sector || ''}
Público objetivo: ${brandProfile.audience || ''}
Servicios / temas principales: ${brandProfile.services || ''}
Estilo de comunicación: ${brandProfile.communicationStyle || ''}
Identidad visual: ${brandProfile.visualIdentity || ''}
Tipos de fotografía recomendada: ${brandProfile.photoTypes || ''}
Elementos visuales a EVITAR: ${brandProfile.avoidElements || ''}
Información comercial verificada: ${brandProfile.verifiedInfo || ''}
RESTRICCIONES EDITORIALES CRÍTICAS: ${brandProfile.restrictions || ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━` : '';

  const systemPrompt = `Eres un experto en comunicación visual para Instagram y Facebook. Generas contenido profesional en español para carruseles de ${count} diapositivas.

${catInstructions}
${brandProfileBlock}
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

  const isAdvertising = category === 'publicidad';
  const userPrompt = isAdvertising
    ? `Crea una campaña publicitaria para redes sociales sobre: «${topic.slice(0, 500)}»

INSTRUCCIÓN IMPORTANTE: El tema puede ser muy breve. Usa el Perfil de Identidad de Marca para enriquecer cada lámina con el contexto correcto del negocio, su audiencia y su propuesta de valor. El tema es el punto de partida creativo, no una limitación.

Genera exactamente ${count} láminas siguiendo la estructura narrativa AIDA+ indicada (gancho → interés/deseo → valor → emoción → CTA).
Adapta el lenguaje, el tono y los conceptos visuales al perfil de la marca activa.

Devuelve ÚNICAMENTE este JSON (sin texto adicional):
{
  "slides": [
    {
      "type": "cover|content|bullets|cta",
      "label": "ETIQUETA CORTA EN MAYÚSCULAS (2–4 palabras)",
      "headline": "Titular impactante (máx. 8 palabras).",
      "body": "Texto secundario breve (máx. 2 oraciones) o null.",
      "bullets": ["Beneficio concreto 1", "Beneficio concreto 2", "Beneficio concreto 3"] o null,
      "imagePrompt": "Cinematic visual concept in English for this slide's advertising function."
    }
  ]
}`
    : `Genera el carrusel sobre este tema/contenido:

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
// v1.7 — gpt-image-2 · 1024×1024 · b64_json nativo · Brand AI Profile support
app.post('/api/carousel/image', imageLimiter, async (req, res) => {
  const { prompt, slideIndex = 0, brandCategory = 'editorial', brandProfile } = req.body;

  if (!prompt || prompt.trim().length < 10) {
    return res.status(400).json({ error: 'El campo "prompt" es obligatorio.' });
  }

  // Construir contexto de marca para enriquecer el prompt visual
  let brandContext = '';
  if (brandProfile) {
    const parts = [];
    if (brandProfile.businessDescription) parts.push(`Brand: ${brandProfile.businessDescription}`);
    if (brandProfile.sector)              parts.push(`Sector: ${brandProfile.sector}`);
    if (brandProfile.visualIdentity)      parts.push(`Visual style: ${brandProfile.visualIdentity}`);
    if (brandProfile.photoTypes)          parts.push(`Recommended visuals: ${brandProfile.photoTypes}`);
    if (brandProfile.avoidElements)       parts.push(`MUST AVOID in image: ${brandProfile.avoidElements}`);
    brandContext = parts.join('. ') + '. ';
  }

  const safePrompt = `${brandContext}${prompt.slice(0, 700)}. Professional photography, cinematic lighting, high quality. NO text, NO logos, NO typography, NO watermarks. Square composition.`;

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
    version: '1.9.0',
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
