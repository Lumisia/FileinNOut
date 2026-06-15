<script setup>
import { useToastStore } from '@/stores/useToastStore'

const toastStore = useToastStore()

const ICONS = {
  success: 'fa-solid fa-circle-check',
  error: 'fa-solid fa-circle-exclamation',
  warning: 'fa-solid fa-triangle-exclamation',
  info: 'fa-solid fa-circle-info',
}

const iconFor = (type) => ICONS[type] ?? ICONS.info
</script>

<template>
  <Teleport to="body">
    <div class="toast-host" role="region" aria-label="알림" aria-live="polite">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toastStore.toasts"
          :key="toast.id"
          class="toast"
          :class="`toast--${toast.type}`"
          :role="toast.type === 'error' ? 'alert' : 'status'"
        >
          <i class="toast__icon" :class="iconFor(toast.type)" aria-hidden="true"></i>
          <div class="toast__body">
            <p v-if="toast.title" class="toast__title">{{ toast.title }}</p>
            <p class="toast__message">{{ toast.message }}</p>
          </div>
          <button
            v-if="toast.action"
            type="button"
            class="toast__action"
            @click="toastStore.runAction(toast)"
          >
            {{ toast.action.label }}
          </button>
          <button
            type="button"
            class="toast__close"
            aria-label="알림 닫기"
            @click="toastStore.dismiss(toast.id)"
          >
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-host {
  position: fixed;
  bottom: 1.25rem;
  right: 1.25rem;
  z-index: 13000;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  width: min(24rem, calc(100vw - 2rem));
  pointer-events: none;
}

.toast {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: 0.7rem;
  padding: 0.85rem 0.95rem;
  border-radius: 0.9rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-left: 4px solid var(--toast-accent, var(--accent));
  box-shadow: var(--shadow-lg);
  color: var(--text-main);
}

.toast--success { --toast-accent: #16a34a; }
.toast--error { --toast-accent: var(--danger); }
.toast--warning { --toast-accent: #d97706; }
.toast--info { --toast-accent: var(--accent); }

.toast__icon {
  flex-shrink: 0;
  margin-top: 0.12rem;
  font-size: 1.05rem;
  color: var(--toast-accent, var(--accent));
}

.toast__body {
  flex: 1;
  min-width: 0;
}

.toast__title {
  font-size: 0.85rem;
  font-weight: 800;
  color: var(--text-main);
  margin-bottom: 0.15rem;
}

.toast__message {
  font-size: 0.82rem;
  line-height: 1.4;
  color: var(--text-secondary);
  word-break: break-word;
}

.toast__action {
  flex-shrink: 0;
  align-self: center;
  border: 1px solid color-mix(in srgb, var(--toast-accent, var(--accent)) 40%, transparent);
  background: color-mix(in srgb, var(--toast-accent, var(--accent)) 12%, transparent);
  color: var(--toast-accent, var(--accent));
  border-radius: 999px;
  padding: 0.32rem 0.7rem;
  font-size: 0.76rem;
  font-weight: 800;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.toast__action:hover {
  background: color-mix(in srgb, var(--toast-accent, var(--accent)) 20%, transparent);
}

.toast__close {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.6rem;
  height: 1.6rem;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.toast__close:hover {
  background: var(--bg-input);
  color: var(--text-main);
}

.toast-enter-active,
.toast-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}

.toast-enter-from {
  transform: translateX(120%);
  opacity: 0;
}

.toast-leave-to {
  transform: translateX(120%);
  opacity: 0;
}

.toast-leave-active {
  position: absolute;
  right: 0;
  width: 100%;
}

@media (max-width: 640px) {
  .toast-host {
    left: 1rem;
    right: 1rem;
    bottom: 1rem;
    width: auto;
  }
}
</style>
