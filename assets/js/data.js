/* =====================================================================
   data.js — single source of truth for all portfolio content.
   Rendered into the page by app.js (renderSkills / renderExperience /
   renderProjects / renderAchievements). Edit here, not in markup.
   ===================================================================== */

window.PROFILE = {
  identity: {
    name: 'Syed Abdul Kareem',
    role: 'Full Stack Software Engineer',
    tagline: 'MEAN · AWS · Jenkins · Generative AI · SaaS · CRM & Q2C',
    sub: '3+ years building enterprise SaaS platforms with Angular, Node.js, MySQL & Generative AI.',
    location: 'Hyderabad, India',
    email: 'syedazeeem.13@gmail.com',
    phone: '+91 93912 45975',
    linkedin: 'https://www.linkedin.com/in/syed-abdul-kareem-b33519200/',
    github: 'https://github.com/SyedAbdulKareem13',
  },

  /* ---- Skills: grouped technology constellation ---- */
  skills: [
    { group: 'Frontend',        accent: 'v', items: ['Angular', 'React', 'Next.js', 'TypeScript', 'RxJS', 'Micro-Frontend', 'Custom Reactive Forms', 'Change Detection Optimization'] },
    { group: 'Backend',         accent: 'c', items: ['Node.js', 'Express.js', 'REST APIs', 'JWT / Passport.js', 'API Gateway', 'Microservices', 'Multi-DB'] },
    { group: 'Databases',       accent: 'v', items: ['MySQL', 'MongoDB', 'RDS'] },
    { group: 'DevOps',          accent: 'c', items: ['Docker', 'Jenkins', 'Azure Pipelines', 'AWS (S3, EC2)', 'Git', 'Bitbucket'] },
    { group: 'AI & Automation', accent: 'v', items: ['OpenAI API', 'LangChain', 'LLMs', 'Prompt Engineering', 'WebSockets', 'Generative AI'] },
    { group: 'SaaS / Enterprise', accent: 'c', items: ['Multi-Tenant', 'RBAC', 'Configurable UI', 'Audit Trail'] },
  ],

  /* ---- Experience: pinned timeline ---- */
  experience: [
    {
      role: 'Software Developer',
      org: 'KEBS — Kaar Enterprise Business Suites',
      period: 'Dec 2022 — Present',
      tag: 'Full-time',
      points: [
        'Owned the CRM Suite frontend across ~30 sprints, shipping production features in 4–5 days with low tech debt.',
        'Architected the Quote Builder (Deal Management System) with dynamic reactive forms and automated Revenue / Cost / GM% via RxJS.',
        'Led the CRM revamp & Quote-to-Cash (Q2C) integration with automated project mapping.',
        'Built reusable private Angular libraries (@kebs-lib/ui, @kebs-lib/forms) consumed across teams.',
      ],
    },
    {
      role: 'ML Engineer Intern',
      org: 'Ericsson',
      period: 'Jul 2022 — Sep 2022',
      tag: 'Internship',
      points: [
        'Performed statistical analysis, data cleaning and validation on large telecom datasets.',
        'Built insight visualizations to surface trends for engineering stakeholders.',
      ],
    },
    {
      role: 'B.Tech, Information Technology',
      org: 'Puducherry Technological University',
      period: '2019 — 2023',
      tag: 'Education',
      points: [
        'Bachelor of Technology in Information Technology.',
      ],
    },
  ],

  /* ---- Projects: real GitHub work + the featured KEBS enterprise build ----
     Each card "redirects" via its links. KEBS is proprietary, so it points to
     LinkedIn; the rest point to live demos + source on GitHub.            */
  projects: [
    {
      title: 'KEBS — CRM Suite & Quote Builder',
      blurb: 'Enterprise Quote Management integrated with CRM / ERP / Project. Dynamic reactive forms, automated Revenue / Cost / GM% via RxJS, multi-level approvals, and reusable private Angular libraries powering a multi-tenant SaaS.',
      tags: ['Angular', 'RxJS', 'Dynamic Config Engine', 'Low-Code', 'Private NPM', 'Q2C'],
      featured: true,
      proprietary: true,
      links: [{ label: 'LinkedIn', href: 'https://www.linkedin.com/in/syed-abdul-kareem-b33519200/', type: 'linkedin' }],
    },
    {
      title: 'Manzil One',
      blurb: 'Multi-tenant CRM & quotation platform: lead-to-quote pipeline, RFQs, live margin math and multi-step approvals — the SaaS architecture I specialise in, built end-to-end.',
      tags: ['TypeScript', 'Next.js', 'Supabase', 'Multi-Tenant', 'CRM'],
      featured: true,
      links: [
        { label: 'Live', href: 'https://manzilone.vercel.app', type: 'live' },
        { label: 'Code', href: 'https://github.com/SyedAbdulKareem13/manzilone', type: 'code' },
      ],
    },
    {
      title: 'SyncWave',
      blurb: 'Real-time synchronized listening on the web — press play once and every device stays on the same beat, powered by realtime WebSocket fan-out.',
      tags: ['TypeScript', 'Next.js', 'Realtime', 'WebSockets'],
      links: [
        { label: 'Live', href: 'https://syncwave-web-kappa.vercel.app', type: 'live' },
        { label: 'Code', href: 'https://github.com/SyedAbdulKareem13/syncwave-web', type: 'code' },
      ],
    },
    {
      title: 'Smart Umrah',
      blurb: 'A luxury Umrah-booking frontend with pixel-perfect design implementation — premium motion, glass surfaces and a cinematic booking flow.',
      tags: ['TypeScript', 'Next.js', 'Design Systems', 'Motion'],
      links: [
        { label: 'Live', href: 'https://smart-umrah.vercel.app', type: 'live' },
        { label: 'Code', href: 'https://github.com/SyedAbdulKareem13/smart-umrah', type: 'code' },
      ],
    },
    {
      title: 'Jarvis',
      blurb: 'A Python desktop voice assistant: speech control, web automation, email / WhatsApp messaging and face recognition — an early dive into automation & AI.',
      tags: ['Python', 'Automation', 'Speech', 'Computer Vision'],
      links: [
        { label: 'Code', href: 'https://github.com/SyedAbdulKareem13/Jarvis', type: 'code' },
      ],
    },
    {
      title: 'CRM Mini',
      blurb: 'The early multi-tenant CRM build that grew into Manzil One — lean lead & quote management exploring the tenancy and approval patterns up front.',
      tags: ['TypeScript', 'CRM', 'Multi-Tenant'],
      links: [
        { label: 'Code', href: 'https://github.com/SyedAbdulKareem13/crm-mini', type: 'code' },
      ],
    },
  ],

  /* ---- Achievements: counters that climb on reveal ---- */
  achievements: [
    { value: 3,  suffix: '+', label: 'Years building enterprise SaaS' },
    { value: 30, suffix: '~', prefix: true, label: 'CRM sprints owned' },
    { value: 4,  suffix: '+', label: 'Go-lives (Finance, HR, CRM, Quote Builder)' },
    { value: 2,  suffix: '',  label: 'Published private Angular libraries' },
  ],

  achievementNotes: [
    'Published private Angular libraries — @kebs-lib/ui & @kebs-lib/forms.',
    'Dockerized demo platforms for fast, isolated client onboarding.',
    'Production features shipped in 4–5 days with consistently low tech debt.',
  ],
};
