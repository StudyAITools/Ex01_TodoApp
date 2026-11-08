/**
 * localStorage 저장/불러오기.
 * 시크릿 모드, 차단된 사이트 데이터, 용량 초과 등으로 저장소 접근이 실패해도 앱이 멈추지 않도록
 * 모든 접근을 try/catch로 감싼다. 테스트에서는 storage 인자로 가짜 저장소를 넘길 수 있다.
 */
import { sanitizeTodos } from './todos.js';

export const STORAGE_KEY = 'todo-app/v1';

/** `localStorage`에 접근하는 것만으로 예외가 날 수 있어(SecurityError) 안전하게 가져온다. */
function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadTodos(storage = defaultStorage()) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return raw ? sanitizeTodos(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

/** @returns {boolean} 저장에 성공했는지 */
export function saveTodos(todos, storage = defaultStorage()) {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(todos));
    return true;
  } catch {
    return false;
  }
}

export function isStorageAvailable(storage = defaultStorage()) {
  if (!storage) return false;
  const probeKey = `${STORAGE_KEY}:probe`;
  try {
    storage.setItem(probeKey, '1');
    storage.removeItem(probeKey);
    return true;
  } catch {
    return false;
  }
}
