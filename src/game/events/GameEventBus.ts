import { GameEvent, GameEventPayloadMap } from './GameEventTypes';

type EventHandler<E extends GameEvent> = (payload: GameEventPayloadMap[E]) => void;

interface ListenerEntry<E extends GameEvent> {
  handler: EventHandler<E>;
  once: boolean;
}

export interface GameEventBus {
  on<E extends GameEvent>(event: E, handler: EventHandler<E>): () => void;
  once<E extends GameEvent>(event: E, handler: EventHandler<E>): () => void;
  emit<E extends GameEvent>(event: E, payload: GameEventPayloadMap[E]): void;
  off<E extends GameEvent>(event: E, handler: EventHandler<E>): void;
  removeAllListeners(): void;
  listenerCount(event: GameEvent): number;
}

export function createGameEventBus(): GameEventBus {
  const listeners = new Map<GameEvent, Set<ListenerEntry<any>>>();

  function on<E extends GameEvent>(event: E, handler: EventHandler<E>): () => void {
    if (!listeners.has(event)) {
      listeners.set(event, new Set());
    }
    const entry: ListenerEntry<E> = { handler, once: false };
    listeners.get(event)!.add(entry);
    return () => {
      listeners.get(event)?.delete(entry);
    };
  }

  function once<E extends GameEvent>(event: E, handler: EventHandler<E>): () => void {
    if (!listeners.has(event)) {
      listeners.set(event, new Set());
    }
    const entry: ListenerEntry<E> = { handler, once: true };
    listeners.get(event)!.add(entry);
    return () => {
      listeners.get(event)?.delete(entry);
    };
  }

  function emit<E extends GameEvent>(event: E, payload: GameEventPayloadMap[E]): void {
    const entries = listeners.get(event);
    if (!entries) return;

    const toRun: ListenerEntry<E>[] = [];
    for (const entry of entries) {
      toRun.push(entry);
      if (entry.once) {
        entries.delete(entry);
      }
    }
    for (const entry of toRun) {
      entry.handler(payload);
    }
  }

  function off<E extends GameEvent>(event: E, handler: EventHandler<E>): void {
    const entries = listeners.get(event);
    if (!entries) return;
    for (const entry of entries) {
      if (entry.handler === handler) {
        entries.delete(entry);
        break;
      }
    }
  }

  function removeAllListeners(): void {
    listeners.clear();
  }

  function listenerCount(event: GameEvent): number {
    return listeners.get(event)?.size ?? 0;
  }

  return { on, once, emit, off, removeAllListeners, listenerCount };
}
