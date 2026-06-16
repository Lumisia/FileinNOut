<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router';
import FileUpload from '@/components/function/FilesUploadWidget.vue';
import loadpost from '@/components/workspace/loadpost';
import { useFileStore } from '@/stores/useFileStore';
import { useAuthStore } from '@/stores/useAuthStore';
import postApi from '@/api/postApi';
import { useToastStore } from '@/stores/useToastStore';
import { useDialog } from '@/composables/useDialog';
import ShareModal from '@/views/workspace/ShareModal.vue';
import RoleModal from '@/views/workspace/RoleModal.vue';

const authStore = useAuthStore()
const fileStore = useFileStore()
const toast = useToastStore()
const { confirm } = useDialog()
const isSidebarOpen = ref(true) // 사이드바 토글 상태
const openMenuId = ref(null) // 현재 열려있는 메뉴의 ID 관리

// 공유 모달 관련 상태
const isShareModalOpen = ref(false);
const targetPostIdx = ref(null);
const targetPostUuid = ref('');

// 권한 설정 모달 관련 상태
const isRoleModalOpen = ref(false);
const roleDataList = ref([]);

// 1. loadpost에서 정의된 상태와 함수를 가져옵니다.
const { 
  personalItems, 
  sharedItems, 
  isPersonalOpen, 
  isSharedOpen, 
  side_list 
} = loadpost;

const scrollToTop = () => {
  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

// ✅ SSE: 협업 페이지 타이틀 실시간 반영 핵심 로직
const handleSseTitleUpdated = (evt) => {
  const updatedData = evt?.detail || {}
  const postId = Number(updatedData?.postId)
  const newTitle = updatedData?.title

  if (!postId || !newTitle) return;

  console.log(`[SSE Vue] 타이틀 업데이트 감지: 게시글 ${postId} -> ${newTitle}`);

  // 1. 협업 페이지(sharedItems) 리스트에서 해당 게시글 찾아서 제목 변경
  if (sharedItems.value) {
    sharedItems.value = sharedItems.value.map((item) => {
      if (Number(item?.post_idx) === postId) {
        return { ...item, title: newTitle }
      }
      return item
    })
  }

  // 2. 혹시 본인이 만든 페이지(personalItems)를 공유 중일 수 있으므로 여기도 같이 갱신
  if (personalItems.value) {
    personalItems.value = personalItems.value.map((item) => {
      if (Number(item?.post_idx) === postId) {
        return { ...item, title: newTitle }
      }
      return item
    })
  }
}

// 메뉴 토글 함수 (이벤트 전파 방지 포함)
const toggleMenu = (event, idx) => {
  event.stopPropagation();
  openMenuId.value = openMenuId.value === idx ? null : idx;
}

// 외부 클릭 시 메뉴 닫기
const closeMenu = () => {
  openMenuId.value = null;
}

onMounted(() => {
  side_list();
  window.addEventListener('sse-title-updated', handleSseTitleUpdated)
  window.addEventListener('click', closeMenu);
})

onBeforeUnmount(() => {
  window.removeEventListener('sse-title-updated', handleSseTitleUpdated)
  window.removeEventListener('click', closeMenu);
})
 
// 사이드바 토글 함수
const toggleSidebar = () => {
  isSidebarOpen.value = !isSidebarOpen.value
}

const isAdministrator = computed(() => {
  const email = String(authStore.user?.email || '').toLowerCase()
  const role = String(authStore.user?.role || '').toUpperCase()

  return (
    Boolean(fileStore.planCapabilities?.adminAccount) ||
    role.includes('ADMIN') ||
    email === 'administrator@administrator.adm'
  )
})

const sidebarToggleStyle = computed(() => ({
  left: isSidebarOpen.value ? 'calc(16rem - 0.75rem)' : '0.75rem',
}))

const router = useRouter();
const route = useRoute();

const goToPost = async (idx) => {
  if (!idx) return;

  // 현재 보고 있는 페이지와 동일한 idx를 클릭하면 새로고침 X
  if (String(route.params.id) === String(idx)) {
    return;
  }

  if (typeof window.__activeEditorDestroy === 'function') {
    window.__activeEditorDestroy();
    window.__activeEditorDestroy = null;
  }
  setTimeout(() => {
    router.push(`/workspace/read/${idx}`);
  }, 10);
};
// 1. 선택된 게시글의 상태를 저장할 ref 추가
const targetPostStatus = ref('Private');

// 메뉴 액션 함수들
const handleAction = async (action, idx) => {
  if (action === 'delete') {
    if (await confirm({ title: '페이지 삭제', message: '정말로 이 페이지를 삭제하시겠습니까?', confirmText: '삭제', danger: true })) {
      await postApi.deletePost(idx); 
      await side_list(); 
      router.push({ name: 'home' });
    }
  } else if (action === 'listDelete') {
    // ✨ [추가] 목록 삭제 기능 (본인이 ADMIN이 아닐 때 리스트에서 제거)
    if (await confirm({ title: '목록에서 삭제', message: '이 페이지를 내 목록에서 삭제하시겠습니까?', confirmText: '삭제', danger: true })) {
      try {
        await postApi.list_delete(idx); // api.post(`/workspace/delete/list/${idx}`) 호출
        await side_list(); 
        router.push({ name: 'home' });
      } catch (error) {
        console.error(error);
        toast.error('목록 삭제 중 오류가 발생했습니다.');
      }
    }
  } else if (action === 'share') {
    const allItems = [...personalItems.value, ...sharedItems.value];
    const selectedItem = allItems.find(item => item.post_idx === idx);

    targetPostIdx.value = idx;
    targetPostUuid.value = selectedItem ? (selectedItem.uuid || selectedItem.UUID) : ''; 
    targetPostStatus.value = selectedItem ? selectedItem.status : 'Private';
    isShareModalOpen.value = true;
  } else if (action === 'settings') {
    try {
      targetPostIdx.value = idx;
      const response = await postApi.loadRole(idx);
      const fetchedRoles = response.result ? response.result.body : response;
      roleDataList.value = Array.isArray(fetchedRoles) ? fetchedRoles : [];
      isRoleModalOpen.value = true;
    } catch (error) {
      console.error('Role list fetch error:', error);
      toast.error('권한 정보를 불러오는데 실패했습니다.');
    }
  }
  openMenuId.value = null;
}
</script>

<template>
  <div class="relative">
    <ShareModal 
      :is-open="isShareModalOpen" 
      :post-idx="targetPostIdx"
      :uuid="targetPostUuid" 
      :initial-status="targetPostStatus" 
      @close="isShareModalOpen = false"
    />
    <RoleModal
      :is-open="isRoleModalOpen"
      :post-idx="targetPostIdx"
      :initial-roles="roleDataList"
      @close="isRoleModalOpen = false"
    />

    <aside 
      class="bg-[var(--bg-sidebar)] border-r border-[var(--border-color)] flex flex-col transition-all duration-300 h-full sticky top-0"
      :class="[isSidebarOpen ? 'w-64 overflow-visible' : 'w-0 border-r-0 overflow-hidden']"
    >
      <div :class="isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'" class="transition-opacity duration-300 h-full flex flex-col">
        <RouterLink 
          :to="{ name: 'home' }" 
          class="py-6 px-6 pb-4 flex items-center gap-3 no-underline cursor-pointer transition-opacity duration-200 hover:opacity-80 flex-shrink-0"
          @click="scrollToTop"
        >
          <div class="w-9 h-9 bg-blue-600 rounded-lg shadow-lg shadow-blue-200 flex items-center justify-center flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </div>
          <span class="font-bold text-lg text-[var(--text-main)] tracking-tight no-underline">FileInNOut</span>
        </RouterLink>

        <div class="px-6 mb-4 overflow-visible relative z-[100]">
          <FileUpload />
        </div>

        <nav class="flex-1 px-3 overflow-y-auto custom-scrollbar">
          <div class="mb-6">
            <RouterLink
              :to="{ name: 'home' }"
              class="w-full flex items-center gap-3.5 px-3 py-2.5 text-sm text-[var(--text-secondary)] rounded-xl transition-all duration-200 hover:bg-[var(--bg-input)] hover:text-[var(--text-main)] no-underline"
              active-class="!bg-blue-500/10 !text-blue-600 !font-bold dark:!bg-blue-400/20 dark:!text-blue-400"
            >
              <i class="fa-solid fa-house w-5 text-center flex-shrink-0 text-lg"></i>
              <span>홈</span>
            </RouterLink>

            <RouterLink
              :to="{ name: 'shareFile' }"
              class="w-full flex items-center gap-3.5 px-3 py-2.5 text-sm text-[var(--text-secondary)] rounded-xl transition-all duration-200 hover:bg-[var(--bg-input)] hover:text-[var(--text-main)] no-underline"
              active-class="!bg-blue-500/10 !text-blue-600 !font-bold dark:!bg-blue-400/20 dark:!text-blue-400"
            >
              <i class="fa-solid fa-people-group w-5 text-center flex-shrink-0 text-lg"></i>
              <span>공유 파일</span>
            </RouterLink>

            <RouterLink
              :to="{ name: 'recentFile' }"
              class="w-full flex items-center gap-3.5 px-3 py-2.5 text-sm text-[var(--text-secondary)] rounded-xl transition-all duration-200 hover:bg-[var(--bg-input)] hover:text-[var(--text-main)] no-underline"
              active-class="!bg-blue-500/10 !text-blue-600 !font-bold dark:!bg-blue-400/20 dark:!text-blue-400"
            >
              <i class="fa-solid fa-clock w-5 text-center flex-shrink-0 text-lg"></i>
              <span>최근 파일</span>
            </RouterLink>
          </div>

          <div class="border-t border-[var(--border-color)] my-4 mx-2"></div>

          <div>
            <div class="flex items-center justify-between px-4 py-2 rounded-lg transition-colors duration-200 hover:bg-[var(--bg-input)] group">
              <button
                type="button"
                @click="isPersonalOpen = !isPersonalOpen"
                :aria-expanded="isPersonalOpen"
                class="flex flex-1 min-w-0 items-center justify-between gap-2 text-left cursor-pointer"
              >
                <h3 class="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">개인 페이지</h3>
                <span class="text-xs text-[var(--text-muted)] transition-transform duration-200" aria-hidden="true" :class="{ 'rotate-180': !isPersonalOpen }">▼</span>
              </button>
              <RouterLink :to="{ name: 'workspace' }" @click.stop class="ml-2 shrink-0">
                <button type="button" aria-label="새 워크스페이스 만들기" class="p-1 rounded hover:bg-gray-200 text-[var(--text-muted)] hover:text-blue-500 transition-colors">
                  <i class="fa-solid fa-plus text-[10px]" aria-hidden="true"></i>
                </button>
              </RouterLink>
            </div>

            <div v-show="isPersonalOpen" class="mt-1 space-y-1 px-2">
              <template v-if="personalItems.length > 0">
                <div v-for="item in personalItems" :key="item.post_idx" class="group relative px-3 py-2 text-sm text-[var(--text-secondary)] rounded-xl flex items-center justify-between transition-all duration-200 hover:bg-[var(--bg-input)] hover:text-[var(--text-main)]">
                  <button type="button" @click="goToPost(item.post_idx)" class="flex flex-1 min-w-0 items-center gap-3 overflow-hidden text-left cursor-pointer">
                    <i class="fa-solid fa-file-lines w-4 text-center opacity-70 flex-shrink-0" aria-hidden="true"></i>
                    <span class="truncate">{{ item.title }}</span>
                  </button>
                  <button type="button" @click="toggleMenu($event, item.post_idx)" :aria-label="`${item.title} 더보기`" aria-haspopup="true" :aria-expanded="openMenuId === item.post_idx" class="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-all">
                    <i class="fa-solid fa-ellipsis text-xs" aria-hidden="true"></i>
                  </button>
                  <div v-if="openMenuId === item.post_idx" class="absolute right-2 top-10 w-32 bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg shadow-xl z-[110] py-1 overflow-hidden">
                    <button v-if="item.level === 'ADMIN'" @click.stop="handleAction('share', item.post_idx)" class="w-full text-left px-4 py-2 text-xs hover:bg-[var(--bg-input)] transition-colors flex items-center gap-2">
                      <i class="fa-solid fa-share-nodes w-3"></i> 공유
                    </button>
                    <button v-if="item.level === 'ADMIN'" @click.stop="handleAction('settings', item.post_idx)" class="w-full text-left px-4 py-2 text-xs hover:bg-[var(--bg-input)] transition-colors flex items-center gap-2">
                      <i class="fa-solid fa-lock w-3"></i> 권한 설정
                    </button>
                    
                    <button v-if="item.level !== 'ADMIN'" @click.stop="handleAction('listDelete', item.post_idx)" class="w-full text-left px-4 py-2 text-xs text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors flex items-center gap-2">
                      <i class="fa-solid fa-rectangle-xmark w-3"></i> 목록 삭제
                    </button>

                    <div v-if="item.level === 'ADMIN'" class="border-t border-[var(--border-color)] my-1"></div>
                    <button v-if="item.level === 'ADMIN'" @click.stop="handleAction('delete', item.post_idx)" class="w-full text-left px-4 py-2 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-2">
                      <i class="fa-solid fa-trash w-3"></i> 삭제
                    </button>
                  </div>
                </div>
              </template>
              <div v-else class="px-3 py-4 text-xs text-[var(--text-muted)] italic text-center border border-dashed border-gray-200 rounded-lg mx-2">생성된 페이지가 없습니다.</div>
            </div>
          </div>

          <div>
            <button
              type="button"
              @click="isSharedOpen = !isSharedOpen"
              :aria-expanded="isSharedOpen"
              class="w-full flex items-center justify-between px-4 py-2 cursor-pointer rounded-lg transition-colors duration-200 hover:bg-[var(--bg-input)] text-left"
            >
              <h3 class="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">협업 페이지</h3>
              <span class="text-xs text-[var(--text-muted)] transition-transform duration-200" aria-hidden="true" :class="{ 'rotate-180': !isSharedOpen }">▼</span>
            </button>
            <div v-show="isSharedOpen" class="mt-1 space-y-1 px-2">
              <template v-if="sharedItems.length > 0">
                <div v-for="team in sharedItems" :key="team.post_idx" class="group relative px-3 py-2 text-sm text-[var(--text-secondary)] rounded-xl flex items-center justify-between transition-all duration-200 hover:bg-[var(--bg-input)] hover:text-[var(--text-main)]">
                  <button type="button" @click="goToPost(team.post_idx)" class="flex flex-1 min-w-0 items-center gap-3 overflow-hidden text-left cursor-pointer">
                    <i class="fa-solid fa-file-lines w-4 text-center opacity-70 flex-shrink-0" aria-hidden="true"></i>
                    <span class="truncate">{{ team.title }}</span>
                  </button>
                  <button type="button" @click="toggleMenu($event, team.post_idx)" :aria-label="`${team.title} 더보기`" aria-haspopup="true" :aria-expanded="openMenuId === team.post_idx" class="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-all">
                    <i class="fa-solid fa-ellipsis text-xs" aria-hidden="true"></i>
                  </button>
                  <div v-if="openMenuId === team.post_idx" class="absolute right-2 top-10 w-32 bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg shadow-xl z-[110] py-1 overflow-hidden">
                    <button v-if="team.level === 'ADMIN'" @click.stop="handleAction('share', team.post_idx)" class="w-full text-left px-4 py-2 text-xs hover:bg-[var(--bg-input)] transition-colors flex items-center gap-2">
                      <i class="fa-solid fa-share-nodes w-3"></i> 공유
                    </button>
                    <button v-if="team.level === 'ADMIN'" @click.stop="handleAction('settings', team.post_idx)" class="w-full text-left px-4 py-2 text-xs hover:bg-[var(--bg-input)] transition-colors flex items-center gap-2">
                      <i class="fa-solid fa-lock w-3"></i> 권한 설정
                    </button>

                    <button v-if="team.level !== 'ADMIN'" @click.stop="handleAction('listDelete', team.post_idx)" class="w-full text-left px-4 py-2 text-xs text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors flex items-center gap-2">
                      <i class="fa-solid fa-rectangle-xmark w-3"></i> 목록 삭제
                    </button>

                    <div v-if="team.level === 'ADMIN'" class="border-t border-[var(--border-color)] my-1"></div>
                    <button v-if="team.level === 'ADMIN'" @click.stop="handleAction('delete', team.post_idx)" class="w-full text-left px-4 py-2 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-2">
                      <i class="fa-solid fa-trash w-3"></i> 삭제
                    </button>
                  </div>
                </div>
              </template>
              <div v-else class="px-3 py-4 text-xs text-[var(--text-muted)] italic text-center border border-dashed border-gray-200 rounded-lg mx-2">생성된 페이지가 없습니다.</div>
            </div>
          </div>
          
          <div class="border-t border-[var(--border-color)] my-4 mx-2"></div>
          
          <div class="space-y-1">
            <RouterLink :to="{ name: 'trash' }" class="w-full flex items-center gap-3.5 px-3 py-2.5 text-sm text-[var(--text-secondary)] rounded-xl transition-all duration-200 hover:bg-[var(--bg-input)] hover:text-[var(--text-main)] no-underline">
              <i class="fa-solid fa-trash w-5 text-center flex-shrink-0 text-lg"></i>
              <span>휴지통</span>
            </RouterLink>
            <RouterLink
              :to="{ name: 'storage' }"
              class="w-full flex items-center gap-3.5 px-3 py-2.5 text-sm text-[var(--text-secondary)] rounded-xl transition-all duration-200 hover:bg-[var(--bg-input)] hover:text-[var(--text-main)] no-underline"
              active-class="!bg-blue-500/10 !text-blue-600 !font-bold dark:!bg-blue-400/20 dark:!text-blue-400"
            >
              <i class="fa-solid fa-cloud w-5 text-center flex-shrink-0 text-lg"></i>
              <span>저장용량</span>
            </RouterLink>
            <RouterLink
              v-if="isAdministrator"
              :to="{ name: 'administrator' }"
              class="w-full flex items-center gap-3.5 px-3 py-2.5 text-sm text-[var(--text-secondary)] rounded-xl transition-all duration-200 hover:bg-[var(--bg-input)] hover:text-[var(--text-main)] no-underline"
              active-class="!bg-blue-500/10 !text-blue-600 !font-bold dark:!bg-blue-400/20 dark:!text-blue-400"
            >
              <i class="fa-solid fa-user-shield w-5 text-center flex-shrink-0 text-lg"></i>
              <span>관리자 페이지</span>
            </RouterLink>
          </div>
        </nav>
      </div>
    </aside>

    <button
      @click="toggleSidebar"
      type="button"
      class="sidebar-toggle absolute top-4 z-50 flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] text-[var(--text-main)] shadow-lg transition-all duration-300 hover:bg-[var(--bg-input)]"
      :style="sidebarToggleStyle"
      :title="isSidebarOpen ? '사이드바 숨기기' : '사이드바 보이기'"
      :aria-label="isSidebarOpen ? '사이드바 숨기기' : '사이드바 보이기'"
      :aria-expanded="isSidebarOpen"
    >
      <i class="fas transition-transform duration-300" :class="isSidebarOpen ? 'fa-chevron-left' : 'fa-chevron-right'" aria-hidden="true"></i>
    </button>
  </div>
</template>

<style scoped>
/* Scrollbar Styling */
nav::-webkit-scrollbar {
  width: 6px;
}

nav::-webkit-scrollbar-track {
  background: transparent;
}

nav::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}

nav::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}
.overflow-visible {
  overflow: visible !important; 
}

.sidebar-toggle {
  transform: translateX(-50%);
}

@media (max-width: 1024px) {
  .sidebar-toggle {
    top: 0.75rem;
  }
}
</style>
