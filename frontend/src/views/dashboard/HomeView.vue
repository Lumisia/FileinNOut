<script setup>
import BaseFileView from "@/components/BaseFileView.vue";
import { useFileStore } from "@/stores/useFileStore";

const fileStore = useFileStore();

const openUpload = () => {
  window.dispatchEvent(new CustomEvent("open-file-upload"));
};
</script>

<template>
  <BaseFileView
    title="홈"
    :files="fileStore.driveFiles"
    :show-folder-navigation="true"
    empty-icon="fa-solid fa-cloud-arrow-up"
    empty-title="아직 파일이 없습니다"
    empty-description="첫 파일을 업로드하거나 폴더를 만들어 드라이브를 시작해 보세요."
    empty-action-label="파일 업로드"
    @empty-action="openUpload"
    @delete="fileStore.moveToTrash"
  />
</template>
