# MedSnap - Gestión de Evidencias Clínicas

Sistema de registro fotográfico para pacientes con almacenamiento local y sincronización con Google Drive.

## Características

- 📸 **Captura de Fotos:** Toma de evidencias directamente desde la cámara del dispositivo.
- 📂 **Almacenamiento Local:** Los registros se guardan en el navegador para acceso rápido sin conexión.
- ☁️ **Sincronización con Google Drive:** Respalda y restaura tus datos en la nube.
- 🔍 **Búsqueda Inteligente:** Filtra registros por nombre de paciente en tiempo real.
- 📱 **PWA Ready:** Instálalo en tu móvil como una aplicación nativa.
- 🚀 **Splash Screen:** Experiencia de carga profesional.

## Requisitos Previos

- [Node.js](https://nodejs.org/) (v18 o superior)
- Una cuenta de Google Cloud para configurar las credenciales de Drive.

## Instalación y Configuración

1. **Clona el repositorio:**
   ```bash
   git clone https://github.com/tu-usuario/medsnap.git
   cd medsnap
   ```

2. **Instala las dependencias:**
   ```bash
   npm install
   ```

3. **Configura las variables de entorno:**
   Crea un archivo `.env` en la raíz del proyecto basado en `.env.example`:
   ```env
   GOOGLE_CLIENT_ID=tu_id_de_cliente
   GOOGLE_CLIENT_SECRET=tu_secreto_de_cliente
   APP_URL=http://localhost:3000
   ```

4. **Inicia la aplicación en modo desarrollo:**
   ```bash
   npm run dev
   ```
   La aplicación estará disponible en `http://localhost:3000`.

## Despliegue en Producción

Para compilar y ejecutar en un entorno de producción:

```bash
npm run build
npm start
```

## Configuración de Google Drive

Para que la sincronización funcione, debes crear un proyecto en [Google Cloud Console](https://console.cloud.google.com/):
1. Habilita la **Google Drive API**.
2. Configura la **Pantalla de Consentimiento OAuth** (añade el scope `.../auth/drive.file`).
3. Crea un **ID de cliente de OAuth** (Tipo: Aplicación Web).
4. Añade las URIs de redireccionamiento autorizadas:
   - `http://localhost:3000/auth/google/callback`
   - `https://tu-url-de-produccion.com/auth/google/callback`

---
Desarrollado por **lejosaco** para la gestión eficiente de evidencias médicas.
