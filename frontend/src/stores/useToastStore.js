import { defineStore } from 'pinia'
import { ref } from 'vue'

let nextId = 0

const DEFAULT_TIMEOUTS = {
  success: 4000,
  info: 4000,
  warning: 6000,
  error: 8000,
}

/**
 * 전역 토스트 알림 스토어.
 * 컴포넌트 밖(예: editor.js 같은 일반 모듈)에서도 useToastStore() 로 호출 가능
 * (Pinia가 app.mount 전에 설치되므로).
 */
export const useToastStore = defineStore('toast', () => {
  const toasts = ref([])

  function dismiss(id) {
    const index = toasts.value.findIndex((t) => t.id === id)
    if (index === -1) return
    const [removed] = toasts.value.splice(index, 1)
    if (removed?._timer) clearTimeout(removed._timer)
  }

  function push({ type = 'info', message = '', title = '', action = null, timeout } = {}) {
    const id = ++nextId
    // action(실행 취소 등)이 있으면 사용자가 누를 시간을 충분히 준다.
    const resolvedTimeout =
      timeout ?? (action ? 8000 : DEFAULT_TIMEOUTS[type] ?? 4000)

    const toast = { id, type, message, title, action, _timer: null }
    toasts.value.push(toast)

    if (resolvedTimeout > 0) {
      toast._timer = setTimeout(() => dismiss(id), resolvedTimeout)
    }
    return id
  }

  function runAction(toast) {
    try {
      toast.action?.handler?.()
    } finally {
      dismiss(toast.id)
    }
  }

  const success = (message, opts = {}) => push({ ...opts, type: 'success', message })
  const error = (message, opts = {}) => push({ ...opts, type: 'error', message })
  const warning = (message, opts = {}) => push({ ...opts, type: 'warning', message })
  const info = (message, opts = {}) => push({ ...opts, type: 'info', message })

  return { toasts, push, dismiss, runAction, success, error, warning, info }
})
