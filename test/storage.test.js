import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEY, isStorageAvailable, loadTodos, saveTodos } from '../public/js/storage.js';

class MemoryStorage {
  #data = new Map();
  getItem(key) {
    return this.#data.has(key) ? this.#data.get(key) : null;
  }
  setItem(key, value) {
    this.#data.set(key, String(value));
  }
  removeItem(key) {
    this.#data.delete(key);
  }
}

const brokenStorage = {
  getItem() {
    throw new Error('SecurityError');
  },
  setItem() {
    throw new Error('QuotaExceededError');
  },
  removeItem() {},
};

const todo = { id: 'a', title: '장보기', completed: false, createdAt: 1 };

describe('storage', () => {
  test('저장한 목록을 그대로 불러온다', () => {
    const storage = new MemoryStorage();
    assert.equal(saveTodos([todo], storage), true);
    assert.deepEqual(loadTodos(storage), [todo]);
  });

  test('저장된 값이 없으면 빈 배열', () => {
    assert.deepEqual(loadTodos(new MemoryStorage()), []);
  });

  test('깨진 JSON이면 빈 배열', () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, '{not json');
    assert.deepEqual(loadTodos(storage), []);
  });

  test('불러올 때 잘못된 항목을 걸러낸다', () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify([todo, { id: 'b' }, 'x']));
    assert.deepEqual(loadTodos(storage), [todo]);
  });

  test('저장소 접근이 실패해도 예외를 던지지 않는다', () => {
    assert.deepEqual(loadTodos(brokenStorage), []);
    assert.equal(saveTodos([todo], brokenStorage), false);
    assert.equal(isStorageAvailable(brokenStorage), false);
  });

  test('저장소가 없으면 사용 불가로 처리한다', () => {
    assert.deepEqual(loadTodos(null), []);
    assert.equal(saveTodos([todo], null), false);
    assert.equal(isStorageAvailable(null), false);
  });

  test('사용 가능 여부 확인 후 흔적을 남기지 않는다', () => {
    const storage = new MemoryStorage();
    assert.equal(isStorageAvailable(storage), true);
    assert.equal(storage.getItem(`${STORAGE_KEY}:probe`), null);
  });
});
