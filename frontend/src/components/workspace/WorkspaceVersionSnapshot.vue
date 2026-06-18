<script setup>
import { computed, ref } from 'vue'
import { parseVersionSnapshot, resolveVersionImageUrl } from '@/utils/workspaceVersion'

const props = defineProps({
  version: { type: Object, default: null },
  assetUrlById: { type: Map, default: () => new Map() },
  emptyLabel: { type: String, default: '저장된 내용이 없습니다.' },
})

const snapshot = computed(() => props.version ? parseVersionSnapshot(props.version) : null)
const failedImages = ref(new Set())

const formatDate = (value) => value
  ? new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(value))
  : ''

const headingTag = (block) => `h${Math.min(Math.max(Number(block?.data?.level) || 2, 1), 4)}`
const listItems = (block) => Array.isArray(block?.data?.items) ? block.data.items : []
const itemText = (item) => typeof item === 'string' ? item : (item?.content || item?.text || '')
const imageKey = (block, index) => String(block?.data?.file?.assetIdx ?? block?.id ?? index)
const imageUrl = (block) => resolveVersionImageUrl(block, props.assetUrlById)
const markImageFailed = (key) => {
  failedImages.value = new Set([...failedImages.value, key])
}
</script>

<template>
  <section class="version-snapshot" :aria-label="snapshot ? `v${snapshot.versionNum} 내용` : emptyLabel">
    <header v-if="snapshot" class="version-snapshot__header">
      <div class="version-snapshot__meta">
        <span class="version-snapshot__badge">v{{ snapshot.versionNum }}</span>
        <time>{{ formatDate(snapshot.createdAt) }}</time>
      </div>
      <h3>{{ snapshot.title }}</h3>
    </header>

    <div v-if="!snapshot" class="version-snapshot__empty">{{ emptyLabel }}</div>
    <div v-else-if="!snapshot.blocks.length" class="version-snapshot__empty">저장된 본문이 없습니다.</div>

    <div v-else class="version-snapshot__content">
      <template v-for="(block, index) in snapshot.blocks" :key="block.id || index">
        <component
          :is="headingTag(block)"
          v-if="block.type === 'header'"
          class="version-block version-block--heading"
          v-html="block.data?.text"
        />
        <p
          v-else-if="block.type === 'paragraph'"
          class="version-block version-block--paragraph"
          v-html="block.data?.text || '&nbsp;'"
        ></p>
        <component
          :is="block.data?.style === 'ordered' ? 'ol' : 'ul'"
          v-else-if="block.type === 'list'"
          class="version-block version-block--list"
        >
          <li v-for="(item, itemIndex) in listItems(block)" :key="itemIndex" v-html="itemText(item)"></li>
        </component>
        <ul v-else-if="block.type === 'checklist'" class="version-block version-block--checklist">
          <li v-for="(item, itemIndex) in listItems(block)" :key="itemIndex">
            <i :class="item?.checked ? 'fa-solid fa-square-check' : 'fa-regular fa-square'"></i>
            <span v-html="itemText(item)"></span>
          </li>
        </ul>
        <blockquote v-else-if="block.type === 'quote'" class="version-block version-block--quote">
          <p v-html="block.data?.text"></p>
          <cite v-if="block.data?.caption">{{ block.data.caption }}</cite>
        </blockquote>
        <pre v-else-if="block.type === 'code'" class="version-block version-block--code"><code>{{ block.data?.code }}</code></pre>
        <div v-else-if="block.type === 'delimiter'" class="version-block version-block--delimiter">•••</div>
        <div v-else-if="block.type === 'table'" class="version-block version-block--table-wrap">
          <table>
            <tbody>
              <tr v-for="(row, rowIndex) in block.data?.content || []" :key="rowIndex">
                <td v-for="(cell, cellIndex) in row" :key="cellIndex" v-html="cell"></td>
              </tr>
            </tbody>
          </table>
        </div>
        <figure v-else-if="block.type === 'image'" class="version-block version-block--image">
          <img
            v-if="imageUrl(block) && !failedImages.has(imageKey(block, index))"
            :src="imageUrl(block)"
            :alt="block.data?.caption || '버전 이미지'"
            @error="markImageFailed(imageKey(block, index))"
          />
          <div v-else class="version-block__image-error">
            <i class="fa-regular fa-image"></i>
            <span>이미지를 불러올 수 없습니다.</span>
          </div>
          <figcaption v-if="block.data?.caption">{{ block.data.caption }}</figcaption>
        </figure>
        <a
          v-else-if="block.type === 'embed' && block.data?.source"
          class="version-block version-block--embed"
          :href="block.data.source"
          target="_blank"
          rel="noopener noreferrer"
        >
          <i class="fa-solid fa-arrow-up-right-from-square"></i>
          {{ block.data.caption || block.data.source }}
        </a>
        <p v-else-if="block.data?.text" class="version-block version-block--paragraph" v-html="block.data.text"></p>
      </template>
    </div>
  </section>
</template>

<style scoped>
.version-snapshot {
  min-width: 0;
  height: 100%;
  overflow: auto;
  background: var(--editor-bg, #fff);
}

.version-snapshot__header {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 16px 20px 14px;
  border-bottom: 1px solid var(--editor-border, #e5e7eb);
  background: color-mix(in srgb, var(--editor-bg, #fff) 96%, #f8fafc 4%);
}

.version-snapshot__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 7px;
  color: #64748b;
  font-size: 11px;
}

.version-snapshot__badge {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  border-radius: 6px;
  background: rgba(99, 102, 241, 0.12);
  color: #4f46e5;
  font-weight: 800;
}

.version-snapshot__header h3 {
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--editor-text, #111827);
  font-size: 15px;
  line-height: 1.4;
}

.version-snapshot__content { padding: 22px 24px 36px; }
.version-snapshot__empty { display: grid; min-height: 280px; place-items: center; padding: 24px; color: #94a3b8; font-size: 13px; }
.version-block { margin: 0 0 14px; color: var(--editor-text, #1f2937); overflow-wrap: anywhere; }
.version-block--heading { margin-top: 22px; line-height: 1.35; }
.version-block--heading:first-child { margin-top: 0; }
.version-block--paragraph { line-height: 1.7; }
.version-block--list { padding-left: 24px; line-height: 1.7; }
.version-block--checklist { display: grid; gap: 8px; padding: 0; list-style: none; }
.version-block--checklist li { display: flex; align-items: flex-start; gap: 8px; }
.version-block--checklist i { margin-top: 4px; color: #6366f1; }
.version-block--quote { padding: 10px 16px; border-left: 3px solid #818cf8; background: rgba(99, 102, 241, 0.06); }
.version-block--quote p { margin: 0; }
.version-block--quote cite { display: block; margin-top: 8px; color: #64748b; font-size: 12px; }
.version-block--code { overflow: auto; padding: 14px; border-radius: 6px; background: #111827; color: #e5e7eb; font-size: 12px; line-height: 1.6; white-space: pre-wrap; }
.version-block--delimiter { text-align: center; color: #94a3b8; letter-spacing: 8px; }
.version-block--table-wrap { overflow-x: auto; }
.version-block--table-wrap table { width: 100%; border-collapse: collapse; }
.version-block--table-wrap td { padding: 8px 10px; border: 1px solid var(--editor-border, #d1d5db); font-size: 13px; }
.version-block--image img { display: block; width: 100%; max-height: 420px; object-fit: contain; border-radius: 6px; background: #f1f5f9; }
.version-block--image figcaption { margin-top: 8px; color: #64748b; font-size: 12px; text-align: center; }
.version-block__image-error { display: grid; min-height: 180px; place-items: center; gap: 8px; padding: 24px; border: 1px dashed var(--editor-border, #cbd5e1); color: #94a3b8; font-size: 12px; }
.version-block__image-error i { font-size: 24px; }
.version-block--embed { display: inline-flex; align-items: center; gap: 7px; color: #4f46e5; font-size: 13px; }

:global(html.dark) .version-block--code { background: #0f172a; }
</style>
