<script setup>
import ToastHost from '@/components/feedback/ToastHost.vue'
import DialogHost from '@/components/feedback/DialogHost.vue'
</script>

<template>
  <RouterView></RouterView>
  <ToastHost />
  <DialogHost />
</template>

<style scoped></style>
