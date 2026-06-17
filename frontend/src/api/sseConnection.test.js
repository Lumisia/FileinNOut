import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SSE_EVENT_FORWARD_MAP,
  parseEventData,
  shouldScheduleReconnect,
  createSseConnection,
} from './sseConnection.js'

// EventSourcePolyfill 동작을 흉내 내는 가짜 구현.
class FakeEventSource {
  static CLOSED = 2

  constructor(url, options) {
    this.url = url
    this.options = options
    this.readyState = 0
    this.listeners = {}
    this.onopen = null
    this.onerror = null
    this.closed = false
    FakeEventSource.instances.push(this)
  }

  addEventListener(name, handler) {
    this.listeners[name] = handler
  }

  emit(name, data) {
    const handler = this.listeners[name]
    if (handler) handler({ data })
  }

  close() {
    this.closed = true
    this.readyState = FakeEventSource.CLOSED
  }
}
FakeEventSource.instances = []

const makeDeps = (overrides = {}) => {
  FakeEventSource.instances = []
  const dispatched = []
  const timers = []
  return {
    dispatched,
    timers,
    deps: {
      url: '/api/sse/connect',
      EventSourceImpl: FakeEventSource,
      getAuthHeaders: () => ({ Authorization: 'Bearer test' }),
      dispatch: (name, detail) => dispatched.push({ name, detail }),
      reconnectDelayMs: 1000,
      setTimeoutFn: (fn) => {
        timers.push(fn)
        return timers.length // 타이머 id
      },
      clearTimeoutFn: () => {},
      ...overrides,
    },
  }
}

test('parseEventData parses JSON and falls back to raw on failure', () => {
  assert.deepEqual(parseEventData('{"a":1}'), { a: 1 })
  assert.equal(parseEventData('not json'), 'not json')
})

test('shouldScheduleReconnect: manual close never reconnects', () => {
  assert.equal(
    shouldScheduleReconnect({ manuallyClosed: true, readyState: 2, closedState: 2 }),
    false,
  )
})

test('shouldScheduleReconnect: only reconnect manually when CLOSED', () => {
  // CONNECTING/OPEN 상태면 polyfill이 자체 재연결 → 직접 안 검
  assert.equal(
    shouldScheduleReconnect({ manuallyClosed: false, readyState: 0, closedState: 2 }),
    false,
  )
  assert.equal(
    shouldScheduleReconnect({ manuallyClosed: false, readyState: 2, closedState: 2 }),
    true,
  )
})

test('createSseConnection forwards every mapped server event to a window event', () => {
  const { dispatched, deps } = makeDeps()
  createSseConnection(deps)
  const es = FakeEventSource.instances[0]

  es.emit('notification', '{"id":1}')
  es.emit('new-message', '{"msg":"hi"}')
  es.emit('chat-preview-update', '{"room":7}')
  es.emit('title-updated', '{"postId":3}')
  es.emit('role-changed', '{"newRole":"VIEWER"}')

  assert.deepEqual(dispatched, [
    { name: 'sse-notification', detail: { id: 1 } },
    { name: 'sse-new-message', detail: { msg: 'hi' } },
    { name: 'sse-chat-preview-update', detail: { room: 7 } },
    { name: 'sse-title-updated', detail: { postId: 3 } },
    { name: 'sse-role-changed', detail: { newRole: 'VIEWER' } },
  ])
})

test('createSseConnection forwards all keys declared in the map', () => {
  const { dispatched, deps } = makeDeps()
  createSseConnection(deps)
  const es = FakeEventSource.instances[0]

  for (const serverEvent of Object.keys(SSE_EVENT_FORWARD_MAP)) {
    es.emit(serverEvent, '{}')
  }

  assert.equal(dispatched.length, Object.keys(SSE_EVENT_FORWARD_MAP).length)
})

test('createSseConnection passes auth headers and withCredentials to EventSource', () => {
  const { deps } = makeDeps()
  createSseConnection(deps)
  const es = FakeEventSource.instances[0]

  assert.equal(es.url, '/api/sse/connect')
  assert.equal(es.options.withCredentials, true)
  assert.deepEqual(es.options.headers, { Authorization: 'Bearer test' })
})

test('createSseConnection calls onConnect on open', () => {
  let opened = 0
  const { deps } = makeDeps({ onConnect: () => (opened += 1) })
  createSseConnection(deps)
  const es = FakeEventSource.instances[0]

  es.onopen({})
  assert.equal(opened, 1)
})

test('onerror does NOT manually reconnect while polyfill is still retrying', () => {
  const { timers, deps } = makeDeps()
  createSseConnection(deps)
  const es = FakeEventSource.instances[0]

  es.readyState = 0 // CONNECTING (polyfill 재시도 중)
  es.onerror({})

  assert.equal(timers.length, 0) // 직접 재연결 예약 없음
})

test('onerror schedules a single manual reconnect when CLOSED', () => {
  const { timers, deps } = makeDeps()
  createSseConnection(deps)
  const es = FakeEventSource.instances[0]

  es.readyState = FakeEventSource.CLOSED
  es.onerror({})

  assert.equal(timers.length, 1)
  assert.equal(FakeEventSource.instances.length, 1)

  // 예약된 재연결 실행 → 새 연결 1개 생성
  timers[0]()
  assert.equal(FakeEventSource.instances.length, 2)
})

test('close() prevents reconnect and closes the underlying source', () => {
  const { timers, deps } = makeDeps()
  const handle = createSseConnection(deps)
  const es = FakeEventSource.instances[0]

  handle.close()
  assert.equal(es.closed, true)

  // 종료 후 에러가 나도 재연결하지 않는다
  es.readyState = FakeEventSource.CLOSED
  es.onerror({})
  assert.equal(timers.length, 0)
})
