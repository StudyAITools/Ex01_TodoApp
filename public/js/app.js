/**
 * TODO 앱의 화면(DOM) 계층.
 * 상태 변경은 todos.js의 순수 함수로 계산하고, 여기서는 저장·렌더링·포커스 관리만 한다.
 */
import {
  FILTERS,
  MAX_TITLE_LENGTH,
  addTodo,
  clearCompleted,
  filterTodos,
  getStats,
  parseFilter,
  pickEntries,
  removeTodo,
  restoreTodos,
  setAllCompleted,
  toggleTodo,
  updateTitle,
} from './todos.js';
import { STORAGE_KEY, isStorageAvailable, loadTodos, saveTodos } from './storage.js';

const UNDO_TIMEOUT_MS = 6000;
/** 다시 그린 뒤 포커스를 되돌려 줄 수 있는 항목 안의 컨트롤 */
const ITEM_CONTROLS = ['todo-toggle', 'todo-edit-btn', 'todo-delete'];
const EMPTY_MESSAGES = {
  none: '아직 할 일이 없어요. 위 입력란에 첫 할 일을 적어 보세요.',
  [FILTERS.active]: '진행 중인 할 일이 없어요.',
  [FILTERS.completed]: '아직 완료한 할 일이 없어요.',
};

const $ = (selector) => document.querySelector(selector);

const els = {
  today: $('#today'),
  summary: $('#summary'),
  progressText: $('#progress-text'),
  progressBar: $('#progress-bar'),
  newTodoForm: $('#new-todo-form'),
  newTodoInput: $('#new-todo'),
  storageWarning: $('#storage-warning'),
  toolbar: $('#toolbar'),
  filterLinks: document.querySelectorAll('[data-filter]'),
  filterCounts: document.querySelectorAll('[data-count]'),
  toggleAll: $('#toggle-all'),
  list: $('#todo-list'),
  empty: $('#empty-state'),
  footer: $('#footer'),
  count: $('#todo-count'),
  clearCompleted: $('#clear-completed'),
  toast: $('#toast'),
  toastMessage: $('#toast-message'),
  toastUndo: $('#toast-undo'),
  announcer: $('#announcer'),
  itemTemplate: $('#todo-item-template'),
  editTemplate: $('#todo-edit-template'),
};

const state = {
  todos: loadTodos(),
  filter: parseFilter(location.hash),
  /** 제목을 수정 중인 항목의 id */
  editingId: null,
};

/** 마지막 삭제를 되돌리기 위한 정보: { entries, timer } */
let undo = null;
let toastHovered = false;
let toastFocused = false;
let announceTimer = 0;
/** render() 도중 편집 입력란이 제거되며 생기는 focusout을 무시하기 위한 플래그 */
let isRendering = false;

// ─── 상태 변경 ──────────────────────────────────────────────

function commit(nextTodos, renderOptions) {
  if (nextTodos !== state.todos) {
    state.todos = nextTodos;
    els.storageWarning.hidden = saveTodos(nextTodos);
  }
  render(renderOptions);
}

function startEditing(id) {
  if (!id || state.editingId === id) return;
  state.editingId = id;
  render();
}

function finishEditing(id, title, { restoreFocus = false } = {}) {
  if (state.editingId !== id) return;
  state.editingId = null;
  commit(updateTitle(state.todos, id, title), restoreFocus ? { focus: { id, control: 'todo-edit-btn' } } : {});
}

function cancelEditing({ restoreFocus = false } = {}) {
  const id = state.editingId;
  if (!id) return;
  state.editingId = null;
  render(restoreFocus ? { focus: { id, control: 'todo-edit-btn' } } : {});
}

function deleteTodo(id) {
  const entries = pickEntries(state.todos, (todo) => todo.id === id);
  if (entries.length === 0) return;
  commit(removeTodo(state.todos, id));
  offerUndo(entries, '할 일을 삭제했어요.');
}

function deleteCompleted() {
  const entries = pickEntries(state.todos, (todo) => todo.completed);
  if (entries.length === 0) return;
  const movedByKeyboard = isKeyboardFocused(els.clearCompleted);
  commit(clearCompleted(state.todos));
  // 버튼이 사라지므로 키보드 사용자의 포커스를 입력란으로 옮긴다.
  if (movedByKeyboard) els.newTodoInput.focus();
  offerUndo(entries, `완료한 할 일 ${entries.length}개를 삭제했어요.`);
}

// ─── 렌더링 ────────────────────────────────────────────────

function render({ focus = null } = {}) {
  const stats = getStats(state.todos);
  const visible = filterTodos(state.todos, state.filter);
  if (state.editingId && !visible.some((todo) => todo.id === state.editingId)) {
    state.editingId = null;
  }
  const previousFocus = focus ? null : captureListFocus();

  isRendering = true;
  try {
    const newEditInput = renderList(visible);
    renderStatus(stats, visible.length);

    if (newEditInput) {
      newEditInput.focus();
      const end = newEditInput.value.length;
      newEditInput.setSelectionRange(end, end);
    } else if (focus) {
      focusItemControl(focus);
    } else if (previousFocus && isFocusLost()) {
      focusItemControl(previousFocus);
    }
  } finally {
    isRendering = false;
  }
}

/**
 * id를 키로 기존 <li>를 재사용한다. 통째로 다시 그리지 않으므로
 * 편집 중인 입력값·포커스가 유지되고, 편집 중 다른 항목을 클릭해도 클릭이 사라지지 않는다.
 * @returns {HTMLInputElement | null} 이번에 새로 열린 편집 입력란
 */
function renderList(visible) {
  const visibleIds = new Set(visible.map((todo) => todo.id));
  for (const item of Array.from(els.list.children)) {
    if (!visibleIds.has(item.dataset.id)) item.remove();
  }
  const existing = new Map(Array.from(els.list.children, (item) => [item.dataset.id, item]));

  let newEditInput = null;
  visible.forEach((todo, index) => {
    const item = existing.get(todo.id) ?? createItem(todo.id);
    newEditInput = updateItem(item, todo, todo.id === state.editingId) ?? newEditInput;
    const current = els.list.children[index];
    if (current !== item) els.list.insertBefore(item, current ?? null);
  });
  return newEditInput;
}

function createItem(id) {
  const item = els.itemTemplate.content.firstElementChild.cloneNode(true);
  const titleId = `todo-title-${id}`;
  item.dataset.id = id;
  item.querySelector('.todo-title').id = titleId;
  item.querySelector('.todo-toggle').setAttribute('aria-labelledby', titleId);
  return item;
}

function updateItem(item, todo, isEditing) {
  item.classList.toggle('is-completed', todo.completed);
  item.querySelector('.todo-toggle').checked = todo.completed;
  const title = item.querySelector('.todo-title');
  if (title.textContent !== todo.title) title.textContent = todo.title;
  item.querySelector('.todo-edit-btn').setAttribute('aria-label', `${todo.title} 수정`);
  item.querySelector('.todo-delete').setAttribute('aria-label', `${todo.title} 삭제`);

  item.classList.toggle('is-editing', isEditing);
  const form = item.querySelector('.todo-edit-form');
  if (isEditing && !form) {
    const newForm = els.editTemplate.content.firstElementChild.cloneNode(true);
    const input = newForm.elements.namedItem('title');
    input.maxLength = MAX_TITLE_LENGTH;
    input.value = todo.title;
    title.after(newForm);
    return input;
  }
  if (!isEditing && form) form.remove();
  return null;
}

function renderStatus(stats, visibleCount) {
  const hasTodos = stats.total > 0;
  const percent = hasTodos ? Math.round((stats.completed / stats.total) * 100) : 0;

  els.summary.hidden = !hasTodos;
  els.progressText.textContent = `${stats.completed} / ${stats.total} 완료`;
  els.progressBar.style.width = `${percent}%`;

  els.toolbar.hidden = !hasTodos;
  for (const link of els.filterLinks) {
    if (link.dataset.filter === state.filter) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  for (const badge of els.filterCounts) badge.textContent = String(stats[badge.dataset.count]);
  els.toggleAll.textContent = stats.active === 0 ? '모두 해제' : '모두 완료';

  els.list.hidden = visibleCount === 0;
  els.empty.hidden = visibleCount > 0;
  els.empty.textContent = EMPTY_MESSAGES[hasTodos ? state.filter : 'none'] ?? '';

  els.footer.hidden = !hasTodos;
  els.count.textContent = stats.active > 0 ? `남은 할 일 ${stats.active}개` : '모두 끝냈어요! 🎉';
  els.clearCompleted.hidden = stats.completed === 0;

  document.title = stats.active > 0 ? `(${stats.active}) 할 일` : '할 일';
}

// ─── 포커스 관리 ────────────────────────────────────────────

/** 키보드로 포커스된 상태인지. 마우스·터치 사용자에게는 포커스를 억지로 옮기지 않기 위해 쓴다. */
function isKeyboardFocused(element) {
  try {
    return element.matches(':focus-visible');
  } catch {
    return element === document.activeElement;
  }
}

function isFocusLost() {
  const active = document.activeElement;
  return !active || active === document.body;
}

function captureListFocus() {
  const active = document.activeElement;
  if (!active || !els.list.contains(active) || !isKeyboardFocused(active)) return null;
  const control = ITEM_CONTROLS.find((name) => active.classList.contains(name));
  const item = active.closest('.todo-item');
  if (!control || !item) return null;
  return { id: item.dataset.id, control, index: Array.from(els.list.children).indexOf(item) };
}

/** 같은 항목의 컨트롤로, 항목이 사라졌으면 같은 자리 항목으로, 목록이 비었으면 입력란으로 포커스를 옮긴다. */
function focusItemControl({ id, control, index = 0 }) {
  const items = Array.from(els.list.children);
  const item = items.find((el) => el.dataset.id === id) ?? items[Math.min(index, items.length - 1)];
  const target = item?.querySelector(`.${control}`);
  (target ?? els.newTodoInput).focus();
}

// ─── 실행 취소 토스트 & 스크린리더 알림 ─────────────────────

function offerUndo(entries, message) {
  clearTimeout(undo?.timer);
  undo = { entries, timer: 0 };
  els.toastMessage.textContent = message;
  els.toast.hidden = false;
  scheduleUndoDismiss();
  announce(message);
}

/** 마우스가 올라가 있거나 포커스가 있는 동안에는 토스트를 닫지 않는다. */
function scheduleUndoDismiss() {
  if (!undo) return;
  clearTimeout(undo.timer);
  if (toastHovered || toastFocused) return;
  undo.timer = setTimeout(dismissUndo, UNDO_TIMEOUT_MS);
}

function dismissUndo() {
  if (!undo) return;
  clearTimeout(undo.timer);
  undo = null;
  if (isKeyboardFocused(els.toastUndo)) els.newTodoInput.focus();
  els.toast.hidden = true;
  toastHovered = false;
  toastFocused = false;
}

function undoLastDelete() {
  if (!undo) return;
  const { entries } = undo;
  dismissUndo();
  commit(restoreTodos(state.todos, entries));
  announce('삭제를 취소했어요.');
}

function announce(message) {
  clearTimeout(announceTimer);
  els.announcer.textContent = '';
  // 같은 문구가 연달아 나와도 다시 읽히도록 비운 뒤 잠시 후에 채운다.
  announceTimer = setTimeout(() => {
    els.announcer.textContent = message;
  }, 100);
}

// ─── 이벤트 ────────────────────────────────────────────────

const itemIdOf = (element) => element.closest('.todo-item')?.dataset.id;

// <form>의 submit을 쓰면 한글 IME 조합 중 Enter로 항목이 두 번 추가되거나
// 마지막 글자가 입력란에 남는 문제(keydown 방식의 흔한 버그)가 생기지 않는다.
els.newTodoForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const next = addTodo(state.todos, els.newTodoInput.value);
  els.newTodoInput.value = '';
  els.newTodoInput.focus();
  if (next === state.todos) return;
  if (state.filter === FILTERS.completed) {
    // 완료 목록에서는 새 항목이 보이지 않으므로 전체 보기로 전환한다.
    state.filter = FILTERS.all;
    history.replaceState(null, '', '#/');
  }
  commit(next);
  announce('할 일을 추가했어요.');
});

els.list.addEventListener('change', (event) => {
  if (event.target.matches('.todo-toggle')) {
    commit(toggleTodo(state.todos, itemIdOf(event.target)));
  }
});

els.list.addEventListener('click', (event) => {
  const button = event.target.closest('.todo-edit-btn, .todo-delete');
  if (!button) return;
  const id = itemIdOf(button);
  if (button.classList.contains('todo-delete')) deleteTodo(id);
  else startEditing(id);
});

els.list.addEventListener('dblclick', (event) => {
  const title = event.target.closest('.todo-title');
  if (title) startEditing(itemIdOf(title));
});

els.list.addEventListener('submit', (event) => {
  const form = event.target.closest('.todo-edit-form');
  if (!form) return;
  event.preventDefault();
  finishEditing(itemIdOf(form), form.elements.namedItem('title').value, { restoreFocus: true });
});

els.list.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || event.isComposing || event.keyCode === 229) return;
  if (!event.target.matches('.todo-edit-input')) return;
  event.preventDefault();
  cancelEditing({ restoreFocus: true });
});

// 편집 중 다른 곳을 누르면 저장한다.
els.list.addEventListener('focusout', (event) => {
  if (isRendering || !event.target.matches('.todo-edit-input')) return;
  finishEditing(itemIdOf(event.target), event.target.value);
});

els.toggleAll.addEventListener('click', () => {
  commit(setAllCompleted(state.todos, getStats(state.todos).active > 0));
});

els.clearCompleted.addEventListener('click', deleteCompleted);

els.toastUndo.addEventListener('click', undoLastDelete);
els.toast.addEventListener('mouseenter', () => {
  toastHovered = true;
  scheduleUndoDismiss();
});
els.toast.addEventListener('mouseleave', () => {
  toastHovered = false;
  scheduleUndoDismiss();
});
els.toast.addEventListener('focusin', () => {
  toastFocused = true;
  scheduleUndoDismiss();
});
els.toast.addEventListener('focusout', (event) => {
  toastFocused = els.toast.contains(event.relatedTarget);
  scheduleUndoDismiss();
});

window.addEventListener('hashchange', () => {
  state.filter = parseFilter(location.hash);
  render();
});

// 다른 탭에서 목록을 바꾸면 이 탭에도 반영한다.
window.addEventListener('storage', (event) => {
  if (event.key !== null && event.key !== STORAGE_KEY) return;
  state.todos = loadTodos();
  render();
});

// ─── 시작 ─────────────────────────────────────────────────

els.today.textContent = new Intl.DateTimeFormat('ko-KR', {
  month: 'long',
  day: 'numeric',
  weekday: 'long',
}).format(new Date());
els.newTodoInput.maxLength = MAX_TITLE_LENGTH;
els.storageWarning.hidden = isStorageAvailable();
render();
