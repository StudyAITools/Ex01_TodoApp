import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FILTERS,
  MAX_TITLE_LENGTH,
  addTodo,
  clearCompleted,
  createTodo,
  filterTodos,
  generateId,
  getStats,
  normalizeTitle,
  parseFilter,
  pickEntries,
  removeTodo,
  restoreTodos,
  sanitizeTodos,
  setAllCompleted,
  toggleTodo,
  updateTitle,
} from '../public/js/todos.js';

const make = (id, overrides = {}) => ({ id, title: `할 일 ${id}`, completed: false, createdAt: 0, ...overrides });
const ids = (todos) => todos.map((todo) => todo.id);

describe('normalizeTitle', () => {
  test('앞뒤 공백을 지우고 연속 공백을 하나로 줄인다', () => {
    assert.equal(normalizeTitle('  우유   사기 \n\t'), '우유 사기');
  });

  test('문자열이 아니면 빈 문자열을 반환한다', () => {
    assert.equal(normalizeTitle(undefined), '');
    assert.equal(normalizeTitle(42), '');
  });

  test('최대 길이를 넘으면 이모지가 깨지지 않게 코드 포인트 단위로 자른다', () => {
    const result = normalizeTitle('😀'.repeat(MAX_TITLE_LENGTH + 5));
    assert.equal(result, '😀'.repeat(MAX_TITLE_LENGTH));
  });
});

describe('createTodo / addTodo', () => {
  test('정리된 제목으로 미완료 항목을 만든다', () => {
    assert.deepEqual(createTodo('  운동  ', { id: 'x', now: 123 }), {
      id: 'x',
      title: '운동',
      completed: false,
      createdAt: 123,
    });
  });

  test('빈 제목이면 null', () => {
    assert.equal(createTodo('   '), null);
  });

  test('목록 끝에 추가하고 원본은 바꾸지 않는다', () => {
    const todos = [make('a')];
    const next = addTodo(todos, '새 항목', { id: 'b', now: 1 });
    assert.deepEqual(ids(next), ['a', 'b']);
    assert.deepEqual(ids(todos), ['a']);
  });

  test('빈 제목이면 원본 배열을 그대로 반환한다', () => {
    const todos = [make('a')];
    assert.equal(addTodo(todos, ' \n '), todos);
  });

  test('id를 주지 않으면 서로 다른 id가 만들어진다', () => {
    const next = addTodo(addTodo([], '하나'), '둘');
    assert.notEqual(next[0].id, next[1].id);
    assert.notEqual(generateId(), generateId());
  });
});

describe('toggleTodo / setAllCompleted', () => {
  test('해당 항목만 완료 상태를 뒤집는다', () => {
    const todos = [make('a'), make('b')];
    const next = toggleTodo(todos, 'b');
    assert.equal(next[1].completed, true);
    assert.equal(next[0], todos[0]);
    assert.equal(todos[1].completed, false);
  });

  test('없는 id면 원본을 반환한다', () => {
    const todos = [make('a')];
    assert.equal(toggleTodo(todos, 'zzz'), todos);
  });

  test('모두 완료/해제', () => {
    const todos = [make('a'), make('b', { completed: true })];
    assert.ok(setAllCompleted(todos, true).every((todo) => todo.completed));
    assert.ok(setAllCompleted(todos, false).every((todo) => !todo.completed));
  });

  test('이미 모두 그 상태면 원본을 반환한다', () => {
    const todos = [make('a', { completed: true })];
    assert.equal(setAllCompleted(todos, true), todos);
  });
});

describe('updateTitle', () => {
  test('제목을 정리해서 바꾼다', () => {
    const next = updateTitle([make('a')], 'a', '  새   제목 ');
    assert.equal(next[0].title, '새 제목');
  });

  test('빈 제목이면 실수로 보고 원래 제목을 유지한다', () => {
    const todos = [make('a')];
    assert.equal(updateTitle(todos, 'a', '   '), todos);
  });

  test('제목이 같거나 id가 없으면 원본을 반환한다', () => {
    const todos = [make('a')];
    assert.equal(updateTitle(todos, 'a', todos[0].title), todos);
    assert.equal(updateTitle(todos, 'zzz', '무엇이든'), todos);
  });
});

describe('removeTodo / clearCompleted', () => {
  test('해당 항목을 지운다', () => {
    assert.deepEqual(ids(removeTodo([make('a'), make('b')], 'a')), ['b']);
  });

  test('완료된 항목만 지운다', () => {
    const todos = [make('a', { completed: true }), make('b'), make('c', { completed: true })];
    assert.deepEqual(ids(clearCompleted(todos)), ['b']);
  });

  test('지울 것이 없으면 원본을 반환한다', () => {
    const todos = [make('a')];
    assert.equal(removeTodo(todos, 'zzz'), todos);
    assert.equal(clearCompleted(todos), todos);
  });
});

describe('pickEntries / restoreTodos (실행 취소)', () => {
  test('삭제한 항목들을 원래 위치로 되돌린다', () => {
    const todos = ['a', 'b', 'c', 'd'].map((id, i) => make(id, { completed: i % 2 === 1 }));
    const entries = pickEntries(todos, (todo) => todo.completed);
    assert.deepEqual(
      entries.map((entry) => entry.index),
      [1, 3],
    );
    assert.deepEqual(restoreTodos(clearCompleted(todos), entries), todos);
  });

  test('삭제 후 다른 항목이 추가되어도 원래 자리로 들어간다', () => {
    const todos = [make('a'), make('b'), make('c')];
    const entries = pickEntries(todos, (todo) => todo.id === 'b');
    const changed = addTodo(removeTodo(todos, 'b'), '새 항목', { id: 'e' });
    assert.deepEqual(ids(restoreTodos(changed, entries)), ['a', 'b', 'c', 'e']);
  });

  test('목록이 짧아졌으면 끝에 넣는다', () => {
    const entries = [{ todo: make('z'), index: 10 }];
    assert.deepEqual(ids(restoreTodos([make('a')], entries)), ['a', 'z']);
  });

  test('이미 있는 id는 다시 넣지 않는다', () => {
    const todos = [make('a')];
    assert.equal(restoreTodos(todos, [{ todo: make('a'), index: 0 }]), todos);
  });
});

describe('filterTodos / getStats / parseFilter', () => {
  const todos = [make('a'), make('b', { completed: true }), make('c')];

  test('필터별로 항목을 고른다', () => {
    assert.deepEqual(ids(filterTodos(todos, FILTERS.all)), ['a', 'b', 'c']);
    assert.deepEqual(ids(filterTodos(todos, FILTERS.active)), ['a', 'c']);
    assert.deepEqual(ids(filterTodos(todos, FILTERS.completed)), ['b']);
    assert.deepEqual(ids(filterTodos(todos, 'unknown')), ['a', 'b', 'c']);
  });

  test('개수를 센다', () => {
    assert.deepEqual(getStats(todos), { total: 3, active: 2, completed: 1 });
    assert.deepEqual(getStats([]), { total: 0, active: 0, completed: 0 });
  });

  test('URL 해시를 필터로 바꾼다', () => {
    assert.equal(parseFilter('#/active'), FILTERS.active);
    assert.equal(parseFilter('#/completed'), FILTERS.completed);
    assert.equal(parseFilter('#/'), FILTERS.all);
    assert.equal(parseFilter(''), FILTERS.all);
    assert.equal(parseFilter('#/nope'), FILTERS.all);
    assert.equal(parseFilter('#/toString'), FILTERS.all);
  });
});

describe('sanitizeTodos', () => {
  test('배열이 아니면 빈 배열', () => {
    assert.deepEqual(sanitizeTodos(null), []);
    assert.deepEqual(sanitizeTodos({ id: 'a' }), []);
  });

  test('잘못된 항목은 버리고 값을 정리한다', () => {
    const result = sanitizeTodos([
      { id: 'a', title: '  정상  ', completed: true, createdAt: 5 },
      { id: 'b', title: '완료 값이 이상함', completed: 'yes' },
      { id: '', title: '빈 id' },
      { id: 3, title: '숫자 id' },
      { id: 'c', title: '   ' },
      { id: 'd' },
      null,
      'text',
    ]);
    assert.deepEqual(result, [
      { id: 'a', title: '정상', completed: true, createdAt: 5 },
      { id: 'b', title: '완료 값이 이상함', completed: false, createdAt: 0 },
    ]);
  });

  test('중복 id는 처음 것만 남긴다', () => {
    const result = sanitizeTodos([make('a', { title: '첫째' }), make('a', { title: '둘째' })]);
    assert.deepEqual(
      result.map((todo) => todo.title),
      ['첫째'],
    );
  });
});
