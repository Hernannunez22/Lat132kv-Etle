import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import {
  MensajeChat,
  PrecisionNivelId,
  GeminiPrecisionState,
  GeminiPrecisionMeta,
} from '../types';
import { buscarYExtraerDePliegosReales } from '../data/pliegosContractuales';
import { apiFetch, tryReadJsonResponse } from '../utils/apiClient';
import { extraerDriveFolderId, getGoogleDriveAccessToken } from '../utils/googleAuth';
import { useAuth } from './AuthContext';
import { useDrive } from './DriveContext';
import { usePliegos } from './PliegosContext';
import { useObra } from './ObraContext';
import { useMinutas } from './MinutasContext';

export interface ChatContextType {
  chatMessages: MensajeChat[];
  sendChatMessage: (texto: string, precisionOverride?: PrecisionNivelId) => Promise<void>;
  clearChat: () => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { precisionNivel, puedeUsarModelosPagos, setGeminiPrecisionState } = useAuth();
  const { driveFolderId, setHasDriveToken, setDriveDocsCount } = useDrive();
  const {
    pliegosReales,
    planoCompararA,
    planoCompararB,
    chatAdjuntos,
    hidratarPliegoEnServidorLocal,
    resincronizarPliegosDesdeIDB,
  } = usePliegos();
  const {
    planos,
    hitos,
    interferencias,
    notasLibro,
    notasCampo,
    totalPlanificados,
    hidratarNotasLibroEnServidorLocal,
  } = useObra();
  const { minutas, compromisosMinutas, notasPedido } = useMinutas();

  const [chatMessages, setChatMessages] = useState<MensajeChat[]>([
    {
      id: 'init-1',
      texto:
        '⚡ **Asistente Integral de Ingeniería Eléctrica 132 kV, Documentos de Obra y Auditoría**\n\n' +
        'Puedes consultarme cualquier tema técnico o documental:\n' +
        '- **Memorias Descriptivas, Estudios de Suelos y Docs de Drive:** conecta Google Drive con **"Docs Drive"** para buscar y leer archivos reales de cualquier carpeta (ej. `ET-LE-OC-MD-*`).\n' +
        '- **Libro de Comunicaciones / Notas de Libro:** lee NP, OS y NS diferenciando **Actores (UTE, TRANSNOA, Inspección)** para detectar discrepancias y contestaciones.\n' +
        '- **Pliegos, Planos PDF y Cálculos / Normativa:** contrasta cláusulas, hitos, interferencias o responde consultas técnicas abiertas (AEA, CIRSOC, IRAM, IEC).',
      esUsuario: false,
      fecha: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const construirContextoObra = useCallback(
    (consulta?: string) => {
      const apcCount = planos.filter(p => p.selloApc).length;
      const resumenPorDisciplina: Record<string, { total: number; apc: number }> = {};
      for (const p of planos) {
        const disc = p.disciplina || 'General';
        if (!resumenPorDisciplina[disc]) resumenPorDisciplina[disc] = { total: 0, apc: 0 };
        resumenPorDisciplina[disc].total += 1;
        if (p.selloApc) resumenPorDisciplina[disc].apc += 1;
      }

      // Buscar sobre TODOS los planos los que coincidan con la consulta + completar hasta 120 representativos
      const tokensConsulta = (consulta || '')
        .toLowerCase()
        .split(/\s+/)
        .filter(t => t.length >= 2);
      const planosOrdenados = [...planos]
        .map(p => {
          const txt = `${p.codigo} ${p.descripcion} ${p.disciplina} ${p.proyecto} ${p.estado || ''}`.toLowerCase();
          let sc = 0;
          for (const t of tokensConsulta) {
            if (txt.includes(t)) sc += 10;
          }
          return { p, sc };
        })
        .sort((a, b) => b.sc - a.sc)
        .slice(0, 120)
        .map(({ p }) => ({
          codigo: p.codigo,
          descripcion: p.descripcion,
          disciplina: p.disciplina,
          revision: p.revision,
          proyecto: p.proyecto,
          estado: p.estado,
          selloApc: p.selloApc,
        }));

      return {
        resumenPlanos: {
          totalPlanificados,
          emitidos: planos.length,
          conSelloApc: apcCount,
          porDisciplina: resumenPorDisciplina,
          planosRelevantesYCatalogo: planosOrdenados,
        },
        hitos: hitos.map(h => ({
          codigo: h.codigo,
          nombre: h.nombre,
          frente: h.frente,
          fechaObjetivo: h.fechaObjetivo,
          pesoContractual: h.pesoContractual,
          responsable: h.responsable,
        })),
        interferencias: interferencias.map(i => ({
          empresa: i.empresa,
          tipoInterferencia: i.tipoInterferencia,
          estadoTramite: i.estadoTramite,
          vanosAfectados: i.vanosAfectados,
          fechaDocumento: i.fechaDocumento,
          resumenSolicitud: i.resumenSolicitud ? i.resumenSolicitud.slice(0, 350) : '',
        })),
        minutas: minutas.map(m => ({
          codigo: m.codigo,
          titulo: m.titulo,
          fechaReunion: m.fechaReunion,
          frente: m.frente,
          resumen: m.resumen ? m.resumen.slice(0, 350) : '',
        })),
        compromisosMinutas: compromisosMinutas.map(c => ({
          minutaCodigo: c.minutaCodigo,
          minutaFecha: c.minutaFecha,
          numeroItem: c.numeroItem,
          descripcion: c.descripcion ? c.descripcion.slice(0, 260) : '',
          responsable: c.responsable,
          frente: c.frente,
          fechaLimite: c.fechaLimite,
          estado: c.estado,
        })),
        notasPedido: notasPedido.map(n => ({
          numeroNota: n.numeroNota,
          fechaEmision: n.fechaEmision,
          emisor: n.emisor,
          destinatario: n.destinatario,
          frente: n.frente,
          asunto: n.asunto,
        })),
        notasLibroResumen: notasLibro.map(n => ({
          id: n.id,
          codigo: n.codigo,
          tipoNota: n.tipoNota,
          titulo: n.titulo,
          fecha: n.fecha,
          actorEmisor: n.actorEmisor,
          emisorDetalle: n.emisorDetalle,
          actorReceptor: n.actorReceptor,
          receptorDetalle: n.receptorDetalle,
          sentido: n.sentido,
          estadoRespuesta: n.estadoRespuesta,
          respondeANotas: n.respondeANotas,
          respondidaPorNotas: n.respondidaPorNotas,
          referenciasNotas: n.referenciasNotas,
          resumen: n.resumen ? n.resumen.slice(0, 240) : '',
        })),
        notasCampo: notasCampo ? notasCampo.slice(0, 6000) : '',
      };
    },
    [
      planos,
      totalPlanificados,
      hitos,
      interferencias,
      minutas,
      compromisosMinutas,
      notasPedido,
      notasLibro,
      notasCampo,
    ]
  );

  const ejecutarStreamChat = useCallback(
    async (
      msg: string,
      historial: string,
      historialMensajes: Array<{ rol: 'usuario' | 'asistente'; texto: string }>,
      pliegoIds: string[],
      contextoObra: Record<string, any>,
      idAi: string,
      driveAccessToken?: string,
      driveFolderIdParam?: string,
      precisionOverride?: PrecisionNivelId
    ): Promise<{
      ok: boolean;
      needsSync?: boolean;
      limitReached?: boolean;
      errorMsg?: string;
      precisionMeta?: GeminiPrecisionMeta;
    }> => {
      const res = await apiFetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensaje: msg,
          historial,
          historialMensajes,
          pliegoIds,
          contextoObra,
          driveAccessToken,
          driveFolderId: driveFolderIdParam,
          precisionNivel: puedeUsarModelosPagos ? precisionOverride || precisionNivel : 'gratuito',
        }),
      });

      const cType = (res.headers.get('content-type') || '').toLowerCase();
      if (!res.ok || !res.body || cType.includes('text/html')) {
        let detail = `HTTP ${res.status}`;
        try {
          const errJson = await tryReadJsonResponse(res);
          if (errJson?.error) detail = `${detail}: ${String(errJson.error)}`;
        } catch {}
        return { ok: false, errorMsg: detail };
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let acumulado = '';
      let needsSync = false;
      let streamErr = '';
      let streamPrecisionMeta: GeminiPrecisionMeta | undefined;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const eventos = buffer.split('\n\n');
        buffer = eventos.pop() || '';

        for (const evt of eventos) {
          const line = evt.trim();
          if (!line.startsWith('data:')) continue;
          const jsonStr = line.slice(5).trim();
          if (!jsonStr) continue;
          try {
            const payload = JSON.parse(jsonStr);
            if (payload.needsSync) {
              needsSync = true;
            }
            if (typeof payload.driveDocsTotal === 'number') {
              setDriveDocsCount(payload.driveDocsTotal);
            }
            if (payload.estadoPrecision) {
              setGeminiPrecisionState(payload.estadoPrecision as GeminiPrecisionState);
            }
            if (payload.precisionMeta) {
              streamPrecisionMeta = payload.precisionMeta as GeminiPrecisionMeta;
              setChatMessages(prev =>
                prev.map(m => (m.id === idAi ? { ...m, precisionMeta: streamPrecisionMeta } : m))
              );
            }
            if (payload.chunk) {
              acumulado += payload.chunk;
              const textoActual = acumulado;
              setChatMessages(prev =>
                prev.map(m =>
                  m.id === idAi
                    ? {
                        ...m,
                        texto: textoActual,
                        ...(streamPrecisionMeta ? { precisionMeta: streamPrecisionMeta } : {}),
                      }
                    : m
                )
              );
            }
            if (payload.error && !acumulado) {
              streamErr = String(payload.error);
              return {
                ok: false,
                limitReached: Boolean(payload.limitReached),
                errorMsg: streamErr,
              };
            }
          } catch {}
        }
      }

      if (needsSync) return { ok: false, needsSync: true };
      return {
        ok: acumulado.trim().length > 0,
        precisionMeta: streamPrecisionMeta,
        errorMsg: streamErr || (!acumulado.trim() ? 'Stream vacío del servidor' : undefined),
      };
    },
    [puedeUsarModelosPagos, precisionNivel, setDriveDocsCount, setGeminiPrecisionState]
  );

  const construirRespaldoLocalMultifuente = useCallback(
    (consulta: string, motivoErrorApi?: string): string => {
      const qNorm = consulta
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
      const stop = new Set([
        'los', 'las', 'una', 'uno', 'con', 'sin', 'por', 'para', 'sobre', 'entre',
        'como', 'cual', 'que', 'hay', 'tiene', 'esta', 'este', 'del', 'algun', 'alguna',
      ]);
      const tokens = Array.from(
        new Set(
          qNorm
            .replace(/[^a-z0-9_-]+/g, ' ')
            .split(/\s+/)
            .filter(t => t.length >= 3 && !stop.has(t))
        )
      );

      const scoreTexto = (txt: string) => {
        const n = txt
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase();
        let s = 0;
        for (const t of tokens) {
          if (n.includes(t)) s += 10;
        }
        return s;
      };

      const notasCoinc = notasLibro
        .map(n => ({
          n,
          sc: scoreTexto(
            `${n.codigo} ${n.tipoNota} ${n.titulo} ${n.resumen} ${n.contenidoTexto || ''}`
          ),
        }))
        .filter(x => x.sc > 0)
        .sort((a, b) => b.sc - a.sc)
        .slice(0, 8);

      const npCoinc = notasPedido
        .map(np => ({
          np,
          sc: scoreTexto(`${np.numeroNota} ${np.asunto} ${np.contenidoMarkdown || ''}`),
        }))
        .filter(x => x.sc > 0)
        .sort((a, b) => b.sc - a.sc)
        .slice(0, 5);

      const minCoinc = minutas
        .map(m => ({
          m,
          sc: scoreTexto(`${m.codigo} ${m.titulo} ${m.resumen || ''} ${m.contenidoTexto || ''}`),
        }))
        .filter(x => x.sc > 0)
        .sort((a, b) => b.sc - a.sc)
        .slice(0, 5);

      const extraccionPliegos = buscarYExtraerDePliegosReales(consulta, pliegosReales);

      const partes: string[] = [];
      if (motivoErrorApi) {
        partes.push(
          `> ⚠️ **El motor IA Gemini del servidor no pudo completar esta respuesta (${motivoErrorApi}).** Mostrando búsqueda local directa en Notas, Minutas y Pliegos.`
        );
      }

      if (notasCoinc.length > 0) {
        partes.push(
          `### Notas de Libro / Comunicaciones coincidentes (${notasCoinc.length})\n` +
            notasCoinc
              .map(
                ({ n }) =>
                  `- **${n.codigo}** (${n.tipoNota} · ${n.fecha || 's/f'}) — *${n.actorEmisor} ➔ ${n.actorReceptor}* · **${n.estadoRespuesta}**\n  ${n.resumen || n.titulo}`
              )
              .join('\n')
        );
      }

      if (npCoinc.length > 0) {
        partes.push(
          `### Notas de Pedido generadas coincidentes (${npCoinc.length})\n` +
            npCoinc
              .map(({ np }) => `- **${np.numeroNota}** (${np.fechaEmision}): ${np.asunto}`)
              .join('\n')
        );
      }

      if (minCoinc.length > 0) {
        partes.push(
          `### Minutas coincidentes (${minCoinc.length})\n` +
            minCoinc
              .map(
                ({ m }) =>
                  `- **${m.codigo}** (${m.fechaReunion}): ${m.titulo}${m.resumen ? ` — ${m.resumen.slice(0, 180)}` : ''}`
              )
              .join('\n')
        );
      }

      if (
        extraccionPliegos.coincidencias.length > 0 ||
        partes.length === (motivoErrorApi ? 1 : 0)
      ) {
        partes.push(extraccionPliegos.resumen);
      }

      return partes.join('\n\n');
    },
    [notasLibro, notasPedido, minutas, pliegosReales]
  );

  const sendChatMessage = useCallback(
    async (msg: string, precisionOverride?: PrecisionNivelId) => {
      if (!msg.trim()) return;
      const nivelActivo: PrecisionNivelId = puedeUsarModelosPagos
        ? precisionOverride || precisionNivel
        : 'gratuito';

      const mensajesPrevios = chatMessages
        .filter(m => m.id !== 'init-1' && m.id !== 'init-reset' && m.texto.trim().length > 0)
        .slice(-14);

      const historialMensajes: Array<{ rol: 'usuario' | 'asistente'; texto: string }> =
        mensajesPrevios.map(m => ({
          rol: m.esUsuario ? 'usuario' : 'asistente',
          texto: m.texto.slice(0, 4000),
        }));

      const historialReciente = mensajesPrevios
        .slice(-8)
        .map(m => `${m.esUsuario ? 'Usuario' : 'Asistente'}: ${m.texto.slice(0, 1800)}`)
        .join('\n\n');

      const driveAccessToken = getGoogleDriveAccessToken() || undefined;
      setHasDriveToken(Boolean(driveAccessToken));
      const driveFolderResuelto = extraerDriveFolderId(driveFolderId);

      const userMsg: MensajeChat = {
        id: 'usr-' + Date.now(),
        texto: msg,
        esUsuario: true,
        fecha: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        adjuntosNombres: chatAdjuntos.length > 0 ? chatAdjuntos.map(a => a.nombre) : undefined,
      };

      setChatMessages(prev => [...prev, userMsg]);

      const idAi = 'ai-' + Date.now();
      const loadingAi: MensajeChat = {
        id: idAi,
        texto: driveAccessToken
          ? 'Analizando tu consulta y revisando Google Drive, Pliegos y Libro de Notas...'
          : 'Analizando tu consulta, Pliegos, Notas de Libro e ingeniería de obra...',
        esUsuario: false,
        fecha: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setChatMessages(prev => [...prev, loadingAi]);

      const pliegoIds = pliegosReales.map(p => p.id);
      const contextoObra = construirContextoObra(msg);
      let ultimoErrorApi = '';

      try {
        // Hidratar Notas de Libro en segundo plano si aún no se sincronizó esta firma (sin bloquear el envío si falla)
        if (notasLibro.length > 0) {
          void hidratarNotasLibroEnServidorLocal(notasLibro);
        }
        let streamRes = await ejecutarStreamChat(
          msg,
          historialReciente,
          historialMensajes,
          pliegoIds,
          contextoObra,
          idAi,
          driveAccessToken,
          driveFolderResuelto,
          nivelActivo
        );
        if (streamRes.limitReached) {
          const msgLimite = `> ⚠️ **Límite diario de uso/costo alcanzado:** ${streamRes.errorMsg || 'Se alcanzó el límite configurado para este modelo.'}\n\nPuedes cambiar al nivel **Económico · Rápido** en el selector superior del chat o ampliar/reiniciar los límites diarios en **Límites y costos**.`;
          setChatMessages(prev => prev.map(m => (m.id === idAi ? { ...m, texto: msgLimite } : m)));
          return;
        }
        if (streamRes.needsSync) {
          setChatMessages(prev =>
            prev.map(m =>
              m.id === idAi ? { ...m, texto: 'Sincronizando índice de pliegos y notas...' } : m
            )
          );
          for (const p of pliegosReales) {
            if (p.contenidoTexto) {
              await hidratarPliegoEnServidorLocal(p);
            }
          }
          await resincronizarPliegosDesdeIDB();
          streamRes = await ejecutarStreamChat(
            msg,
            historialReciente,
            historialMensajes,
            pliegoIds,
            contextoObra,
            idAi,
            driveAccessToken,
            driveFolderResuelto,
            nivelActivo
          );
        }
        if (streamRes.limitReached) {
          const msgLimite = `> ⚠️ **Límite diario de uso/costo alcanzado:** ${streamRes.errorMsg || 'Se alcanzó el límite configurado para este modelo.'}\n\nPuedes cambiar al nivel **Económico · Rápido** en el selector superior del chat o ampliar/reiniciar los límites diarios en **Límites y costos**.`;
          setChatMessages(prev => prev.map(m => (m.id === idAi ? { ...m, texto: msgLimite } : m)));
          return;
        }
        if (streamRes.ok) return;
        if (streamRes.errorMsg) ultimoErrorApi = streamRes.errorMsg;
      } catch (errStream: any) {
        ultimoErrorApi = errStream?.message || 'Error en stream';
        console.warn('Error en stream /api/chat/stream:', errStream);
      }

      try {
        const res = await apiFetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mensaje: msg,
            historial: historialReciente,
            historialMensajes,
            pliegoIds,
            contextoObra,
            driveAccessToken,
            driveFolderId: driveFolderResuelto,
            precisionNivel: nivelActivo,
          }),
        });
        const data = await tryReadJsonResponse(res);
        if (typeof data?.driveDocsTotal === 'number') {
          setDriveDocsCount(data.driveDocsTotal);
        }
        if (data?.estadoPrecision) {
          setGeminiPrecisionState(data.estadoPrecision as GeminiPrecisionState);
        }
        if (res.status === 429 || data?.limitReached) {
          const msgLimite = `> ⚠️ **Límite diario de uso/costo alcanzado:** ${data?.error || 'Se alcanzó el límite configurado para este modelo.'}\n\n${
            puedeUsarModelosPagos
              ? 'Puedes cambiar al nivel **Gratuito · $0** o **Económico · Rápido** en el selector superior del chat o ampliar/reiniciar los límites diarios en **Límites y costos**.'
              : 'Puedes ajustar el tope a 0 (sin límite) o reiniciar el contador hoy en **Límites y costos**.'
          }`;
          setChatMessages(prev => prev.map(m => (m.id === idAi ? { ...m, texto: msgLimite } : m)));
          return;
        }
        if (res.ok && data && data.exito && data.respuesta) {
          setChatMessages(prev =>
            prev.map(m =>
              m.id === idAi
                ? {
                    ...m,
                    texto: data.respuesta,
                    precisionMeta: data.precisionMeta as GeminiPrecisionMeta | undefined,
                  }
                : m
            )
          );
          return;
        }
        ultimoErrorApi = data?.error ? String(data.error) : `HTTP ${res.status}`;
      } catch (errApi: any) {
        ultimoErrorApi = errApi?.message || ultimoErrorApi || 'Error de red';
        console.warn('API local /api/chat no respondió, usando respaldo local multifuente:', errApi);
      }

      const respaldo = construirRespaldoLocalMultifuente(msg, ultimoErrorApi);
      setChatMessages(prev => prev.map(m => (m.id === idAi ? { ...m, texto: respaldo } : m)));
    },
    [
      puedeUsarModelosPagos,
      precisionNivel,
      chatMessages,
      setHasDriveToken,
      driveFolderId,
      chatAdjuntos,
      pliegosReales,
      construirContextoObra,
      notasLibro,
      hidratarNotasLibroEnServidorLocal,
      ejecutarStreamChat,
      hidratarPliegoEnServidorLocal,
      resincronizarPliegosDesdeIDB,
      setDriveDocsCount,
      setGeminiPrecisionState,
      construirRespaldoLocalMultifuente,
    ]
  );

  const clearChat = useCallback(() => {
    setChatMessages([
      {
        id: 'init-reset',
        texto:
          '⚡ Chat reiniciado.\n\n' +
          `Activos en memoria: **${notasLibro.length} nota(s) de libro** · ` +
          `**${pliegosReales.length} pliego(s) real(es)** · ` +
          `**${[planoCompararA, planoCompararB].filter(Boolean).length} plano(s) PDF en comparador** · ` +
          `**${planos.length} planos en catálogo** · **${hitos.length} hitos** · **${interferencias.length} cruces**.`,
        esUsuario: false,
        fecha: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  }, [
    notasLibro.length,
    pliegosReales.length,
    planoCompararA,
    planoCompararB,
    planos.length,
    hitos.length,
    interferencias.length,
  ]);

  const value = useMemo<ChatContextType>(
    () => ({
      chatMessages,
      sendChatMessage,
      clearChat,
    }),
    [chatMessages, sendChatMessage, clearChat]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) throw new Error('useChat must be used within a ChatProvider');
  return context;
};
