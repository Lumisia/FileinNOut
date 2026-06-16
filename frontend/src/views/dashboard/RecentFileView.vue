<script setup>
import { computed } from "vue";
import BaseFileView from "@/components/BaseFileView.vue";
import { useFileStore } from "@/stores/useFileStore";

const fileStore = useFileStore();
const thirtyDaysAgo = new Date();
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

const recentFilesMonth = computed(() =>
  fileStore.recentFiles.filter((file) => new Date(file.lastModified) >= thirtyDaysAgo),
);
</script>

<template>
  <BaseFileView
    title="최근 파일"
    :files="recentFilesMonth"
    empty-icon="fa-regular fa-clock"
    empty-title="최근 파일이 없습니다"
    empty-description="최근 30일 동안 수정한 파일이 여기에 표시됩니다."
    @delete="fileStore.moveToTrash"
  />
</template>
