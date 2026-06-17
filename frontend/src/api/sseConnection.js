// 앱 전체에서 단 하나의 실시간 SSE 연결을 관리하는 순수 로직.
//
// 브라우저 의존성(EventSource 구현, window.dispatchEvent, localStorage 등)은 전부
// 인자로 주입받는다. 덕분에 jsdom 없이 node:test로 검증할 수 있고, sseApi.js가
// 브라우저 기본 구현을 끼워 넣는다.

// 서버 SSE 이벤트명 → 앱 전역(window) CustomEvent 이름.
// 예전에는 알림 SSE와 워크스페이스 SSE가 각각 연결을 열어 같은 이벤트를 중복 수신했다.
// 이제 단일 연결이 모든 이벤트를 받아 window CustomEvent로 재방출하고, 각 컴포넌트는
// 해당 window 이벤트만 구독한다.
export const SSE_EVENT_FORWARD_MAP = Object.freeze({
  notification: 'sse-notification',
  'new-message': 'sse-new-message',
  'chat-preview-update': 'sse-chat-preview-update',
  'title-updated': 'sse-title-updated',
  'role-changed': 'sse-role-changed',
})

export const SSE_RECONNECT_DELAY_MS = 5000

// SSE 이벤트 data는 보통 JSON이지만, 일부는 평문일 수 있다. 파싱 실패 시 원문 유지.
export const parseEventData = (raw) => {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

// onerror 발생 시 "직접 재연결을 걸어야 하는가" 판정.
// - 수동 종료(로그아웃 등)면 재연결하지 않는다.
// - CLOSED가 아니면 EventSource 구현이 자체적으로 재연결하므로 직접 걸지 않는다(재연결 단일화).
// - CLOSED(치명적)일 때만 직접 한 번 재연결한다.
export const shouldScheduleReconnect = ({ manuallyClosed, readyState, closedState }) => {
  if (manuallyClosed) return false
  return readyState === closedState
}

// 단일 SSE 연결 핸들을 만든다. 반환된 객체의 close()로 종료한다.
export const createSseConnection = ({
  url,
  EventSourceImpl,
  getAuthHeaders,
  dispatch,
  onConnect,
  closedState = EventSourceImpl?.CLOSED,
  reconnectDelayMs = SSE_RECONNECT_DELAY_MS,
  eventSourceOptions = {},
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
}) => {
  let eventSource = null
  let reconnectTimer = null
  let manuallyClosed = false

  const clearReconnectTimer = () => {
    if (reconnectTimer !== null) {
      clearTimeoutFn(reconnectTimer)
      reconnectTimer = null
    }
  }

  const open = () => {
    eventSource = new EventSourceImpl(url, {
      headers: getAuthHeaders(),
      withCredentials: true,
      ...eventSourceOptions,
    })

    eventSource.onopen = (event) => {
      if (onConnect) onConnect(event)
    }

    for (const [serverEvent, windowEvent] of Object.entries(SSE_EVENT_FORWARD_MAP)) {
      eventSource.addEventListener(serverEvent, (event) => {
        dispatch(windowEvent, parseEventData(event?.data))
      })
    }

    eventSource.onerror = () => {
      if (
        !shouldScheduleReconnect({
          manuallyClosed,
          readyState: eventSource?.readyState,
          closedState,
        })
      ) {
        return
      }

      clearReconnectTimer()
      reconnectTimer = setTimeoutFn(() => {
        reconnectTimer = null
        if (!manuallyClosed) open()
      }, reconnectDelayMs)
    }
  }

  open()

  return {
    close: () => {
      manuallyClosed = true
      clearReconnectTimer()
      if (eventSource) {
        eventSource.close()
        eventSource = null
      }
    },
  }
}
