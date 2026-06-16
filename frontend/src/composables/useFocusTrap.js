import { nextTick, onBeforeUnmount, unref, watch } from 'vue'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * 커스텀 모달 셸에 접근성 동작을 주입한다.
 * (포커스 트랩 = Tab 순환, ESC 닫기, body 스크롤 락, 열 때 첫 포커스 이동, 닫을 때 포커스 복귀)
 *
 * BaseModal 의 인라인 로직을 미러링한 재사용 버전. BaseModal 로 옮기기 어려운
 * 대형/맞춤 레이아웃 모달(공유·설정·미리보기 등)에서 기존 마크업을 유지한 채 사용한다.
 * `role="dialog"` 등 ARIA 속성은 호출하는 쪽 템플릿에서 패널 요소에 직접 부여한다.
 *
 *   const panelRef = ref(null)
 *   useFocusTrap(() => props.isOpen, panelRef, { onEsc: () => emit('close') })
 *
 * 패널 안에서 처음 포커스할 요소는 `data-autofocus` 로 지정할 수 있다.
 *
 * @param {() => boolean} isActive  모달 열림 상태 getter (반응형)
 * @param {import('vue').Ref<HTMLElement|null>} panelRef  패널 루트 요소 ref
 * @param {object} [options]
 * @param {() => void} [options.onEsc]  ESC 키 콜백(보통 close emit)
 * @param {boolean} [options.closeOnEsc=true]
 * @param {boolean} [options.lockScroll=true]
 */
export function useFocusTrap(isActive, panelRef, options = {}) {
  const { onEsc, closeOnEsc = true, lockScroll = true } = options

  let previouslyFocused = null
  let previousBodyOverflow = ''
  let listening = false

  const panelEl = () => unref(panelRef)

  function focusables() {
    const el = panelEl()
    if (!el) return []
    return Array.from(el.querySelectorAll(FOCUSABLE)).filter(
      (node) => node.offsetParent !== null || node === document.activeElement,
    )
  }

  function onKeydown(event) {
    if (event.key === 'Escape' && closeOnEsc) {
      event.stopPropagation()
      onEsc?.()
      return
    }
    if (event.key !== 'Tab') return

    const el = panelEl()
    if (!el) return

    const items = focusables()
    if (items.length === 0) {
      event.preventDefault()
      el.focus()
      return
    }

    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement

    // 포커스가 패널 밖으로 새면 안으로 끌어온다.
    if (!el.contains(active)) {
      event.preventDefault()
      ;(event.shiftKey ? last : first).focus()
      return
    }

    if (event.shiftKey && (active === first || active === el)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function activate() {
    previouslyFocused = document.activeElement

    if (lockScroll) {
      previousBodyOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }

    // bubble 단계로 듣는다 → 위에 쌓인 BaseModal(useDialog) 등이
    // stopPropagation 으로 ESC/Tab 을 먼저 처리하면 이 트랩은 가로채지 않는다.
    document.addEventListener('keydown', onKeydown)
    listening = true

    nextTick(() => {
      const el = panelEl()
      const preferred = el?.querySelector('[data-autofocus]')
      ;(preferred ?? focusables()[0] ?? el)?.focus()
    })
  }

  function deactivate() {
    if (listening) {
      document.removeEventListener('keydown', onKeydown)
      listening = false
    }

    if (lockScroll) {
      document.body.style.overflow = previousBodyOverflow
    }

    if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
      previouslyFocused.focus()
    }
    previouslyFocused = null
  }

  watch(
    isActive,
    (open, wasOpen) => {
      if (open) activate()
      else if (wasOpen) deactivate()
    },
    { immediate: true, flush: 'post' },
  )

  onBeforeUnmount(() => {
    if (listening) {
      document.removeEventListener('keydown', onKeydown)
      if (lockScroll) document.body.style.overflow = previousBodyOverflow
    }
  })
}
