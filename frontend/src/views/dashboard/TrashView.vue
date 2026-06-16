<script setup>
import BaseFileView from "@/components/BaseFileView.vue";
import { useFileStore } from "@/stores/useFileStore";
import { useDialog } from "@/composables/useDialog";

const fileStore = useFileStore();
const { confirm } = useDialog();

const handlePermanentDelete = async (id) => {
  await fileStore.permanentlyDelete(id);
};

const handleClearTrash = async () => {
  if (await confirm({ title: "휴지통 비우기", message: "휴지통의 모든 항목을 영구 삭제하시겠습니까? 복구할 수 없습니다.", confirmText: "영구 삭제", danger: true })) {
    await fileStore.emptyTrash();
  }
};
</script>

<template>
  <BaseFileView
    title="휴지통"
    :files="fileStore.trashFiles"
    :show-empty="true"
    delete-mode="permanent"
    :show-folder-navigation="false"
    empty-icon="fa-regular fa-trash-can"
    empty-title="휴지통이 비었습니다"
    empty-description="삭제한 파일이 여기에 표시됩니다. 영구 삭제하면 복구할 수 없어요."
    @delete="handlePermanentDelete"
  >
    <template #header-right>
      <button class="rounded-lg px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50" @click="handleClearTrash">
        휴지통 비우기
      </button>
    </template>

    <template #header-bottom>
      <div class="mb-6 flex items-center gap-2 rounded-lg bg-gray-100 p-3 text-xs text-gray-500">
        휴지통의 항목은 영구 삭제되면 복구할 수 없습니다.
      </div>
    </template>
  </BaseFileView>
</template>
