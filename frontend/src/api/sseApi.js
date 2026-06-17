import { EventSourcePolyfill } from 'event-source-polyfill'
import { apiPath } from '@/utils/backendUrl'
import {
  createSseConnection as createSseConnectionCore,
  SSE_EVENT_FORWARD_MAP,
} from './sseConnection.js'

// SSE는 이벤트가 없으면 바이트가 흐르지 않아 프록시/CDN이 idle로 끊을 수 있다.
// heartbeatTimeout을 넉넉히 잡아 polyfill이 성급히 끊지 않게 한다(서버도 주기적 ping 전송).
const SSE_OPTIONS = { heartbeatTimeout: 3600000 }

const browserAuthHeaders = () => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ACCESS_TOKEN') : null
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const browserDispatch = (eventName, detail) => {
  window.dispatchEvent(new CustomEvent(eventName, { detail }))
}

// 앱 전체에서 단 하나의 실시간 SSE 연결을 연다.
// 모든 서버 이벤트는 window CustomEvent로 재방출되어 각 컴포넌트가 구독한다.
const createSseConnection = ({ onConnect } = {}) =>
  createSseConnectionCore({
    url: apiPath('/sse/connect'),
    EventSourceImpl: EventSourcePolyfill,
    closedState: EventSourcePolyfill.CLOSED,
    getAuthHeaders: browserAuthHeaders,
    dispatch: browserDispatch,
    onConnect,
    eventSourceOptions: SSE_OPTIONS,
  })

export default {
  createSseConnection,
  SSE_EVENT_FORWARD_MAP,
}
