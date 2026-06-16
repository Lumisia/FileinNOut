<script setup>
import { computed, onMounted } from "vue";
import { useFileStore } from "@/stores/useFileStore";

const fileStore = useFileStore();

const formatBytes = (bytes) => {
  const size = Number(bytes || 0);
  if (!Number.isFinite(size) || size <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(
    Math.floor(Math.log(size) / Math.log(1024)),
    units.length - 1,
  );
  const value = size / 1024 ** unitIndex;
  const fractionDigits = unitIndex === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;

  return `${value.toFixed(fractionDigits)} ${units[unitIndex]}`;
};

const formatDate = (value) => {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const summary = computed(() => fileStore.storageSummary);
const storageSkeletonCards = [1, 2, 3, 4];
const storageSkeletonRows = [1, 2, 3, 4, 5];

const sortedCategories = computed(() => {
  return [...(summary.value?.categories || [])]
    .filter((category) => Number(category?.sizeBytes || 0) > 0)
    .sort((left, right) => Number(right?.sizeBytes || 0) - Number(left?.sizeBytes || 0));
});

const usageWidth = computed(() => {
  return `${Math.min(100, Math.max(0, Number(summary.value?.usagePercent || 0)))}%`;
});

const retryStorageSummary = async () => {
  try {
    await fileStore.fetchStorageSummary();
  } catch (error) {
    console.error("Storage summary fetch failed:", error);
  }
};

onMounted(() => {
  void retryStorageSummary();
});
</script>

<template>
  <div class="max-w-6xl">
    <div class="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 class="text-xl font-bold text-gray-800">저장용량</h2>
        <p class="mt-2 text-sm text-gray-500">
          현재 클라우드에 저장된 전체 파일 기준 통계를 보여줍니다.
        </p>
      </div>

      <button
        type="button"
        class="rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
        :disabled="fileStore.storageLoading"
        @click="retryStorageSummary"
      >
        {{ fileStore.storageLoading ? "새로고침 중..." : "새로고침" }}
      </button>
    </div>

    <div
      v-if="fileStore.storageLoading && !summary"
      class="storage-skeleton rounded-3xl border border-gray-200 bg-white p-6 shadow-sm"
      aria-label="저장 공간 통계를 불러오는 중입니다."
    >
      <div class="storage-skeleton__header">
        <span></span>
        <span></span>
      </div>
      <div class="storage-skeleton__bar"></div>
      <div class="storage-skeleton__cards">
        <span v-for="card in storageSkeletonCards" :key="card"></span>
      </div>
      <div class="storage-skeleton__rows">
        <span v-for="row in storageSkeletonRows" :key="row"></span>
      </div>
    </div>

    <template v-else>
      <div
        v-if="fileStore.storageError"
        class="storage-error-panel mb-6 rounded-3xl border border-rose-200 bg-rose-50 px-6 py-5 text-sm text-rose-700"
      >
        <div>
          <p class="font-semibold">저장 공간 정보를 불러오지 못했습니다.</p>
          <p class="mt-1 text-rose-600">{{ fileStore.storageError }}</p>
        </div>
        <button type="button" class="storage-error-panel__button" :disabled="fileStore.storageLoading" @click="retryStorageSummary">
          {{ fileStore.storageLoading ? "다시 시도 중..." : "다시 시도" }}
        </button>
      </div>

      <div v-if="fileStore.storageLoading && summary" class="mb-6 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">
        저장 공간 통계를 새로고침하고 있습니다.
      </div>

    <template v-if="summary">
      <div class="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
        <div class="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">현재 플랜</p>
            <h3 class="mt-2 text-3xl font-black text-gray-900">
              {{ summary.planLabel }}
            </h3>
          </div>

          <div class="text-right">
            <p class="text-sm text-gray-400">전체 사용량</p>
            <p class="text-4xl font-black text-gray-900">
              {{ formatBytes(summary.usedBytes) }}
            </p>
            <p class="mt-1 text-sm text-gray-500">
              / {{ formatBytes(summary.quotaBytes) }} ({{ summary.usagePercent }}%)
            </p>
          </div>
        </div>

        <div class="mt-8 overflow-hidden rounded-full bg-slate-100">
          <div
            class="h-4 rounded-full bg-gradient-to-r from-blue-600 via-sky-500 to-indigo-500 transition-all duration-300"
            :style="{ width: usageWidth }"
          ></div>
        </div>

        <div class="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div class="rounded-2xl bg-slate-50 px-5 py-4">
            <p class="text-xs font-semibold uppercase tracking-wide text-gray-400">활성 파일 사용량</p>
            <p class="mt-2 text-2xl font-bold text-gray-900">{{ formatBytes(summary.activeUsedBytes) }}</p>
          </div>
          <div class="rounded-2xl bg-slate-50 px-5 py-4">
            <p class="text-xs font-semibold uppercase tracking-wide text-gray-400">휴지통 사용량</p>
            <p class="mt-2 text-2xl font-bold text-gray-900">{{ formatBytes(summary.trashUsedBytes) }}</p>
          </div>
          <div class="rounded-2xl bg-slate-50 px-5 py-4">
            <p class="text-xs font-semibold uppercase tracking-wide text-gray-400">남은 용량</p>
            <p class="mt-2 text-2xl font-bold text-gray-900">{{ formatBytes(summary.remainingBytes) }}</p>
          </div>
          <div class="rounded-2xl bg-slate-50 px-5 py-4">
            <p class="text-xs font-semibold uppercase tracking-wide text-gray-400">전체 파일 수</p>
            <p class="mt-2 text-2xl font-bold text-gray-900">{{ summary.totalFileCount }}</p>
          </div>
        </div>
      </div>

      <div class="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section class="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div class="mb-5 flex items-center justify-between gap-3">
            <div>
              <h3 class="text-lg font-bold text-gray-900">카테고리별 통계</h3>
              <p class="mt-1 text-sm text-gray-500">활성 상태 파일 기준 분류입니다.</p>
            </div>
          </div>

          <div v-if="sortedCategories.length > 0" class="space-y-4">
            <div
              v-for="category in sortedCategories"
              :key="category.categoryKey"
              class="rounded-2xl border border-gray-100 bg-slate-50 px-4 py-4"
            >
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p class="text-sm font-semibold text-gray-900">{{ category.categoryLabel }}</p>
                  <p class="mt-1 text-xs text-gray-500">{{ category.fileCount }}개 파일</p>
                </div>
                <div class="text-right">
                  <p class="text-sm font-bold text-gray-900">{{ formatBytes(category.sizeBytes) }}</p>
                  <p class="mt-1 text-xs text-gray-500">활성 파일 중 {{ category.usagePercent }}%</p>
                </div>
              </div>
              <div class="mt-3 overflow-hidden rounded-full bg-white">
                <div
                  class="h-2 rounded-full bg-blue-500"
                  :style="{ width: `${Math.min(100, Math.max(0, category.usagePercent || 0))}%` }"
                ></div>
              </div>
            </div>
          </div>

          <div
            v-else
            class="rounded-2xl border border-dashed border-gray-200 bg-slate-50 px-4 py-10 text-center text-sm text-gray-500"
          >
            집계할 활성 파일이 없습니다.
          </div>
        </section>

        <section class="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 class="text-lg font-bold text-gray-900">파일 상태 통계</h3>

          <div class="mt-5 grid gap-3 sm:grid-cols-2">
            <div class="rounded-2xl border border-gray-200 px-4 py-4">
              <p class="text-xs font-semibold uppercase tracking-wide text-gray-400">활성 파일</p>
              <p class="mt-2 text-2xl font-bold text-gray-900">{{ summary.activeFileCount }}</p>
            </div>
            <div class="rounded-2xl border border-gray-200 px-4 py-4">
              <p class="text-xs font-semibold uppercase tracking-wide text-gray-400">휴지통 파일</p>
              <p class="mt-2 text-2xl font-bold text-gray-900">{{ summary.trashFileCount }}</p>
            </div>
            <div class="rounded-2xl border border-gray-200 px-4 py-4">
              <p class="text-xs font-semibold uppercase tracking-wide text-gray-400">활성 폴더</p>
              <p class="mt-2 text-2xl font-bold text-gray-900">{{ summary.activeFolderCount }}</p>
            </div>
            <div class="rounded-2xl border border-gray-200 px-4 py-4">
              <p class="text-xs font-semibold uppercase tracking-wide text-gray-400">휴지통 폴더</p>
              <p class="mt-2 text-2xl font-bold text-gray-900">{{ summary.trashFolderCount }}</p>
            </div>
          </div>
        </section>
      </div>

      <section class="mt-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div class="mb-5 flex items-center justify-between gap-3">
          <div>
            <h3 class="text-lg font-bold text-gray-900">용량을 많이 차지하는 파일</h3>
            <p class="mt-1 text-sm text-gray-500">현재 활성 파일 중 큰 순서대로 보여줍니다.</p>
          </div>
        </div>

        <div
          v-if="summary.largestFiles?.length"
          class="overflow-hidden rounded-2xl border border-gray-200"
        >
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-slate-50">
              <tr>
                <th class="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">파일명</th>
                <th class="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">확장자</th>
                <th class="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">크기</th>
                <th class="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">수정 시간</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 bg-white">
              <tr v-for="file in summary.largestFiles" :key="file.idx">
                <td class="px-5 py-4 text-sm font-semibold text-gray-900">{{ file.fileOriginName }}</td>
                <td class="px-5 py-4 text-sm text-gray-600">{{ (file.fileFormat || "-").toUpperCase() }}</td>
                <td class="px-5 py-4 text-sm text-gray-600">{{ formatBytes(file.fileSize) }}</td>
                <td class="px-5 py-4 text-sm text-gray-600">{{ formatDate(file.lastModifyDate) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div
          v-else
          class="rounded-2xl border border-dashed border-gray-200 bg-slate-50 px-4 py-10 text-center text-sm text-gray-500"
        >
          집계할 활성 파일이 없습니다.
        </div>
      </section>
    </template>
    </template>
  </div>
</template>

<style scoped>
.storage-skeleton {
  display: grid;
  gap: 1rem;
}

.storage-skeleton__header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.storage-skeleton__header span,
.storage-skeleton__bar,
.storage-skeleton__cards span,
.storage-skeleton__rows span {
  display: block;
  border-radius: 999px;
  background: linear-gradient(90deg, color-mix(in srgb, var(--border-color) 70%, transparent), color-mix(in srgb, var(--bg-elevated) 90%, transparent), color-mix(in srgb, var(--border-color) 70%, transparent));
  background-size: 220% 100%;
  animation: storage-skeleton-pulse 1.25s ease-in-out infinite;
}

.storage-skeleton__header span:first-child {
  width: min(14rem, 48%);
  height: 2rem;
}

.storage-skeleton__header span:last-child {
  width: min(10rem, 36%);
  height: 2rem;
}

.storage-skeleton__bar {
  height: 1rem;
  width: 100%;
}

.storage-skeleton__cards {
  display: grid;
  gap: 0.85rem;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.storage-skeleton__cards span {
  min-height: 5.6rem;
  border-radius: 1rem;
}

.storage-skeleton__rows {
  display: grid;
  gap: 0.65rem;
}

.storage-skeleton__rows span {
  height: 2.8rem;
  border-radius: 1rem;
}

.storage-error-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.storage-error-panel__button {
  flex-shrink: 0;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--danger) 32%, transparent);
  background: var(--bg-elevated);
  color: var(--danger);
  font-size: 0.82rem;
  font-weight: 800;
  padding: 0.55rem 0.9rem;
}

.storage-error-panel__button:hover:not(:disabled) {
  background: var(--danger-soft);
}

.storage-error-panel__button:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

@keyframes storage-skeleton-pulse {
  0% { background-position: 120% 0; }
  100% { background-position: -120% 0; }
}

@media (max-width: 768px) {
  .storage-skeleton__cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .storage-error-panel {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
