import { describe, it, expect } from 'vitest';
import { appendStreamEvent, finalizeStreamEvents, parseSessionLog, parseStreamEventPayload } from '../session-stream';
import type { SessionStreamEvent } from '../../types/api';

function msg(role: 'agent' | 'user', content: string, done = false): SessionStreamEvent {
  return { type: 'acp_message', role, content, done };
}

function thought(content: string, done = false): SessionStreamEvent {
  return { type: 'acp_thought', content, done };
}

function toolCall(id: string, tool: string, status: 'running' | 'completed' | 'failed' = 'running'): SessionStreamEvent {
  return { type: 'acp_tool_call', id, tool, args: {}, status, result: null };
}

describe('appendStreamEvent', () => {
  it('merges consecutive same-role message chunks', () => {
    let events: SessionStreamEvent[] = [];
    events = appendStreamEvent(events, msg('agent', 'Hello '));
    events = appendStreamEvent(events, msg('agent', 'world'));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'acp_message', content: 'Hello world' });
  });

  it('merges message chunks across interleaving thought events', () => {
    let events: SessionStreamEvent[] = [];
    events = appendStreamEvent(events, msg('agent', 'Hello '));
    events = appendStreamEvent(events, thought('thinking...', true));
    events = appendStreamEvent(events, msg('agent', 'world'));

    // Should merge into one message, not scatter into two
    const messages = events.filter((e) => e.type === 'acp_message');
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ content: 'Hello world' });
  });

  it('merges message chunks across interleaving tool call events', () => {
    let events: SessionStreamEvent[] = [];
    events = appendStreamEvent(events, msg('agent', 'Before '));
    events = appendStreamEvent(events, toolCall('t1', 'read_file'));
    events = appendStreamEvent(events, msg('agent', 'after'));

    const messages = events.filter((e) => e.type === 'acp_message');
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ content: 'Before after' });
  });

  it('merges message chunks across multiple interleaving events', () => {
    let events: SessionStreamEvent[] = [];
    events = appendStreamEvent(events, msg('agent', 'A'));
    events = appendStreamEvent(events, thought('hmm', true));
    events = appendStreamEvent(events, toolCall('t1', 'search'));
    events = appendStreamEvent(events, toolCall('t1', 'search', 'completed'));
    events = appendStreamEvent(events, msg('agent', 'B'));
    events = appendStreamEvent(events, msg('agent', 'C', true));

    const messages = events.filter((e) => e.type === 'acp_message');
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ content: 'ABC', done: true });
  });

  it('does NOT merge messages across role changes', () => {
    let events: SessionStreamEvent[] = [];
    events = appendStreamEvent(events, msg('agent', 'Hello', true));
    events = appendStreamEvent(events, msg('user', 'Hi', true));
    events = appendStreamEvent(events, msg('agent', 'New turn'));

    const agentMsgs = events.filter((e) => e.type === 'acp_message' && e.role === 'agent');
    expect(agentMsgs).toHaveLength(2);
    expect(agentMsgs[0]).toMatchObject({ content: 'Hello' });
    expect(agentMsgs[1]).toMatchObject({ content: 'New turn' });
  });

  it('does NOT merge with explicitly done message (no intervening events)', () => {
    let events: SessionStreamEvent[] = [];
    events = appendStreamEvent(events, msg('agent', 'First', true));
    events = appendStreamEvent(events, msg('agent', 'Second'));

    const messages = events.filter((e) => e.type === 'acp_message');
    // When the last message was explicitly done and next one starts, it's a new turn
    expect(messages).toHaveLength(2);
  });

  it('merges thought chunks across interleaving tool calls', () => {
    let events: SessionStreamEvent[] = [];
    events = appendStreamEvent(events, thought('Part 1 '));
    events = appendStreamEvent(events, toolCall('t1', 'read'));
    events = appendStreamEvent(events, thought('Part 2', true));

    const thoughts = events.filter((e) => e.type === 'acp_thought');
    expect(thoughts).toHaveLength(1);
    expect(thoughts[0]).toMatchObject({ content: 'Part 1 Part 2', done: true });
  });

  it('does NOT merge thoughts across a message boundary', () => {
    let events: SessionStreamEvent[] = [];
    events = appendStreamEvent(events, thought('Thought 1', true));
    events = appendStreamEvent(events, msg('agent', 'Message', true));
    events = appendStreamEvent(events, thought('Thought 2'));

    const thoughts = events.filter((e) => e.type === 'acp_thought');
    expect(thoughts).toHaveLength(2);
  });

  it('does NOT merge thoughts across a completed tool call', () => {
    let events: SessionStreamEvent[] = [];
    events = appendStreamEvent(events, thought('Thought 1'));
    events = appendStreamEvent(events, toolCall('t1', 'read_file'));
    events = appendStreamEvent(events, toolCall('t1', 'read_file', 'completed'));
    events = appendStreamEvent(events, thought('Thought 2'));

    const thoughts = events.filter((e) => e.type === 'acp_thought');
    expect(thoughts).toHaveLength(2);
    expect(thoughts[0]).toMatchObject({ content: 'Thought 1', done: true });
    expect(thoughts[1]).toMatchObject({ content: 'Thought 2' });
  });

  it('does NOT merge thoughts across a failed tool call', () => {
    let events: SessionStreamEvent[] = [];
    events = appendStreamEvent(events, thought('Thought 1'));
    events = appendStreamEvent(events, toolCall('t1', 'search', 'failed'));
    events = appendStreamEvent(events, thought('Thought 2'));

    const thoughts = events.filter((e) => e.type === 'acp_thought');
    expect(thoughts).toHaveLength(2);
  });

  it('auto-closes trailing open thought on different event type', () => {
    let events: SessionStreamEvent[] = [];
    events = appendStreamEvent(events, thought('open'));
    events = appendStreamEvent(events, toolCall('t1', 'search'));

    expect(events[0]).toMatchObject({ type: 'acp_thought', done: true });
  });

  it('merges tool call updates by id', () => {
    let events: SessionStreamEvent[] = [];
    events = appendStreamEvent(events, toolCall('t1', 'read_file', 'running'));
    events = appendStreamEvent(events, toolCall('t1', 'read_file', 'completed'));

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'acp_tool_call', status: 'completed' });
  });

  it('replaces plan events in place', () => {
    const plan1: SessionStreamEvent = { type: 'acp_plan', entries: [{ id: '1', title: 'Step 1', status: 'running' }] };
    const plan2: SessionStreamEvent = { type: 'acp_plan', entries: [{ id: '1', title: 'Step 1', status: 'done' }] };

    let events: SessionStreamEvent[] = [];
    events = appendStreamEvent(events, msg('agent', 'Hello', true));
    events = appendStreamEvent(events, plan1);
    events = appendStreamEvent(events, plan2);

    const plans = events.filter((e) => e.type === 'acp_plan');
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ entries: [{ status: 'done' }] });
  });
});

describe('finalizeStreamEvents', () => {
  it('closes all open messages and thoughts', () => {
    const events: SessionStreamEvent[] = [
      msg('agent', 'open msg'),
      thought('open thought'),
    ];
    const finalized = finalizeStreamEvents(events);
    expect(finalized[0]).toMatchObject({ done: true });
    expect(finalized[1]).toMatchObject({ done: true });
  });

  it('returns same array reference when nothing to close', () => {
    const events: SessionStreamEvent[] = [
      msg('agent', 'done', true),
      thought('done', true),
    ];
    const finalized = finalizeStreamEvents(events);
    expect(finalized).toBe(events);
  });
});

describe('parseStreamEventPayload', () => {
  it('preserves line breaks when acp thought content is an array of text blocks', () => {
    const payload = {
      __acp_method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'agent_thought_chunk',
          content: [
            { type: 'text', text: 'Line 1' },
            { type: 'text', text: 'Line 2' },
          ],
          done: true,
        },
      },
    };

    const event = parseStreamEventPayload(payload);
    expect(event).toMatchObject({
      type: 'acp_thought',
      content: 'Line 1\n\nLine 2',
      done: true,
    });
  });

  it('extracts tool name from toolName field in session/update', () => {
    const payload = {
      __acp_method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'call-1',
          toolName: 'list_specs',
          status: 'completed',
          rawInput: {},
        },
      },
    };
    const event = parseStreamEventPayload(payload);
    expect(event).toMatchObject({ type: 'acp_tool_call', tool: 'list_specs', id: 'call-1' });
  });

  it('extracts tool name from title field in session/update', () => {
    const payload = {
      __acp_method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'call-2',
          title: 'read_file',
          status: 'running',
        },
      },
    };
    const event = parseStreamEventPayload(payload);
    expect(event).toMatchObject({ type: 'acp_tool_call', tool: 'read_file', id: 'call-2' });
  });

  it('extracts tool name from toolName in direct acp_tool_call event', () => {
    const payload = {
      type: 'acp_tool_call',
      id: 'call-3',
      toolName: 'search_specs',
      args: {},
      status: 'running',
    };
    const event = parseStreamEventPayload(payload);
    expect(event).toMatchObject({ type: 'acp_tool_call', tool: 'search_specs', id: 'call-3' });
  });
});

describe('parseSessionLog', () => {
  it('extracts tool name from toolName in embedded JSONRPC log', () => {
    const log = {
      id: 1,
      session_id: 'session-1',
      timestamp: '2026-01-01T00:00:00Z',
      level: 'info',
      message: JSON.stringify({
        __acp_method: 'session/update',
        params: {
          update: {
            sessionUpdate: 'tool_call',
            toolCallId: 'call-4',
            toolName: 'view_spec',
            status: 'completed',
            result: { text: 'hello' },
          },
        },
      }),
    };
    const event = parseSessionLog(log);
    expect(event).toMatchObject({ type: 'acp_tool_call', tool: 'view_spec', id: 'call-4' });
  });
});
