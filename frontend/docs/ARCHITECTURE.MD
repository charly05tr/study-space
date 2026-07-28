src/
├── assets/             # Archivos estáticos (imágenes, fuentes, SVGs)
├── components/         # Componentes UI globales y genéricos (Botones, Modales, Inputs)
├── config/             # Configuraciones globales (instancia de Axios, React Query client)
├── features/           # 🌟 EL CORAZÓN DE LA APP: Módulos por dominio de negocio
│   ├── auth/           # Ejemplo: Dominio de Autenticación
│   │   ├── api/        # Peticiones HTTP de este dominio (login, register)
│   │   ├── components/ # Componentes exclusivos de auth (LoginForm, PasswordReset)
│   │   ├── hooks/      # Hooks de TanStack Query exclusivos (useLogin, useUser)
│   │   └── types.ts    # Interfaces TypeScript para este dominio
│   │
│   └── libros/         # Ejemplo: Dominio de tu conversor de PDFs
│       ├── api/        # Llamadas a tu backend (subir PDF, obtener HTML)
│       ├── components/ # Lector interactivo, paginador, visor
│       ├── hooks/      # useConvertBook, useFetchHtml
│       └── store/      # (Opcional) Un slice de Zustand exclusivo si el dominio es muy complejo
│
├── hooks/              # Custom hooks globales (useWindowSize, useTheme)
├── layouts/            # Estructuras de página (MainLayout, AuthLayout, ReaderLayout)
├── pages/              # Las vistas que React Router va a renderizar (ensamblan los features)
├── routes/             # Configuración del enrutador (React Router)
├── store/              # 🧠 Estado Global del Cliente (Zustand)
│   ├── uiStore.ts      # Manejo de modales globales, sidebars
│   └── authStore.ts    # Estado de sesión activa
├── types/              # Tipados globales compartidos
└── utils/              # Funciones puras de ayuda (formatear fechas, parsear strings)