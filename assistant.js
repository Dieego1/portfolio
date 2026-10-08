(function () {
  'use strict';

  const MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
  const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3';
  const ACCEPT_MIN = 0.45;
  const MARGIN = 0.05;
  const COMBINE_MIN = 0.55;

  const normalize = (s) => String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const hasPhrase = (text, phrase) => (' ' + text + ' ').includes(' ' + phrase + ' ');

  const OUT = {
    es: 'Solo puedo responder preguntas sobre el portafolio de Diego: experiencia, proyectos, estudios, certificados, habilidades, CV, contacto y su negocio. ¿Qué te gustaría saber?',
    en: 'I can only answer questions about Diego’s portfolio: experience, projects, education, certifications, skills, CV, contact and his business. What would you like to know?'
  };

  const BLOCK = {
    es: 'Estoy aquí para ayudarte con preguntas sobre el portafolio de Diego. Puedes preguntarme sobre sus proyectos, experiencia o contacto.',
    en: 'I’m here to help with questions about Diego’s portfolio. You can ask me about his projects, experience or contact.'
  };

  const BAD_WORDS = new Set(normalize([
    'puta', 'puto', 'putos', 'putas', 'pendejo', 'pendeja', 'pendejos', 'pendejas',
    'cabron', 'cabrona', 'cabrones', 'chingar', 'chingada', 'chingado', 'chingon', 'chinga', 'chingaderas',
    'verga', 'vergas', 'mierda', 'idiota', 'idiotas', 'imbecil', 'imbeciles', 'estupido', 'estupida',
    'estupidos', 'estupidas', 'culero', 'culera', 'culeros', 'pinche', 'joder', 'marica', 'maricon',
    'tonto', 'tonta', 'inutil', 'basura', 'mamon', 'mamona', 'pito',
    'fuck', 'fucking', 'shit', 'bitch', 'bitches', 'asshole', 'assholes', 'bastard', 'cunt',
    'motherfucker', 'retard', 'retarded', 'stupid', 'idiot', 'moron', 'dumb'
  ].join(' ')).split(' '));

  const LEET = { '4': 'a', '3': 'e', '1': 'i', '0': 'o', '5': 's', '7': 't', '@': 'a', '$': 's' };

  function isOffensive(text) {
    const leeted = String(text).toLowerCase().replace(/[43107@$5]/g, ch => LEET[ch]);
    const squashed = leeted.replace(/(.)\1{2,}/g, '$1');
    const tokens = normalize(squashed).split(' ');
    if (tokens.some(w => BAD_WORDS.has(w))) return true;
    // detecta evasion por espaciado de letras, ej. "p u t o": une corridas de tokens de 1 char
    const merged = [];
    let buf = '';
    for (const t of tokens) {
      if (t.length === 1) {
        buf += t;
      } else {
        if (buf) { merged.push(buf); buf = ''; }
      }
    }
    if (buf) merged.push(buf);
    return merged.some(w => BAD_WORDS.has(w));
  }

  const EN_HINT = new Set(['what', 'who', 'how', 'where', 'which', 'does', 'do', 'is', 'are', 'can', 'could',
    'tell', 'about', 'his', 'he', 'has', 'have', 'the', 'project', 'projects', 'experience', 'skills',
    'contact', 'certifications', 'education', 'hire', 'work', 'and', 'with', 'you', 'your', 'i', 'any',
    'first', 'most', 'recent', 'team', 'stack', 'rules']);

  const ES_HINT = new Set(['que', 'quien', 'como', 'donde', 'cual', 'cuales', 'tiene', 'tienes', 'es', 'son',
    'puede', 'puedo', 'hablame', 'sobre', 'proyectos', 'proyecto', 'experiencia', 'habilidades', 'contacto',
    'certificados', 'estudios', 'de', 'el', 'la', 'los', 'las', 'y', 'su', 'sus', 'hay', 'me', 'un', 'una',
    'del', 'en', 'para', 'hola', 'por', 'cuanto', 'tu', 'primer', 'reciente', 'equipo', 'reglas']);

  function detectLang(text, fallback) {
    const tokens = normalize(text).split(' ');
    const en = tokens.filter(t => EN_HINT.has(t)).length;
    const es = tokens.filter(t => ES_HINT.has(t)).length;
    if (en > es) return 'en';
    if (es > en) return 'es';
    return fallback;
  }

  const TECH_KNOWN = ['php', 'python', 'javascript', 'java', 'html', 'html5', 'css', 'css3', 'sql', 'mysql',
    'mongodb', 'mongo', 'angularjs', 'angular', 'bootstrap', 'git', 'xampp', 'vs code', 'jwt', 'mvc', 'crud',
    'poo', 'api', 'apis', 'rest', 'copilot', 'pwa'].map(normalize);

  const TECH_UNKNOWN = [
    ['react', 'React'], ['vue', 'Vue'], ['docker', 'Docker'], ['kubernetes', 'Kubernetes'],
    ['nodejs', 'Node.js'], ['node js', 'Node.js'], ['express', 'Express'], ['django', 'Django'],
    ['flask', 'Flask'], ['laravel', 'Laravel'], ['ruby', 'Ruby'], ['rails', 'Ruby on Rails'],
    ['kotlin', 'Kotlin'], ['swift', 'Swift'], ['flutter', 'Flutter'], ['android', 'Android'],
    ['typescript', 'TypeScript'], ['postgresql', 'PostgreSQL'], ['postgres', 'PostgreSQL'],
    ['redis', 'Redis'], ['firebase', 'Firebase'], ['tailwind', 'Tailwind'], ['linux', 'Linux'],
    ['jenkins', 'Jenkins'], ['terraform', 'Terraform'], ['azure', 'Azure'], ['unity', 'Unity'],
    ['golang', 'Go'], ['microservicios', 'microservicios'], ['microservices', 'microservices'],
    ['graphql', 'GraphQL'], ['devops', 'DevOps'], ['ci cd', 'CI/CD'], ['tdd', 'TDD'],
    ['test driven development', 'Test Driven Development'], ['desarrollo guiado por pruebas', 'desarrollo guiado por pruebas'],
    ['pruebas unitarias', 'pruebas unitarias'], ['unit testing', 'unit testing'],
    ['arquitectura limpia', 'arquitectura limpia'], ['clean architecture', 'Clean Architecture'],
    ['clean code', 'Clean Code'], ['experiencia de usuario', 'diseño UX'], ['user experience', 'UX design'],
    ['nextjs', 'Next.js'], ['next js', 'Next.js'], ['wordpress', 'WordPress'], ['figma', 'Figma'],
    ['webpack', 'Webpack'], ['nestjs', 'NestJS'], ['nest js', 'NestJS'], ['spring boot', 'Spring Boot']
  ].map(([k, name]) => [normalize(k), name]);

  const OFF_TOPIC_BANK = [
    '¿Cuánto es 12 por 3?', '¿Qué clima hará mañana?', 'Dame una receta de galletas', 'Recomiéndame una película de terror',
    '¿Quién fue Benito Juárez?', 'Tradúceme esta frase al francés', '¿Cuál es el mejor restaurante?',
    '¿Me das consejos para dormir mejor?', 'Who won the world cup?', 'How do I cook pasta?', '¿Qué opinas de la política?',
    'Cuéntame un chiste', '¿Cuándo es el próximo eclipse?', '¿Cuál es la altura del Everest?', 'Write a short story about a dragon',
    'What is the capital of Japan?', '¿Cómo se juega al ajedrez?', '¿Cuál es el mejor videojuego?', '¿Qué es la fotosíntesis?',
    '¿Cómo se hace un bucle for en Python?', 'Explain quantum physics', '¿Cuál es el precio del bitcoin hoy?',
    'Recommend me a good book', '¿Qué canción está de moda?', 'What is the best smartphone to buy?', '¿Cómo bajo de peso rápido?',
    'Tell me a joke about cats', '¿Quién es el actor más famoso?', 'How do I fix my car engine?', '¿Qué opinas de Messi?',
    '¿Cuál es el sentido de la vida?', 'Write me a poem about love', '¿Cómo funciona un motor de combustión?', 'What time is it in Tokyo?',
    '¿Me ayudas con mi tarea de historia?', 'Solve this equation: x + 5 = 12', '¿Cuál es la mejor marca de tenis?', '¿Qué come un oso panda?'
  ];

  const DATA = [
    {
      id: 'identity',
      weight: 1,
      examples: [
        '¿Eres una IA?', '¿Eres una persona o un robot?', 'Are you a bot?', '¿Quién eres?', '¿Eres humano?', 'Are you human?',
        '¿Eres inteligencia artificial?', 'Are you an AI?', '¿Con quién estoy hablando?', 'Who am I talking to?',
        '¿Este chat es de una persona real?', 'Is this a real person?', '¿Eres un chatbot?', 'Is this a chatbot?'
      ],
      kw: {
        es: ['eres una ia', 'eres ia', 'eres humano', 'eres persona', 'eres un robot', 'eres un bot', 'quien eres', 'que eres', 'eres inteligencia artificial', 'persona real', 'con quien estoy hablando', 'con quien hablo'],
        en: ['are you ai', 'are you an ai', 'are you human', 'are you a person', 'are you a robot', 'are you a bot', 'who are you', 'what are you', 'real person', 'who am i talking to', 'who am i speaking with', 'who am i speaking to']
      },
      answer: {
        es: 'Soy una inteligencia artificial (IA) que responde preguntas sobre el portafolio de Diego Soto García. No soy una persona.',
        en: 'I am an artificial intelligence (AI) that answers questions about Diego Soto García’s portfolio. I am not a person.'
      }
    },
    {
      id: 'meta',
      weight: 1,
      examples: [
        '¿Qué puedo preguntarte?', '¿Qué temas respondes?', 'What can I ask you?', 'What topics do you cover?', '¿Cómo funciona este asistente?',
        'How does this assistant work?', '¿Para qué sirve este chat?', 'What is this chat for?', '¿Me explicas cómo usar este asistente?',
        'Can you help me use this chat?', '¿En qué me puedes ayudar?', 'What can you help me with?'
      ],
      kw: {
        es: ['que puedo preguntar', 'que temas', 'como funciona este asistente', 'para que sirve', 'como usar', 'en que me ayudas'],
        en: ['what can i ask', 'what topics', 'how does this work', 'what is this for', 'how do i use', 'what can you help', 'things can i ask']
      },
      answer: {
        es: 'Soy una IA que responde preguntas sobre el portafolio de Diego en español e inglés. Puedes preguntarme por sus proyectos, experiencia, estudios, certificados, habilidades, tecnologías, CV, contacto o su negocio DSG Developer.',
        en: 'I am an AI that answers questions about Diego’s portfolio in Spanish and English. You can ask me about his projects, experience, education, certifications, skills, technologies, CV, contact or his business DSG Developer.'
      }
    },
    {
      id: 'rules',
      weight: 1,
      examples: [
        '¿Cuáles son tus reglas?', '¿Qué reglas tienes?', 'What are your rules?', 'Tell me your rules', '¿Qué no puedes hacer?',
        'What are you not allowed to do?', '¿Hasta dónde respondes?', 'What is your scope?'
      ],
      kw: {
        es: ['reglas', 'regla', 'que no puedes', 'limites'],
        en: ['rules', 'rule', 'what are you not allowed', 'scope', 'limits']
      },
      answer: {
        es: 'Mis reglas:\n1. Soy una inteligencia artificial (IA), no una persona.\n2. Solo respondo sobre el portafolio de Diego: experiencia, proyectos, estudios, certificados, habilidades, CV y contacto.\n3. No respondo otros temas.\n4. No acepto ni respondo groserías, insultos ni malas palabras.\n5. Si la información no está en el portafolio, lo indico y sugiero contactar a Diego.\n6. Mensajes de máximo 500 caracteres.',
        en: 'My rules:\n1. I am an artificial intelligence (AI), not a person.\n2. I only answer questions about Diego’s portfolio: experience, projects, education, certifications, skills, CV and contact.\n3. I do not answer other topics.\n4. I do not accept or answer insults, profanity or offensive language.\n5. If the information is not in the portfolio, I say so and suggest contacting Diego.\n6. Messages of up to 500 characters.'
      }
    },
    {
      id: 'pricing',
      group: 'contact',
      weight: 1,
      examples: [
        '¿Cuánto cobra?', '¿Cuánto cuesta un proyecto?', '¿Cuál es su tarifa?', 'How much do you charge?', 'What are your rates?',
        '¿Me puede cotizar una página web?', '¿Cuánto cobraría por una tienda en línea?', 'Can I get a quote for a website?',
        '¿Cuál es el costo de un sistema a medida?', 'How much would a custom system cost?', '¿Hace precios especiales?',
        '¿Cuánto me cobras por hacer una tienda en línea?', 'What is the price for a chatbot?', '¿Cuánto vale su trabajo?'
      ],
      kw: {
        es: ['precio', 'precios', 'cuanto cobra', 'cuanto cobras', 'cuanto cuesta', 'costo', 'costos', 'cotizacion', 'cotizar', 'tarifa', 'presupuesto'],
        en: ['price', 'prices', 'pricing', 'cost', 'how much', 'quote', 'rate', 'rates', 'budget']
      },
      answer: {
        es: 'No tengo información de precios publicada en el portafolio. Para cotizar, escríbele a Diego: dieegoflame123@gmail.com o por WhatsApp al 56 3686 6429.',
        en: 'I don’t have pricing information published in the portfolio. To get a quote, write to Diego: dieegoflame123@gmail.com or on WhatsApp at 56 3686 6429.'
      }
    },
    {
      id: 'salary',
      group: 'contact',
      weight: 1,
      examples: [
        '¿Cuál es su sueldo esperado?', '¿Cuánto gana?', '¿Cuál es su salario?', 'What is his expected salary?', 'How much does he earn?',
        '¿Qué condiciones laborales ofrece?', 'What are his salary expectations?', '¿Cuánto pediría por trabajar con nosotros?'
      ],
      kw: {
        es: ['sueldo', 'salario', 'cuanto gana', 'sueldo esperado'],
        en: ['salary', 'expected salary', 'how much does he earn', 'compensation']
      },
      answer: {
        es: 'No tengo información de sueldo publicada en el portafolio. Para hablar de condiciones de trabajo, escríbele a Diego: dieegoflame123@gmail.com.',
        en: 'I don’t have salary information published in the portfolio. To discuss work conditions, write to Diego: dieegoflame123@gmail.com.'
      }
    },
    {
      id: 'certs',
      weight: 1,
      examples: [
        '¿Qué certificados tiene?', '¿Tiene certificación de AWS?', '¿Tiene cursos de Cisco?', 'Does he have certifications?', 'What courses has he completed?',
        '¿Tiene algún certificado de Anthropic?', 'Tell me about the Cisco certification', '¿Qué cursos de programación tiene?',
        '¿Tiene el curso de APIs de freeCodeCamp?', 'Did he finish any AWS course?', '¿Qué certificaciones tiene en redes?',
        '¿Tiene certificado de ciberseguridad?', 'What certificates does he hold?', '¿Cuáles son sus certificaciones?', 'Does he have a cloud certificate?',
        'Did he complete the Cisco course?', '¿Terminó el curso de Cisco?'
      ],
      kw: {
        es: ['certificado', 'certificados', 'certificacion', 'certificaciones', 'cursos', 'curso', 'ccna', 'cisco', 'aws', 'freecodecamp', 'anthropic', 'acreditacion'],
        en: ['certificate', 'certificates', 'certification', 'certifications', 'courses', 'course', 'ccna', 'cisco', 'aws', 'freecodecamp', 'anthropic']
      },
      answer: {
        es: 'Certificaciones:\n- CCNA + Ethical Hacker: Cybersecurity Fundamentals (Cisco Networking Academy, 2021 – 2025).\n- AWS Cloud Practitioner Essentials (AWS Skill Builder, 2026).\n- Back End Development and APIs (freeCodeCamp, 2026).\n- Building with the Claude API (Anthropic Academy, 2026).',
        en: 'Certifications:\n- CCNA + Ethical Hacker: Cybersecurity Fundamentals (Cisco Networking Academy, 2021 – 2025).\n- AWS Cloud Practitioner Essentials (AWS Skill Builder, 2026).\n- Back End Development and APIs (freeCodeCamp, 2026).\n- Building with the Claude API (Anthropic Academy, 2026).'
      }
    },
    {
      id: 'p1',
      group: 'project',
      weight: 2,
      examples: [
        '¿Qué sistema hizo para una empresa?', 'Háblame del proyecto de Garza Gas', '¿Qué hizo para la empresa privada?', 'Tell me about the client management system',
        'Did he build a system for a company?', '¿Hizo algún sistema de clientes?', '¿Qué hizo para la empresa Garza Gas?', '¿Qué sistema hizo para una empresa privada?',
        'What did he build for the private company?', '¿Qué hace el sistema de clientes?', 'Háblame de la gestión de clientes', 'Did he digitize client records?',
        '¿Qué pasó con el sistema de Garza?', 'Tell me about Garza Gas', '¿Qué es el sistema empresarial?', '¿De qué trata el sistema que hizo para la gasera?',
        '¿Qué sistema le hizo a la gasera?'
      ],
      kw: {
        es: ['gestion de clientes', 'garza gas', 'sistema web empresarial', 'sistema empresarial', 'clientes', 'empresa privada', 'gasera'],
        en: ['client management', 'garza gas', 'enterprise web', 'private company', 'clients']
      },
      answer: {
        es: 'Sistema Web Empresarial de Gestión de Clientes (Garza Gas), sep 2025 – ene 2026.\nDigitalizó el alta y consulta de clientes, eliminando el registro manual. Incluye autenticación segura con control de sesiones y un módulo CRUD completo. Está en producción y en uso activo por el equipo operativo.\nStack: PHP, MySQL, JavaScript, HTML5, CSS3.',
        en: 'Enterprise Web Client Management System (Garza Gas), Sep 2025 – Jan 2026.\nIt digitized the client registration and lookup workflow, eliminating manual records. It includes secure authentication with session control and a full CRUD module. It is in production and actively used by the operations team.\nStack: PHP, MySQL, JavaScript, HTML5, CSS3.'
      }
    },
    {
      id: 'p2',
      group: 'project',
      weight: 2,
      examples: [
        '¿Qué hizo para el TESCI?', 'Háblame de la plataforma de flotilla', '¿Cuál fue el proyecto institucional?', 'Tell me about the fleet platform',
        'Did he build something for a school?', '¿Qué sistema usa Recursos Materiales?', '¿Qué hizo para la flotilla vehicular?', 'What did he build for the TESCI?',
        '¿Hizo un sistema para controlar viajes?', 'Did he build a vehicle management system?', '¿Qué es la plataforma de flotilla?', 'Háblame del calendario de viajes',
        '¿Cuál fue el sistema que usó la escuela?', 'Tell me about the institutional project'
      ],
      kw: {
        es: ['flotilla', 'vehicular', 'vehiculos', 'viajes', 'recursos materiales', 'calendario', 'para el tesci', 'proyecto institucional'],
        en: ['fleet', 'vehicle', 'vehicles', 'trips', 'materials department', 'calendar', 'for the tesci', 'institutional project']
      },
      answer: {
        es: 'Plataforma de Gestión de Flotilla Vehicular para el TESCI (mar – jun 2025).\nFue adoptada oficialmente por el Departamento de Recursos Materiales para el control de viajes institucionales. Tiene un calendario interactivo con seguimiento de estados en tiempo real, que reemplazó el seguimiento en papel. Diego fue el único desarrollador y la entregó en plazo.\nStack: PHP, MySQL, JavaScript, HTML5, CSS3.',
        en: 'Vehicle Fleet Management Platform for TESCI (Mar – Jun 2025).\nIt was officially adopted by the Materials Department for institutional trip management. It has an interactive calendar with real-time status tracking, replacing paper-based follow-up. Diego was the only developer and delivered it on schedule.\nStack: PHP, MySQL, JavaScript, HTML5, CSS3.'
      }
    },
    {
      id: 'p3',
      group: 'project',
      weight: 2,
      examples: [
        '¿Hizo un sitio para un cliente de nutrición?', 'Háblame del proyecto de nutrición', '¿Tiene un panel de administración?', 'Tell me about the nutrition website',
        'Did he build a website with admin panel?', '¿Cuál es su proyecto freelance activo?', 'Háblame del sitio de Nutrición Inteligente', '¿Qué hizo para nutrición?',
        'Did he make a website for a nutrition client?', '¿Hizo un panel administrativo para un cliente?', '¿Qué es Nutrición Inteligente?', 'What is Nutrición Inteligente?',
        'Háblame del sitio de nutricion', 'Tell me about the nutrition project'
      ],
      kw: {
        es: ['nutricion', 'nutricion inteligente', 'panel administrativo', 'ognutricion'],
        en: ['nutrition', 'nutrition intelligent', 'admin panel', 'administrative panel']
      },
      answer: {
        es: 'Sitio Web con Panel Administrativo para Nutrición Inteligente (freelance, feb 2026).\nPlataforma con login seguro y panel de administración de usuarios para un cliente real. Está en producción y activa: ognutricionentrenamientointeligente.com.mx.\nStack: PHP, MySQL, JavaScript, HTML5, CSS3.',
        en: 'Website with Admin Panel for Nutrición Inteligente (freelance, Feb 2026).\nA platform with secure login and a user administration panel for a real client. It is live in production: ognutricionentrenamientointeligente.com.mx.\nStack: PHP, MySQL, JavaScript, HTML5, CSS3.'
      }
    },
    {
      id: 'p4',
      group: 'project',
      weight: 2,
      examples: [
        '¿Hizo una app para barberías?', 'Háblame de BarberApp', '¿Qué es BarberApp?', 'Tell me about the barber app', '¿Qué pasó con la app de barbería?',
        'Did he build an app for barbershops?', '¿Qué app hizo para un barbero?', 'Tell me about BarberApp', '¿Hizo una PWA?', 'Did he build a PWA?',
        '¿Qué hace la app de cortes y citas?', 'Did he build an app for haircuts?', '¿Qué sistema hizo para una barbería?', 'Háblame de la barbería'
      ],
      kw: {
        es: ['barber', 'barberia', 'barberapp', 'pwa', 'barbero', 'cortes de pelo', 'cortes'],
        en: ['barber', 'barbershop', 'barberapp', 'pwa', 'haircut', 'haircuts']
      },
      answer: {
        es: 'BarberApp es una PWA (aplicación web progresiva) para gestionar una barbería: citas, cortes, gastos, propinas y reparto de ganancias entre barbero y dueño. Funciona sin servidor ni hosting mensual y se instala en cualquier celular o computadora. Es un proyecto freelance que ya fue vendido. El portafolio no detalla su stack tecnológico.',
        en: 'BarberApp is a PWA (progressive web app) for managing a barbershop: appointments, haircuts, expenses, tips and profit-splitting between barber and owner. It runs without a server or monthly hosting and can be installed on any phone or computer. It is a freelance project that has already been sold. The portfolio does not detail its tech stack.'
      }
    },
    {
      id: 'stack',
      group: 'project',
      weight: 1,
      examples: [
        '¿Qué tecnologías usó en sus proyectos?', '¿Con qué stack hizo las apps?', 'What stack did he use?', '¿Con qué lenguajes hizo los sistemas?',
        'What technologies did he use in his projects?', '¿Qué usó para hacer el sitio de nutrición?', '¿Qué tecnologías tiene la plataforma de flotilla?',
        '¿Qué tecnologías usó en el sistema de Garza Gas?', 'Which stack is used in his projects?', '¿Qué base de datos usó en sus proyectos?',
        'En general, ¿con qué herramientas construyó sus sistemas?', 'Overall, what tools did he use to build his systems?',
        '¿Cuál usa más tecnología?', '¿Cuál de sus proyectos usa más tecnología?', 'Which project uses more technology?', 'Which one uses more technology?'
      ],
      kw: {
        es: ['stack', 'tecnologias de sus proyectos', 'con que hizo', 'que uso en sus proyectos', 'tecnologias uso', 'tecnologia uso', 'tecnologias usadas', 'tecnologias utilizadas', 'mas tecnologia', 'mas tecnologias'],
        en: ['stack', 'what did he use', 'which stack', 'technologies used', 'more technology', 'most technology', 'uses more technology']
      },
      answer: {
        es: 'Stack de sus proyectos:\n- Sistema de gestión de clientes (Garza Gas): PHP, MySQL, JavaScript, HTML5, CSS3.\n- Plataforma de flotilla vehicular (TESCI): PHP, MySQL, JavaScript, HTML5, CSS3.\n- Sitio con panel administrativo (Nutrición Inteligente): PHP, MySQL, JavaScript, HTML5, CSS3.\n- BarberApp: el portafolio no detalla su stack.',
        en: 'Stack of his projects:\n- Client management system (Garza Gas): PHP, MySQL, JavaScript, HTML5, CSS3.\n- Vehicle fleet platform (TESCI): PHP, MySQL, JavaScript, HTML5, CSS3.\n- Website with admin panel (Nutrición Inteligente): PHP, MySQL, JavaScript, HTML5, CSS3.\n- BarberApp: the portfolio does not detail its stack.'
      }
    },
    {
      id: 'first',
      group: 'project',
      weight: 2,
      examples: [
        '¿Cuál fue su primer proyecto?', '¿Cuál fue su primer proyecto freelance?', 'What was his first project?', '¿Cuál fue el primero que hizo?',
        '¿Cuál fue el primer trabajo que hizo como freelance?', 'What was his first freelance job?', '¿Cuál fue su primer sistema?', 'Which was the earliest project?',
        '¿Por dónde empezó con los proyectos?', 'Where did he start with projects?', '¿Cuál es el proyecto más antiguo?', 'What is his oldest project?'
      ],
      kw: {
        es: ['primer proyecto', 'primer proyecto freelance', 'primer freelance', 'primero'],
        en: ['first project', 'first freelance', 'first', 'earliest']
      },
      answer: {
        es: 'Con fecha publicada, el primer proyecto fue la Plataforma de Gestión de Flotilla Vehicular para el TESCI (mar – jun 2025). El primer proyecto freelance es el sitio con panel administrativo de Nutrición Inteligente (feb 2026), que sigue activo.',
        en: 'With a published date, the first project was the Vehicle Fleet Management Platform for TESCI (Mar – Jun 2025). The first freelance project is the website with admin panel for Nutrición Inteligente (Feb 2026), which is still live.'
      }
    },
    {
      id: 'recent',
      group: 'project',
      weight: 2,
      examples: [
        '¿Cuál es su proyecto más reciente?', 'What is his latest project?', '¿Cuál fue el último proyecto que hizo?', '¿Qué proyecto hizo más recientemente?',
        '¿Cuál es el proyecto que hizo más recientemente?', 'What was his most recent project?', '¿Cuál fue su último trabajo?', 'Which project is the newest?',
        '¿Qué hizo el año pasado?', 'What did he build most recently?', '¿Cuál es su proyecto actual?', '¿Qué está haciendo ahora?'
      ],
      kw: {
        es: ['mas reciente', 'ultimo proyecto', 'nuevo proyecto', 'reciente', 'ultimo'],
        en: ['most recent', 'latest', 'last project', 'newest', 'recent']
      },
      answer: {
        es: 'El proyecto más reciente con fecha publicada es el sitio con panel administrativo de Nutrición Inteligente (feb 2026). BarberApp también es un proyecto freelance, pero el portafolio no publica su fecha.',
        en: 'The most recent project with a published date is the website with admin panel for Nutrición Inteligente (Feb 2026). BarberApp is also a freelance project, but the portfolio does not publish its date.'
      }
    },
    {
      id: 'links',
      group: 'project',
      weight: 1,
      examples: [
        '¿Cuál es el sitio de Nutrición Inteligente?', '¿Tiene un sitio web en línea?', 'Do you have a link to his projects?', '¿Dónde veo sus proyectos en vivo?',
        'What is the website link?', '¿Cuál es el link de su negocio?', '¿Dónde está su página de DSG?', 'Give me his website',
        '¿Hay una liga de su GitHub?', 'Where can I see his projects live?', '¿Me das la URL del sitio?', 'Is there a demo I can open?'
      ],
      kw: {
        es: ['sitio web', 'link', 'liga', 'url', 'en vivo', 'pagina', 'en linea'],
        en: ['website', 'link', 'url', 'live', 'demo', 'online']
      },
      answer: {
        es: 'Enlaces:\n- Sitio de Nutrición Inteligente: ognutricionentrenamientointeligente.com.mx\n- DSG Developer: dsg-developer-mx.netlify.app\n- GitHub: github.com/Dieego1\n- LinkedIn: linkedin.com/in/diegosotogarciaia',
        en: 'Links:\n- Nutrición Inteligente website: ognutricionentrenamientointeligente.com.mx\n- DSG Developer: dsg-developer-mx.netlify.app\n- GitHub: github.com/Dieego1\n- LinkedIn: linkedin.com/in/diegosotogarciaia'
      }
    },
    {
      id: 'business',
      weight: 1,
      examples: [
        '¿Qué servicios ofrece su negocio?', '¿Qué es DSG Developer?', '¿Ofrece chatbots?', 'What services does he offer?', '¿Hace páginas web para empresas?',
        'Does he make Discord bots?', '¿Qué hace DSG?', 'What is DSG Developer?', '¿Hace sistemas a medida?', 'Does he build custom systems?',
        '¿Qué ofrece DSG Developer?', '¿Tiene su propio negocio?', 'Does he have his own business?', '¿Hace mantenimiento de sistemas?', '¿Hace bases de datos?'
      ],
      kw: {
        es: ['negocio', 'dsg', 'dsg developer', 'servicios', 'ofrece', 'ofreces', 'chatbot', 'chatbots', 'discord', 'mi negocio'],
        en: ['business', 'dsg', 'services', 'offer', 'offers', 'chatbot', 'chatbots', 'discord']
      },
      answer: {
        es: 'DSG Developer es la marca personal de Diego para servicios de desarrollo web profesional: páginas web, sistemas a medida, chatbots con inteligencia artificial, servidores de Discord, bases de datos y mantenimiento. Atiende a empresas, negocios y creadores de contenido en México y el extranjero.\nSitio: dsg-developer-mx.netlify.app',
        en: 'DSG Developer is Diego’s personal brand for professional web development services: websites, custom systems, AI chatbots, Discord servers, databases and maintenance. It serves companies, businesses and content creators in Mexico and abroad.\nSite: dsg-developer-mx.netlify.app'
      }
    },
    {
      id: 'education',
      weight: 1,
      examples: [
        '¿Dónde estudió?', '¿Está titulado?', '¿Qué carrera estudió?', 'What is his degree?', 'Did he graduate?', '¿En qué escuela se formó?', '¿Dónde se graduó?',
        '¿Tiene título universitario?', 'Is he a university graduate?', '¿Qué licenciatura tiene?', '¿Estudió sistemas?', 'Did he study computer science?',
        '¿Cuándo se graduó?', 'When did he graduate?', '¿Cuál es su formación académica?', 'What is his academic background?'
      ],
      kw: {
        es: ['estudio', 'estudios', 'escuela', 'universidad', 'tesci', 'carrera', 'educacion', 'egresado', 'titulado', 'titulacion', 'titulo', 'ingenieria', 'ingeniero'],
        en: ['study', 'studies', 'school', 'university', 'degree', 'education', 'graduated', 'graduate', 'college', 'engineering', 'engineer']
      },
      answer: {
        es: 'Ingeniería en Sistemas Computacionales en el TESCI (Tecnológico de Estudios Superiores de Cuautitlán Izcalli), periodo 2021 – 2026. Egresado en enero de 2026 y titulado.',
        en: 'Computer Systems Engineering at TESCI (Tecnológico de Estudios Superiores de Cuautitlán Izcalli), 2021 – 2026. Graduated in January 2026 and degree certified.'
      }
    },
    {
      id: 'experience',
      weight: 1,
      examples: [
        '¿Cuál es su experiencia laboral?', '¿Ha trabajado como freelance?', 'What is his work experience?', '¿Dónde ha trabajado?', '¿Tiene experiencia profesional?',
        '¿Ha trabajado en alguna empresa?', 'Has he worked for a company?', '¿Cuánta experiencia tiene?', 'How much experience does he have?',
        '¿Desde cuándo es freelance?', 'Since when is he freelance?', '¿Qué trabajos ha tenido?', 'What jobs has he had?'
      ],
      kw: {
        es: ['experiencia', 'trabajo', 'trabajos', 'empleo', 'laboral', 'freelance', 'trabajado', 'historial'],
        en: ['experience', 'work', 'job', 'employment', 'freelance', 'worked for', 'career']
      },
      answer: {
        es: 'Desarrollador Full Stack Jr. freelance desde septiembre de 2025, a través de DSG Developer. Ha desarrollado sistemas y apps web (backend, frontend, base de datos y despliegue) para empresas, instituciones y clientes freelance.\nProyectos en producción:\n- Sistema de gestión de clientes para Garza Gas (sep 2025 – ene 2026).\n- Plataforma de flotilla vehicular para el TESCI (mar – jun 2025).\n- Sitio con panel administrativo para Nutrición Inteligente (feb 2026).',
        en: 'Full Stack Jr. Developer, freelance since September 2025, through DSG Developer. He has built web systems and apps (backend, frontend, database and deployment) for companies, institutions and freelance clients.\nProduction projects:\n- Client management system for Garza Gas (Sep 2025 – Jan 2026).\n- Vehicle fleet platform for TESCI (Mar – Jun 2025).\n- Website with admin panel for Nutrición Inteligente (Feb 2026).'
      }
    },
    {
      id: 'duration',
      weight: 2,
      examples: [
        '¿Cuánto tiempo lleva programando?', '¿Cuántos meses lleva como desarrollador?', '¿Cuánto tiempo tiene de experiencia?',
        '¿Cuánto tiempo lleva en esto?', '¿Hace cuántos meses empezó?', 'How long has he been coding?',
        'How long has he been freelancing?', 'How much experience does he have in months?', 'How long has he been a developer?',
        'How long has he worked as a developer?', 'For how long has he been programming?', '¿Cuánto lleva programando?',
        '¿Hace cuánto empezó a programar?', '¿Desde cuándo empezó a desarrollar?', 'Since when has he been developing?',
        'How long ago did he start programming?', '¿Hace cuánto empezó en esto de desarrollar?', '¿Hace cuánto que se dedica a esto?'
      ],
      kw: {
        es: ['cuanto tiempo lleva', 'cuantos meses lleva', 'hace cuantos meses', 'cuanto lleva programando', 'cuanto lleva desarrollando',
          'hace cuanto empezo', 'desde cuando empezo'],
        en: ['how long has he', 'how many months has he', 'for how long', 'how long ago did he start']
      },
      answer: {
        es: 'Lleva programando profesionalmente como freelance desde septiembre de 2025.',
        en: 'He has been working professionally as a freelance developer since September 2025.'
      },
      dynamic: (L) => {
        const months = monthsSince('2025-09-01');
        return L === 'en'
          ? `He has been working as a freelance developer for about ${months} month${months === 1 ? '' : 's'} (since September 2025).`
          : `Lleva aproximadamente ${months} mes${months === 1 ? '' : 'es'} como desarrollador freelance (desde septiembre de 2025).`;
      }
    },
    {
      id: 'skills',
      weight: 1,
      examples: [
        '¿Qué tecnologías domina?', '¿Qué lenguajes de programación sabe?', '¿Qué frameworks usa?', 'What technologies does he know?', '¿Sabe bases de datos?',
        '¿Qué herramientas usa?', '¿Sabe programar en Python?', 'Does he know PHP?', '¿Qué tecnologías conoce?', 'What programming languages does he use?',
        '¿Sabe JavaScript?', 'Does he know SQL?', '¿Qué habilidades técnicas tiene?', 'What are his technical skills?', '¿Usa Git?', 'Does he use Docker?',
        '¿Qué sabe hacer?', 'What can he do?', '¿Sabe Java?', '¿Qué tan bueno es en programación?'
      ],
      kw: {
        es: ['habilidades', 'tecnologias', 'tecnologia', 'stack', 'skills', 'lenguajes', 'herramientas', 'frameworks', 'bases de datos', 'conceptos', 'ia aplicada', 'sabe programar', 'que sabe', 'sabe'],
        en: ['skills', 'technologies', 'technology', 'tech stack', 'languages', 'tools', 'frameworks', 'databases', 'concepts', 'what can he do', 'what does he know', 'know']
      },
      answer: {
        es: 'Lenguajes: PHP, Python, JavaScript, HTML5, CSS3, SQL y Java.\nBases de datos: MySQL y MongoDB.\nFrameworks y librerías: AngularJS y Bootstrap.\nHerramientas: Git, GitHub, VS Code y XAMPP.\nConceptos: APIs REST, POO, autenticación JWT, MVC, CRUD y Scrum.\nIA aplicada: Claude (Anthropic) y GitHub Copilot para depurar, revisar y optimizar código.',
        en: 'Languages: PHP, Python, JavaScript, HTML5, CSS3, SQL and Java.\nDatabases: MySQL and MongoDB.\nFrameworks and libraries: AngularJS and Bootstrap.\nTools: Git, GitHub, VS Code and XAMPP.\nConcepts: REST APIs, OOP, JWT authentication, MVC, CRUD and Scrum.\nApplied AI: Claude (Anthropic) and GitHub Copilot for debugging, code review and optimization.'
      }
    },
    {
      id: 'teamwork',
      weight: 2,
      examples: [
        '¿Trabaja en equipo?', '¿Sabe trabajar en equipo?', 'Does he work well in a team?', '¿Usa metodologías ágiles?', 'Is he good at teamwork?',
        '¿Es buen compañero de equipo?', '¿Sabe colaborar con otros?', 'Can he collaborate with others?', '¿Trabaja con Scrum?', 'Does he use Scrum?',
        '¿Trabaja solo o en grupo?', 'Does he work alone or in a group?', '¿Qué tal es en equipo?', 'How is he as a team member?'
      ],
      kw: {
        es: ['trabajo en equipo', 'trabajar en equipo', 'en equipo', 'equipo', 'colaborativo', 'colaborativa', 'colaboracion', 'scrum'],
        en: ['teamwork', 'team', 'collaborate', 'collaboration', 'collaborative', 'work in a team', 'working in a team']
      },
      answer: {
        es: 'Diego trabaja con flujos colaborativos: ha usado Scrum para organizar el trabajo, y Git y GitHub para el control de versiones y el trabajo colaborativo en el código. El portafolio no detalla más sobre su trabajo en equipo; para eso, escríbele a Diego.',
        en: 'Diego works in collaborative workflows: he has used Scrum to organize work, and Git and GitHub for version control and collaborative coding. The portfolio does not go into more detail about teamwork; for that, write to Diego.'
      }
    },
    {
      id: 'languages',
      weight: 1,
      examples: [
        '¿Qué idiomas habla?', '¿Habla inglés?', 'What languages does he speak?', '¿Qué nivel de inglés tiene?', '¿Qué lenguajes habla?',
        'Does he speak English?', '¿Habla español?', 'What is his English level?', '¿Qué idiomas domina?', 'Which languages does he know?'
      ],
      kw: {
        es: ['idiomas', 'idioma', 'ingles', 'espanol', 'habla'],
        en: ['languages', 'language', 'english', 'spanish', 'speak']
      },
      answer: {
        es: 'Español: nativo. Inglés: intermedio, nivel B1 (lectura fluida de documentación técnica).',
        en: 'Spanish: native. English: intermediate, B1 level (fluent reading of technical documentation).'
      }
    },
    {
      id: 'cv',
      weight: 1,
      examples: [
        '¿Tiene CV?', '¿Dónde descargo su currículum?', 'Can I see his resume?', '¿Puedo ver su CV en inglés?', '¿Dónde puedo leer su currículum?',
        '¿Hay un PDF de su perfil?', 'Is there a PDF of his profile?', '¿Me mandas su CV?', 'Do you have his CV?', '¿Dónde está la hoja de vida?',
        'Where can I download his CV?', '¿Tiene versión en inglés del CV?', 'Does he have an English resume?',
        '¿Tiene un documento descargable con su experiencia?', '¿Dónde descargo un documento con su experiencia y estudios?'
      ],
      kw: {
        es: ['cv', 'cvs', 'curriculum', 'curriculum vitae', 'descargar', 'pdf', 'hoja de vida'],
        en: ['cv', 'cvs', 'resume', 'curriculum', 'download', 'pdf']
      },
      answer: {
        es: 'El CV está en la sección "CV" del portafolio, en español e inglés, y puedes descargarlo o abrirlo en otra pestaña. Incluye perfil profesional, habilidades técnicas, proyectos en producción y educación.',
        en: 'The CV is in the "CV" section of the portfolio, in Spanish and English, and you can download it or open it in another tab. It includes professional profile, technical skills, production projects and education.'
      }
    },
    {
      id: 'contact',
      group: 'contact',
      weight: 1,
      examples: [
        '¿Cómo lo contacto?', '¿Cuál es su correo?', '¿Tiene WhatsApp?', 'How can I contact him?', 'What is his email?', '¿Dónde lo encuentro en LinkedIn?',
        '¿Cómo puedo escribirle?', '¿Cuál es su teléfono?', 'What is his phone number?', '¿Cómo le hablo?', 'How do I reach him?', '¿Tiene correo electrónico?',
        '¿Me da su número?', 'Can I get his number?', '¿Dónde puedo mandarle un mensaje?', 'Where can I message him?', '¿Cuál es su GitHub?', '¿Tiene LinkedIn?'
      ],
      kw: {
        es: ['contacto', 'contactar', 'contactarlo', 'contactarle', 'correo', 'email', 'mail', 'telefono', 'celular', 'numero', 'whatsapp', 'linkedin', 'github', 'escribirle', 'llamar'],
        en: ['contact', 'reach', 'email', 'mail', 'phone', 'number', 'whatsapp', 'linkedin', 'github', 'get in touch']
      },
      answer: {
        es: 'Puedes contactar a Diego por:\n- Correo: dieegoflame123@gmail.com\n- Teléfono: 56 3686 6429\n- WhatsApp: wa.me/5215636866429\n- LinkedIn: linkedin.com/in/diegosotogarciaia\n- GitHub: github.com/Dieego1',
        en: 'You can contact Diego through:\n- Email: dieegoflame123@gmail.com\n- Phone: 56 3686 6429\n- WhatsApp: wa.me/5215636866429\n- LinkedIn: linkedin.com/in/diegosotogarciaia\n- GitHub: github.com/Dieego1'
      }
    },
    {
      id: 'availability',
      group: 'contact',
      weight: 1,
      examples: [
        '¿Está disponible para trabajar?', '¿Lo puedo contratar?', 'Is he available to hire?', '¿Puede empezar ya?', 'Is he available to start now?',
        '¿Tiene oportunidades laborales abiertas?', '¿Está buscando trabajo?', 'Is he looking for a job?', '¿Puede empezar la próxima semana?',
        'Is he open to new opportunities?', '¿Lo podemos contratar para un proyecto?', '¿Está libre para un nuevo trabajo?'
      ],
      kw: {
        es: ['disponible', 'disponibilidad', 'contratar', 'contratarlo', 'contratacion', 'trabajar con', 'oportunidad', 'vacante', 'reclutar'],
        en: ['available', 'availability', 'hire', 'hiring', 'opportunity', 'work with him']
      },
      answer: {
        es: 'Diego tiene disponibilidad inmediata y vive en Estado de México / CDMX. Para contratarlo o hablar de una oportunidad, escríbele a dieegoflame123@gmail.com o por WhatsApp al 56 3686 6429.',
        en: 'Diego is available immediately and lives in Estado de México / CDMX. To hire him or talk about an opportunity, write to dieegoflame123@gmail.com or on WhatsApp at 56 3686 6429.'
      }
    },
    {
      id: 'location',
      weight: 1,
      examples: [
        '¿Dónde vive?', '¿En qué ciudad está?', 'Where is he located?', '¿Vive en CDMX?', '¿En qué estado vive?', 'Where does he live?',
        '¿Es de la Ciudad de México?', 'Is he from Mexico City?', '¿Vive cerca de Cuautitlán?', '¿Trabaja presencial o remoto?', 'Does he work remotely?',
        '¿De dónde es?', 'Where is he from?', '¿En qué parte de la república vive?', '¿En qué parte de México radica?',
        'Which part of Mexico does he live in?', 'Where in the country is he based?'
      ],
      kw: {
        es: ['ubicacion', 'donde vive', 'donde esta', 'de donde', 'ciudad', 'radica', 'radicando', 'parte de la republica', 'parte de mexico'],
        en: ['location', 'where is he', 'where does he live', 'city', 'based', 'part of mexico', 'part of the country']
      },
      answer: {
        es: 'Diego vive en Estado de México / CDMX, México.',
        en: 'Diego lives in Estado de México / CDMX, Mexico.'
      }
    },
    {
      id: 'profile',
      weight: 1,
      examples: [
        '¿Quién es Diego?', 'Háblame de Diego', 'Who is Diego?', 'Tell me about him', '¿Cuál es su perfil?', '¿Quién es este programador?',
        'Give me a summary of him', 'Dame un resumen de él', '¿Cómo se describe?', 'Who is this developer?', '¿Qué tipo de persona es?', 'Introduce him to me'
      ],
      kw: {
        es: ['quien es diego', 'quien es', 'sobre diego', 'perfil', 'presentate', 'cuentame de diego', 'resumen', 'dame un resumen'],
        en: ['who is diego', 'who is he', 'about diego', 'profile', 'tell me about diego', 'introduce', 'summary', 'give me a summary']
      },
      answer: {
        es: 'Diego Soto García es Desarrollador Full Stack Jr. e Ingeniero en Sistemas Computacionales. Egresado del TESCI en enero de 2026 y titulado. Tiene proyectos en producción para una empresa privada, una institución y un cliente freelance, y dirige su marca DSG Developer. Vive en Estado de México / CDMX y tiene disponibilidad inmediata.',
        en: 'Diego Soto García is a Full Stack Jr. Developer and Computer Systems Engineer. He graduated from TESCI in January 2026 and holds his degree. He has production projects for a private company, an institution and a freelance client, and runs his brand DSG Developer. He lives in Estado de México / CDMX and is available immediately.'
      }
    },
    {
      id: 'projects',
      group: 'project',
      weight: 1,
      examples: [
        '¿Qué proyectos tiene?', '¿Qué ha construido?', 'Show me his projects', 'What has he built?', 'What projects has he built?', 'What projects has he done?', 'Which projects has he worked on?', '¿Cuáles son sus proyectos en producción?',
        '¿Qué sistemas ha desarrollado?', '¿Qué ha hecho?', 'What projects does he have?', '¿Qué apps ha hecho?', 'List his projects',
        '¿Cuántos proyectos tiene?', 'How many projects does he have?', '¿Qué trabajos ha entregado?', 'Which systems has he delivered?',
        '¿Qué cosas ha desarrollado en total?', 'What has he developed in total overall?',
        '¿Qué proyectos ha hecho Diego?', 'What projects has Diego built?'
      ],
      kw: {
        es: ['proyecto', 'proyectos', 'sistemas', 'apps', 'aplicaciones', 'que ha hecho', 'que ha construido', 'portafolio'],
        en: ['project', 'projects', 'systems', 'apps', 'applications', 'what has he built', 'portfolio', 'built']
      },
      answer: {
        es: 'Proyectos del portafolio:\n1. Sistema de gestión de clientes (Garza Gas): empresa privada, en producción.\n2. Plataforma de flotilla vehicular: TESCI, adoptada oficialmente por Recursos Materiales.\n3. Sitio con panel administrativo: Nutrición Inteligente (freelance), activo.\n4. BarberApp: PWA para barberías (freelance), vendido.\n\nPregúntame por cualquiera para ver los detalles.',
        en: 'Projects in the portfolio:\n1. Client management system (Garza Gas): private company, in production.\n2. Vehicle fleet platform: TESCI, officially adopted by the Materials Department.\n3. Website with admin panel: Nutrición Inteligente (freelance), live.\n4. BarberApp: PWA for barbershops (freelance), sold.\n\nAsk me about any of them for details.'
      }
    },
    {
      id: 'greeting',
      weight: 0.5,
      examples: ['Hola', 'Buenas tardes', 'Hi', 'Hello there', 'Buenos días', 'Hola, ¿qué tal?', 'Hey', 'Good morning', 'Qué onda', 'Buenas noches'],
      kw: {
        es: ['hola', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches', 'que tal', 'que onda'],
        en: ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening']
      },
      answer: {
        es: '¡Hola! Pregúntame lo que quieras sobre Diego: proyectos, experiencia, estudios, certificados, habilidades, CV o contacto.',
        en: 'Hi! Ask me anything about Diego: projects, experience, education, certifications, skills, CV or contact.'
      }
    }
  ];

  DATA.forEach(e => {
    e.keywords = [...new Set([...e.kw.es, ...e.kw.en].map(normalize))];
  });

  const BY_ID = Object.fromEntries(DATA.map(e => [e.id, e]));

  const MISS_KEY = 'bot-unanswered';
  const MISS_MAX = 200;

  function logMiss(text, lang) {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(MISS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      arr.push({ q: text, lang, t: new Date().toISOString() });
      while (arr.length > MISS_MAX) arr.shift();
      localStorage.setItem(MISS_KEY, JSON.stringify(arr));
    } catch {}
  }

  function getMissedQuestions() {
    try {
      const raw = localStorage.getItem(MISS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function clearMissedQuestions() {
    try { localStorage.removeItem(MISS_KEY); } catch {}
  }

  function missingNote(names, L) {
    const list = names.join(', ');
    return L === 'en'
      ? `I can’t find ${list} in Diego’s portfolio.`
      : `No encuentro ${list} en el portafolio de Diego.`;
  }

  function answerText(entry, L) {
    return entry.dynamic ? entry.dynamic(L) : entry.answer[L];
  }

  // "primero/primera/ultimo/ultima" se dejan fuera a proposito: esas palabras ya resuelven
  // bien solas contra los temas "first"/"recent", tratarlas como genericas les haria perder
  // esa precision.
  const GENERIC_FOLLOWUP_WORDS = new Set(['eso', 'esa', 'ese', 'otro', 'otra', 'segundo', 'segunda',
    'tercero', 'tercera', 'cuarto', 'cuarta', 'tambien',
    'and', 'that', 'it', 'other', 'second', 'third', 'fourth', 'more', 'else', 'too']);

  const GENERIC_FOLLOWUP_PHRASES = [
    'y el segundo', 'y la segunda', 'y el tercero', 'y la tercera', 'y el cuarto', 'y la cuarta',
    'y el otro', 'y la otra', 'del otro', 'de los otros', 'que hay del otro', 'cuentame mas',
    'dame mas detalles', 'mas detalles', 'y ese', 'y esa', 'y eso', 'what about the other',
    'what about that', 'what about the third', 'what about the fourth', 'tell me more', 'more details',
    'and the second', 'and the third', 'and the fourth', 'and that one', 'what about it'
  ].map(normalize);

  // Mismo motivo que arriba: si la frase de seguimiento, aunque tenga una muletilla generica
  // como "tell me more"/"cuentame mas", tambien menciona una de estas palabras que ya resuelven
  // bien solas (p.ej. "tell me more about the first one"), se deja que el ranking normal gane
  // en vez de taparlo con el tema anterior.
  const STRONG_FOLLOWUP_OVERRIDES = new Set(['first', 'earliest', 'recent', 'latest', 'newest',
    'primero', 'primera', 'ultimo', 'ultima', 'reciente']);

  // Una frase "generica" de seguimiento no tiene contenido propio (nombres, temas) que el
  // modelo pueda rankear con confianza por si sola, asi que en vez de dejar que el modelo
  // adivine (puede aterrizar en cualquier tema corto por pura coincidencia de estilo, como
  // "cuentame mas" pareciendose a un saludo), se usa directo el tema de la pregunta anterior.
  function isGenericFollowUp(text) {
    const q = normalize(text);
    const tokens = q.split(' ').filter(Boolean);
    if (tokens.some(t => STRONG_FOLLOWUP_OVERRIDES.has(t))) return false;
    if (tokens.length > 0 && tokens.length <= 3 && tokens.some(t => GENERIC_FOLLOWUP_WORDS.has(t))) return true;
    return GENERIC_FOLLOWUP_PHRASES.some(p => (' ' + q + ' ').includes(' ' + p + ' '));
  }

  function monthsSince(fromISO) {
    const from = new Date(fromISO + 'T00:00:00');
    const now = new Date();
    let months = (now.getFullYear() - from.getFullYear()) * 12 + (now.getMonth() - from.getMonth());
    if (now.getDate() < from.getDate()) months -= 1;
    return Math.max(months, 0);
  }

  function scoreEntry(entry, q, knownTech) {
    let score = 0;
    for (const k of entry.keywords) {
      if (hasPhrase(q, k)) score += k.split(' ').length;
    }
    score *= entry.weight;
    if (entry.id === 'skills') score += knownTech * 3;
    return score;
  }

  function missingTech(q) {
    const known = TECH_KNOWN.filter(k => hasPhrase(q, k)).length;
    const missing = TECH_UNKNOWN.filter(([k]) => hasPhrase(q, k)).map(([, name]) => name);
    return { known, missing };
  }

  function answer(question, lang, context) {
    const text = String(question || '').trim().slice(0, 500);
    const L = detectLang(text, lang === 'en' ? 'en' : 'es');
    if (!text) return { text: OUT[L], blocked: false, topicId: null };
    if (isOffensive(text)) return { text: BLOCK[L], blocked: true, topicId: null };

    const q = normalize(text);
    const { known, missing } = missingTech(q);
    const hasContext = !!(context && context.lastTopicId && BY_ID[context.lastTopicId]);

    if (hasContext && isGenericFollowUp(text)) {
      const topicId = context.lastTopicId;
      const parts = [];
      if (missing.length) parts.push(missingNote(missing, L));
      parts.push(answerText(BY_ID[topicId], L));
      return { text: parts.join('\n\n'), blocked: false, topicId };
    }

    const ranked = DATA
      .map(entry => ({ entry, score: scoreEntry(entry, q, known) }))
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score);

    const parts = [];
    let topicId = null;
    if (missing.length && known === 0) {
      parts.push(missingNote(missing, L));
      parts.push(answerText(BY_ID.skills, L));
      topicId = 'skills';
    } else if (ranked.length > 0) {
      const [first, second] = ranked;
      topicId = first.entry.id;
      if (missing.length) parts.push(missingNote(missing, L));
      parts.push(answerText(first.entry, L));
      const combine = second
        && second.score >= 1
        && second.score >= first.score * 0.5
        && first.entry.id !== 'greeting'
        && second.entry.id !== 'greeting'
        && !(first.entry.group && first.entry.group === second.entry.group);
      if (combine) parts.push(answerText(second.entry, L));
    } else if (hasContext) {
      topicId = context.lastTopicId;
      parts.push(answerText(BY_ID[topicId], L));
    } else {
      logMiss(text, L);
      return { text: OUT[L], blocked: false, topicId: null };
    }
    return { text: parts.join('\n\n'), blocked: false, topicId };
  }

  const WORKER_SRC = `
    import { pipeline } from '${TRANSFORMERS_URL}';
    let extractor = null;
    const topicVecs = [];
    const bankVecs = [];
    const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
    const embed = async (t) => (await extractor(t, { pooling: 'mean', normalize: true })).data;
    self.onmessage = async (e) => {
      const m = e.data;
      try {
        if (m.type === 'init') {
          extractor = await pipeline('feature-extraction', m.model, {
            dtype: 'q8',
            progress_callback: (p) => self.postMessage({ type: 'progress', p: { status: p.status, progress: p.progress, file: p.file } })
          });
          for (const t of m.topics) topicVecs.push({ id: t.id, vec: await embed(t.text) });
          for (const t of m.bank) bankVecs.push(await embed(t));
          self.postMessage({ type: 'ready' });
        } else if (m.type === 'rank') {
          const qv = await embed(m.text);
          const best = {};
          for (const { id, vec } of topicVecs) {
            const s = dot(qv, vec);
            if (best[id] === undefined || s > best[id]) best[id] = s;
          }
          const topics = Object.entries(best).map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score);
          const off = Math.max(...bankVecs.map(v => dot(qv, v)));
          self.postMessage({ type: 'rank', reqId: m.reqId, topics, off });
        }
      } catch (err) {
        self.postMessage({ type: 'error', reqId: m.reqId, message: String((err && err.message) || err) });
      }
    };
  `;

  const TOPIC_TEXTS = DATA.flatMap(e => e.examples.map(text => ({ id: e.id, text })));

  const progressListeners = [];

  const STALL_MS = 90000;

  function startWorkerEngine() {
    return new Promise((resolve, reject) => {
      const blob = new Blob([WORKER_SRC], { type: 'text/javascript' });
      const worker = new Worker(URL.createObjectURL(blob), { type: 'module' });
      const pending = new Map();
      let reqSeq = 0;
      let stall = null;
      let ready = false;
      let dead = false;

      const fail = (err) => {
        dead = true;
        clearTimeout(stall);
        worker.terminate();
        pending.forEach(p => p.reject(err));
        pending.clear();
        if (!ready) reject(err);
      };
      const arm = () => {
        clearTimeout(stall);
        stall = setTimeout(() => fail(new Error('sin progreso')), STALL_MS);
      };

      worker.onerror = () => fail(new Error('worker'));
      worker.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'progress') {
          arm();
          progressListeners.forEach(f => f(m.p));
        } else if (m.type === 'ready') {
          ready = true;
          clearTimeout(stall);
          resolve({
            rank(text) {
              if (dead) return Promise.reject(new Error('worker caído'));
              const reqId = ++reqSeq;
              return new Promise((res, rej) => {
                pending.set(reqId, { resolve: res, reject: rej });
                worker.postMessage({ type: 'rank', reqId, text });
              });
            }
          });
        } else if (m.type === 'rank') {
          const r = pending.get(m.reqId);
          if (r) { pending.delete(m.reqId); r.resolve({ topics: m.topics, off: m.off }); }
        } else if (m.type === 'error') {
          if (m.reqId === undefined) { fail(new Error(m.message)); return; }
          const r = pending.get(m.reqId);
          if (r) { pending.delete(m.reqId); r.reject(new Error(m.message)); }
        }
      };
      arm();
      worker.postMessage({ type: 'init', model: MODEL, topics: TOPIC_TEXTS, bank: OFF_TOPIC_BANK });
    });
  }

  async function startMainThreadEngine() {
    const tf = await import(TRANSFORMERS_URL);
    const extractor = await tf.pipeline('feature-extraction', MODEL, {
      dtype: 'q8',
      progress_callback: (p) => progressListeners.forEach(f => f(p))
    });
    const embed = async (t) => (await extractor(t, { pooling: 'mean', normalize: true })).data;
    const dot = (a, b) => {
      let s = 0;
      for (let i = 0; i < a.length; i++) s += a[i] * b[i];
      return s;
    };
    const topicVecs = [];
    for (const t of TOPIC_TEXTS) topicVecs.push({ id: t.id, vec: await embed(t.text) });
    const bankVecs = [];
    for (const t of OFF_TOPIC_BANK) bankVecs.push(await embed(t));
    return {
      async rank(text) {
        const qv = await embed(text);
        const best = {};
        for (const { id, vec } of topicVecs) {
          const s = dot(qv, vec);
          if (best[id] === undefined || s > best[id]) best[id] = s;
        }
        const topics = Object.entries(best).map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score);
        const off = Math.max(...bankVecs.map(v => dot(qv, v)));
        return { topics, off };
      }
    };
  }

  async function answerAsync(question, lang, engine, context) {
    if (!engine) return answer(question, lang, context);
    const text = String(question || '').trim().slice(0, 500);
    const L = detectLang(text, lang === 'en' ? 'en' : 'es');
    if (!text) return { text: OUT[L], blocked: false, topicId: null };
    if (isOffensive(text)) return { text: BLOCK[L], blocked: true, topicId: null };

    const { known, missing } = missingTech(normalize(text));
    if (missing.length && known === 0) {
      return { text: [missingNote(missing, L), answerText(BY_ID.skills, L)].join('\n\n'), blocked: false, topicId: 'skills' };
    }

    const hasContext = !!(context && context.lastTopicId && BY_ID[context.lastTopicId]);

    if (hasContext && isGenericFollowUp(text)) {
      const topicId = context.lastTopicId;
      const parts = [];
      if (missing.length) parts.push(missingNote(missing, L));
      parts.push(answerText(BY_ID[topicId], L));
      return { text: parts.join('\n\n'), blocked: false, topicId };
    }

    let ranking;
    try {
      ranking = await engine.rank(text);
    } catch (err) {
      return answer(text, lang, context);
    }
    const { topics, off } = ranking;
    const [first, second] = topics;
    const standsAlone = !!(first && first.score >= ACCEPT_MIN && first.score >= off + MARGIN);

    let topicId;
    if (standsAlone) {
      topicId = first.id;
    } else if (hasContext) {
      topicId = context.lastTopicId;
    } else {
      logMiss(text, L);
      return { text: OUT[L], blocked: false, topicId: null };
    }

    const parts = [];
    if (missing.length) parts.push(missingNote(missing, L));
    const firstEntry = BY_ID[topicId];
    parts.push(answerText(firstEntry, L));
    if (standsAlone) {
      const secondEntry = second && BY_ID[second.id];
      const combine = secondEntry
        && second.score >= COMBINE_MIN
        && first.id !== 'greeting'
        && second.id !== 'greeting'
        && !(firstEntry.group && firstEntry.group === secondEntry.group);
      if (combine) parts.push(answerText(secondEntry, L));
    }
    return { text: parts.join('\n\n'), blocked: false, topicId };
  }

  let enginePromise = null;

  async function loadEngine() {
    try {
      return await startWorkerEngine();
    } catch (err) {
      return await startMainThreadEngine();
    }
  }

  function preload(onProgress) {
    if (onProgress) progressListeners.push(onProgress);
    if (!enginePromise) {
      enginePromise = loadEngine().catch(() => null);
    }
    return enginePromise;
  }

  const api = { answer, answerAsync, detectLang, isOffensive, normalize, preload, getMissedQuestions, clearMissedQuestions, OFF_TOPIC_BANK, DATA, ACCEPT_MIN, MARGIN, COMBINE_MIN };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    window.PortfolioAssistant = api;
  }
})();
