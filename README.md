# Obras 132 kV - Centro de Control e Ingeniería

Centro de control documental, auditoría técnica de pliegos y planos, cronograma maestro de hitos contractuales, gestión de interferencias y generador de informes ejecutivos en 1 clic para el corredor eléctrico de alta tensión 132 kV.

## Frentes de Obra del Corredor
- **LAT El Bracho - Villa Quinteros** (132 kV, 173 planos planificados)
- **ET Leales** (132 / 33 / 13.2 kV, 529 planos planificados)
- **ET Villa Quinteros** (132 / 33 / 13.2 kV, 282 planos planificados)
- **ET El Bracho** (132 kV, 99 planos planificados)

## Características Principales
- **Dashboard Bento Grid:** Métricas de emisión viva vs. 910 planos contractuales (5.3% inicial), aprobación sello APC y estado del respaldo en Cloudflare R2.
- **Explorador de Planos:** Búsqueda en tiempo real, filtros por frente y descarga directa de respaldos.
- **Cronograma Maestro de Hitos:** Detección de ruta crítica, semáforos automáticos de vencimiento (En plazo, Por vencer, Vencidos) e importador de matrices Excel (`.xlsx` / `.xls` / `.csv`) mediante SheetJS.
- **Generador de Informes Ejecutivos en 1 Clic:** Diagnóstico de ritmo de carga, desglose por frente, nómina completa tabular, auditoría forense de demoras y exportación instantánea a Microsoft Word (`.doc`) e impresión PDF.
- **Auditoría de Interferencias:** Trámites y verificación técnica con TGN, DNV (Ruta 38), Gasnor, Belgrano Cargas y EDET.
- **Anotador Técnico & Auditoría:** Contrastación de Pliego Técnico vs Plano Aprobado (APC) vs Protocolo de Inspección en terreno, con notas de campo, registro de fotos y notas de audio grabadas con reproducción.
- **Chat Asistente IA:** Consulta especializada en normativa, pliegos, planos e hitos contractuales.

## Tecnologías
- **Framework:** React 19 + TypeScript + Vite
- **Estilos:** Tailwind CSS v4 (tema oscuro Bento Grid)
- **Íconos:** Lucide React
- **Procesamiento de Cronogramas:** SheetJS (XLSX)
