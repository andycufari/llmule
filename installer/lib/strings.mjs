// Every word the user reads, in Spanish (Argentina, voseo on purpose) and English. Same keys in both
// (llmule.test.mjs checks it). The language: --lang en|es, else the one saved in ~/.llmule/prefs.json
// (the L key on the welcome screen), else the system locale (es* → Spanish, anything else → English).

export const ES = {
  lang: 'es',
  langName: 'Español',
  dec: (n) => String(n).replace('.', ','), // decimal comma
  of: (a, b) => `${a} de ${b}`, // "1,2 GB de 20,5 GB"
  you: 'vos',
  someone: 'alguien',
  title: 'Instalación de LLMule',
  titleRun: 'LLMule',
  step: (n, of) => `Paso ${n} de ${of}`,
  keys: { enter: 'Seguir', esc: 'Atrás', f3: 'Salir', move: 'Elegir', tab: 'Campo', space: 'Marcar', pause: 'Pausar', resume: 'Reanudar', open: 'Abrir',
    spaceKey: 'ESPACIO', lang: 'English' }, // lang: the key's label is the OTHER language, in its own words
  status: {
    site: 'Red', engine: 'Motor', model: 'Modelo', login: 'Cuenta', share: 'Estado', vpn: 'Mesh', pool: 'Pool',
    vpnOff: 'sin mesh', vpnUp: 'mesh directo', vpnRelay: 'mesh por relay', vpnWait: 'mesh…', poolOn: 'en el pool', poolWait: 'esperando',
    siteUp: 'llmule.xyz ok', siteDown: 'llmule.xyz caído', siteUpShort: 'red ok', siteDownShort: 'red caída', siteChecking: 'llmule.xyz…',
    engineNone: 'sin motor', engineDown: 'motor caído', engineIdle: 'parado', engineLoading: 'cargando',
    modelNone: 'sin modelo',
    loginNo: 'sin vincular', loginWait: 'vinculando…', loginYes: 'vinculado',
    shareOff: 'apagado', shareOn: 'compartiendo', sharePaused: 'en pausa', shareWaiting: 'esperando', shareBusy: 'trabajando',
    loginNoShort: 'sin cuenta', engineNoneShort: 'sin motor', modelNoneShort: 'sin modelo',
  },
  small: (w, h) => [`La ventana es muy chica (${w}×${h}).`, 'Agrandala a 80×24 o más.'],
  exit: {
    title: 'Salir',
    setup: ['¿Salís de la instalación?', 'Lo que ya bajaste queda: la próxima sigue desde acá.'],
    run: ['¿Cerrás LLMule?', 'Dejás de compartir hasta que lo vuelvas a abrir.'],
    stay: 'Seguir', stayRun: 'Seguir compartiendo', leave: 'Salir', leaveRun: 'Cerrar',
  },
  // An error, for a person: the codes the site and the downloads use, else the message itself
  errorOf: (e) => {
    if (!e) return 'Algo falló.';
    if (e.code === 'no_space') return `No hay lugar en el disco: hacen falta ${Math.ceil((e.need || 0) / 1e9)} GB y hay ${Math.floor((e.free || 0) / 1e9)} GB libres.`;
    if (e.code === 'bad_sha256') return 'Lo que bajé no coincide con el sha256 que esperaba. Lo borré: probá de nuevo (ENTER).';
    if (e.code === 'offline' || e.name === 'TimeoutError' || /fetch failed/.test(e.message)) return 'llmule.xyz no responde. Probá de nuevo en un rato.';
    if (e.code === 'invite_only') return 'Este pool es sólo con invitación: pedile un código al dueño (tecla C en la lista).';
    if (e.code === 'nick_required') return 'Elegí un nick primero (el pool muestra quién está).';
    if (e.code === 'one_pool') return 'Ya tenés un pool abierto. Cerralo antes de armar otro.';
    if (e.code === 'full') return 'El pool está lleno.';
    if (e.code === 'used') return 'Esa invitación ya se usó.';
    if (e.code === 'expired') return 'Esa invitación venció: pedile otra al dueño.';
    if (e.code === 'not_found') return 'No encontré ese pool (o ese código).';
    if (e.code === 'rate_limited') return 'Demasiados intentos. Esperá un rato.';
    if (e.code === 'nick_taken') return 'Ese nick ya lo tiene otra persona. Probá otro.';
    if (e.code === 'bad_nick') return 'Sólo a-z, 0-9, _ o - (3 a 20).';
    if (e.code === 'llama_missing') return 'llama-server no está en lo que bajé';
    if (e.code === 'model_file') return 'No encuentro el archivo del modelo';
    if (e.code === 'llama_exit') return `llama-server salió (código ${e.exitCode}). Mirá ~/.llmule/llama-server.log`;
    if (e.code === 'llama_timeout') return 'llama-server no terminó de cargar en 10 minutos';
    if (e.code === 'shortcut') return 'no pude crear el acceso directo';
    return e.message || String(e);
  },
  version: (v, built) => `versión ${v} · build ${built}`,
  versionShort: (v) => `v${v}`,
  waitSite: (s) => `llmule.xyz no responde. Reintento solo en ${s} s.`,

  welcome: {
    win: 'Bienvenido',
    hello: 'Hola. Esto deja tu compu compartiendo IA en LLMule.',
    what: 'LLMule es la red P2P under de LLMs: la gente con placa comparte sus modelos y el resto los usa gratis.',
    will: 'Qué voy a hacer, paso a paso:',
    steps: [
      'Mirar tu placa y cuánta memoria tiene.',
      'Vincular esta compu a tu cuenta de llmule.xyz.',
      'Elegís: compartir tu modelo, sumarte a un pool o armar uno.',
      'Preparar el motor (llama.cpp si no tenés) y el modelo.',
      'Dejar un ícono: abierto compartís, cerrado no.',
    ],
    safe: 'Compartir no abre puertos ni lee tus archivos. Todo queda en ~/.llmule.',
    go: 'Empezar', quit: 'Salir',
    lang: 'Idioma',
  },

  machine: {
    win: 'Tu máquina',
    looking: 'Mirando tu máquina…',
    os: 'Sistema', cpu: 'Procesador', ram: 'Memoria', gpu: 'Placa', vram: 'Para modelos',
    none: 'ninguna que sirva',
    integrated: (chip) => `${chip} (GPU integrada)`,
    cores: (cpu, n) => `${cpu} · ${n} núcleos`,
    unified: (gb) => `${gb} GB unificada`,
    usable: (gb) => `~${gb} GB (memoria unificada)`,
    have: (name, gb) => `Tenés una ${name} con ${gb} GB.`,
    haveApple: (chip, gb) => `Tenés un ${chip}: tu placa puede usar ~${gb} GB.`,
    haveNone: 'No encontré placa con memoria propia. Va a andar con el procesador, lento.',
    fits: (name, quant) => `Te alcanza para: ${name} en ${quant}.`,
  },

  engine: {
    win: 'Motor',
    looking: 'Busco un motor corriendo en esta compu…',
    port: (p) => `puerto ${p}`,
    up: (n) => `arriba · ${n} modelo${n === 1 ? '' : 's'}`,
    down: 'no está',
    pick: 'Elegí con cuál compartir:',
    install: 'Instalar llama.cpp igual',
    noneFound: 'No encontré ninguno. Te instalo llama.cpp en el paso que sigue.',
    head: ['Motor', 'Estado'],
    onlyEmbed: 'sólo embeddings',
    noneLoaded: (id) => `Ningún modelo de chat cargado. En el paso que sigue te ofrezco cargar ${id}.`,
    embedOnly: (name) => `${name} sólo tiene modelos de embeddings (no sirven para chatear). Bajá un modelo de chat ahí, o sigo con llama.cpp y uno del catálogo.`,
  },

  install: {
    win: 'Instalar llama.cpp',
    intro: 'No tenés motor. Te instalo llama.cpp (llama-server), el motor libre de ggml.org.',
    where: (dir) => `Va en ${dir}. Nada fuera de esa carpeta.`,
    bonus: (port) => `Mientras LLMule esté abierto, queda en localhost:${port} con API OpenAI: usalo desde tus harness.`,
    files: 'Bajo de github.com/ggml-org/llama.cpp:',
    checked: 'Verifico el sha256 antes de descomprimir.',
    checkPart: 'Reviso lo que ya había bajado de',
    ok: 'Instalar', other: 'Ya tengo uno',
    download: 'Bajando', verify: 'Verificando sha256', unpack: 'Descomprimiendo', done: 'Listo: llama-server instalado.',
    otherUrl: 'Pegá la URL de tu motor (termina en /v1):',
    noAnswer: (url) => `No contesta ${url}/models con modelos.`,
  },

  model: {
    win: 'Modelo',
    pick: (gb) => (gb ? `Elegí qué compartir. Marqué el mejor que entra en tus ${gb} GB.` : 'Elegí qué compartir. Sin placa, lo más chico.'),
    inEngine: 'ya en tu motor',
    rec: '★ recomendado',
    noFit: 'no entra',
    alt: 'alternativa',
    need: (need, have) => `Necesita ~${need} GB · tenés ${have} GB`,
    size: 'Tamaño',
    downloading: 'Bajando',
    eta: (s) => (s >= 90 ? `faltan ${Math.ceil(s / 60)} min` : `faltan ${Math.ceil(s)} s`),
    verify: 'Verificando sha256…',
    loading: 'Cargando el modelo en la placa…',
    loaded: 'Modelo cargado.',
    from: (repo) => `de huggingface.co/${repo}`,
    paused: 'Se cortó la conexión. Espero y sigo desde donde quedó.',
    pausedRetry: (s) => `Se cortó la conexión. Sigo desde donde quedó en ${s} s.`,
    checking: 'Reviso lo que ya había bajado…',
    pausedShort: 'en pausa, sin conexión',
    head: ['Modelo                      Cuant.   Tamaño', ''],
    notLoaded: 'bajado, sin cargar',
    needLoad: (id, eng) => `${id} está en ${eng} pero no está cargado: así no contesta. Hay que cargarlo (ocupa memoria de la placa mientras esté cargado).`,
    lmsCan: (cmd) => `Lo puedo cargar yo, con: ${cmd}`,
    byHand: (eng) => `Cargalo en ${eng} (arriba de todo: "Select a model to load") y apretá ENTER.`,
    loadIt: 'Cargarlo (L)',
    loadedByHand: 'Ya lo cargué',
    loadTitle: 'Cargar modelo',
    loadConfirm: (id, eng) => [`¿Cargo ${id} en ${eng}?`, 'Usa memoria de la placa hasta que lo descargues.'],
    no: 'No',
    yesLoad: 'Cargar',
    lmsLoading: (id) => `Cargando ${id} con lms…`,
    lmsFailed: 'lms no pudo cargarlo:',
    stillNot: (id) => `Todavía no veo ${id} cargado.`,
    rechecking: 'Me fijo en el motor…',
    back: 'ENTER vuelve.',
  },

  link: {
    win: 'Vincular tu cuenta',
    intro: 'Esta compu tiene que saber de quién es. Abrí esta página:',
    code: 'y poné este código:',
    how: 'Entrás con tu mail como siempre, ves el nombre de esta compu y apretás "Link this computer". La key llega sola.',
    opened: 'Te abrí el navegador. Si no se abrió, escribí la dirección a mano.',
    open: 'Abrir el navegador',
    waiting: 'Esperando que lo apruebes',
    expires: (mm, ss) => `vence en ${mm}:${String(ss).padStart(2, '0')}`,
    expired: 'El código venció. ENTER para pedir otro.',
    denied: 'Lo rechazaste en la web. ENTER para pedir otro código.',
    done: (who) => `Listo, vinculada a ${who}.`,
    saved: (k) => `Ya tenés una key guardada (${k}). Uso esa.`,
    safe: 'La key queda en ~/.llmule/, sólo la podés leer vos.',
  },

  profile: {
    win: 'Tu perfil',
    intro: 'Así te ve la red.',
    thisMachine: 'Esta máquina',
    thisMachineHint: 'sólo esta compu',
    account: 'Tu perfil',
    accountHint: 'igual en todas tus máquinas',
    machine: 'Nombre de esta máquina',
    machineShort: 'Nombre',
    loading: 'Trayendo tu perfil…',
    nick: 'Tu nick',
    nickHint: '3 a 20: a-z, 0-9, _ o -',
    nickBad: 'Sólo a-z, 0-9, _ o - (3 a 20).',
    avatar: 'Tu mula',
    bio: 'Bio (una línea)',
    colors: ['azul', 'verde', 'roja', 'violeta', 'naranja'],
    saving: 'Guardando…',
  },

  test: {
    win: 'Prueba',
    intro: 'Le hago una pregunta a tu modelo, acá, en tu máquina:',
    question: '¿Qué es una mula? Respondé en dos líneas.',
    thinking: 'Pensando…',
    stats: (s, tps) => `Respondió en ${s} s · ${tps} tokens/s`,
    failed: 'No respondió. ¿Está cargado el modelo? ENTER reintenta.',
    engineSaid: (msg) => `El motor dijo: ${msg}`,
  },

  icon: {
    win: 'Ícono',
    intro: 'LLMule no queda corriendo de fondo. Es un ícono:',
    how: ['Lo abrís → se abre esta ventana y compartís.', 'Cerrás la ventana → deja de compartir.'],
    howPool: ['Lo abrís → tu placa vuelve al pool.', 'Cerrás la ventana → el pool se reacomoda sin vos.'],
    desktop: 'Ícono "LLMule" en el escritorio',
    autostart: 'Abrir LLMule al prender la compu',
    autostartHint: 'Apagado salvo que lo marques.',
    made: (p) => `Creado: ${p}`,
    // What goes inside the icon files (a comment in the Mac .command, the Linux menu entry)
    fileComment: 'LLMule: abrís esto y compartís; cerrás la ventana y deja de compartir.',
    menuComment: 'Compartí tu placa en llmule.xyz',
  },

  done: {
    win: 'Listo',
    big: '¡Listo! Estás compartiendo.',
    card: 'Tu ficha:',
    api: (url) => `Tu motor: ${url} (API OpenAI, mientras LLMule esté abierto).`,
    next: 'Ver el panel',
    thanks: 'Gracias por poner tu placa. La red es la gente.',
  },

  dash: {
    win: 'LLMule — compartiendo',
    sharing: (m) => `Compartiendo ${m}`,
    paused: 'En pausa. P para volver a compartir.',
    waitingSite: 'llmule.xyz no responde: espero y sigo solo.',
    waitingEngine: 'El motor no responde: espero a que vuelva.',
    starting: 'Conectando…',
    machine: 'Tu máquina',
    tokens: 'Tokens servidos',
    session: 'Esta sesión',
    week: 'Esta semana',
    total: 'Total',
    rank: (n) => `puesto #${n}`,
    level: 'Nivel',
    idle: 'esperando trabajo',
    net: 'red',
    you: 'tu placa',
    log: 'Actividad',
    logStart: (from, model) => `entra un pedido de ${from} → ${model}`,
    logDone: (tok, s) => `respondido · ${tok} tokens en ${s} s`,
    logFail: (why) => `falló: ${why}`,
    logOnline: (m) => `en línea, compartiendo ${m}`,
    logWaitSite: 'llmule.xyz no responde, espero',
    logWaitEngine: 'el motor no responde, espero',
    logPaused: 'en pausa',
    logStopped: 'desconectado de la red',
    card: 'Ficha',
    logExit: (c) => `provider exit ${c}`,
  },

  menu: {
    win: '¿Qué hacemos con tu placa?',
    intro: 'Tres formas de poner tu placa en LLMule. Podés cambiar después.',
    share: 'Compartir mi modelo',
    shareWhat: 'Tu placa corre un modelo entero y lo presta a la red.',
    shareNeed: 'Sirve cualquier placa, y hasta sin placa.',
    pool: 'Unirme a un pool',
    poolWhat: 'Tu placa corre una parte de un modelo gigante, junto con otras casas.',
    poolNeed: (n) => `Rinde con 24 GB o más y buena subida. ${n} pool${n === 1 ? '' : 's'} para sumarte ahora.`,
    poolSmall: (gb) => `Tu placa tiene ${gb} GB: suma poco a un pool. Compartir te va a rendir más.`,
    poolNew: 'Crear un pool',
    poolNewWhat: 'Elegís el modelo, invitás gente y lo corren entre todos. El pool es tuyo.',
    poolNewNeed: 'Como armar un server: vos invitás, la máquina más firme hace de cabeza.',
    noMesh: 'mesh-llm (el motor de los pools) no tiene versión para Mac Intel todavía.',
  },

  pools: {
    win: 'Pools',
    intro: 'Un pool corre un modelo que no entra en ninguna casa sola. Elegí uno:',
    head: ['Pool                          Modelo', 'Máquinas · estado'],
    open: 'esperando', running: 'andando', closed: 'cerrado', yours: 'estás',
    nodes: (n) => `${n} máquina${n === 1 ? '' : 's'}`,
    isOpen: 'Abierto: cualquiera con cuenta y nick se puede sumar.',
    isInvite: 'Con invitación: ya estás en la lista del dueño.',
    speed: (t) => `Anda a ~${t} tokens/s (medido en el pool).`,
    missing: (gb, cards) => (Number(String(gb).replace(',', '.')) > 0 ? `Le faltan ~${gb} GB (unas ${cards} placas de 24 GB) para arrancar.` : 'Ya tiene la memoria: espera a que arranque la cabeza.'),
    loading: 'Buscando pools…',
    none: 'No hay pools abiertos ahora. Si te pasaron un código, apretá C. O volvé y creá uno.',
    noneQ: 'Nada con esa búsqueda. / para buscar otra cosa, C para un código.',
    filtered: (q) => `buscando "${q}"`,
    search: 'Buscar (modelo, nombre o dueño):',
    codeAsk: 'Código de invitación (XXXX-XXXX):',
    keySearch: 'Buscar', keyCode: 'Código',
    line: (p, dec) => `${p.modelName} ${p.quant} · ${dec(p.sizeGB)} GB · ${p.layers} capas · dueño @${p.owner || '?'}${p.head ? ` · cabeza @${p.head}` : ''}`,
  },

  contrib: {
    win: 'Lo que aportás',
    intro: (pool) => `Así quedaría ${pool} con tu placa:`,
    yours: (n, of, gb) => `Te tocarían unas ${n} de las ${of} capas (~${gb} GB en tu placa). mesh-llm reparte las capas reales al arrancar.`,
    completes: 'Con tu placa el pool llega a la memoria que necesita.',
    notYet: (gb, cards) => `Todavía faltan ~${gb} GB (unas ${cards} placas de 24 GB) además de la tuya.`,
    addsYou: (gb) => `Tus ${gb} GB suman. El pool arranca cuando alcance.`,
    first: (gb) => `Bajás sólo tus capas (~${gb} GB) de Hugging Face, una vez. Quedan guardadas para la próxima.`,
    rules: [
      'Sólo los pools abren una conexión, entre las máquinas del pool, cifrada y firmada. Tus prompts pasan por las máquinas de los miembros: la cabeza ve el texto. Unite a pools de gente que conozcas.',
      'Si te desconectás, el pool se reacomoda y espera. No pasa nada.',
    ],
    join: 'Unirme', back: 'Ver otro', back2: 'Seguir',
  },

  poolnew: {
    win: 'Crear un pool',
    intro: 'Elegí el modelo que van a correr entre todos:',
    head: ['Modelo                        Cuant.      Tamaño', 'Con tu placa'],
    test: 'prueba (entra en cualquiera)',
    cards: (n) => `faltan ~${n} placa${n === 1 ? '' : 's'}`,
    fitsAlone: 'entra en tu placa',
    missing: (gb, need, cards) => `Con tus ${gb} GB faltan ~${need} GB: unas ${cards} placas de 24 GB más.`,
    alone: 'Entra en tu placa sola: para probar el pool está perfecto.',
    open: 'Abierto: cualquiera lo ve en la lista y se suma',
    openHint: 'Lo ve toda la red. Los prompts pasan por máquinas de desconocidos.',
    inviteHint: 'Sólo con un código tuyo (de un uso, 24 h). Recomendado.',
    headMe: 'Esta máquina es la cabeza',
    headMeHint: 'La cabeza publica el pool en LLMule y tiene que estar prendida: si se apaga, se corta.',
    headLaterHint: 'Elegís la cabeza después (tecla H en el panel): la máquina más firme del pool.',
    create: 'Crear', creating: 'Creando el pool…',
    made: (name) => `Listo: ${name}`,
    madeOpen: 'Está abierto: aparece en "Unirme a un pool" para todos.',
    madeInvite: 'Mandale este código a quien quieras sumar (un uso, vence en 24 h):',
    codeHow: 'Lo pone en LLMule → Unirme a un pool → C. I hace otro código.',
    youHead: 'Tu máquina es la cabeza: arranca el mesh y espera a los demás.',
    headLater: 'Tu máquina entra como una más; cuando estén todos, elegí la cabeza con H.',
    keyInvite: 'Otro código',
    safety: 'Sólo los pools abren una conexión, entre las máquinas del pool, cifrada y firmada. Tus prompts pasan por las máquinas de los miembros: la cabeza ve el texto. Armá pools con gente que conozcas.',
  },

  mesh: {
    win: 'Tu máquina en el pool',
    introHead: (p) => `Arranco el pool ${p}. Las máquinas del pool se hablan directo, cifrado y firmado (mesh-llm), sin pasar por llmule.xyz. Tu nodo sólo deja entrar a las del pool.`,
    introWorker: (p) => `Me sumo a ${p}. Las máquinas del pool se hablan directo, cifrado y firmado (mesh-llm), sin pasar por llmule.xyz. Tu nodo sólo deja entrar a las del pool.`,
    firewall: 'Si tu compu pregunta si acepta conexiones entrantes, es mesh-llm: decí que sí. Si decís que no, anda igual pero por relay, más lento.',
    install: 'Bajando mesh-llm', verify: 'Verificando sha256', unpack: 'Descomprimiendo',
    installed: 'mesh-llm instalado', installHint: 'En ~/.llmule/mesh, verificado con sha256.',
    create: 'Creando el mesh', createHint: 'Tu máquina es la cabeza: la invitación va a los miembros por llmule.xyz.',
    waitHead: 'Esperando a la cabeza', waitHeadHint: 'Cuando la cabeza arranque, entro solo. Podés dejarlo así.',
    join: 'Entrando al mesh', joinHint: 'Conecto con la cabeza (directo si se puede, si no por relay).',
    peers: (n, p) => `Conectado con ${n} máquina${n === 1 ? '' : 's'}${p ? ` · ${p}` : ''}`,
    noPeers: 'Esperando a las otras máquinas', noPeersHint: 'El pool arranca cuando alcance la memoria.',
    direct: (ms) => `directo, ${ms} ms`,
    relay: (ms) => `por relay, ${ms} ms (más lento)`,
    layers: (a, b, of) => `Tus capas: ${a} a ${b} de ${of}`,
    layersWait: 'Tus capas', layersHint: 'mesh-llm reparte las capas y cada uno baja las suyas.',
    downloaded: (b) => `bajado: ${b}`,
    shortfall: (gb) => `Todavía no alcanza la memoria (faltan ~${gb} GB). Espero a que se sumen más.`,
    ready: 'Listo: tus capas están cargadas y el pool anda.',
    readyHead: (m) => `Listo: el pool anda y está publicado en LLMule como ${m}.`,
    canGo: 'ENTER sigue igual: el panel sigue esperando por vos.',
  },

  pdash: {
    win: 'LLMule — en el pool',
    in: (id) => `En el pool ${id}`,
    replan: 'Una máquina se fue: el pool se reacomoda.',
    starting: 'Arrancando el pool…',
    waitHead: 'Esperando a la cabeza del pool…',
    pipeline: 'pedido',
    out: 'token',
    layers: 'Capas',
    estimate: 'estimado',
    nodes: ['Máquina', 'Placa', 'Capas', 'Memoria', 'Estado'],
    head: 'cabeza',
    up: 'lista', down: 'caída', loading: 'cargando',
    stats: 'El pool',
    speed: 'Velocidad',
    today: 'Hoy',
    mine: 'Tu parte',
    yourTotal: 'Tus tokens',
    path: 'Conexión',
    share: (pct) => `${pct}% de las capas`,
    logInvite: (c) => `invitación nueva: ${c} (un uso, 24 h)`,
    logOpen: 'el pool ahora es abierto',
    logClosed: 'el pool ahora es sólo con invitación',
    logHead: (n) => `${n} es la nueva cabeza`,
    keyInvite: 'Invitar', keyOpen: 'Abrir', keyClose: 'Cerrar', keyHead: 'Cabeza', keyLeave: 'Salir del pool',
    leaveTitle: 'Salir del pool',
    leaveLines: ['¿Dejás el pool?', 'Tu máquina sale y el pool se reacomoda sin vos.'],
    stay: 'Quedarme', leave: 'Salir del pool',
    youTag: (n) => `${n} (vos)`,
    direct: 'directo', relay: 'relay',
  },

  // The pool run's log and errors (lib/pool-run.mjs, and the demo's fake run)
  run: {
    layersReady: 'capas cargadas',
    meshReqFail: (t) => `pedido falló en el mesh: ${t}`,
    meshExit: (c) => `mesh-llm salió (código ${c}). Mirá ~/.llmule/mesh.log`,
    nodeUp: (n) => `nodo arrancado: acepta sólo a ${n} máquina${n === 1 ? '' : 's'} del pool`,
    published: (m) => `publicado en LLMule como ${m}`,
    job: (tok, tps) => `pedido · ${tok} tokens${tps ? ` a ${tps} tok/s` : ''}`,
    jobFrom: (from, tok, tps) => `pedido de ${from} · ${tok} tokens a ${tps} tok/s`,
    fail: (why) => `falló: ${why}`,
    providerExit: (c) => `el provider salió (${c}); lo vuelvo a arrancar`,
    nowHead: 'ahora tu máquina es la cabeza del pool',
    headChanged: 'la cabeza del pool cambió',
    membersChanged: 'cambiaron las máquinas del pool: reinicio el nodo con la lista nueva (~1 min)',
    gone: 'Ya no estás en este pool (lo cerraron o te sacaron).',
    unsafe: (why) => `Paré el pool por seguridad: mesh-llm no arrancó como nodo privado y firmado (${why}). Mirá ~/.llmule/mesh.log`,
    ready: 'el pool está listo',
    replan: 'el pool se reacomoda',
    noSpace: (gb) => `No hay lugar en el disco (faltan ${gb} GB).`,
    noBuild: 'mesh-llm no tiene versión para esta máquina (Mac Intel). Podés compartir tu modelo igual.',
    nodeDown: (n) => `${n} se cayó`,
    nodeBack: (n) => `${n} volvió`,
  },

  // Outside the full-screen app: --help, --uninstall, no terminal
  cli: {
    help: `LLMule — compartí tu placa en la red P2P de LLMs (llmule.xyz)

Uso:
  llmule                    la primera vez: la instalación paso a paso. Después: el panel.
  llmule --setup            la instalación de nuevo (otro modelo, otro pool)
  llmule --demo             el recorrido completo con todo simulado (nada de red ni archivos)
         --mode=pool|poolnew  con --demo: arranca en "unirme a un pool" o "crear un pool"
         --machine=3090|mac|small|cpu   con --demo: qué máquina simular
         --engine=none|ollama           con --demo: simular un motor ya corriendo
         --fast             con --demo: esperas más cortas
  llmule --lang=es|en       idioma (también con la tecla L en la bienvenida; queda guardado)
  llmule --uninstall        borra los íconos que creó; ~/.llmule lo borrás vos si querés
  llmule --version          versión y fecha del build
  llmule --help             esto

Todo lo que guarda va en ~/.llmule (la key, el motor, los modelos). No corre de fondo:
abierto comparte, cerrado no.

Teclas: ENTER sigue · ESC vuelve · flechas/TAB eligen · F3, Q o Ctrl+C salen (pide confirmación).
Necesita una terminal de 80×24 o más. Colores: LLMULE_COLORS=16|256|24 · cajas ASCII: LLMULE_ASCII=1
`,
    removed: (f) => `borrado: ${f}`,
    noIcons: 'No había íconos. ',
    rest: (dir) => `Lo demás (key, motor, modelos) está en ${dir}: borrá esa carpeta si no lo querés más.`,
    needTty: 'LLMule necesita una terminal: abrilo desde una ventana de terminal (no con la salida redirigida). Ayuda: --help',
  },

  demo: { email: 'vos@ejemplo.com' },

  levels: [
    [0, 'Burrito'],
    [100_000, 'Mula de carga'],
    [1_000_000, 'Mula de tiro'],
    [10_000_000, 'Mula blindada'],
    [100_000_000, 'Mula legendaria'],
  ],
};

export const EN = {
  lang: 'en',
  langName: 'English',
  dec: (n) => String(n),
  of: (a, b) => `${a} of ${b}`,
  you: 'you',
  someone: 'someone',
  title: 'LLMule Setup',
  titleRun: 'LLMule',
  step: (n, of) => `Step ${n} of ${of}`,
  keys: { enter: 'Next', esc: 'Back', f3: 'Quit', move: 'Choose', tab: 'Field', space: 'Check', pause: 'Pause', resume: 'Resume', open: 'Open',
    spaceKey: 'SPACE', lang: 'Español' },
  status: {
    site: 'Network', engine: 'Engine', model: 'Model', login: 'Account', share: 'Status', vpn: 'Mesh', pool: 'Pool',
    vpnOff: 'no mesh', vpnUp: 'mesh direct', vpnRelay: 'mesh via relay', vpnWait: 'mesh…', poolOn: 'in the pool', poolWait: 'waiting',
    siteUp: 'llmule.xyz ok', siteDown: 'llmule.xyz down', siteUpShort: 'net ok', siteDownShort: 'net down', siteChecking: 'llmule.xyz…',
    engineNone: 'no engine', engineDown: 'engine down', engineIdle: 'stopped', engineLoading: 'loading',
    modelNone: 'no model',
    loginNo: 'not linked', loginWait: 'linking…', loginYes: 'linked',
    shareOff: 'off', shareOn: 'sharing', sharePaused: 'paused', shareWaiting: 'waiting', shareBusy: 'working',
    loginNoShort: 'no account', engineNoneShort: 'no engine', modelNoneShort: 'no model',
  },
  small: (w, h) => [`The window is too small (${w}×${h}).`, 'Make it 80×24 or bigger.'],
  exit: {
    title: 'Quit',
    setup: ['Quit setup?', 'What you downloaded stays: next time it picks up from here.'],
    run: ['Close LLMule?', 'You stop sharing until you open it again.'],
    stay: 'Keep going', stayRun: 'Keep sharing', leave: 'Quit', leaveRun: 'Close',
  },
  errorOf: (e) => {
    if (!e) return 'Something went wrong.';
    if (e.code === 'no_space') return `Not enough disk space: it needs ${Math.ceil((e.need || 0) / 1e9)} GB and there are ${Math.floor((e.free || 0) / 1e9)} GB free.`;
    if (e.code === 'bad_sha256') return "The download doesn't match the sha256 I expected. I deleted it: try again (ENTER).";
    if (e.code === 'offline' || e.name === 'TimeoutError' || /fetch failed/.test(e.message)) return "llmule.xyz isn't answering. Try again in a while.";
    if (e.code === 'invite_only') return 'This pool is invite-only: ask the owner for a code (C on the list).';
    if (e.code === 'nick_required') return 'Pick a nick first (the pool shows who is in it).';
    if (e.code === 'one_pool') return 'You already have a pool open. Close it before making another.';
    if (e.code === 'full') return 'The pool is full.';
    if (e.code === 'used') return 'That invite was already used.';
    if (e.code === 'expired') return 'That invite expired: ask the owner for a new one.';
    if (e.code === 'not_found') return "I couldn't find that pool (or that code).";
    if (e.code === 'rate_limited') return 'Too many tries. Wait a while.';
    if (e.code === 'nick_taken') return 'Someone else has that nick. Try another.';
    if (e.code === 'bad_nick') return 'Only a-z, 0-9, _ or - (3 to 20).';
    if (e.code === 'llama_missing') return "llama-server isn't in what I downloaded";
    if (e.code === 'model_file') return "I can't find the model file";
    if (e.code === 'llama_exit') return `llama-server quit (code ${e.exitCode}). See ~/.llmule/llama-server.log`;
    if (e.code === 'llama_timeout') return "llama-server didn't finish loading in 10 minutes";
    if (e.code === 'shortcut') return "I couldn't create the shortcut";
    return e.message || String(e);
  },
  version: (v, built) => `version ${v} · build ${built}`,
  versionShort: (v) => `v${v}`,
  waitSite: (s) => `llmule.xyz isn't answering. Retrying in ${s} s.`,

  welcome: {
    win: 'Welcome',
    hello: 'Hi. This sets your computer up to share AI on LLMule.',
    what: 'LLMule is the underground P2P network of LLMs: people with a GPU share their models and everyone else uses them for free.',
    will: "What I'll do, step by step:",
    steps: [
      'Check your GPU and its memory.',
      'Link this computer to your llmule.xyz account.',
      'You choose: share your model, join a pool or start one.',
      'Set up the engine (llama.cpp if needed) and the model.',
      'Leave an icon: open it to share, close it to stop.',
    ],
    safe: "Sharing opens no ports and doesn't read your files. Everything stays in ~/.llmule.",
    go: 'Start', quit: 'Quit',
    lang: 'Language',
  },

  machine: {
    win: 'Your computer',
    looking: 'Looking at your computer…',
    os: 'System', cpu: 'Processor', ram: 'Memory', gpu: 'GPU', vram: 'For models',
    none: 'none that helps',
    integrated: (chip) => `${chip} (integrated GPU)`,
    cores: (cpu, n) => `${cpu} · ${n} cores`,
    unified: (gb) => `${gb} GB unified`,
    usable: (gb) => `~${gb} GB (unified memory)`,
    have: (name, gb) => `You have an ${name} with ${gb} GB.`,
    haveApple: (chip, gb) => `You have an ${chip}: your GPU can use ~${gb} GB.`,
    haveNone: "I didn't find a GPU with its own memory. It will run on the processor, slowly.",
    fits: (name, quant) => `Enough for: ${name} at ${quant}.`,
  },

  engine: {
    win: 'Engine',
    looking: 'Looking for an engine running on this computer…',
    port: (p) => `port ${p}`,
    up: (n) => `up · ${n} model${n === 1 ? '' : 's'}`,
    down: 'not running',
    pick: 'Choose which one to share with:',
    install: 'Install llama.cpp anyway',
    noneFound: "I didn't find any. I'll install llama.cpp in the next step.",
    head: ['Engine', 'Status'],
    onlyEmbed: 'embeddings only',
    noneLoaded: (id) => `No chat model loaded. In the next step I offer to load ${id}.`,
    embedOnly: (name) => `${name} only has embedding models (they can't chat). Download a chat model there, or I go on with llama.cpp and one from the catalog.`,
  },

  install: {
    win: 'Install llama.cpp',
    intro: "You have no engine. I'll install llama.cpp (llama-server), the free engine from ggml.org.",
    where: (dir) => `It goes in ${dir}. Nothing outside that folder.`,
    bonus: (port) => `While LLMule is open, it stays on localhost:${port} with an OpenAI API: use it from your own tools.`,
    files: 'Downloading from github.com/ggml-org/llama.cpp:',
    checked: 'I check the sha256 before unpacking.',
    checkPart: 'Checking what was already downloaded of',
    ok: 'Install', other: 'I have one',
    download: 'Downloading', verify: 'Checking sha256', unpack: 'Unpacking', done: 'Done: llama-server installed.',
    otherUrl: 'Paste the URL of your engine (ends in /v1):',
    noAnswer: (url) => `${url}/models doesn't answer with any models.`,
  },

  model: {
    win: 'Model',
    pick: (gb) => (gb ? `Choose what to share. I marked the best one that fits in your ${gb} GB.` : 'Choose what to share. Without a GPU, the smallest.'),
    inEngine: 'already in your engine',
    rec: '★ recommended',
    noFit: "doesn't fit",
    alt: 'alternative',
    need: (need, have) => `Needs ~${need} GB · you have ${have} GB`,
    size: 'Size',
    downloading: 'Downloading',
    eta: (s) => (s >= 90 ? `${Math.ceil(s / 60)} min left` : `${Math.ceil(s)} s left`),
    verify: 'Checking sha256…',
    loading: 'Loading the model onto the GPU…',
    loaded: 'Model loaded.',
    from: (repo) => `from huggingface.co/${repo}`,
    paused: 'The connection dropped. I wait and resume where it stopped.',
    pausedRetry: (s) => `The connection dropped. Resuming where it stopped in ${s} s.`,
    checking: 'Checking what was already downloaded…',
    pausedShort: 'paused, no connection',
    head: ['Model                       Quant.   Size', ''],
    notLoaded: 'downloaded, not loaded',
    needLoad: (id, eng) => `${id} is in ${eng} but it isn't loaded, so it can't answer. It has to be loaded (it uses GPU memory while it is).`,
    lmsCan: (cmd) => `I can load it for you, with: ${cmd}`,
    byHand: (eng) => `Load it in ${eng} (at the very top: "Select a model to load") and press ENTER.`,
    loadIt: 'Load it (L)',
    loadedByHand: 'I loaded it',
    loadTitle: 'Load model',
    loadConfirm: (id, eng) => [`Load ${id} in ${eng}?`, 'It uses GPU memory until you unload it.'],
    no: 'No',
    yesLoad: 'Load',
    lmsLoading: (id) => `Loading ${id} with lms…`,
    lmsFailed: "lms couldn't load it:",
    stillNot: (id) => `I still don't see ${id} loaded.`,
    rechecking: 'Checking the engine…',
    back: 'ENTER goes back.',
  },

  link: {
    win: 'Link your account',
    intro: 'This computer needs to know whose it is. Open this page:',
    code: 'and enter this code:',
    how: 'Log in with your email as usual, check the name of this computer and press "Link this computer". The key arrives by itself.',
    opened: "I opened your browser. If it didn't open, type the address yourself.",
    open: 'Open the browser',
    waiting: 'Waiting for your approval',
    expires: (mm, ss) => `expires in ${mm}:${String(ss).padStart(2, '0')}`,
    expired: 'The code expired. ENTER for a new one.',
    denied: 'You rejected it on the web. ENTER for a new code.',
    done: (who) => `Done, linked to ${who}.`,
    saved: (k) => `You already have a saved key (${k}). Using that one.`,
    safe: 'The key stays in ~/.llmule/, readable only by you.',
  },

  profile: {
    win: 'Your profile',
    intro: 'This is how the network sees you.',
    thisMachine: 'This computer',
    thisMachineHint: 'only this computer',
    account: 'Your profile',
    accountHint: 'same on all your computers',
    machine: 'Name of this computer',
    machineShort: 'Name',
    loading: 'Getting your profile…',
    nick: 'Your nick',
    nickHint: '3 to 20: a-z, 0-9, _ or -',
    nickBad: 'Only a-z, 0-9, _ or - (3 to 20).',
    avatar: 'Your mule',
    bio: 'Bio (one line)',
    colors: ['blue', 'green', 'red', 'purple', 'orange'],
    saving: 'Saving…',
  },

  test: {
    win: 'Test',
    intro: 'I ask your model a question, here, on your computer:',
    question: 'What is a mule? Answer in two lines.',
    thinking: 'Thinking…',
    stats: (s, tps) => `Answered in ${s} s · ${tps} tokens/s`,
    failed: "No answer. Is the model loaded? ENTER tries again.",
    engineSaid: (msg) => `The engine said: ${msg}`,
  },

  icon: {
    win: 'Icon',
    intro: "LLMule doesn't keep running in the background. It's an icon:",
    how: ['Open it → this window opens and you share.', 'Close the window → sharing stops.'],
    howPool: ['Open it → your GPU goes back to the pool.', 'Close the window → the pool rearranges without you.'],
    desktop: '"LLMule" icon on the desktop',
    autostart: 'Open LLMule when the computer starts',
    autostartHint: 'Off unless you check it.',
    made: (p) => `Created: ${p}`,
    fileComment: 'LLMule: open this and you share; close the window and sharing stops.',
    menuComment: 'Share your GPU on llmule.xyz',
  },

  done: {
    win: 'Done',
    big: "Done! You're sharing.",
    card: 'Your card:',
    api: (url) => `Your engine: ${url} (OpenAI API, while LLMule is open).`,
    next: 'See the panel',
    thanks: 'Thanks for putting your GPU in. The network is the people.',
  },

  dash: {
    win: 'LLMule — sharing',
    sharing: (m) => `Sharing ${m}`,
    paused: 'Paused. P to share again.',
    waitingSite: "llmule.xyz isn't answering: I wait and carry on by myself.",
    waitingEngine: "The engine isn't answering: waiting for it to come back.",
    starting: 'Connecting…',
    machine: 'Your computer',
    tokens: 'Tokens served',
    session: 'This session',
    week: 'This week',
    total: 'Total',
    rank: (n) => `rank #${n}`,
    level: 'Level',
    idle: 'waiting for work',
    net: 'network',
    you: 'your GPU',
    log: 'Activity',
    logStart: (from, model) => `request from ${from} → ${model}`,
    logDone: (tok, s) => `answered · ${tok} tokens in ${s} s`,
    logFail: (why) => `failed: ${why}`,
    logOnline: (m) => `online, sharing ${m}`,
    logWaitSite: "llmule.xyz isn't answering, waiting",
    logWaitEngine: "the engine isn't answering, waiting",
    logPaused: 'paused',
    logStopped: 'disconnected from the network',
    card: 'Card',
    logExit: (c) => `provider exit ${c}`,
  },

  menu: {
    win: 'What do we do with your GPU?',
    intro: 'Three ways to put your GPU on LLMule. You can change later.',
    share: 'Share my model',
    shareWhat: 'Your GPU runs a whole model and lends it to the network.',
    shareNeed: 'Any GPU works, even no GPU.',
    pool: 'Join a pool',
    poolWhat: 'Your GPU runs one part of a huge model, together with other homes.',
    poolNeed: (n) => `Best with 24 GB or more and good upload. ${n} pool${n === 1 ? '' : 's'} to join now.`,
    poolSmall: (gb) => `Your GPU has ${gb} GB: it adds little to a pool. Sharing will pay off more.`,
    poolNew: 'Start a pool',
    poolNewWhat: 'You choose the model, invite people and run it together. The pool is yours.',
    poolNewNeed: 'Like running a game server: you invite, the steadiest machine is the head.',
    noMesh: 'mesh-llm (the pool engine) has no version for Intel Macs yet.',
  },

  pools: {
    win: 'Pools',
    intro: "A pool runs a model that doesn't fit in any single home. Choose one:",
    head: ['Pool                          Model', 'Machines · status'],
    open: 'waiting', running: 'running', closed: 'closed', yours: "you're in",
    nodes: (n) => `${n} machine${n === 1 ? '' : 's'}`,
    isOpen: 'Open: anyone with an account and a nick can join.',
    isInvite: "Invite-only: you're already on the owner's list.",
    speed: (t) => `Runs at ~${t} tokens/s (measured in the pool).`,
    missing: (gb, cards) => (Number(String(gb).replace(',', '.')) > 0 ? `It needs ~${gb} GB more (about ${cards} 24 GB cards) to start.` : 'It has the memory: waiting for the head to start.'),
    loading: 'Looking for pools…',
    none: 'No open pools right now. If someone gave you a code, press C. Or go back and start one.',
    noneQ: 'Nothing for that search. / to search again, C for a code.',
    filtered: (q) => `searching "${q}"`,
    search: 'Search (model, name or owner):',
    codeAsk: 'Invite code (XXXX-XXXX):',
    keySearch: 'Search', keyCode: 'Code',
    line: (p, dec) => `${p.modelName} ${p.quant} · ${dec(p.sizeGB)} GB · ${p.layers} layers · owner @${p.owner || '?'}${p.head ? ` · head @${p.head}` : ''}`,
  },

  contrib: {
    win: 'What you bring',
    intro: (pool) => `This is how ${pool} would look with your GPU:`,
    yours: (n, of, gb) => `You'd get about ${n} of the ${of} layers (~${gb} GB on your GPU). mesh-llm splits the real layers when it starts.`,
    completes: 'With your GPU the pool reaches the memory it needs.',
    notYet: (gb, cards) => `It still needs ~${gb} GB (about ${cards} 24 GB cards) besides yours.`,
    addsYou: (gb) => `Your ${gb} GB count. The pool starts when there's enough.`,
    first: (gb) => `You download only your layers (~${gb} GB) from Hugging Face, once. They stay saved for next time.`,
    rules: [
      'Only pools open a connection, between the pool\'s machines, encrypted and signed. Your prompts go through the members\' machines: the head sees the text. Join pools of people you know.',
      'If you disconnect, the pool rearranges and waits. Nothing breaks.',
    ],
    join: 'Join', back: 'See another', back2: 'Next',
  },

  poolnew: {
    win: 'Start a pool',
    intro: "Choose the model you'll all run together:",
    head: ['Model                         Quant.      Size', 'With your GPU'],
    test: 'test (fits anywhere)',
    cards: (n) => `~${n} more card${n === 1 ? '' : 's'}`,
    fitsAlone: 'fits on your GPU',
    missing: (gb, need, cards) => `With your ${gb} GB it needs ~${need} GB more: about ${cards} more 24 GB cards.`,
    alone: 'Fits on your GPU alone: perfect for trying the pool.',
    open: 'Open: anyone sees it on the list and joins',
    openHint: "The whole network sees it. Prompts go through strangers' machines.",
    inviteHint: 'Only with a code from you (single use, 24 h). Recommended.',
    headMe: 'This computer is the head',
    headMeHint: 'The head publishes the pool on LLMule and has to stay on: if it goes off, the pool stops.',
    headLaterHint: 'You choose the head later (H on the panel): the steadiest machine in the pool.',
    create: 'Create', creating: 'Creating the pool…',
    made: (name) => `Done: ${name}`,
    madeOpen: "It's open: it shows up in \"Join a pool\" for everyone.",
    madeInvite: 'Send this code to whoever you want to add (single use, expires in 24 h):',
    codeHow: 'They enter it in LLMule → Join a pool → C. I makes another code.',
    youHead: 'Your computer is the head: it starts the mesh and waits for the others.',
    headLater: 'Your computer joins as one more; when everyone is in, choose the head with H.',
    keyInvite: 'New code',
    safety: 'Only pools open a connection, between the pool\'s machines, encrypted and signed. Your prompts go through the members\' machines: the head sees the text. Start pools with people you know.',
  },

  mesh: {
    win: 'Your computer in the pool',
    introHead: (p) => `Starting the pool ${p}. The pool's machines talk directly, encrypted and signed (mesh-llm), without going through llmule.xyz. Your node only lets the pool's machines in.`,
    introWorker: (p) => `Joining ${p}. The pool's machines talk directly, encrypted and signed (mesh-llm), without going through llmule.xyz. Your node only lets the pool's machines in.`,
    firewall: "If your computer asks whether to accept incoming connections, that's mesh-llm: say yes. If you say no, it still works, but through a relay, slower.",
    install: 'Downloading mesh-llm', verify: 'Checking sha256', unpack: 'Unpacking',
    installed: 'mesh-llm installed', installHint: 'In ~/.llmule/mesh, checked with sha256.',
    create: 'Creating the mesh', createHint: 'Your computer is the head: the invite goes to the members through llmule.xyz.',
    waitHead: 'Waiting for the head', waitHeadHint: 'When the head starts, I join by myself. You can leave it like this.',
    join: 'Joining the mesh', joinHint: 'Connecting to the head (directly if possible, else through a relay).',
    peers: (n, p) => `Connected to ${n} machine${n === 1 ? '' : 's'}${p ? ` · ${p}` : ''}`,
    noPeers: 'Waiting for the other machines', noPeersHint: "The pool starts when there's enough memory.",
    direct: (ms) => `direct, ${ms} ms`,
    relay: (ms) => `via relay, ${ms} ms (slower)`,
    layers: (a, b, of) => `Your layers: ${a} to ${b} of ${of}`,
    layersWait: 'Your layers', layersHint: 'mesh-llm splits the layers and each one downloads its own.',
    downloaded: (b) => `downloaded: ${b}`,
    shortfall: (gb) => `Not enough memory yet (~${gb} GB short). Waiting for more machines.`,
    ready: 'Ready: your layers are loaded and the pool is running.',
    readyHead: (m) => `Ready: the pool is running and published on LLMule as ${m}.`,
    canGo: 'ENTER goes on anyway: the panel keeps waiting for you.',
  },

  pdash: {
    win: 'LLMule — in the pool',
    in: (id) => `In the pool ${id}`,
    replan: 'A machine left: the pool is rearranging.',
    starting: 'Starting the pool…',
    waitHead: 'Waiting for the pool\'s head…',
    pipeline: 'request',
    out: 'token',
    layers: 'Layers',
    estimate: 'estimate',
    nodes: ['Machine', 'GPU', 'Layers', 'Memory', 'Status'],
    head: 'head',
    up: 'ready', down: 'down', loading: 'loading',
    stats: 'The pool',
    speed: 'Speed',
    today: 'Today',
    mine: 'Your part',
    yourTotal: 'Your tokens',
    path: 'Link',
    share: (pct) => `${pct}% of the layers`,
    logInvite: (c) => `new invite: ${c} (single use, 24 h)`,
    logOpen: 'the pool is now open',
    logClosed: 'the pool is now invite-only',
    logHead: (n) => `${n} is the new head`,
    keyInvite: 'Invite', keyOpen: 'Open', keyClose: 'Close', keyHead: 'Head', keyLeave: 'Leave pool',
    leaveTitle: 'Leave the pool',
    leaveLines: ['Leave the pool?', 'Your computer leaves and the pool rearranges without you.'],
    stay: 'Stay', leave: 'Leave pool',
    youTag: (n) => `${n} (you)`,
    direct: 'direct', relay: 'relay',
  },

  run: {
    layersReady: 'layers loaded',
    meshReqFail: (t) => `request failed in the mesh: ${t}`,
    meshExit: (c) => `mesh-llm quit (code ${c}). See ~/.llmule/mesh.log`,
    nodeUp: (n) => `node started: only lets in the pool's ${n} machine${n === 1 ? '' : 's'}`,
    published: (m) => `published on LLMule as ${m}`,
    job: (tok, tps) => `request · ${tok} tokens${tps ? ` at ${tps} tok/s` : ''}`,
    jobFrom: (from, tok, tps) => `request from ${from} · ${tok} tokens at ${tps} tok/s`,
    fail: (why) => `failed: ${why}`,
    providerExit: (c) => `the provider quit (${c}); restarting it`,
    nowHead: 'your computer is now the pool\'s head',
    headChanged: 'the pool\'s head changed',
    membersChanged: 'the pool\'s machines changed: restarting the node with the new list (~1 min)',
    gone: "You're no longer in this pool (it was closed or you were removed).",
    unsafe: (why) => `I stopped the pool for safety: mesh-llm didn't start as a private, signed node (${why}). See ~/.llmule/mesh.log`,
    ready: 'the pool is ready',
    replan: 'the pool is rearranging',
    noSpace: (gb) => `Not enough disk space (${gb} GB short).`,
    noBuild: 'mesh-llm has no version for this computer (Intel Mac). You can still share your model.',
    nodeDown: (n) => `${n} went down`,
    nodeBack: (n) => `${n} is back`,
  },

  cli: {
    help: `LLMule — share your GPU on the P2P network of LLMs (llmule.xyz)

Usage:
  llmule                    first time: step-by-step setup. After that: the panel.
  llmule --setup            run setup again (another model, another pool)
  llmule --demo             the whole flow, all simulated (no network, no files)
         --mode=pool|poolnew  with --demo: start on "join a pool" or "start a pool"
         --machine=3090|mac|small|cpu   with --demo: which computer to simulate
         --engine=none|ollama           with --demo: simulate an engine already running
         --fast             with --demo: shorter waits
  llmule --lang=en|es       language (also the L key on the welcome screen; it's remembered)
  llmule --uninstall        removes the icons it made; delete ~/.llmule yourself if you want
  llmule --version          version and build date
  llmule --help             this

Everything it saves goes in ~/.llmule (the key, the engine, the models). It doesn't run in the
background: open, it shares; closed, it doesn't.

Keys: ENTER next · ESC back · arrows/TAB choose · F3, Q or Ctrl+C quit (asks first).
Needs a terminal of 80×24 or more. Colors: LLMULE_COLORS=16|256|24 · ASCII boxes: LLMULE_ASCII=1
`,
    removed: (f) => `removed: ${f}`,
    noIcons: 'There were no icons. ',
    rest: (dir) => `The rest (key, engine, models) is in ${dir}: delete that folder if you don't want it anymore.`,
    needTty: 'LLMule needs a terminal: open it from a terminal window (not with its output redirected). Help: --help',
  },

  demo: { email: 'you@example.com' },

  levels: [
    [0, 'Little donkey'],
    [100_000, 'Pack mule'],
    [1_000_000, 'Draft mule'],
    [10_000_000, 'Armored mule'],
    [100_000_000, 'Legendary mule'],
  ],
};

export const LANGS = { es: ES, en: EN };

// es* → Spanish, anything else → English. POSIX order: LC_ALL, LC_MESSAGES, LANG ("C"/"POSIX" say nothing);
// then the OS locale through Intl (Windows has no LANG; Node and Deno read the system's there).
export function systemLang(env = process.env, intlLocale = () => Intl.DateTimeFormat().resolvedOptions().locale) {
  for (const k of ['LC_ALL', 'LC_MESSAGES', 'LANG']) {
    const v = env[k];
    if (v && !/^(C|POSIX)([._@]|$)/i.test(v)) return /^es([_.\-@]|$)/i.test(v) ? 'es' : 'en';
  }
  try {
    return /^es([_\-]|$)/i.test(intlLocale() || '') ? 'es' : 'en';
  } catch {
    return 'en';
  }
}

export const normLang = (l) => (l === 'es' || l === 'en' ? l : null);

// --lang wins, then the saved choice, then the system
export const pickLang = ({ flag, saved, env, intlLocale } = {}) => normLang(flag) || normLang(saved) || systemLang(env, intlLocale);

export function strings(lang) {
  return LANGS[lang] || EN;
}
