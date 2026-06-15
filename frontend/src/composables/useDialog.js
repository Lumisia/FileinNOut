import { useDialogStore } from '@/stores/useDialogStore'

/**
 * 브라우저 기본 confirm()/prompt() 를 대체하는 Promise 기반 다이얼로그.
 *
 *   const { confirm, prompt } = useDialog()
 *   if (await confirm({ title, message, danger: true })) { ... }   // → boolean
 *   const name = await prompt({ title, label, value })             // → string|null (취소 시 null)
 */
export function useDialog() {
  const store = useDialogStore()

  const confirm = (opts = {}) =>
    store.open({
      kind: 'confirm',
      title: opts.title ?? '확인',
      message: opts.message ?? '',
      confirmText: opts.confirmText ?? '확인',
      cancelText: opts.cancelText ?? '취소',
      danger: opts.danger ?? false,
    })

  const prompt = (opts = {}) =>
    store.open({
      kind: 'prompt',
      title: opts.title ?? '입력',
      message: opts.message ?? '',
      label: opts.label ?? '',
      value: opts.value ?? '',
      placeholder: opts.placeholder ?? '',
      confirmText: opts.confirmText ?? '확인',
      cancelText: opts.cancelText ?? '취소',
      required: opts.required ?? false,
    })

  return { confirm, prompt }
}
