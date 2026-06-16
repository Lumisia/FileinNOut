<script setup>
/**
 * 빈 화면 공통 컴포넌트 — 아이콘 + 제목 + 설명 + 액션(기본 슬롯).
 * 화면별 원인과 다음 행동(CTA)을 한 곳에서 일관되게 표현한다. 토큰 사용(다크 대응).
 */
defineProps({
  icon: { type: String, default: 'fa-regular fa-folder-open' },
  title: { type: String, default: '' },
  description: { type: String, default: '' },
})
</script>

<template>
  <div class="empty-state" role="status">
    <span class="empty-state__icon" aria-hidden="true">
      <i :class="icon"></i>
    </span>
    <p v-if="title" class="empty-state__title">{{ title }}</p>
    <p v-if="description" class="empty-state__desc">{{ description }}</p>
    <div v-if="$slots.default" class="empty-state__actions">
      <slot></slot>
    </div>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.55rem;
  padding: 3rem 1.5rem;
  text-align: center;
  border: 1px dashed var(--border-color);
  border-radius: 1.25rem;
  background: color-mix(in srgb, var(--bg-elevated, var(--bg-main)) 70%, transparent);
}

.empty-state__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3.4rem;
  height: 3.4rem;
  margin-bottom: 0.2rem;
  border-radius: 999px;
  font-size: 1.5rem;
  color: var(--accent, #2563eb);
  background: color-mix(in srgb, var(--accent, #2563eb) 12%, transparent);
}

.empty-state__title {
  font-size: 1rem;
  font-weight: 800;
  color: var(--text-main);
}

.empty-state__desc {
  max-width: 30rem;
  font-size: 0.86rem;
  line-height: 1.6;
  color: var(--text-muted);
}

.empty-state__actions {
  margin-top: 0.6rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  justify-content: center;
}
</style>
