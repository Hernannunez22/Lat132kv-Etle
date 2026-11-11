# ⚡ Conexión con Google Apps Script (Backend de Google Sheets)

Esta carpeta contiene el archivo `Codigo.gs` para conectar tu Google Sheets con la aplicación web de Obras 132 kV.

## 📋 Pasos para Instalar y Desplegar:

1. **Crear o Abrir tu Planilla de Google Sheets**:
   - Ingresa a [Google Sheets](https://sheets.google.com) y crea una nueva planilla (o usa la existente donde tienes los planos).

2. **Abrir el Editor de Apps Script**:
   - En el menú superior de la planilla, haz clic en **Extensiones** > **Apps Script**.

3. **Pegar el Código**:
   - Borra cualquier función vacía que aparezca en el editor (`myFunction`).
   - Copia todo el contenido del archivo `apps-script/Codigo.gs` y pégalo allí.
   - Guarda con el ícono de disquete 💾 (o `Ctrl + S`).

4. **Desplegar como Aplicación Web (Web App)**:
   - Haz clic en el botón azul superior **Implementar** (Deploy) > **Nueva implementación** (New deployment).
   - En el engranaje a la izquierda, selecciona **Aplicación web**.
   - Completa:
     - **Descripción**: `API Obras 132 kV`
     - **Ejecutar como**: `Yo (tu_email@gmail.com)`
     - **Quién tiene acceso**: `Cualquier usuario` (Anyone) *(⚠️ Importante: Esto permite que la app web pueda leer y guardar los planos sin errores de CORS o permisos).*
   - Haz clic en **Implementar**.
   - Concede los permisos de Google si te los solicita.

5. **Copiar la URL**:
   - Copia la **URL de la aplicación web** (la que termina en `/exec`).
   - Ejemplo: `https://script.google.com/macros/s/AKfycbx.../exec`

6. **Vincular en la Aplicación Web**:
   - Abre tu aplicación de **Obras 132 kV**.
   - Haz clic en el botón de ajustes ⚙️ en la esquina superior derecha del header.
   - Pega tu URL en el campo **URL Endpoint Web App (Apps Script)**.
   - Haz clic en **Guardar y Conectar**.
   - ¡Listo! El indicador pasará a `Sheets Conectado` y se sincronizarán tus planos, hitos e informes en vivo.
