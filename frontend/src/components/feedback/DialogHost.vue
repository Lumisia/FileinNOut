<script setup>
import { computed, ref, watch } from 'vue'
import { useDialogStore } from '@/stores/useDialogStore'
import BaseModal from './BaseModal.vue'

const dialogStore = useDialogStore()
const active = computed(() => dialogStore.active)

const promptValue = ref('')
const inputId = 'dialog-prompt-input'

watch(active, (current) => {
  if (current?.kind === 'prompt') {
    promptValue.value = current.value ?? ''
  }
})

const confirmDisabled = computed(() => {
  const current = active.value
  if (current?.kind === 'prompt' && current.required) {
    return promptValue.value.trim().length === 0
  }
  return false
})

function onCancel() {
  const current = active.value
  if (!current) return
  dialogStore.resolve(current.kind === 'confirm' ? false : null)
}

function onConfirm() {
  const current = active.value
  if (!current) return
  if (confirmDisabled.value) return
  if (current.kind === 'prompt') {
    dialogStore.resolve(promptValue.value.trim())
  } else {
    dialogStore.resolve(true)
  }
}
</script>

<template>
  <BaseModal :open="!!active" :title="active?.title || ''" @close="onCancel">
    <p v-if="active?.message" class="dialog__message">{{ active.message }}</p>

    <div v-if="active?.kind === 'prompt'" class="dialog__field">
      <label v-if="active.label" :for="inputId" class="dialog__label">{{ active.label }}</label>
      <input
        :id="inputId"
        v-model="promptValue"
        type="text"
        class="dialog__input"
        data-autofocus
        :placeholder="active.placeholder"
        @keyup.enter="onConfirm"
      />
    </div>

    <template #footer>
      <button type="button" class="dialog__btn dialog__btn--ghost" @click="onCancel">
        {{ active?.cancelText || '취소' }}
      </button>
      <button
        type="button"
        class="dialog__btn"
        :class="active?.danger ? 'dialog__btn--danger' : 'dialog__btn--primary'"
        :disabled="confirmDisabled"
        @click="onConfirm"
      >
        {{ active?.confirmText || '확인' }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.dialog__message {
  font-size: 0.92rem;
  line-height: 1.5;
  color: var(--text-secondary);
  white-space: pre-line;
}

.dialog__field {
  margin-top: 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.dialog__label {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-muted);
}

.dialog__input {
  width: 100%;
  border: 1px solid var(--border-strong);
  border-radius: 0.7rem;
  background: var(--bg-input);
  padding: 0.65rem 0.8rem;
  font-size: 0.92rem;
  color: var(--text-main);
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.dialog__input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
}

.dialog__btn {
  border-radius: 0.7rem;
  padding: 0.55rem 1.1rem;
  font-size: 0.88rem;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background-color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
}

.dialog__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dialog__btn--ghost {
  background: transparent;
  border-color: var(--border-strong);
  color: var(--text-secondary);
}

.dialog__btn--ghost:hover {
  background: var(--bg-input);
  color: var(--text-main);
}

.dialog__btn--primary {
  background: var(--accent);
  color: var(--text-inverse);
}

.dialog__btn--primary:hover:not(:disabled) {
  background: var(--accent-hover);
}

.dialog__btn--danger {
  background: var(--danger);
  color: #fff;
}

.dialog__btn--danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--danger) 85%, #000);
}
</style>
