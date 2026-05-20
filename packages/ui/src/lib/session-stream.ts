import type { Session, SessionLog, SessionStreamEvent } from '../types/api';

export type AcpFilterType = 'messages' | 'thoughts' | 'tools' | 'plan';

const STREAM_EVENT_TYPES = new Set<SessionStreamEvent['type']>(['complete', 'log']);

export function isAcpSession(session?: Session | null): boolean {
  return (session?.protocol ?? 'subprocess') === 'acp';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asObject(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asOptionalTimestamp(value: unknown): string | undefined {
  const timestamp = asString(value);
  return timestamp || undefined;
}

function asToolStatus(value: unknown): 'running' | 'completed' | 'failed' {
  if (value === 'completed' || value === 'failed') return value;
  if (value === 'done') return 'completed';
  return 'running';
}

function asPlanStatus(value: unknown): 'pending' | 'running' | 'done' {
  if (value === 'done' || value === 'running' || value === 'pending') return value;
  if (value === 'completed') return 'done';
  if (value === 'in_progress') return 'running';
  return 'pending';
}

function extractTextFromContent(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => extractTextFromContent(item))
      .filter((text) => text.length > 0)
      .join('\n\n');
  }
  if (isRecord(value)) {
    if (typeof value.text === 'string') return value.text;
    if (typeof value.content === 'string') return value.content;
    return '';
  }
  return '';
}

function extractResultFromUpdate(update: Record<string, unknown>): unknown {
  if (update.result !== undefined) return update.result;

  const content = update.content;
  if (Array.isArray(content)) {
    for (const item of content) {
      if (!isRecord(item)) continue;
      if (item.content !== undefined) return item.content;
      if (item.result !== undefined) return item.result;
      if (item.text !== undefined) return item.text;
    }
    return content;
  }

  if (isRecord(content)) {
    if (content.content !== undefined) return content.content;
    if (content.text !== undefined) return content.text;
    return content;
  }

  return null;
}

function mapAcpRawToStreamEvent(method: string, params: unknown, fallbackTimestamp?: string): SessionStreamEvent | null {
  if (!isRecord(params)) return null;

  if (method === 'session/request_permission') {
    return {
      type: 'acp_permission_request',
      timestamp: fallbackTimestamp,
      id: asString(params.id),
      tool: asString(params.tool),
      args: asRecord(params.args),
      options: asArray(params.options).filter((option): option is string => typeof option === 'string'),
    };
  }

  if (method !== 'session/update') return null;

  const updateObj = asObject(params.update) ?? params;
  const updateType = asString(updateObj.sessionUpdate ?? updateObj.type);

  if (updateType === 'agent_message_chunk' || updateType === 'user_message_chunk') {
    const contentBlocks = asArray(updateObj.content);
    const content = extractTextFromContent(updateObj.content ?? updateObj.text);
    return {
      type: 'acp_message',
      timestamp: fallbackTimestamp,
      role: updateType === 'user_message_chunk' ? 'user' : 'agent',
      content,
      done: asBoolean(updateObj.done),
      contentBlocks,
      rawContent: updateObj.content,
    };
  }

  if (updateType === 'agent_thought_chunk') {
    const contentBlocks = asArray(updateObj.content);
    const content = extractTextFromContent(updateObj.content ?? updateObj.text);
    return {
      type: 'acp_thought',
      timestamp: fallbackTimestamp,
      content,
      done: asBoolean(updateObj.done),
      contentBlocks,
      rawContent: updateObj.content,
    };
  }

  if (updateType === 'tool_call' || updateType === 'tool_call_update') {
    return {
      type: 'acp_tool_call',
      timestamp: fallbackTimestamp,
      id: asString(updateObj.toolCallId ?? updateObj.id),
      tool: asString(updateObj.title ?? updateObj.toolName ?? updateObj.tool ?? updateObj.name),
      args: asRecord(updateObj.args ?? updateObj.rawInput ?? updateObj.input ?? updateObj.arguments),
      status: asToolStatus(updateObj.status),
      result: extractResultFromUpdate(updateObj),
      rawContent: updateObj.content,
    };
  }

  if (updateType === 'plan') {
    return {
      type: 'acp_plan',
      timestamp: fallbackTimestamp,
      entries: asArray(updateObj.entries).map((entry, index) => {
        if (!isRecord(entry)) {
          return { id: String(index), title: '', status: 'pending' as const };
        }

        return {
          id: asString(entry.id, String(index)),
          title: asString(entry.title),
          status: asPlanStatus(entry.status),
        };
      }),
      done: typeof updateObj.done === 'boolean' ? updateObj.done : undefined,
    };
  }

  if (updateType === 'current_mode_update') {
    return {
      type: 'acp_mode_update',
      timestamp: fallbackTimestamp,
      mode: asString(updateObj.mode),
    };
  }

  return null;
}

function parseRawEvent(payload: unknown): SessionStreamEvent | null {
  if (!isRecord(payload)) return null;
  const type = asString(payload.type);
  if (!STREAM_EVENT_TYPES.has(type as SessionStreamEvent['type'])) return null;

  switch (type) {
    case 'log':
      return {
        type: 'log',
        timestamp: asString(payload.timestamp),
        level: asString(payload.level),
        message: asString(payload.message),
      };
    case 'complete':
      return {
        type: 'complete',
        status: asString(payload.status),
        duration_ms: typeof payload.duration_ms === 'number' ? payload.duration_ms : 0,
      };
    default:
      return null;
  }
}

function parseDirectAcpEvent(payload: Record<string, unknown>): SessionStreamEvent | null {
  const type = asString(payload.type);
  const timestamp = asOptionalTimestamp(payload.timestamp);

  if (type === 'acp_message') {
    const role = asString(payload.role);
    if (role === 'user' || role === 'agent') {
      return {
        type: 'acp_message',
        timestamp,
        role,
        content: extractTextFromContent(payload.content),
        done: asBoolean(payload.done),
        contentBlocks: asArray(payload.contentBlocks ?? payload.content),
        rawContent: payload.content,
      };
    }
  }

  if (type === 'acp_thought') {
    return {
      type: 'acp_thought',
      timestamp,
      content: extractTextFromContent(payload.content),
      done: asBoolean(payload.done),
      contentBlocks: asArray(payload.contentBlocks ?? payload.content),
      rawContent: payload.content,
    };
  }

  if (type === 'acp_tool_call') {
    return {
      type: 'acp_tool_call',
      timestamp,
      id: asString(payload.id),
      tool: asString(payload.toolName ?? payload.tool ?? payload.name),
      args: asRecord(payload.args ?? payload.rawInput ?? payload.input ?? payload.arguments),
      status: asToolStatus(payload.status),
      result: payload.result ?? null,
      rawContent: payload.content,
    };
  }

  if (type === 'acp_plan') {
    return {
      type: 'acp_plan',
      timestamp,
      entries: asArray(payload.entries).map((entry, index) => {
        if (!isRecord(entry)) {
          return { id: String(index), title: '', status: 'pending' as const };
        }
        return {
          id: asString(entry.id, String(index)),
          title: asString(entry.title),
          status: asPlanStatus(entry.status),
        };
      }),
      done: typeof payload.done === 'boolean' ? payload.done : undefined,
    };
  }

  return null;
}

export function parseStreamEventPayload(payload: unknown): SessionStreamEvent | null {
  if (isRecord(payload) && typeof payload.__acp_method === 'string') {
    const mapped = mapAcpRawToStreamEvent(
      payload.__acp_method,
      payload.params,
      asOptionalTimestamp(payload.timestamp),
    );
    if (mapped) return mapped;
  }

  if (isRecord(payload)) {
    const direct = parseDirectAcpEvent(payload);
    if (direct) return direct;
  }

  const parsed = parseRawEvent(payload);
  if (parsed) return parsed;

  // Handle log-type events whose message may contain embedded JSON-RPC
  if (isRecord(payload) && payload.type === 'log' && typeof payload.message === 'string') {
    const msg = payload.message;
    const jsonStart = msg.indexOf('{');
    if (jsonStart >= 0) {
      try {
        const inner = JSON.parse(msg.slice(jsonStart));
        if (isRecord(inner) && typeof inner.__acp_method === 'string') {
          const event = mapAcpRawToStreamEvent(
            inner.__acp_method,
            inner.params,
            asOptionalTimestamp(payload.timestamp),
          );
          if (event) return event;
        }
      } catch { /* ignore */ }
    }
  }
  return null;
}

export function parseSessionLog(log: SessionLog): SessionStreamEvent {
  let parsedMessage: unknown = null;
  // Try to parse raw JSONRPC messages from STDOUT
  const jsonStart = log.message.indexOf('{');
  if (jsonStart >= 0) {
    try {
      const jsonContent = log.message.slice(jsonStart);
      parsedMessage = JSON.parse(jsonContent);
    } catch {
      parsedMessage = null;
    }
  }

  if (isRecord(parsedMessage) && typeof parsedMessage.__acp_method === 'string') {
    const acpEvent = mapAcpRawToStreamEvent(
      parsedMessage.__acp_method,
      parsedMessage.params,
      asOptionalTimestamp(parsedMessage.timestamp) ?? log.timestamp,
    );
    if (acpEvent) return acpEvent;
  }

  if (isRecord(parsedMessage)) {
    const direct = parseDirectAcpEvent(parsedMessage);
    if (direct) return direct;
  }

  const parsed = parseRawEvent(parsedMessage);
  if (parsed) {
    if ('timestamp' in parsed && !parsed.timestamp) {
      return { ...parsed, timestamp: log.timestamp };
    }
    return parsed;
  }

  return {
    type: 'log',
    timestamp: log.timestamp,
    level: log.level,
    message: log.message,
  };
}

/**
 * Internal marker on message/thought events to track whether `done: true`
 * was set by auto-close (vs explicitly by the stream). Auto-closed events
 * can still accept future chunks from the same turn.
 */
interface AutoCloseMarker { _autoClosed?: boolean }

export function appendStreamEvent(events: SessionStreamEvent[], next: SessionStreamEvent): SessionStreamEvent[] {
  const current = [...events];
  const last = current[current.length - 1];

  // --- Message merging: search backwards for same-role message to merge with ---
  if (next.type === 'acp_message') {
    for (let i = current.length - 1; i >= 0; i--) {
      const ev = current[i];
      if (ev?.type === 'acp_message') {
        if (ev.role === next.role && (!ev.done || (ev as AutoCloseMarker)._autoClosed)) {
          const merged = {
            ...ev,
            content: `${ev.content}${next.content}`,
            done: next.done,
            timestamp: next.timestamp ?? ev.timestamp,
          };
          delete (merged as AutoCloseMarker)._autoClosed;
          current[i] = merged;
          return current;
        }
        // Different role or explicitly done → new turn
        break;
      }
    }
  }

  // --- Thought merging: search backwards for thought to merge with ---
  if (next.type === 'acp_thought') {
    for (let i = current.length - 1; i >= 0; i--) {
      const ev = current[i];
      if (ev?.type === 'acp_thought' && (!ev.done || (ev as AutoCloseMarker)._autoClosed)) {
        // If content is pushed in discrete bullet blocks without trailing newlines,
        // and both chunks are non-empty, we add a newline gap UNLESS it looks like
        // mid-markdown or mid-word chunking stream.
        let joiner = '';
        const prevText = ev.content || '';
        const nextText = next.content || '';

        // Safely check if we should join with a newline (handles discrete polling status chunks)
        if (prevText && nextText && /[^\s\n]$/.test(prevText) && /^[^\s\n]/.test(nextText)) {
          // Exclude exact formatting chunk follow-ups like "**"
          if (!/^[*_`~]+$/.test(nextText)) {
            // Next block starts with a capital letter, or is repeating identical polling phrase
            if (/[a-zA-Z0-9.,*_"']$/.test(prevText) && /^[A-Z]/.test(nextText)) {
              joiner = '\n\n';
            } else if (prevText.endsWith(nextText)) {
              joiner = '\n\n';
            }
          }
        }

        const merged = {
          ...ev,
          content: `${prevText}${joiner}${nextText}`,
          done: next.done,
          timestamp: next.timestamp ?? ev.timestamp,
        };
        delete (merged as AutoCloseMarker)._autoClosed;
        current[i] = merged;
        return current;
      }
      // Stop at any message boundary (different conversation turn)
      if (ev?.type === 'acp_message') break;
      // Stop at completed/failed tool calls (agent received new info → new reasoning phase)
      if (ev?.type === 'acp_tool_call' && (ev.status === 'completed' || ev.status === 'failed')) break;
    }
  }

  // Auto-close open thoughts when a different event type arrives
  if (next.type !== 'acp_thought' && last?.type === 'acp_thought' && !last.done) {
    current[current.length - 1] = { ...last, done: true };
    (current[current.length - 1] as AutoCloseMarker)._autoClosed = true;
  }

  // Auto-close open messages when a different event type arrives
  if (next.type !== 'acp_message' && last?.type === 'acp_message' && !last.done) {
    current[current.length - 1] = { ...last, done: true };
    (current[current.length - 1] as AutoCloseMarker)._autoClosed = true;
  }

  // On session complete, close all remaining open thoughts and messages
  if (next.type === 'complete') {
    for (let i = 0; i < current.length; i++) {
      const ev = current[i];
      if ((ev?.type === 'acp_thought' || ev?.type === 'acp_message') && !ev.done) {
        current[i] = { ...ev, done: true };
      }
    }
  }

  if (next.type === 'acp_tool_call') {
    const index = current.findIndex((event) => event.type === 'acp_tool_call' && event.id === next.id);
    if (index >= 0) {
      const existing = current[index];
      if (existing.type === 'acp_tool_call') {
        current[index] = {
          ...existing,
          ...next,
          args: Object.keys(next.args).length > 0 ? next.args : existing.args,
          result: next.result ?? existing.result,
        };
      }
      return current;
    }
  }

  if (next.type === 'acp_plan') {
    let index = -1;
    for (let i = current.length - 1; i >= 0; i -= 1) {
      if (current[i]?.type === 'acp_plan') {
        index = i;
        break;
      }
    }
    if (index >= 0) {
      current[index] = next;
      return current;
    }
  }

  current.push(next);
  return current;
}

/** Close all remaining open thoughts/messages — call after replaying historical logs. */
export function finalizeStreamEvents(events: SessionStreamEvent[]): SessionStreamEvent[] {
  let mutated = false;
  const result = events.map((ev) => {
    if ((ev.type === 'acp_thought' || ev.type === 'acp_message') && !ev.done) {
      mutated = true;
      return { ...ev, done: true };
    }
    return ev;
  });
  return mutated ? result : events;
}

export function getAcpFilterType(event: SessionStreamEvent): AcpFilterType | null {
  switch (event.type) {
    case 'acp_message':
      return 'messages';
    case 'acp_thought':
      return 'thoughts';
    case 'acp_tool_call':
    case 'acp_permission_request':
      return 'tools';
    case 'acp_plan':
      return 'plan';
    default:
      return null;
  }
}

export function getActiveToolCall(events: SessionStreamEvent[]): { tool: string; id: string } | null {
  const active = [...events]
    .reverse()
    .find((event) => event.type === 'acp_tool_call' && event.status === 'running');
  if (!active || active.type !== 'acp_tool_call') return null;
  return { tool: active.tool, id: active.id };
}

export function getPlanProgress(events: SessionStreamEvent[]): { completed: number; total: number } | null {
  const plan = [...events].reverse().find((event) => event.type === 'acp_plan');
  if (!plan || plan.type !== 'acp_plan') return null;
  const total = plan.entries.length;
  const completed = plan.entries.filter((entry) => entry.status === 'done').length;
  if (total === 0) return null;
  return { completed, total };
}
