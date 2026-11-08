/**
 * 할 일 목록 상태를 다루는 순수 함수 모음.
 *
 * - DOM·저장소에 의존하지 않으므로 Node에서 그대로 테스트할 수 있다.
 * - 입력 배열을 절대 변경하지 않는다. 바뀐 것이 있으면 새 배열을, 없으면 원본을 그대로 반환한다.
 *   (호출하는 쪽은 `next !== todos`로 변경 여부를 판단할 수 있다.)
 *
 * @typedef {{ id: string, title: string, completed: boolean, createdAt: number }} Todo
 * @typedef {{ todo: Todo, index: number }} TodoEntry 삭제 전 위치를 기억한 항목 (실행 취소용)
 */

export const FILTERS = Object.freeze({
  all: 'all',
  active: 'active',
  completed: 'completed',
});

export const MAX_TITLE_LENGTH = 200;

/** 고유 ID를 만든다. randomUUID를 쓸 수 없는 환경(비보안 컨텍스트 등)에서는 대체 값을 쓴다. */
export function generateId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 앞뒤 공백을 지우고 연속 공백을 하나로 줄인 뒤, 최대 길이(코드 포인트 단위)로 자른다. */
export function normalizeTitle(title) {
  if (typeof title !== 'string') return '';
  const collapsed = title.replace(/\s+/g, ' ').trim();
  const chars = Array.from(collapsed);
  if (chars.length <= MAX_TITLE_LENGTH) return collapsed;
  return chars.slice(0, MAX_TITLE_LENGTH).join('').trimEnd();
}

/** @returns {Todo | null} 제목이 비어 있으면 null */
export function createTodo(title, { id = generateId(), now = Date.now() } = {}) {
  const normalized = normalizeTitle(title);
  if (!normalized) return null;
  return { id, title: normalized, completed: false, createdAt: now };
}

/** 목록 끝에 새 할 일을 추가한다. 제목이 비어 있으면 원본을 반환한다. */
export function addTodo(todos, title, options) {
  const todo = createTodo(title, options);
  return todo ? [...todos, todo] : todos;
}

function updateById(todos, id, update) {
  const index = todos.findIndex((todo) => todo.id === id);
  if (index === -1) return todos;
  const updated = update(todos[index]);
  if (updated === todos[index]) return todos;
  const next = todos.slice();
  next[index] = updated;
  return next;
}

export function toggleTodo(todos, id) {
  return updateById(todos, id, (todo) => ({ ...todo, completed: !todo.completed }));
}

export function setAllCompleted(todos, completed) {
  if (todos.every((todo) => todo.completed === completed)) return todos;
  return todos.map((todo) => (todo.completed === completed ? todo : { ...todo, completed }));
}

/** 제목을 바꾼다. 새 제목이 비어 있으면 실수로 지운 것으로 보고 원래 제목을 유지한다. */
export function updateTitle(todos, id, title) {
  const normalized = normalizeTitle(title);
  if (!normalized) return todos;
  return updateById(todos, id, (todo) => (todo.title === normalized ? todo : { ...todo, title: normalized }));
}

function removeWhere(todos, predicate) {
  const next = todos.filter((todo) => !predicate(todo));
  return next.length === todos.length ? todos : next;
}

export function removeTodo(todos, id) {
  return removeWhere(todos, (todo) => todo.id === id);
}

export function clearCompleted(todos) {
  return removeWhere(todos, (todo) => todo.completed);
}

/** 조건에 맞는 항목을 현재 위치와 함께 꺼낸다. 삭제 전에 호출해 두면 restoreTodos로 되돌릴 수 있다. */
export function pickEntries(todos, predicate) {
  return todos.flatMap((todo, index) => (predicate(todo) ? [{ todo, index }] : []));
}

/**
 * pickEntries로 기억해 둔 항목을 원래 위치에 다시 넣는다.
 * 그 사이 다른 항목이 추가·변경되었어도 동작하며, 이미 있는 id는 건너뛴다.
 */
export function restoreTodos(todos, entries) {
  const ids = new Set(todos.map((todo) => todo.id));
  const next = todos.slice();
  for (const { todo, index } of [...entries].sort((a, b) => a.index - b.index)) {
    if (ids.has(todo.id)) continue;
    next.splice(Math.min(index, next.length), 0, todo);
    ids.add(todo.id);
  }
  return next.length === todos.length ? todos : next;
}

export function filterTodos(todos, filter) {
  switch (filter) {
    case FILTERS.active:
      return todos.filter((todo) => !todo.completed);
    case FILTERS.completed:
      return todos.filter((todo) => todo.completed);
    default:
      return todos;
  }
}

export function getStats(todos) {
  const completed = todos.filter((todo) => todo.completed).length;
  return { total: todos.length, active: todos.length - completed, completed };
}

/** '#/active' 같은 URL 해시를 필터 값으로 바꾼다. 알 수 없는 값은 전체 보기. */
export function parseFilter(hash) {
  const value = typeof hash === 'string' ? hash.replace(/^#\/?/, '') : '';
  return Object.hasOwn(FILTERS, value) ? FILTERS[value] : FILTERS.all;
}

/** 저장소에서 읽은 알 수 없는 값을 안전한 Todo 배열로 정리한다. 잘못된 항목과 중복 id는 버린다. */
export function sanitizeTodos(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const todos = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const { id, title, completed, createdAt } = item;
    const normalized = normalizeTitle(title);
    if (typeof id !== 'string' || !id || seen.has(id) || !normalized) continue;
    seen.add(id);
    todos.push({
      id,
      title: normalized,
      completed: completed === true,
      createdAt: Number.isFinite(createdAt) ? createdAt : 0,
    });
  }
  return todos;
}
