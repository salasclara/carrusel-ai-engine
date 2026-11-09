/**
 * Carrusel Social AI Engine — Backend Node.js v2.0
 * Deploy en Railway
 * Variables de entorno requeridas: OPENAI_API_KEY
 * Variables opcionales: DATABASE_URL, ACCESS_KEY, ALLOWED_ORIGINS
 */

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const OpenAI = require('openai');
const { Pool } = require('pg');
const { URL } = require('url');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Railway usa proxy inverso — necesario para express-rate-limit
app.set('trust proxy', 1);

// ─── Validar entorno ────────────────────────────────────────────────────
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY no está configurada.');
  process.exit(1);
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── PostgreSQL ──────────────────────────────────────────────────────────
let db = null;
if (process.env.DATABASE_URL) {
  db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  db.on('error', err => console.error('PostgreSQL error:', err.message));
} else {
  console.warn('⚠️  DATABASE_URL no configurada — módulo de clientes desactivado.');
}

// ─── Inicializar base de datos ───────────────────────────────────────────
async function initDB() {
  if (!db) return;
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slug        TEXT UNIQUE,
        name        TEXT NOT NULL,
        website     TEXT,
        sector      TEXT,
        logo_url    TEXT,
        social_links TEXT,
        business_description TEXT,
        audience    TEXT,
        services    TEXT,
        communication_style TEXT,
        visual_identity TEXT,
        photo_types TEXT,
        avoid_elements TEXT,
        verified_info TEXT,
        restrictions TEXT,
        facebook    TEXT,
        instagram   TEXT,
        temporary_info TEXT,
        colors      TEXT,
        source_urls TEXT,
        analyzed_at TIMESTAMPTZ,
        status      TEXT DEFAULT 'active',
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Seed: perfiles predeterminados (solo si la tabla está vacía)
    const { rows } = await db.query('SELECT COUNT(*) FROM clients');
    if (parseInt(rows[0].count) === 0) {
      await seedDefaultClients();
    }
    // Migraciones para tablas existentes
    await db.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS facebook TEXT`);
    await db.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS instagram TEXT`);
    await db.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS temporary_info TEXT`);

    console.log('✅ Base de datos lista');
  } catch (err) {
    console.error('❌ Error inicializando DB:', err.message);
  }
}

const DEFAULT_CLIENTS = [
  {
    slug: 'rocimar', name: 'Noticias con Rocimar Morales',
    website: null, sector: 'Medios de comunicación, periodismo digital',
    social_links: JSON.stringify({ instagram: '@RocimarNoticias' }),
    business_description: 'Canal de noticias y análisis periodístico conducido por Rocimar Morales, enfocado en la comunidad latina.',
    audience: 'Comunidad latina en Estados Unidos interesada en noticias actuales, política y cultura.',
    services: 'Cobertura de noticias, análisis político, reportajes de actualidad, entrevistas.',
    communication_style: 'Informativo, neutral y profesional. Basado estrictamente en hechos verificados.',
    visual_identity: 'Paleta rojo, azul marino y blanco. Estética periodística profesional.',
    photo_types: 'Estudios de noticias, micrófonos, pantallas informativas, ciudades, eventos públicos, personas diversas en contextos noticiosos.',
    avoid_elements: 'Imágenes sensacionalistas, montajes, contenido no verificado, símbolos partidistas.',
    verified_info: 'Canal digital. @RocimarNoticias.',
    restrictions: 'No inventar hechos, cifras, declaraciones ni fechas.',
    colors: JSON.stringify({ bg1:'#060E20', bg2:'#0F2347', accent:'#E63946', text:'#FFFFFF', sub:'#B0BDD0', badge:'#E63946', badgeTxt:'#fff' }),
  },
  {
    slug: 'pasarela', name: 'Pasarela Studio Internacional',
    website: 'https://pasarelastudio.com', sector: 'Moda, modelaje y desarrollo personal',
    social_links: JSON.stringify({ web: 'pasarelastudio.com' }),
    business_description: 'Escuela profesional de modelaje, pasarela, fotopose, expresión corporal e imagen personal, ubicada en el área de Dallas, Texas.',
    audience: 'Jóvenes y adultos de 15–45 años interesados en modelaje profesional, fotografía de moda, imagen personal y desarrollo de confianza.',
    services: 'Clases de pasarela, fotopose, expresión corporal, imagen personal, maquillaje artístico, sesiones fotográficas profesionales, talleres de confianza y presencia escénica.',
    communication_style: 'Aspiracional, elegante y motivador. Destaca la transformación personal, la confianza y el mundo de la moda profesional.',
    visual_identity: 'Paleta dorada, negra y vino tinto. Estética de alta costura, elegante, sofisticada y profesional.',
    photo_types: 'Modelos en pasarela de moda, sesiones fotográficas de moda, backstage de fashion show, poses profesionales en estudio con iluminación dramática, telas lujosas y accesorios de moda.',
    avoid_elements: 'Aulas escolares tradicionales, pizarras, escritorios de colegio, libros de texto, uniformes escolares.',
    verified_info: 'Escuela en Dallas, Texas. Web: pasarelastudio.com.',
    restrictions: 'No inventar precios, fechas de inscripción ni nombres de instructores. Usar "solicita información".',
    colors: JSON.stringify({ bg1:'#0D0107', bg2:'#7B2D3E', accent:'#C9A84C', text:'#FFFFFF', sub:'#F0E6CF', badge:'#C9A84C', badgeTxt:'#1A040C' }),
  },
  {
    slug: 'fancy', name: 'Fancy by Roxette',
    website: null, sector: 'Moda, estilo personal, belleza',
    social_links: JSON.stringify({ instagram: '@FancyByRoxette' }),
    business_description: 'Marca de moda y estilo personal de Roxette para mujeres latinas.',
    audience: 'Mujeres latinas de 20–45 años interesadas en moda, tendencias y estilo personal.',
    services: 'Asesoría de imagen, looks de moda, tendencias, estilo personal.',
    communication_style: 'Sofisticado, femenino, aspiracional y cercano.',
    visual_identity: 'Paleta rosa, morado y dorado. Estética glamurosa, femenina y elegante.',
    photo_types: 'Moda femenina, accesorios de lujo, looks elegantes, detalles de telas y joyería.',
    avoid_elements: 'Imágenes genéricas sin estilo definido.',
    verified_info: '@FancyByRoxette.',
    restrictions: 'No inventar productos disponibles, precios ni fechas sin confirmación.',
    colors: JSON.stringify({ bg1:'#2D0A2A', bg2:'#8B2063', accent:'#F4A6CD', text:'#FFFFFF', sub:'#F4D6E8', badge:'#F4A6CD', badgeTxt:'#2D0A2A' }),
  },
  {
    slug: 'amares', name: 'Amar Es',
    website: null, sector: 'Contenido espiritual e inspiracional',
    social_links: JSON.stringify({ instagram: '@AmarEs' }),
    business_description: 'Marca de contenido inspiracional sobre amor, fe, relaciones y valores espirituales.',
    audience: 'Comunidad latina interesada en fe, familia, amor y valores.',
    services: 'Contenido inspiracional, mensajes de amor y fe, reflexiones.',
    communication_style: 'Cálido, espiritual, esperanzador y amoroso.',
    visual_identity: 'Paleta rosa suave, morado y blanco. Estética suave y serena.',
    photo_types: 'Parejas en momentos tiernos, familias, luz natural suave, flores, naturaleza, símbolos de amor y fe.',
    avoid_elements: 'Imágenes oscuras, conflictivas o divisivas.',
    verified_info: '@AmarEs.',
    restrictions: 'Mantener mensajes positivos. No inventar testimonios.',
    colors: JSON.stringify({ bg1:'#1A0820', bg2:'#5B1E6E', accent:'#F9A8D4', text:'#FFFFFF', sub:'#EDD5F7', badge:'#F9A8D4', badgeTxt:'#1A0820' }),
  },
  {
    slug: 'maravillas', name: 'Maravillas del Reino',
    website: null, sector: 'Contenido cristiano y espiritual',
    social_links: JSON.stringify({ instagram: '@MaravillasDelReino' }),
    business_description: 'Ministerio cristiano de contenido sobre milagros, fe y esperanza para la comunidad latina.',
    audience: 'Comunidad latina cristiana interesada en fe, Biblia y milagros.',
    services: 'Mensajes bíblicos, contenido de fe, testimonios, reflexiones espirituales.',
    communication_style: 'Inspirador, esperanzador, bíblico y lleno de fe.',
    visual_identity: 'Paleta azul marino, dorado y blanco. Estética celestial y majestuosa.',
    photo_types: 'Cielos con luz dorada, iglesias majestuosas, Biblia abierta, cruces, luz divina.',
    avoid_elements: 'Imágenes controversiales o contrarias a valores cristianos.',
    verified_info: '@MaravillasDelReino.',
    restrictions: 'No inventar testimonios ni promesas de resultados.',
    colors: JSON.stringify({ bg1:'#0C1A3A', bg2:'#1E3F8A', accent:'#FCD34D', text:'#FFFFFF', sub:'#D1DCF8', badge:'#FCD34D', badgeTxt:'#0C1A3A' }),
  },
  {
    slug: 'latina768', name: 'Latina 768 Services',
    website: 'https://latina768.com', sector: 'Servicios profesionales para la comunidad latina',
    social_links: JSON.stringify({ web: 'latina768.com' }),
    business_description: 'Agencia de servicios para la comunidad latina en Dallas: seguros de vida y salud, bienes raíces e inversiones, y marketing digital.',
    audience: 'Familias y emprendedores latinos en Texas y Estados Unidos.',
    services: 'Seguros de vida y salud, bienes raíces, marketing digital, generación de leads, consultoría empresarial.',
    communication_style: 'Profesional, confiable, cercano y orientado a soluciones para la comunidad latina.',
    visual_identity: 'Paleta naranja, azul marino y blanco. Estética profesional y moderna.',
    photo_types: 'Familias latinas felices, hogares modernos, apretones de mano profesionales, oficinas, llaves de casa.',
    avoid_elements: 'Imágenes estereotipadas o de baja calidad.',
    verified_info: 'latina768.com. Área de Dallas, Texas.',
    restrictions: 'No inventar coberturas, tasas, disponibilidad de propiedades ni precios.',
    colors: JSON.stringify({ bg1:'#061020', bg2:'#0E3360', accent:'#F97316', text:'#FFFFFF', sub:'#C4D4E8', badge:'#F97316', badgeTxt:'#fff' }),
  },
];

async function seedDefaultClients() {
  for (const c of DEFAULT_CLIENTS) {
    await db.query(`
      INSERT INTO clients (slug, name, website, sector, social_links,
        business_description, audience, services, communication_style,
        visual_identity, photo_types, avoid_elements, verified_info,
        restrictions, colors)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT (slug) DO NOTHING
    `, [
      c.slug, c.name, c.website || null, c.sector, c.social_links,
      c.business_description, c.audience, c.services, c.communication_style,
      c.visual_identity, c.photo_types, c.avoid_elements, c.verified_info,
      c.restrictions, c.colors,
    ]);
  }
  console.log(`✅ Seed: ${DEFAULT_CLIENTS.length} perfiles de marca cargados`);
}

// ─── Auth middleware ─────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const key = process.env.ACCESS_KEY;
  if (!key) return next(); // sin ACCESS_KEY configurada → acceso libre (dev)
  const provided = req.headers['x-access-key'] || req.query.key;
  if (provided !== key) {
    return res.status(401).json({ error: 'Acceso no autorizado.' });
  }
  next();
}

// ─── CORS ───────────────────────────────────────────────────────────────
// En producción, reemplaza '*' con tus dominios autorizados:
// ['https://claude.ai', 'https://tudominio.com']
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : '*';

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'x-access-key'],
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

// ─── Instrucciones por categoría (Fase B) ────────────────────────────────
const CAT_INSTRUCTIONS = {

  // ── PUBLICIDAD ──────────────────────────────────────────────────────────
  publicidad: `Eres un director creativo y copywriter especialista en publicidad para redes sociales con alto poder de conversión.
Tu objetivo es crear carruseles publicitarios que interrumpan el scroll, generen deseo y provoquen acción.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ESTRUCTURA NARRATIVA OBLIGATORIA (5 láminas)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LÁMINA 1 — GANCHO (type: "cover")
Captar atención en 2 segundos. Frase corta (máx. 7 palabras), impactante. Habla de TRANSFORMACIÓN o IDENTIDAD. NO uses el nombre de la marca en el titular.

LÁMINA 2 — INTERÉS / DESEO (type: "content")
Habla a la EMOCIÓN, no al producto. ¿Cómo se sentirá el cliente? Usa "tú". Conecta con el sueño de la audiencia.

LÁMINA 3 — PROPUESTA DE VALOR (type: "bullets")
Exactamente 3 beneficios concretos y tangibles basados en los servicios REALES de la marca. Sin palabras genéricas.

LÁMINA 4 — CONEXIÓN EMOCIONAL (type: "content")
Una sola idea poderosa. Breve. Debe sonar humana, no corporativa.

LÁMINA 5 — CIERRE / CTA (type: "cta")
Clara y directa. Incluye el CTA oficial de la marca. Puede crear urgencia.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGLAS DE REDACCIÓN (OBLIGATORIAS)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Titulares: máx. 8 palabras. UNA sola idea por lámina.
- Body: máx. 2 oraciones cortas (máx. 25 palabras). Sin párrafos ni relleno.
- PROHIBIDO: "formación integral", "docentes capacitados", "ambiente colaborativo", "metodología innovadora" y frases institucionales genéricas.
- El tono debe reflejar EXACTAMENTE el estilo descrito en el perfil.
- Si el tema es corto, usa el perfil de marca para enriquecer. El tema es el punto de partida.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROHIBICIONES ABSOLUTAS DE VERACIDAD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NUNCA escribir sin confirmación explícita del cliente:
- "cupos limitados" / "últimos lugares" / "solo quedan X plazas"
- "en X días/semanas" / "resultados en X tiempo"
- "incluido" / "gratis" / "sin costo adicional" para no confirmados
- "certificado" / "acreditado" / "avalado por"
- "garantizamos" / "aseguramos" cualquier resultado
- Precios, descuentos o porcentajes no proporcionados
- Testimonios o estadísticas no presentes en el texto
- Fechas de inscripción o eventos no confirmadas
Usa en su lugar: "descubre más", "solicita información", "da el primer paso".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONCEPTO VISUAL (imagePrompt) POR LÁMINA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Genera un imagePrompt DIFERENTE para cada lámina. En inglés, cinematográfico.
- Formato: vertical 4:5, sin texto, sin logos.
- Las imágenes deben pertenecer al mismo universo visual pero con escenas completamente distintas.
- Lámina 1: poderosa y aspiracional. Lámina 2: emocional y cálida. Lámina 3: proceso o resultado tangible. Lámina 4: conexión humana íntima. Lámina 5: oportunidad, puerta que se abre.`,

  // ── NOTICIAS ────────────────────────────────────────────────────────────
  noticias: `Eres un periodista y editor de contenido para redes sociales.
Tu objetivo es comunicar hechos reales con claridad, precisión y estructura periodística.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ESTRUCTURA OBLIGATORIA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LÁMINA 1 — TITULAR (type: "cover")
El hecho más importante en una sola frase directa. Responde QUÉ ocurrió. Sin adjetivos sensacionalistas.

LÁMINA 2 — CONTEXTO (type: "content")
QUIÉN participó y CUÁNDO/DÓNDE ocurrió. Solo datos presentes en el texto proporcionado.

LÁMINA 3 — DESARROLLO (type: "bullets")
3 puntos clave del hecho. Datos concretos. Sin interpretación ni especulación.

LÁMINA 4 — IMPLICACIONES (type: "content")
¿Qué significa esto? Solo si el texto lo indica. Si no, describe brevemente el impacto directo.

LÁMINA 5 — CIERRE (type: "cta")
Fuente o contexto adicional. Puede invitar a seguir la cobertura.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGLAS PERIODÍSTICAS (INQUEBRANTABLES)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- NO inventar hechos, cifras, fechas, declaraciones ni fuentes que no estén en el texto.
- NO usar el tono de la marca como anuncio comercial. Es una noticia, no publicidad.
- Si el texto no tiene suficiente información para una lámina, describe brevemente lo que se sabe.
- Si falta información esencial (fecha, lugar, protagonistas), indícalo en el body con "[Dato no disponible]".
- Mantén tono informativo y neutral. Sin opinión ni dramatismo.
- Las fechas y fuentes deben preservarse tal como aparecen en el texto original.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONCEPTO VISUAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
imagePrompt debe describir ilustraciones editoriales o fotografía documental. En inglés.
- Formato: vertical 4:5. Editorial, limpio, sin texto ni logos.
- NO usar imágenes publicitarias o aspiracionales. El estilo debe ser periodístico y serio.`,

  // ── REFLEXIÓN ───────────────────────────────────────────────────────────
  reflexion: `Eres un escritor de contenido inspirador para redes sociales.
Tu objetivo es crear reflexiones originales que conecten con los valores y la audiencia de la marca.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ESTRUCTURA OBLIGATORIA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LÁMINA 1 — FRASE DE APERTURA (type: "cover")
Una idea que detenga el scroll. Formulada como verdad universal o pregunta poderosa. Máx. 8 palabras.

LÁMINA 2 — DESARROLLO (type: "content")
Explora la idea. ¿Por qué importa? Escribe a la audiencia específica de la marca, no a todos.

LÁMINA 3 — PUNTOS DE REFLEXIÓN (type: "bullets")
3 ideas relacionadas que profundizan el tema. Originales, no genéricas.

LÁMINA 4 — CONEXIÓN PERSONAL (type: "content")
Acerca la reflexión al mundo real del lector. Usando el vocabulario y tono de la marca.

LÁMINA 5 — INVITACIÓN (type: "cta")
Un pensamiento de cierre o una invitación a reflexionar más. No convertir en anuncio comercial.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGLAS EDITORIALES (OBLIGATORIAS)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- El contenido debe ser ORIGINAL. No parafrasear citas conocidas sin atribución.
- NO inventar citas ni atribuirlas a personas reales.
- NO convertir la reflexión en publicidad ni mencionar productos o servicios a menos que sea completamente natural.
- El estilo y vocabulario deben reflejar la identidad de la marca (ver perfil).
- La reflexión debe relacionarse con los valores y el mundo de la audiencia, no ser genérica.
- Tono: profundo pero accesible. Inspirador sin ser sermón.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONCEPTO VISUAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
imagePrompt: fotografía artística, atmosférica, que evoque la emoción de la reflexión. En inglés.
- Formato: vertical 4:5. Iluminación suave, composición poética. Sin texto ni logos.
- Refleja el universo visual de la marca pero con un tono más íntimo e introspectivo.`,

  // ── HISTORIA ────────────────────────────────────────────────────────────
  historia: `Eres un narrador de historias para redes sociales.
Tu objetivo es contar una historia real, narrativa o testimonial que conecte emocionalmente con la audiencia.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ESTRUCTURA OBLIGATORIA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LÁMINA 1 — INTRODUCCIÓN (type: "cover")
Presenta el personaje, la situación o el momento inicial. Genera curiosidad. ¿Quién y en qué punto de su vida?

LÁMINA 2 — DESAFÍO (type: "content")
El problema, la duda o el punto de quiebre. ¿Qué tenía que superar o decidir?

LÁMINA 3 — PROCESO (type: "bullets")
3 pasos, decisiones o cambios concretos que ocurrieron. Específicos, no genéricos.

LÁMINA 4 — RESULTADO (type: "content")
¿Cómo terminó o cómo cambió? Concreto y emocional. Si es ficticio, debe ser claramente narrativo.

LÁMINA 5 — LECCIÓN (type: "cta")
La idea que se lleva el lector. Puede conectar suavemente con la marca si es natural.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGLAS NARRATIVAS (OBLIGATORIAS)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Si la historia es REAL (testimonio, caso de cliente, experiencia de la marca): usar solo los datos proporcionados. No agregar detalles inventados.
- Si es FICTICIA o NARRATIVA: indicar claramente en el label o contexto que es un relato ilustrativo.
- NO inventar testimonios de clientes, alumnos ni participantes reales.
- NO mezclar datos reales con ficción sin señalarlo.
- Tono: conversacional, humano, empático. Primera o tercera persona según el texto.
- Usa el vocabulario y la voz de la marca (ver perfil).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONCEPTO VISUAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
imagePrompt: fotografía narrativa que evoque el momento de la historia. En inglés.
- Formato: vertical 4:5. Cálido, humano, auténtico. Sin texto ni logos.
- Cada lámina debe reflejar visualmente el momento narrativo correspondiente.`,

  // ── MENSAJE ─────────────────────────────────────────────────────────────
  mensaje: `Eres un especialista en comunicación de comunidad para redes sociales.
Tu objetivo es crear mensajes directos, cálidos y auténticos de la marca hacia su audiencia.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ESTRUCTURA OBLIGATORIA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LÁMINA 1 — SALUDO / APERTURA (type: "cover")
El tono y la intención del mensaje en una frase directa. Debe sentirse como una conversación real.

LÁMINA 2 — MENSAJE CENTRAL (type: "content")
La idea principal: felicitación, agradecimiento, celebración, motivación o reconocimiento.

LÁMINA 3 — DESARROLLO (type: "bullets")
3 ideas que amplían o complementan el mensaje. Específicas para esta audiencia.

LÁMINA 4 — CONEXIÓN (type: "content")
Acerca el mensaje a la experiencia del lector. Personal y cercano.

LÁMINA 5 — CIERRE (type: "cta")
Un pensamiento final cálido. Puede incluir el nombre de la marca o un gesto de comunidad.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGLAS DE TONO (OBLIGATORIAS)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- El tono debe adaptarse EXACTAMENTE al estilo de comunicación de la marca (ver perfil).
- NO incluir afirmaciones comerciales a menos que el mensaje sea explícitamente una promoción.
- NO inventar hechos, fechas, logros o estadísticas de la comunidad.
- Lenguaje cercano y humano. Sin formalidad corporativa.
- Si el mensaje es de celebración (cumpleaños, aniversario, fecha especial): mencionar el motivo solo si está en el texto.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONCEPTO VISUAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
imagePrompt: fotografía cálida, de comunidad, celebración o conexión humana. En inglés.
- Formato: vertical 4:5. Iluminación cálida, ambiente positivo. Sin texto ni logos.
- Debe transmitir el mismo sentimiento del mensaje: gratitud, celebración, motivación o cercanía.`,
};

// ─── Fase C: Selección inteligente de contexto por categoría ─────────────
function buildBrandContext(brandProfile, category) {
  if (!brandProfile) return '';

  const p = brandProfile;

  // Campos comunes a todas las categorías
  const name    = p.businessDescription || '';
  const sector  = p.sector || '';
  const style   = p.communicationStyle || '';
  const audience= p.audience || '';
  const avoid   = p.avoidElements || '';
  const photos  = p.photoTypes || '';
  const restrict= p.restrictions || '';

  // Campos específicos de publicidad
  const services = p.services || '';
  const verified = p.verifiedInfo || '';
  const visual   = p.visualIdentity || '';

  switch (category) {

    case 'publicidad':
      // Contexto completo — todo es relevante para vender
      return `PERFIL DE MARCA (uso obligatorio):
Negocio: ${name}
Sector: ${sector}
Público objetivo: ${audience}
Servicios reales: ${services}
Estilo de comunicación: ${style}
Identidad visual: ${visual}
Fotografía recomendada: ${photos}
Elementos a EVITAR: ${avoid}
Información comercial verificada: ${verified}
RESTRICCIONES EDITORIALES: ${restrict}`;

    case 'noticias':
      // Solo restricciones e info verificada — no contaminar con marketing
      return `CONTEXTO DE LA MARCA (solo para identificar quién publica, no para convertir en anuncio):
Nombre del medio o marca: ${name}
Sector: ${sector}
RESTRICCIONES EDITORIALES: ${restrict}
${verified ? `Información verificada de la marca: ${verified}` : ''}`;

    case 'reflexion':
      // Voz, valores y audiencia — sin servicios ni datos comerciales
      return `VOZ Y AUDIENCIA DE LA MARCA:
Descripción: ${name}
Sector: ${sector}
Público al que habla: ${audience}
Estilo de comunicación (voz de la marca): ${style}
Fotografía recomendada para el universo visual: ${photos}
Elementos a evitar: ${avoid}`;

    case 'historia':
      // Identidad y voz — para que la narración suene a la marca
      return `VOZ E IDENTIDAD DE LA MARCA:
Descripción del negocio: ${name}
Sector: ${sector}
Audiencia principal: ${audience}
Estilo de comunicación: ${style}
${restrict ? `Restricciones: ${restrict}` : ''}`;

    case 'mensaje':
      // Solo tono y audiencia — el mensaje es de comunidad, no comercial
      return `TONO Y AUDIENCIA DE LA MARCA:
Descripción: ${name}
Público al que habla: ${audience}
Estilo de comunicación (tono): ${style}`;

    default:
      return `PERFIL DE MARCA: ${name}. Sector: ${sector}. Audiencia: ${audience}. Estilo: ${style}.`;
  }
}

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

  // Fase C: contexto inteligente según categoría
  const brandContextBlock = brandProfile
    ? `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${buildBrandContext(brandProfile, category)}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    : '';

  const systemPrompt = `Eres un experto en comunicación visual para Instagram y Facebook. Generas contenido profesional en español para carruseles de ${count} diapositivas.

${catInstructions}
${brandContextBlock}
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

  // Fase B+C: userPrompt diferenciado por categoría
  const brandServices   = brandProfile?.services   || '';
  const brandPhotoTypes = brandProfile?.photoTypes  || '';
  const brandAvoid      = brandProfile?.avoidElements || '';
  const brandBusiness   = brandProfile?.businessDescription || brandName || '';
  const brandAudience   = brandProfile?.audience    || '';

  const JSON_SCHEMA = `{
  "slides": [
    {
      "type": "cover|content|bullets|cta",
      "label": "ETIQUETA CORTA EN MAYÚSCULAS (2–4 palabras)",
      "headline": "Titular (máx. 8 palabras).",
      "body": "Texto secundario (máx. 2 oraciones) o null.",
      "bullets": ["Punto 1", "Punto 2", "Punto 3"] o null,
      "imagePrompt": "Cinematic scene in English. Vertical 4:5. No text, no logos."
    }
  ]
}`;

  let userPrompt;

  if (category === 'publicidad') {
    userPrompt = `Crea una campaña publicitaria de ${count} láminas para redes sociales.

TEMA / MOTIVO DE LA CAMPAÑA: «${topic.slice(0, 500)}»

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTEXTO DE MARCA (USO OBLIGATORIO)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Este negocio es: ${brandBusiness}
Su audiencia es: ${brandAudience}
Sus servicios reales son: ${brandServices}

REGLA CRÍTICA:
- Cada titular y bullet DEBE hacer referencia a los servicios reales listados arriba.
- PROHIBIDO: motivación genérica, frases institucionales, lenguaje corporativo.
- Los 3 bullets de la lámina 3 deben derivarse solo de los servicios reales.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONCEPTO VISUAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Fotografía correcta para esta marca: ${brandPhotoTypes || 'fotografía profesional alineada con la marca'}
Nunca usar: ${brandAvoid || 'imágenes genéricas sin relación a la marca'}
- Composición vertical 4:5. Las ${count} imágenes: mismo universo visual, escenas completamente distintas.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Estructura AIDA+: gancho → interés/deseo → valor → emoción → CTA.

Devuelve ÚNICAMENTE este JSON:
${JSON_SCHEMA}`;

  } else if (category === 'noticias') {
    userPrompt = `Redacta un carrusel periodístico de ${count} láminas.

TEXTO / INFORMACIÓN DE LA NOTICIA:
---
${topic.slice(0, 3000)}
---

INSTRUCCIONES:
- Usa ÚNICAMENTE los hechos presentes en el texto anterior.
- Estructura: titular → contexto (quién/cuándo/dónde) → 3 puntos clave → implicaciones → cierre con fuente.
- Si falta información para alguna lámina, indica "[Dato no disponible]" en el body.
- imagePrompt: ilustración editorial o fotografía documental. Estilo periodístico, sin glamour.

Devuelve ÚNICAMENTE este JSON:
${JSON_SCHEMA}`;

  } else if (category === 'reflexion') {
    userPrompt = `Crea un carrusel de reflexión de ${count} láminas.

TEMA O IDEA DE PARTIDA: «${topic.slice(0, 500)}»

INSTRUCCIONES:
- La reflexión debe conectar con el mundo y los valores de la audiencia de esta marca: ${brandAudience || 'audiencia general'}.
- El tono y vocabulario deben reflejar el estilo de la marca: ${brandBusiness}.
- NO convertir en anuncio. NO mencionar productos ni servicios a menos que sea completamente natural.
- NO inventar citas ni atribuirlas a personas reales.
- Estructura: frase de apertura → desarrollo → 3 ideas relacionadas → conexión personal → invitación de cierre.
- imagePrompt: fotografía artística y atmosférica que evoque la emoción de la reflexión. Vertical 4:5.

Devuelve ÚNICAMENTE este JSON:
${JSON_SCHEMA}`;

  } else if (category === 'historia') {
    userPrompt = `Crea un carrusel narrativo de ${count} láminas.

HISTORIA O PUNTO DE PARTIDA:
---
${topic.slice(0, 2000)}
---

INSTRUCCIONES:
- Si la historia contiene datos reales (personas, fechas, hechos): úsalos exactamente. No agregar detalles.
- Si es una historia ficticia o ilustrativa: indicarlo en el label de la primera lámina.
- NO inventar testimonios de clientes o participantes reales.
- Estructura: presentación → desafío → proceso (3 pasos) → resultado → lección.
- Voz y vocabulario de la marca: ${brandBusiness}.
- imagePrompt: fotografía narrativa y humana que refleje el momento de cada lámina. Vertical 4:5.

Devuelve ÚNICAMENTE este JSON:
${JSON_SCHEMA}`;

  } else {
    // mensaje y cualquier categoría futura
    userPrompt = `Crea un carrusel de ${category} de ${count} láminas.

TEMA / MENSAJE:
---
${topic.slice(0, 2000)}
---

INSTRUCCIONES:
- Tono y estilo de la marca: ${brandBusiness}. Audiencia: ${brandAudience || 'comunidad de la marca'}.
- Lenguaje cercano y humano. Sin formalidad corporativa.
- NO inventar hechos, logros ni estadísticas de la comunidad.
- imagePrompt: fotografía cálida de comunidad o celebración. Vertical 4:5.

Devuelve ÚNICAMENTE este JSON:
${JSON_SCHEMA}`;
  }

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

// ═══════════════════════════════════════════════════════════════════════════
// ANÁLISIS DE SITIOS WEB — Fase 2
// ═══════════════════════════════════════════════════════════════════════════

// ─── SSRF Protection ────────────────────────────────────────────────────────
const PRIVATE_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^169\.254\./,
  /^::1$/,
  /^\[::1\]$/,
  /^fc00:/i,
  /^fe80:/i,
  /metadata\.(google|internal|aws)/i,
];

function isSafeUrl(urlStr) {
  let parsed;
  try { parsed = new URL(urlStr.trim()); } catch { return { safe: false, reason: 'URL inválida. Verifica el formato.' }; }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { safe: false, reason: 'Solo se permiten URLs http o https.' };
  }
  const host = parsed.hostname.toLowerCase();
  for (const p of PRIVATE_PATTERNS) {
    if (p.test(host)) return { safe: false, reason: 'URL no permitida por políticas de seguridad.' };
  }
  return { safe: true, parsed };
}

// ─── Fetch seguro con timeout y límite de tamaño ────────────────────────────
async function safeFetch(url, timeoutMs = 9000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'CarruselBot/2.0 (perfil-comercial)',
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'es,en;q=0.9',
      },
    });
    clearTimeout(timer);
    if (!r.ok) return null;
    // Leer máximo 250 KB
    const MAX = 250 * 1024;
    const reader = r.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      chunks.push(value);
      if (total >= MAX) { reader.cancel(); break; }
    }
    const buf = Buffer.concat(chunks.map(c => Buffer.from(c)));
    return { text: buf.toString('utf-8'), finalUrl: r.url };
  } catch {
    clearTimeout(timer);
    return null;
  }
}

// ─── Limpiar HTML → texto plano ─────────────────────────────────────────────
function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4500);
}

const analyzeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 4,
  message: { error: 'Demasiados análisis en poco tiempo. Espera un minuto.' },
});

// ─── POST /api/clients/analyze ───────────────────────────────────────────────
app.post('/api/clients/analyze', requireAuth, analyzeLimiter, async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string' || url.trim().length < 6) {
    return res.status(400).json({ error: 'Se requiere una URL válida del sitio web.' });
  }

  // 1. SSRF check
  const safety = isSafeUrl(url.trim());
  if (!safety.safe) return res.status(400).json({ error: safety.reason });

  const origin = safety.parsed.origin; // ej: https://pasarelastudiointer.com

  // 2. Intentar obtener varias páginas (máx 4)
  const pathsToTry = ['/', '/nosotros', '/about', '/quienes-somos',
    '/servicios', '/services', '/programas', '/contacto', '/contact'];
  const pages = [];
  const sourceUrls = [];

  for (const path of pathsToTry) {
    if (pages.length >= 4) break;
    const pageUrl = origin + path;
    const result = await safeFetch(pageUrl, 8000);
    if (result && result.text && result.text.length > 300) {
      const text = htmlToText(result.text);
      if (text.length > 150) {
        pages.push({ url: result.finalUrl || pageUrl, text });
        sourceUrls.push(result.finalUrl || pageUrl);
      }
    }
  }

  if (pages.length === 0) {
    return res.status(422).json({
      error: 'No se pudo acceder al sitio web. Es posible que esté bloqueado, use JavaScript dinámico o no esté disponible. Puedes completar el perfil manualmente.',
      canRetryManually: true,
    });
  }

  // 3. Enviar a GPT para extracción
  const contenido = pages
    .map(p => `=== ${p.url} ===\n${p.text}`)
    .join('\n\n')
    .slice(0, 11000);

  const prompt = `Analiza el contenido de este sitio web y extrae información comercial real.

REGLAS ESTRICTAS:
- Incluye SOLO información presente explícitamente en el texto.
- Si un dato no está disponible, usa exactamente: "No confirmado"
- NO inventes servicios, precios, certificaciones, testimonios ni resultados
- NO agregues suposiciones ni rellenes datos con información genérica

CONTENIDO:
${contenido}

Responde ÚNICAMENTE con JSON válido:
{
  "name": "Nombre comercial exacto del negocio",
  "sector": "Sector o tipo de negocio (breve)",
  "businessDescription": "Qué hace el negocio y dónde opera. Máx 120 palabras. Solo lo que dice el sitio.",
  "services": "Servicios o productos confirmados en el texto, separados por coma",
  "audience": "Público objetivo mencionado en el texto, o No confirmado",
  "location": "Ciudad/estado/país si aparece, o No confirmado",
  "contact": "Teléfono, email o dirección si aparece, o No confirmado",
  "communicationStyle": "Tono del sitio: formal, aspiracional, cercano, etc.",
  "photoTypes": "Tipo de imágenes recomendadas según el estilo del negocio",
  "unverified": ["Dato que no pudo confirmarse 1", "Dato 2"]
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 900,
      response_format: { type: 'json_object' },
    });

    let profile;
    try { profile = JSON.parse(completion.choices[0].message.content); }
    catch { return res.status(502).json({ error: 'Error al procesar la respuesta de IA.' }); }

    return res.json({
      profile: { ...profile, sourceUrls, analyzedAt: new Date().toISOString() },
      pagesAnalyzed: pages.length,
    });

  } catch (err) {
    console.error('Error analyze:', err.message);
    if (err.status === 429) return res.status(429).json({ error: 'Límite de OpenAI alcanzado. Espera un momento.' });
    return res.status(500).json({ error: 'Error al analizar: ' + err.message });
  }
});

// ─── GET /api/health ──────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Carrusel Social AI Engine',
    version: '2.0.0',
    openai: !!process.env.OPENAI_API_KEY,
    database: !!db,
    timestamp: new Date().toISOString(),
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CLIENTES — CRUD
// ═══════════════════════════════════════════════════════════════════════════

// Helper: fila de DB → objeto del frontend
function rowToClient(row) {
  const parseJ = v => { try { return v ? JSON.parse(v) : null; } catch { return null; } };
  return {
    id:                  row.id,
    slug:                row.slug,
    name:                row.name,
    website:             row.website,
    sector:              row.sector,
    logoUrl:             row.logo_url,
    socialLinks:         parseJ(row.social_links) || {},
    businessDescription: row.business_description,
    audience:            row.audience,
    services:            row.services,
    communicationStyle:  row.communication_style,
    visualIdentity:      row.visual_identity,
    photoTypes:          row.photo_types,
    avoidElements:       row.avoid_elements,
    verifiedInfo:        row.verified_info,
    restrictions:        row.restrictions,
    facebook:            row.facebook,
    instagram:           row.instagram,
    temporaryInfo:       row.temporary_info,
    colors:              parseJ(row.colors) || {},
    sourceUrls:          parseJ(row.source_urls) || [],
    analyzedAt:          row.analyzed_at,
    status:              row.status,
    createdAt:           row.created_at,
    updatedAt:           row.updated_at,
  };
}

// GET /api/clients — listar clientes activos
app.get('/api/clients', requireAuth, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Base de datos no configurada.' });
  try {
    const { rows } = await db.query(
      `SELECT id, slug, name, website, sector, logo_url, colors, status, updated_at
       FROM clients WHERE status = 'active' ORDER BY name ASC`
    );
    res.json({ clients: rows.map(r => ({
      id: r.id, slug: r.slug, name: r.name, website: r.website,
      sector: r.sector, logoUrl: r.logo_url,
      colors: (() => { try { return r.colors ? JSON.parse(r.colors) : {}; } catch { return {}; } })(),
      status: r.status, updatedAt: r.updated_at,
    }))});
  } catch (err) {
    console.error('GET /api/clients:', err.message);
    res.status(500).json({ error: 'Error al obtener clientes.' });
  }
});

// GET /api/clients/:id — perfil completo (por id o slug)
app.get('/api/clients/:id', requireAuth, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Base de datos no configurada.' });
  const { id } = req.params;
  try {
    const { rows } = await db.query(
      `SELECT * FROM clients WHERE (id::text = $1 OR slug = $1) AND status != 'deleted' LIMIT 1`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Cliente no encontrado.' });
    res.json({ client: rowToClient(rows[0]) });
  } catch (err) {
    console.error('GET /api/clients/:id:', err.message);
    res.status(500).json({ error: 'Error al obtener el cliente.' });
  }
});

// POST /api/clients — crear cliente
app.post('/api/clients', requireAuth, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Base de datos no configurada.' });
  const {
    name, website, sector, logoUrl, socialLinks,
    businessDescription, audience, services, communicationStyle,
    visualIdentity, photoTypes, avoidElements, verifiedInfo, restrictions,
    facebook, instagram, temporaryInfo, colors,
  } = req.body;

  if (!name || name.trim().length < 2) {
    return res.status(400).json({ error: 'El nombre comercial es obligatorio.' });
  }

  // Generar slug único a partir del nombre
  const baseSlug = name.trim().toLowerCase()
    .replace(/[áàä]/g,'a').replace(/[éèë]/g,'e').replace(/[íìï]/g,'i')
    .replace(/[óòö]/g,'o').replace(/[úùü]/g,'u').replace(/ñ/g,'n')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0, 40);

  let slug = baseSlug;
  let attempt = 0;
  while (true) {
    const { rows } = await db.query('SELECT id FROM clients WHERE slug = $1', [slug]);
    if (!rows.length) break;
    attempt++;
    slug = `${baseSlug}-${attempt}`;
  }

  try {
    const { rows } = await db.query(`
      INSERT INTO clients (
        slug, name, website, sector, logo_url, social_links,
        business_description, audience, services, communication_style,
        visual_identity, photo_types, avoid_elements, verified_info,
        restrictions, facebook, instagram, temporary_info, colors
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      RETURNING *
    `, [
      slug, name.trim(), website || null, sector || null, logoUrl || null,
      socialLinks ? JSON.stringify(socialLinks) : null,
      businessDescription || null, audience || null, services || null,
      communicationStyle || null, visualIdentity || null, photoTypes || null,
      avoidElements || null, verifiedInfo || null, restrictions || null,
      facebook || null, instagram || null, temporaryInfo || null,
      colors ? JSON.stringify(colors) : null,
    ]);
    res.status(201).json({ client: rowToClient(rows[0]) });
  } catch (err) {
    console.error('POST /api/clients:', err.message);
    res.status(500).json({ error: 'Error al crear el cliente.' });
  }
});

// PATCH /api/clients/:id — actualizar cliente
app.patch('/api/clients/:id', requireAuth, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Base de datos no configurada.' });
  const { id } = req.params;

  const allowed = [
    'name','website','sector','logo_url','social_links',
    'business_description','audience','services','communication_style',
    'visual_identity','photo_types','avoid_elements','verified_info',
    'restrictions','facebook','instagram','temporary_info','colors','status',
  ];

  // Mapeo camelCase → snake_case
  const camelToSnake = {
    name:'name', website:'website', sector:'sector',
    logoUrl:'logo_url', socialLinks:'social_links',
    businessDescription:'business_description', audience:'audience',
    services:'services', communicationStyle:'communication_style',
    visualIdentity:'visual_identity', photoTypes:'photo_types',
    avoidElements:'avoid_elements', verifiedInfo:'verified_info',
    restrictions:'restrictions', facebook:'facebook', instagram:'instagram',
    temporaryInfo:'temporary_info', colors:'colors', status:'status',
  };

  const fields = [];
  const values = [];
  let i = 1;
  for (const [camel, snake] of Object.entries(camelToSnake)) {
    if (camel in req.body && allowed.includes(snake)) {
      fields.push(`${snake} = $${i++}`);
      const v = req.body[camel];
      values.push(typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
    }
  }
  if (!fields.length) return res.status(400).json({ error: 'No hay campos para actualizar.' });
  fields.push(`updated_at = NOW()`);
  values.push(id);

  try {
    const { rows } = await db.query(
      `UPDATE clients SET ${fields.join(', ')} WHERE (id::text = $${i} OR slug = $${i}) RETURNING *`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'Cliente no encontrado.' });
    res.json({ client: rowToClient(rows[0]) });
  } catch (err) {
    console.error('PATCH /api/clients/:id:', err.message);
    res.status(500).json({ error: 'Error al actualizar el cliente.' });
  }
});

// DELETE /api/clients/:id — archivar (soft delete)
app.delete('/api/clients/:id', requireAuth, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Base de datos no configurada.' });
  const { id } = req.params;
  try {
    const { rows } = await db.query(
      `UPDATE clients SET status = 'archived', updated_at = NOW()
       WHERE (id::text = $1 OR slug = $1) AND status = 'active' RETURNING id, name`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Cliente no encontrado.' });
    res.json({ message: `Cliente "${rows[0].name}" archivado.`, id: rows[0].id });
  } catch (err) {
    console.error('DELETE /api/clients/:id:', err.message);
    res.status(500).json({ error: 'Error al archivar el cliente.' });
  }
});

// ─── 404 ──────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

// ─── Error handler ────────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

app.listen(PORT, async () => {
  console.log(`✅ Carrusel AI Engine v2.0.0 corriendo en puerto ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
  await initDB();
});
