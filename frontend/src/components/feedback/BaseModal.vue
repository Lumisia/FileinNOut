<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  closeOnBackdrop: { type: Boolean, default: true },
  closeOnEsc: { type: Boolean, default: true },
})

const emit = defineEmits(['close'])

const panelRef = ref(null)
const titleId = `modal-title-${Math.random().toString(36).slice(2, 9)}`

let previouslyFocused = null
let previousBodyOverflow = ''

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusables() {
  if (!panelRef.value) return []
  return Array.from(panelRef.value.querySelectorAll(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  )
}

function onKeydown(event) {
  if (event.key === 'Escape' && props.closeOnEsc) {
    event.stopPropagation()
    emit('close')
    return
  }
  if (event.key !== 'Tab') return

  const items = focusables()
  if (items.length === 0) {
    event.preventDefault()
    panelRef.value?.focus()
    return
  }

  const first = items[0]
  const last = items[items.length - 1]
  const activeEl = document.activeElement

  if (event.shiftKey && (activeEl === first || activeEl === panelRef.value)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && activeEl === last) {
    event.preventDefault()
    first.focus()
  }
}

function onBackdropClick() {
  if (props.closeOnBackdrop) emit('close')
}

function lockScroll() {
  previousBodyOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
}

function unlockScroll() {
  document.body.style.overflow = previousBodyOverflow
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      previouslyFocused = document.activeElement
      lockScroll()
      nextTick(() => {
        const items = focusables()
        const preferred = panelRef.value?.querySelector('[data-autofocus]')
        ;(preferred ?? items[0] ?? panelRef.value)?.focus()
      })
    } else {
      unlockScroll()
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus()
      }
      previouslyFocused = null
    }
  },
)

onBeforeUnmount(() => {
  if (props.open) unlockScroll()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="open"
        class="modal-overlay base-modal__overlay"
        @click.self="onBackdropClick"
        @keydown="onKeydown"
      >
        <div
          ref="panelRef"
          class="modal-content base-modal__panel"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="title ? titleId : undefined"
          tabindex="-1"
        >
          <div v-if="title || $slots.header" class="base-modal__header">
            <slot name="header">
              <h2 :id="titleId" class="base-modal__title">{{ title }}</h2>
            </slot>
            <button
              type="button"
              class="base-modal__close"
              aria-label="닫기"
              @click="emit('close')"
            >
              <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </div>

          <div class="base-modal__body">
            <slot></slot>
          </div>

          <div v-if="$slots.footer" class="base-modal__footer">
            <slot name="footer"></slot>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.base-modal__overlay {
  position: fixed;
  inset: 0;
  z-index: 12500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
  background: var(--bg-overlay);
  backdrop-filter: blur(2px);
}

.base-modal__panel {
  width: min(32rem, 100%);
  max-height: calc(100vh - 2.5rem);
  overflow-y: auto;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: 1.1rem;
  box-shadow: var(--shadow-lg);
  outline: none;
}

.base-modal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.1rem 1.25rem 0.75rem;
}

.base-modal__title {
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--text-main);
}

.base-modal__close {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.9rem;
  height: 1.9rem;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.base-modal__close:hover {
  background: var(--bg-input);
  color: var(--text-main);
}

.base-modal__body {
  padding: 0.25rem 1.25rem 1.1rem;
  color: var(--text-secondary);
}

.base-modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
  padding: 0.85rem 1.25rem 1.15rem;
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-active .base-modal__panel,
.modal-leave-active .base-modal__panel {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .base-modal__panel,
.modal-leave-to .base-modal__panel {
  transform: translateY(12px) scale(0.98);
  opacity: 0;
}
</style>
