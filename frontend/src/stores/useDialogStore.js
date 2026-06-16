import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * 전역 다이얼로그(confirm/prompt) 상태 스토어.
 * 한 번에 하나의 다이얼로그만 활성화된다. Promise 기반으로 결과를 돌려준다.
 * 직접 쓰지 말고 useDialog() 컴포저블을 통해 사용한다.
 */
export const useDialogStore = defineStore('dialog', () => {
  const active = ref(null) // { kind, ...config, _resolve }

  function open(config) {
    // 이미 열린 다이얼로그가 있으면 취소 처리(중첩 방지).
    if (active.value) resolve(null)

    return new Promise((res) => {
      active.value = { ...config, _resolve: res }
    })
  }

  function resolve(value) {
    const current = active.value
    active.value = null
    current?._resolve?.(value)
  }

  return { active, open, resolve }
})
