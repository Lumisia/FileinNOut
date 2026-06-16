<script setup>
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { downloadFileAsset } from '@/api/filesApi'
import postApi from '@/api/postApi'
import { initEditor } from '@/components/workspace/editor'
import loadpost from '@/components/workspace/loadpost'
import { useAuthStore } from '@/stores/useAuthStore'
import { useToastStore } from '@/stores/useToastStore'
import { useDialog } from '@/composables/useDialog'
import { useFocusTrap } from '@/composables/useFocusTrap'
import SockJS from 'sockjs-client'
import Stomp from 'stompjs'
import { apiPath } from '@/utils/backendUrl'
import { fetchPostVersions, fetchPostVersion } from '@/api/versionsApi'

const route     = useRoute()
const router    = useRouter()
const authStore = useAuthStore()
const toast     = useToastStore()
const { confirm } = useDialog()

const editorHolder    = ref(null)
const editorApi       = ref(null)
const title           = ref('')
const isEditorLoading = ref(false)
const isSaving        = ref(false)
const saveStatus      = ref('idle') // 'idle' | 'saving' | 'saved' | 'error'
const lastSavedAt     = ref(null)
const loadError       = ref(null)   // null | { kind: 'forbidden'|'notfound'|'network'|'unknown', status }
const showUserList    = ref(false)
const titleDirty      = ref(false)
const allowRouteLeaveOnce  = ref(false)
const allowWindowUnloadOnce = ref(false)

const LEAVE_WARNING_MESSAGE = '현재 페이지를 나가시겠습니까? 저장하지 않은 페이지는 모두 사라집니다.'

const workspaceId             = ref(null)
const workspaceAccessRole     = ref('ADMIN')
const workspaceAssets         = ref([])
const workspaceAssetLoading   = ref(false)
const workspaceAssetUploading = ref(false)
const workspaceAssetError     = ref('')
const deletingAssetIds        = ref([])
const imageInput              = ref(null)
const fileInput               = ref(null)
const activeWorkspaceAssetId  = ref(null)
const savingWorkspaceAssetIds = ref([])

// ✅ 드롭다운 열림 상태
const openRoleDropdownId = ref(null)

// ✅ 참여자 팝오버: body 로 Teleport + 버튼 기준 위치 계산 (stacking context 트랩 회피)
const presenceBtnRef = ref(null)
const popoverStyle   = ref({})
const POPOVER_WIDTH  = 280

// ─── 계산 속성 ────────────────────────────────────────────────────────────────
const isValid = computed(() => title.value.trim().length > 0)
const hasUnsavedChanges = computed(() =>
  titleDirty.value || Boolean(editorApi.value?.isDirtyRef?.value),
)

const remoteCursors = computed(() => editorApi.value?.remoteCursorsRef?.value || {})
const activeUsers   = computed(() => editorApi.value?.activeUsersRef?.value   || [])

const formatClock = (ts) =>
  new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit' }).format(new Date(ts))

// 저장 상태 표시: 협업 동기화(Yjs)와 별개로 "서버 영구 저장" 상태를 분명히 보여준다.
const saveIndicator = computed(() => {
  if (saveStatus.value === 'saving') return { tone: 'saving', text: '저장 중…' }
  if (saveStatus.value === 'error')  return { tone: 'error',  text: '저장 실패' }
  if (hasUnsavedChanges.value)       return { tone: 'dirty',  text: '변경사항 있음' }
  if (lastSavedAt.value)             return { tone: 'saved',  text: `저장됨 · ${formatClock(lastSavedAt.value)}` }
  return null
})

const loadErrorTitle = computed(() => {
  switch (loadError.value?.kind) {
    case 'forbidden': return '접근 권한이 없습니다'
    case 'notfound':  return '문서를 찾을 수 없습니다'
    default:          return '문서를 불러오지 못했습니다'
  }
})

const loadErrorDesc = computed(() => {
  switch (loadError.value?.kind) {
    case 'forbidden': return '이 문서를 볼 수 있는 권한이 없습니다. 소유자에게 공유를 요청하세요.'
    case 'notfound':  return '삭제되었거나 잘못된 링크일 수 있습니다.'
    case 'network':   return '네트워크 연결을 확인한 뒤 다시 시도해 주세요.'
    default:          return '잠시 후 다시 시도해 주세요.'
  }
})

const canRetryLoad = computed(
  () => Boolean(loadError.value) && !['forbidden', 'notfound'].includes(loadError.value.kind),
)

const canManageAssets = computed(() => {
  if (!workspaceId.value) return true
  const role = String(workspaceAccessRole.value || 'ADMIN').toUpperCase()
  if (role === 'READ') return false
  return ['ADMIN', 'WRITE'].includes(role)
})

const workspaceImages    = computed(() => workspaceAssets.value.filter((a) => a.assetType === 'IMAGE'))
const workspaceFiles     = computed(() => workspaceAssets.value.filter((a) => a.assetType === 'FILE'))
const hasWorkspaceAssets = computed(() => workspaceAssets.value.length > 0)

// ─── 모듈 수준 변수 ──────────────────────────────────────────────────────────
let currentSetupId                = 0
let workspaceAssetStompClient     = null
let connectedWorkspaceAssetRoomId = null

// ─── 역할 레이블 헬퍼 ────────────────────────────────────────────────────────
const roleLabel = (role) => {
  const map = { ADMIN: '관리자', WRITE: '편집자', READ: '뷰어' }
  return map[role] || '뷰어'
}

// ─── 유틸 ────────────────────────────────────────────────────────────────────
const formatBytes = (bytes) => {
  const size = Number(bytes || 0)
  if (!Number.isFinite(size) || size <= 0) return '0 B'
  const units     = ['B', 'KB', 'MB', 'GB', 'TB']
  const unitIndex = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1)
  const value     = size / 1024 ** unitIndex
  const fractionDigits = unitIndex === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(fractionDigits)} ${units[unitIndex]}`
}

const formatDateTime = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(date)
}

const normalizeWorkspaceAsset = (asset = {}) => ({
  id:             asset.idx ?? asset.id ?? null,
  workspaceId:    asset.workspaceIdx ?? asset.workspaceId ?? workspaceId.value,
  assetType:      String(asset.assetType || 'FILE').toUpperCase(),
  originalName:   asset.originalName  || asset.fileOriginName || '이름 없는 파일',
  storedFileName: asset.storedFileName || asset.fileSaveName  || '',
  objectFolder:   asset.objectFolder  || '',
  objectKey:      asset.objectKey     || asset.fileSavePath   || '',
  contentType:    asset.contentType   || 'application/octet-stream',
  fileSize:       Number(asset.fileSize || 0),
  previewUrl:     asset.previewUrl    || '',
  downloadUrl:    asset.downloadUrl   || asset.presignedDownloadUrl || '',
  createdAt:      asset.createdAt     || null,
  createdAtLabel: formatDateTime(asset.createdAt),
  fileSizeLabel:  formatBytes(asset.fileSize),
})

const syncTheme = () => {
  // 앱 전역 테마(Header.initTheme)와 동일: 저장값이 'dark'일 때만 다크.
  // prefers-color-scheme fallback 제거 → 워크스페이스만 다크로 들어가는 문제 해결.
  const shouldUseDark = localStorage.getItem('theme') === 'dark'
  document.documentElement.classList.toggle('dark', shouldUseDark)
}

// ─── 에셋 목록 병합 / 제거 ────────────────────────────────────────────────────
const mergeWorkspaceAssets = (nextAssets) => {
  const assetMap = new Map()
  ;[...nextAssets, ...workspaceAssets.value].forEach((asset) => {
    const normalized = normalizeWorkspaceAsset(asset)
    if (normalized.id != null) assetMap.set(String(normalized.id), normalized)
  })
  workspaceAssets.value = [...assetMap.values()].sort(
    (l, r) => new Date(r.createdAt || 0).getTime() - new Date(l.createdAt || 0).getTime()
  )
}

const removeWorkspaceAssets = (assetIds) => {
  const deleteSet = new Set((assetIds || []).map((id) => String(id)))
  if (!deleteSet.size) return
  workspaceAssets.value = workspaceAssets.value.filter((a) => !deleteSet.has(String(a.id)))
}

// ─── 에셋 실시간 이벤트 ───────────────────────────────────────────────────────
const handleWorkspaceAssetRealtimeEvent = (payload = {}) => {
  if (Number(payload.workspaceIdx || 0) !== Number(workspaceId.value || 0)) return
  if (payload.action === 'UPSERT') {
    mergeWorkspaceAssets(Array.isArray(payload.assets) ? payload.assets : [])
    return
  }
  if (payload.action === 'DELETE') {
    removeWorkspaceAssets(payload.assetIdxList)
    return
  }
  void refreshWorkspaceAssets(workspaceId.value)
}

// ─── STOMP 연결 / 해제 ────────────────────────────────────────────────────────
const disconnectWorkspaceAssetRealtime = () => {
  connectedWorkspaceAssetRoomId = null
  const client = workspaceAssetStompClient
  workspaceAssetStompClient = null
  if (!client) return
  try {
    if (client.connected) {
      client.disconnect(() => {})
    } else if (client.ws?.readyState === WebSocket.OPEN) {
      client.ws.close()
    }
  } catch (error) {
    console.error('Workspace asset realtime disconnect failed:', error)
  }
}

const connectWorkspaceAssetRealtime = (targetWorkspaceId = workspaceId.value) => {
  const normalizedWorkspaceId = Number(targetWorkspaceId || 0)
  const accessToken = authStore.token || localStorage.getItem('ACCESS_TOKEN')

  if (!normalizedWorkspaceId || !accessToken) {
    disconnectWorkspaceAssetRealtime()
    return
  }

  if (
    workspaceAssetStompClient &&
    connectedWorkspaceAssetRoomId === normalizedWorkspaceId &&
    workspaceAssetStompClient.connected
  ) return

  disconnectWorkspaceAssetRealtime()

  const socket      = new SockJS(apiPath('/ws-stomp'))
  const stompClient = Stomp.over(socket)
  stompClient.debug = null

  workspaceAssetStompClient = stompClient
  stompClient.connect(
    { Authorization: `Bearer ${accessToken}` },
    () => {
      if (workspaceAssetStompClient !== stompClient) {
        stompClient.disconnect(() => {})
        return
      }
      connectedWorkspaceAssetRoomId = normalizedWorkspaceId
      stompClient.subscribe(`/sub/workspace/assets/${normalizedWorkspaceId}`, (message) => {
        try {
          const payload = JSON.parse(message.body)
          handleWorkspaceAssetRealtimeEvent(payload)
        } catch (error) {
          console.error('Workspace asset realtime payload parse failed:', error)
          void refreshWorkspaceAssets(normalizedWorkspaceId)
        }
      })
    },
    (error) => {
      if (workspaceAssetStompClient === stompClient) {
        console.error('Workspace asset realtime connection failed:', error)
      }
    },
  )
}

// ─── 에셋 새로고침 ────────────────────────────────────────────────────────────
const refreshWorkspaceAssets = async (targetWorkspaceId = workspaceId.value) => {
  if (!targetWorkspaceId) {
    workspaceAssets.value     = []
    workspaceAssetError.value = ''
    return []
  }
  workspaceAssetLoading.value = true
  workspaceAssetError.value   = ''
  try {
    const result = await postApi.getWorkspaceAssets(targetWorkspaceId)
    workspaceAssets.value = (Array.isArray(result) ? result : []).map(normalizeWorkspaceAsset)
    return workspaceAssets.value
  } catch (error) {
    workspaceAssetError.value =
      error?.response?.data?.message || error?.message || '워크스페이스 첨부 파일을 불러오지 못했습니다.'
    workspaceAssets.value = []
    return []
  } finally {
    workspaceAssetLoading.value = false
  }
}

// ─── 버전 이력 ────────────────────────────────────────────────────────────────
const versionPanelOpen  = ref(false)
const versions          = ref([])
const versionPreview    = ref(null)
const versionsLoading   = ref(false)
const versionLoadError  = ref('')
const versionPanelRef   = ref(null)
useFocusTrap(() => versionPanelOpen.value, versionPanelRef, { onEsc: () => closeVersionPanel() })

const formatVersionDate = (val) => {
  if (!val) return ''
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(val))
}

const getVersionErrorMessage = (error, fallback) => (
  error?.response?.data?.message || error?.message || fallback
)

const loadVersionList = async () => {
  if (!workspaceId.value) return
  versionsLoading.value  = true
  versionLoadError.value = ''
  try {
    versions.value = await fetchPostVersions(workspaceId.value)
  } catch (error) {
    versionLoadError.value = getVersionErrorMessage(error, '버전 이력을 불러오지 못했습니다.')
  } finally {
    versionsLoading.value = false
  }
}

const openVersionPanel = async () => {
  if (!workspaceId.value) return
  versionPanelOpen.value = true
  await loadVersionList()
}

const retryVersionList = () => {
  void loadVersionList()
}

const closeVersionPanel = () => {
  versionPanelOpen.value = false
  versionPreview.value   = null
  versionLoadError.value = ''
}

const previewVersion = async (versionNum) => {
  if (!workspaceId.value) return
  try {
    versionPreview.value = await fetchPostVersion(workspaceId.value, versionNum)
  } catch (error) {
    toast.error(getVersionErrorMessage(error, '버전을 불러오지 못했습니다.'))
  }
}

// ─── 저장 ─────────────────────────────────────────────────────────────────────
const handleSave = async () => {
  if (!editorApi.value?.savePost || isSaving.value) return
  // 저장 진행 중에는 버튼 비활성(회색), 완료되면 원래(파란색)로 복귀
  isSaving.value   = true
  saveStatus.value = 'saving'
  try {
    const response = await editorApi.value.savePost()
    // savePost 가 throw 하지 않으면 서버 영구 저장 성공.
    titleDirty.value = false
    editorApi.value?.markSaved?.()
    saveStatus.value  = 'saved'
    lastSavedAt.value = Date.now()

    // 새로 생성된 문서면 읽기 경로로 이동(기존 문서 재저장은 idx 가 없을 수 있음).
    const savedWorkspaceId = response?.result?.body?.idx ?? response?.data?.idx ?? response?.idx ?? null
    if (savedWorkspaceId) {
      workspaceId.value         = Number(savedWorkspaceId)
      workspaceAccessRole.value = 'ADMIN'
      if (String(route.params.id || '') !== String(savedWorkspaceId)) {
        router.push(`/workspace/read/${savedWorkspaceId}`)
      }
    }
  } catch (error) {
    // 저장 실패: 내용은 그대로 유지(editor.isDirtyRef=true)하고 사용자에게 알린다.
    console.error('워크스페이스 저장 실패:', error)
    saveStatus.value = 'error'
    toast.error('저장에 실패했습니다. 변경사항은 그대로 유지됩니다.', {
      action: { label: '다시 시도', handler: () => handleSave() },
    })
  } finally {
    isSaving.value = false
  }
}

const handleTitleInput = (event) => {
  const nextTitle = event?.target?.value ?? ''
  title.value = nextTitle
  titleDirty.value = true
  editorApi.value?.updateTitleFromLocal?.(nextTitle)
}

// ─── 권한 변경 (드롭다운) ────────────────────────────────────────────────────
const handleRoleAction = async (user, action) => {
  openRoleDropdownId.value = null
  if (!workspaceId.value || !user.userIdx) return

  try {
    if (action === 'KICKED') {
      if (!(await confirm({ title: '참여자 추방', message: `${user.name} 님을 추방하시겠습니까?`, confirmText: '추방', danger: true }))) return
      await postApi.kickUser(workspaceId.value, user.userIdx)
    } else {
      await postApi.changeUserRole(workspaceId.value, user.userIdx, action)
    }
  } catch (e) {
    toast.error('권한 변경에 실패했습니다.')
  }
}

// ─── SSE role-changed 핸들러 ────────────────────────────────────────────────
// 현재 보고 있는 페이지와 같은 워크스페이스일 때만 처리
const handleSseRoleChanged = (evt) => {
  const { postIdx, newRole } = evt?.detail || {}
  if (!postIdx) return

  // 현재 내가 보고 있는 워크스페이스가 아니면 무시
  if (Number(postIdx) !== Number(workspaceId.value)) return

  if (newRole === 'KICKED') {
    toast.warning('해당 워크스페이스에서 추방되었습니다.')
    allowRouteLeaveOnce.value = true
    // 홈으로 강제 이동 + 사이드바 협업목록 갱신(추방된 워크스페이스 제거)
    router.push({ name: 'home' }).finally(() => { loadpost.side_list() })
  } else {
    // 권한이 변경되면 페이지 새로고침으로 최신 권한 반영
    allowWindowUnloadOnce.value = true
    window.location.reload()
  }
}

// ─── 드롭다운 외부 클릭 시 닫기 ──────────────────────────────────────────────
const closeRoleDropdown = () => {
  openRoleDropdownId.value = null
}

// ─── 참여자 팝오버 위치 계산 / 토글 ──────────────────────────────────────────
const updatePopoverPosition = () => {
  const el = presenceBtnRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  // body 로 Teleport → 문서 좌표(absolute) 기준. scroll 은 자동 추적, 버튼 우측 정렬.
  const left = Math.max(8, rect.right + window.scrollX - POPOVER_WIDTH)
  popoverStyle.value = {
    position: 'absolute',
    top:   `${rect.bottom + window.scrollY + 6}px`,
    left:  `${left}px`,
    right: 'auto',
  }
}

const togglePresence = async () => {
  showUserList.value = !showUserList.value
  if (showUserList.value) {
    openRoleDropdownId.value = null
    await nextTick()
    updatePopoverPosition()
  }
}

const handlePresenceReposition = () => {
  if (showUserList.value) updatePopoverPosition()
}

// ─── 워처 ─────────────────────────────────────────────────────────────────────
const handleBeforeUnload = (event) => {
  if (allowWindowUnloadOnce.value) {
    allowWindowUnloadOnce.value = false
    return
  }

  if (!hasUnsavedChanges.value) return

  event.preventDefault()
  event.returnValue = LEAVE_WARNING_MESSAGE
  return LEAVE_WARNING_MESSAGE
}

onBeforeRouteLeave(async () => {
  if (allowRouteLeaveOnce.value) {
    allowRouteLeaveOnce.value = false
    return true
  }

  if (!hasUnsavedChanges.value) return true

  return await confirm({ title: '페이지 나가기', message: LEAVE_WARNING_MESSAGE, confirmText: '나가기', cancelText: '머무르기', danger: true })
})

onBeforeRouteUpdate(async () => {
  if (allowRouteLeaveOnce.value) {
    allowRouteLeaveOnce.value = false
    return true
  }

  if (!hasUnsavedChanges.value) return true

  return await confirm({ title: '페이지 나가기', message: LEAVE_WARNING_MESSAGE, confirmText: '나가기', cancelText: '머무르기', danger: true })
})

watch(workspaceAssets, (assets) => {
  if (!assets.some((a) => a.id === activeWorkspaceAssetId.value)) {
    activeWorkspaceAssetId.value = null
  }
})

// ─── 데이터 준비 ──────────────────────────────────────────────────────────────
const prepareData = async () => {
  const id = route.params.id
  if (!id || route.path === '/workspace') {
    return { idx: null, title: '', contents: '', type: false, status: 'Private', uuid: '', accessRole: 'ADMIN' }
  }
  if (route.meta.initialData && String(route.meta.initialData.idx) === String(id)) {
    return route.meta.initialData
  }
  try {
    return await postApi.getPost(id)
  } catch (error) {
    // 이전에는 실패 시 빈 문서를 반환해 "새 문서"처럼 보였고, 그대로 저장하면
    // 기존 문서를 덮어쓸 위험이 있었다. 이제는 오류 정보를 보존해 호출자(setupEditor)가
    // 안전 화면을 띄우게 한다. (협업 콘텐츠는 로드 성공 후 Yjs 룸으로 동기화되므로 안전)
    const rawStatus = Number(error?.response?.status ?? error?.code)
    const kind =
      rawStatus === 403 ? 'forbidden'
        : rawStatus === 404 ? 'notfound'
        : (error?.response || error?.baseResponse) ? 'unknown'
        : 'network'

    const failure = new Error('document-load-failed')
    failure.loadFailure = { kind, status: Number.isFinite(rawStatus) ? rawStatus : null }
    throw failure
  }
}

// ─── 워크스페이스 자동 저장 ──────────────────────────────────────────────────
const ensureWorkspacePersisted = async ({ navigate = false } = {}) => {
  if (workspaceId.value) return workspaceId.value
  if (!editorApi.value?.savePost) throw new Error('워크스페이스를 먼저 저장할 수 없습니다.')
  const response         = await editorApi.value.savePost()
  const savedWorkspaceId = response?.result?.body?.idx ?? response?.data?.idx ?? response?.idx ?? null
  if (!savedWorkspaceId) throw new Error('워크스페이스 저장에 실패했습니다.')
  workspaceId.value         = Number(savedWorkspaceId)
  workspaceAccessRole.value = 'ADMIN'
  if (navigate && String(route.params.id || '') !== String(savedWorkspaceId)) {
    await router.replace(`/workspace/read/${savedWorkspaceId}`)
  }
  return workspaceId.value
}

// ─── 파일 업로드 ──────────────────────────────────────────────────────────────
const uploadWorkspaceFiles = async (files, { autoPersist = true } = {}) => {
  const selectedFiles = Array.from(files || []).filter(Boolean)
  if (!selectedFiles.length) return []
  let targetWorkspaceId = workspaceId.value
  if (!targetWorkspaceId && autoPersist) {
    targetWorkspaceId = await ensureWorkspacePersisted({ navigate: false })
  }
  if (!targetWorkspaceId) throw new Error('워크스페이스를 먼저 저장한 뒤 업로드해 주세요.')
  workspaceAssetUploading.value = true
  workspaceAssetError.value     = ''
  try {
    const uploaded         = await postApi.uploadWorkspaceAssets(targetWorkspaceId, selectedFiles)
    const normalizedAssets = (Array.isArray(uploaded) ? uploaded : []).map(normalizeWorkspaceAsset)
    mergeWorkspaceAssets(normalizedAssets)
    if (normalizedAssets[0]?.id != null) activeWorkspaceAssetId.value = normalizedAssets[0].id
    return normalizedAssets
  } catch (error) {
    workspaceAssetError.value =
      error?.response?.data?.message || error?.message || '파일 업로드 중 오류가 발생했습니다.'
    throw error
  } finally {
    workspaceAssetUploading.value = false
  }
}

const handleEditorImageUpload = async (file) => {
  const uploadedAssets = await uploadWorkspaceFiles([file], { autoPersist: true })
  const uploadedImage  = uploadedAssets.find((a) => a.assetType === 'IMAGE') || uploadedAssets[0]
  if (!uploadedImage?.previewUrl) throw new Error('이미지 업로드 결과를 확인할 수 없습니다.')
  return uploadedImage
}

const handleAssetSelection = async (event) => {
  const files = Array.from(event.target?.files || [])
  if (!files.length) return
  try {
    await uploadWorkspaceFiles(files, { autoPersist: true })
  } catch (error) {
    console.error('Workspace asset upload failed:', error)
  } finally {
    event.target.value = ''
  }
}

const triggerImageSelect = () => { if (!canManageAssets.value) return; imageInput.value?.click() }
const triggerFileSelect  = () => { if (!canManageAssets.value) return; fileInput.value?.click() }

// ─── 에셋 액션 ────────────────────────────────────────────────────────────────
const toggleWorkspaceAssetActions = (assetId) => {
  if (assetId == null) return
  activeWorkspaceAssetId.value = activeWorkspaceAssetId.value === assetId ? null : assetId
}

const handleAssetDelete = async (asset) => {
  if (!asset?.id || !workspaceId.value || !canManageAssets.value) return
  deletingAssetIds.value    = [...deletingAssetIds.value, asset.id]
  workspaceAssetError.value = ''
  try {
    await postApi.deleteWorkspaceAsset(workspaceId.value, asset.id)
    workspaceAssets.value = workspaceAssets.value.filter((item) => item.id !== asset.id)
    if (activeWorkspaceAssetId.value === asset.id) activeWorkspaceAssetId.value = null
  } catch (error) {
    workspaceAssetError.value =
      error?.response?.data?.message || error?.message || '첨부 파일을 삭제하지 못했습니다.'
  } finally {
    deletingAssetIds.value = deletingAssetIds.value.filter((id) => id !== asset.id)
  }
}

const isDeletingAsset        = (assetId) => deletingAssetIds.value.includes(assetId)
const isSavingWorkspaceAsset = (assetId) => savingWorkspaceAssetIds.value.includes(assetId)

const saveWorkspaceAssetToDrive = async (asset) => {
  if (!asset?.id || !workspaceId.value) return
  savingWorkspaceAssetIds.value = [...savingWorkspaceAssetIds.value, asset.id]
  workspaceAssetError.value     = ''
  try {
    await postApi.saveWorkspaceAssetToDrive(workspaceId.value, asset.id)
    toast.success('파일이 드라이브에 저장되었습니다.')
  } catch (error) {
    workspaceAssetError.value =
      error?.response?.data?.message || error?.message || '파일을 드라이브에 저장하지 못했습니다.'
  } finally {
    savingWorkspaceAssetIds.value = savingWorkspaceAssetIds.value.filter((id) => id !== asset.id)
  }
}

const downloadWorkspaceAsset = async (asset) => {
  if (!asset?.downloadUrl) return
  try {
    await downloadFileAsset(asset, asset.originalName)
  } catch (error) {
    console.error('Workspace asset download failed:', error)
    workspaceAssetError.value = '파일 다운로드에 실패했습니다.'
  }
}

const getWorkspaceAssetBadge = (asset) => (asset?.assetType === 'IMAGE' ? '이미지' : '파일')

// ─── 에디터 초기화 ────────────────────────────────────────────────────────────
const setupEditor = async () => {
  const setupId = ++currentSetupId
  if (!editorHolder.value) return

  isEditorLoading.value = true
  allowRouteLeaveOnce.value = false
  allowWindowUnloadOnce.value = false

  let data
  try {
    data = await prepareData()
  } catch (error) {
    if (setupId !== currentSetupId) return
    console.error('워크스페이스 로드 실패:', error)
    loadError.value = error?.loadFailure ?? { kind: 'unknown', status: null }
    isEditorLoading.value = false
    return
  }
  if (setupId !== currentSetupId) return
  loadError.value = null

  // 기존 에디터를 먼저 정리하고 새 editor를 준비한다.
  if (editorApi.value) {
    try {
      if (editorApi.value.editor?.isReady) await editorApi.value.editor.isReady
      await editorApi.value.destroy()
    } catch (error) {
      console.error('Editor destroy failed:', error)
    }
    editorApi.value = null
  }

  title.value               = data.title || ''
  titleDirty.value          = false
  saveStatus.value          = 'idle'
  lastSavedAt.value         = null
  workspaceId.value         = data.idx ? Number(data.idx) : null
  workspaceAccessRole.value = data.accessRole || data.level || 'ADMIN'

  if (String(workspaceAccessRole.value).toUpperCase() === 'READ' && data.idx) {
    await router.replace(`/workspace/readonly/${data.idx}`)
    return
  }

  await refreshWorkspaceAssets(workspaceId.value)

  await nextTick()
  if (editorHolder.value) editorHolder.value.innerHTML = ''

  try {
    const isPrivate = data.status === 'Private'

    const newEditorApi = await initEditor(
      editorHolder.value,
      `notion-room-${data.idx ? data.idx : `new-${Date.now()}`}`,
      data.contents,
      data.idx ?? null,
      data.title,
      isPrivate,
      {
        uploadImage: handleEditorImageUpload,
        userRole: workspaceAccessRole.value,  // ✅ 역할 전달
      },
    )

    if (setupId !== currentSetupId) {
      if (newEditorApi.editor?.isReady) await newEditorApi.editor.isReady
      newEditorApi.destroy()
      return
    }

    editorApi.value = markRaw(newEditorApi)
    editorApi.value?.bindTitleRef?.(title)
    editorApi.value?.markSaved?.()
  } catch (error) {
    console.error('에디터 초기화 실패:', error)
  } finally {
    if (setupId === currentSetupId) isEditorLoading.value = false
  }
}

const retryLoad = async () => {
  loadError.value = null
  await nextTick()
  await setupEditor()
}

// ─── UUID 초대 링크 처리 ──────────────────────────────────────────────────────
const checkAndRedirectUuid = async () => {
  const uuid = route.query.uuid
  if (!route.path.includes('/invite') || !uuid) return false
  try {
    const response = await postApi.getPostByUuid(uuid)
    const data     = response?.result?.body || response?.data || response
    if (data?.idx) {
      // 공개 링크로 합류한 워크스페이스가 왼쪽 사이드바 '협업 페이지'에 바로 보이도록 목록 갱신
      await loadpost.side_list()
      await router.replace({ name: 'workspace_read', params: { id: data.idx } })
      return true
    }
  } catch (error) {
    console.error('UUID redirect failed:', error)
  }
  await router.replace('/workspace')
  return true
}

// ─── 라이프사이클 ────────────────────────────────────────────────────────────
onMounted(async () => {
  syncTheme()
  const redirected = await checkAndRedirectUuid()
  if (!redirected) await setupEditor()

  // ✅ SSE role-changed 리스너 등록
  window.addEventListener('sse-role-changed', handleSseRoleChanged)
  window.addEventListener('beforeunload', handleBeforeUnload)
  // 드롭다운 외부 클릭 닫기
  window.addEventListener('click', closeRoleDropdown)
  // 참여자 팝오버 위치 재계산
  window.addEventListener('resize', handlePresenceReposition)
})

watch(() => route.params.id, async () => { await setupEditor() })

watch(() => route.path, async (newPath) => {
  if (newPath === '/workspace') await setupEditor()
})

watch(
  () => workspaceId.value,
  (nextWorkspaceId) => { connectWorkspaceAssetRealtime(nextWorkspaceId) },
  { immediate: true },
)

onBeforeUnmount(async () => {
  disconnectWorkspaceAssetRealtime()

  // ✅ SSE role-changed 리스너 해제
  window.removeEventListener('sse-role-changed', handleSseRoleChanged)
  window.removeEventListener('beforeunload', handleBeforeUnload)
  window.removeEventListener('click', closeRoleDropdown)
  window.removeEventListener('resize', handlePresenceReposition)

  if (editorApi.value?.destroy) {
    if (editorApi.value.editor?.isReady) await editorApi.value.editor.isReady
    await editorApi.value.destroy()
  }
})
</script>

<template>
  <div class="workspace-layout">
    <div class="editor-shell">
      <div class="editor-header">
        <input :value="title" placeholder="제목 없음" class="title-input" @input="handleTitleInput" />

        <div class="user-presence-wrapper">
          <button ref="presenceBtnRef" class="presence-toggle-btn" @click.stop="togglePresence">
            <span class="user-count-badge">{{ activeUsers.length }}</span>
            참여자
          </button>
          <Teleport to="body">
          <div v-if="showUserList" class="user-list-popover" :style="popoverStyle" @click.stop>
            <div class="popover-title">현재 참여 중인 사용자</div>
            <div class="user-item-list">
              <div v-for="user in activeUsers" :key="user.clientId" class="user-item">
                <div class="user-avatar" :style="{ background: user.color }">
                  {{ user.name.charAt(0) }}
                </div>
                <div class="user-info">
                  <!-- 이름 + (나) + 역할 배지 -->
                  <div class="user-name-row">
                    <span class="user-name">{{ user.name }}</span>
                    <span v-if="user.isMe" class="me-tag">(나)</span>
                    <span
                      class="role-badge"
                      :class="`role-badge--${(user.role || 'READ').toLowerCase()}`"
                    >
                      {{ roleLabel(user.role) }}
                    </span>
                  </div>

                  <!-- ADMIN이고 본인이 아닐 때만 드롭다운 표시 -->
                  <div
                    v-if="workspaceAccessRole === 'ADMIN' && !user.isMe"
                    class="permission-dropdown-wrapper"
                    @click.stop
                  >
                    <button
                      class="permission-dropdown-trigger"
                      @click.stop="openRoleDropdownId = openRoleDropdownId === user.clientId ? null : user.clientId"
                    >
                      권한 변경 <span class="dropdown-arrow">▼</span>
                    </button>

                    <div v-if="openRoleDropdownId === user.clientId" class="permission-dropdown-menu">
                      <button class="dropdown-item" @click.stop="handleRoleAction(user, 'ADMIN')">
                        관리자로 변경
                      </button>
                      <button class="dropdown-item" @click.stop="handleRoleAction(user, 'WRITE')">
                        편집자로 변경
                      </button>
                      <button class="dropdown-item" @click.stop="handleRoleAction(user, 'READ')">
                        뷰어로 변경
                      </button>
                      <div class="dropdown-divider"></div>
                      <button class="dropdown-item dropdown-item--danger" @click.stop="handleRoleAction(user, 'KICKED')">
                        추방하기
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          </Teleport>
        </div>

        <div class="flex items-center gap-2">
          <span v-if="saveIndicator" class="save-indicator" :class="`save-indicator--${saveIndicator.tone}`">
            <span class="save-indicator__dot"></span>
            {{ saveIndicator.text }}
          </span>
          <button v-if="saveStatus === 'error'" type="button" class="save-retry-btn" @click="handleSave">다시 시도</button>
          <button :disabled="!isValid || isSaving" @click="handleSave" class="save-btn">{{ isSaving ? '저장 중...' : '저장' }}</button>
          <button
            v-if="workspaceId"
            @click="openVersionPanel"
            class="save-btn"
            style="background: var(--bg-input, #f3f4f6); color: var(--text-muted, #6b7280);"
            title="버전 이력"
          >
            <i class="fa-solid fa-clock-rotate-left"></i>
          </button>
        </div>
      </div>

      <!-- 버전 이력 패널 (body 로 Teleport → 조상 stacking/containing-block 영향 제거) -->
      <Teleport to="body">
      <div
        v-if="versionPanelOpen"
        class="fixed inset-0 z-[900] flex items-start justify-end"
        @click.self="closeVersionPanel"
      >
        <div
          ref="versionPanelRef"
          class="w-80 h-full bg-white shadow-2xl border-l border-gray-200 flex flex-col overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="version-panel-title"
          tabindex="-1"
          @click.stop
        >
          <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span id="version-panel-title" class="font-bold text-sm text-gray-700">버전 이력</span>
            <button @click="closeVersionPanel" class="text-gray-400 hover:text-gray-600">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <div v-if="versionsLoading" class="version-skeleton flex-1 px-4 py-4" aria-label="버전 이력을 불러오는 중입니다.">
            <div v-for="row in [1, 2, 3, 4, 5]" :key="row" class="version-skeleton__row">
              <span></span>
              <span></span>
            </div>
          </div>
          <div v-else-if="versionLoadError" class="version-error-panel flex-1 px-4 py-6 text-xs text-rose-600">
            <p class="font-semibold">버전 이력을 불러오지 못했습니다.</p>
            <p class="mt-1 break-words">{{ versionLoadError }}</p>
            <button type="button" class="version-error-panel__button" :disabled="versionsLoading" @click="retryVersionList">
              {{ versionsLoading ? "다시 시도 중..." : "다시 시도" }}
            </button>
          </div>
          <div v-else-if="!versions.length" class="flex-1 flex items-center justify-center text-xs text-gray-400">
            저장된 버전이 없습니다.
          </div>
          <ul v-else class="flex-1 overflow-y-auto divide-y divide-gray-100">
            <li
              v-for="v in versions"
              :key="v.id"
              class="px-4 py-3 hover:bg-gray-50 cursor-pointer"
              @click="previewVersion(v.versionNum)"
            >
              <div class="flex items-center justify-between">
                <span class="text-xs font-semibold text-gray-700">v{{ v.versionNum }}</span>
                <span class="text-[10px] text-gray-400">{{ formatVersionDate(v.createdAt) }}</span>
              </div>
              <p class="text-[11px] text-gray-500 truncate mt-0.5">{{ v.titleSnapshot }}</p>
            </li>
          </ul>

          <!-- 버전 미리보기 -->
          <div v-if="versionPreview" class="border-t border-gray-100 px-4 py-3 bg-gray-50 max-h-64 overflow-y-auto">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-bold text-gray-600">v{{ versionPreview.versionNum }} 미리보기</span>
              <button @click="versionPreview = null" class="text-[10px] text-gray-400 hover:text-gray-600">닫기</button>
            </div>
            <p class="text-[11px] font-semibold text-gray-700 mb-1">{{ versionPreview.titleSnapshot }}</p>
            <pre class="text-[10px] text-gray-500 whitespace-pre-wrap break-all">{{ versionPreview.contentSnapshot }}</pre>
          </div>
        </div>
      </div>
      </Teleport>

      <div class="workspace-assets">
        <div class="workspace-assets__header">
          <div>
            <p class="workspace-assets__summary workspace-assets__summary--plain">첨부 파일 {{ workspaceAssets.length }}개</p>
            <p class="workspace-assets__hint workspace-assets__hint--plain">
              업로드한 파일은 오른쪽 플로팅 목록에서 바로 저장하거나 확인할 수 있습니다.
            </p>
            <p class="workspace-assets__summary">
              이미지 {{ workspaceImages.length }}개 · 파일 {{ workspaceFiles.length }}개
            </p>
          </div>

          <div v-if="canManageAssets" class="workspace-assets__actions">
            <input ref="imageInput" type="file" accept="image/*" multiple hidden @change="handleAssetSelection" />
            <input ref="fileInput" type="file" multiple hidden @change="handleAssetSelection" />
            <button type="button" class="asset-action-btn" :disabled="workspaceAssetUploading" @click="triggerImageSelect">
              이미지 업로드
            </button>
            <button type="button" class="asset-action-btn asset-action-btn--secondary" :disabled="workspaceAssetUploading" @click="triggerFileSelect">
              파일 업로드
            </button>
          </div>
        </div>

        <p v-if="workspaceAssetError" class="workspace-assets__error">{{ workspaceAssetError }}</p>
        <p v-else-if="!workspaceId" class="workspace-assets__hint">처음 업로드할 때 워크스페이스가 먼저 저장됩니다.</p>

        <div v-if="workspaceAssetLoading" class="workspace-assets__loading">첨부 자산을 불러오는 중입니다...</div>

        <section v-if="workspaceImages.length > 0" class="workspace-assets__group">
          <div class="workspace-assets__group-header"><h4>이미지</h4></div>
          <div class="workspace-image-grid">
            <article v-for="asset in workspaceImages" :key="asset.id" class="workspace-image-card">
              <button
                v-if="canManageAssets"
                type="button"
                class="asset-remove-btn"
                :disabled="isDeletingAsset(asset.id)"
                @click.stop="handleAssetDelete(asset)"
              >×</button>
              <a :href="asset.previewUrl" target="_blank" rel="noopener noreferrer" class="workspace-image-card__preview">
                <img :src="asset.previewUrl" :alt="asset.originalName" class="workspace-image-card__image" />
              </a>
              <div class="workspace-image-card__meta">
                <strong>{{ asset.originalName }}</strong>
                <span>{{ asset.fileSizeLabel }}</span>
                <span v-if="asset.createdAtLabel">{{ asset.createdAtLabel }}</span>
              </div>
            </article>
          </div>
        </section>

        <section v-if="workspaceFiles.length > 0" class="workspace-assets__group">
          <div class="workspace-assets__group-header"><h4>파일</h4></div>
          <div class="workspace-file-list">
            <article v-for="asset in workspaceFiles" :key="asset.id" class="workspace-file-card-wrap">
              <button
                v-if="canManageAssets"
                type="button"
                class="asset-remove-btn asset-remove-btn--file"
                :disabled="isDeletingAsset(asset.id)"
                @click.stop="handleAssetDelete(asset)"
              >×</button>
              <button type="button" class="workspace-file-card" @click="downloadWorkspaceAsset(asset)">
                <div class="workspace-file-card__icon">
                  <i class="fa-solid fa-file-arrow-down"></i>
                </div>
                <div class="workspace-file-card__meta">
                  <strong>{{ asset.originalName }}</strong>
                  <span>{{ asset.fileSizeLabel }}</span>
                  <span v-if="asset.createdAtLabel">{{ asset.createdAtLabel }}</span>
                </div>
              </button>
            </article>
          </div>
        </section>

        <div v-if="!workspaceAssetLoading && workspaceImages.length === 0 && workspaceFiles.length === 0" class="workspace-assets__empty">
          업로드된 이미지나 파일이 없습니다.
        </div>
      </div>

      <div class="editor-body">
        <div v-if="loadError" class="load-error">
          <i class="fa-solid fa-triangle-exclamation load-error__icon" aria-hidden="true"></i>
          <h3 class="load-error__title">{{ loadErrorTitle }}</h3>
          <p class="load-error__desc">{{ loadErrorDesc }}</p>
          <div class="load-error__actions">
            <button v-if="canRetryLoad" type="button" class="load-error__btn load-error__btn--primary" @click="retryLoad">다시 시도</button>
            <button type="button" class="load-error__btn" @click="router.push({ name: 'home' })">홈으로</button>
          </div>
        </div>
        <template v-else>
          <div v-if="isEditorLoading" class="loading-overlay">로딩 중...</div>
          <div ref="editorHolder" id="editor-holder" class="editor-holder"></div>
        </template>
      </div>

      <div class="cursors-overlay" aria-hidden>
        <div v-for="(cursor, id) in remoteCursors" :key="id" class="remote-cursor" :style="cursor.style">
          <svg class="cursor-pointer" width="18" height="24" viewBox="0 0 18 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 2L16 11L9 13L13 20L10 22L6 15L2 19V2Z" :fill="cursor.color" stroke="white" stroke-width="2" stroke-linejoin="round" />
          </svg>
          <div class="cursor-label" :style="{ background: cursor.color }">{{ cursor.name }}</div>
        </div>
      </div>
    </div>

    <aside class="workspace-floating-sidebar">
      <div class="workspace-floating-panel">
        <div class="workspace-floating-panel__header">
          <div><h3>첨부 파일</h3></div>
          <span class="workspace-floating-panel__count">{{ workspaceAssets.length }}</span>
        </div>

        <div v-if="workspaceAssetLoading" class="workspace-floating-panel__empty">
          첨부 파일을 불러오는 중입니다...
        </div>
        <div v-else-if="!hasWorkspaceAssets" class="workspace-floating-panel__empty">
          아직 첨부된 파일이 없습니다.
        </div>
        <div v-else class="workspace-floating-list">
          <article
            v-for="asset in workspaceAssets"
            :key="asset.id"
            class="workspace-floating-item"
            :class="{ 'workspace-floating-item--active': activeWorkspaceAssetId === asset.id }"
          >
            <button
              type="button"
              class="workspace-floating-item__main"
              @click="toggleWorkspaceAssetActions(asset.id)"
            >
              <div
                class="workspace-floating-item__icon"
                :class="asset.assetType === 'IMAGE' ? 'workspace-floating-item__icon--image' : 'workspace-floating-item__icon--file'"
              >
                <i :class="asset.assetType === 'IMAGE' ? 'fa-regular fa-image' : 'fa-regular fa-file-lines'"></i>
              </div>
              <div class="workspace-floating-item__meta">
                <div class="workspace-floating-item__title-row">
                  <strong>{{ asset.originalName }}</strong>
                  <span class="workspace-floating-item__badge">{{ getWorkspaceAssetBadge(asset) }}</span>
                </div>
                <span>{{ asset.fileSizeLabel }}</span>
                <span v-if="asset.createdAtLabel">{{ asset.createdAtLabel }}</span>
              </div>
            </button>

            <button
              v-if="canManageAssets"
              type="button"
              class="workspace-floating-item__remove"
              :disabled="isDeletingAsset(asset.id)"
              @click.stop="handleAssetDelete(asset)"
            >×</button>

            <div v-if="activeWorkspaceAssetId === asset.id" class="workspace-floating-item__actions">
              <button
                type="button"
                class="workspace-floating-item__action workspace-floating-item__action--drive"
                :disabled="isSavingWorkspaceAsset(asset.id)"
                @click.stop="saveWorkspaceAssetToDrive(asset)"
              >
                {{ isSavingWorkspaceAsset(asset.id) ? '저장 중...' : '드라이브에 저장' }}
              </button>
              <button
                type="button"
                class="workspace-floating-item__action workspace-floating-item__action--download"
                @click.stop="downloadWorkspaceAsset(asset)"
              >
                로컬에 저장
              </button>
            </div>
          </article>
        </div>
      </div>
    </aside>
  </div>
</template>

<style scoped>
:root {
  --editor-bg: #ffffff;
  --editor-text: #1f2937;
  --editor-border: #e5e7eb;
  --editor-input-bg: #ffffff;
}

:global(html.dark) {
  --editor-bg: #1e1e1e;
  --editor-text: #e5e7eb;
  --editor-border: #333333;
  --editor-input-bg: #2d2d2d;
}

.workspace-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 24px;
  align-items: start;
  max-width: 1380px;
  margin: 24px auto;
  padding: 0 20px 28px;
}

.editor-shell {
  position: relative;
  overflow: visible;
  min-width: 0;
  background: var(--editor-bg);
  color: var(--editor-text);
  border-radius: 16px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
  transition: background 0.3s, color 0.3s;
}

.editor-header {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid var(--editor-border);
  position: relative;
  z-index: 200;          /* ✅ 추가 */
  overflow: visible;     /* ✅ 추가 */
}

.title-input {
  flex: 1;
  min-width: 0;
  font-size: 20px;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid var(--editor-border);
  background: var(--editor-input-bg);
  color: var(--editor-text);
}

.save-btn,
.asset-action-btn {
  padding: 9px 14px;
  background: #2563eb;
  color: white;
  border-radius: 10px;
  cursor: pointer;
  border: none;
  font-weight: 700;
  z-index: 10;
}

.save-btn:disabled,
.asset-action-btn:disabled,
.workspace-floating-item__action:disabled,
.workspace-floating-item__remove:disabled {
  background: #94a3b8;
  cursor: not-allowed;
}

.asset-action-btn--secondary { background: #0f172a; }

/* ─── 저장 상태 표시 ─────────────────────────────────────────────────────── */
.save-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  color: var(--text-muted, #64748b);
}
.save-indicator__dot { width: 7px; height: 7px; border-radius: 999px; background: currentColor; }
.save-indicator--saving { color: #2563eb; }
.save-indicator--error  { color: #dc2626; }
.save-indicator--dirty  { color: #d97706; }
.save-indicator--saved  { color: #16a34a; }

.save-retry-btn {
  padding: 9px 12px;
  border-radius: 10px;
  border: 1px solid #fca5a5;
  background: rgba(220, 38, 38, 0.08);
  color: #dc2626;
  font-weight: 800;
  font-size: 13px;
  cursor: pointer;
}
.save-retry-btn:hover { background: rgba(220, 38, 38, 0.16); }

/* ─── 문서 로드 실패 안전 화면 ───────────────────────────────────────────── */
.load-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 10px;
  min-height: 48vh;
  padding: 40px 20px;
}
.load-error__icon { font-size: 34px; color: #f59e0b; }
.load-error__title { font-size: 18px; font-weight: 800; color: var(--editor-text); }
.load-error__desc { max-width: 360px; font-size: 14px; line-height: 1.5; color: #64748b; }
.load-error__actions { display: flex; gap: 10px; margin-top: 8px; }
.load-error__btn {
  padding: 9px 16px;
  border-radius: 10px;
  border: 1px solid var(--editor-border);
  background: var(--editor-input-bg);
  color: var(--editor-text);
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
}
.load-error__btn--primary { background: #2563eb; color: #fff; border-color: #2563eb; }
.load-error__btn--primary:hover { background: #1d4ed8; }

.user-presence-wrapper { position: relative; }

.presence-toggle-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--editor-input-bg);
  border: 1px solid var(--editor-border);
  border-radius: 10px;
  cursor: pointer;
  color: var(--editor-text);
  font-size: 14px;
}

.user-count-badge {
  background: #16a34a;
  color: white;
  border-radius: 10px;
  padding: 1px 6px;
  font-size: 11px;
  font-weight: bold;
}

.user-list-popover {
  /* body 로 Teleport → top/left 는 인라인 style(popoverStyle)로 주입, position:absolute */
  width: 280px;
  background: var(--editor-bg);
  border: 1px solid var(--editor-border);
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
  z-index: 100000;       /* 모든 워크스페이스 콘텐츠 위 */
  padding: 16px;
}

.popover-title {
  font-size: 12px;
  color: #888;
  margin-bottom: 12px;
  font-weight: 600;
}

.user-item-list { display: grid; gap: 10px; }

.user-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: bold;
  font-size: 14px;
  flex-shrink: 0;
}

.user-info { flex: 1; min-width: 0; }

/* ✅ 이름 + 배지 한 줄 */
.user-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.user-name { font-size: 14px; font-weight: 500; }
.me-tag    { font-size: 11px; color: #888; }

/* ✅ 역할 배지 */
.role-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 999px;
  margin-left: auto;
  white-space: nowrap;
}
.role-badge--admin { background: rgba(37, 99, 235, 0.12); color: #2563eb; }
.role-badge--write { background: rgba(22, 163, 74, 0.12);  color: #16a34a; }
.role-badge--read  { background: rgba(100, 116, 139, 0.12); color: #64748b; }

/* ✅ 드롭다운 */
.permission-dropdown-wrapper {
  position: relative;
  margin-top: 4px;
}

.permission-dropdown-trigger {
  font-size: 11px;
  color: #2563eb;
  background: none;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0;
}

.dropdown-arrow { font-size: 9px; }

.permission-dropdown-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 150px;
  background: var(--editor-bg);
  border: 1px solid var(--editor-border);
  border-radius: 10px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
  z-index: 2000;
  overflow: hidden;
  padding: 4px 0;
}

.dropdown-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 14px;
  font-size: 12px;
  font-weight: 500;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--editor-text);
  transition: background 0.15s;
}
.dropdown-item:hover { background: rgba(0, 0, 0, 0.05); }

.dropdown-divider {
  height: 1px;
  background: var(--editor-border);
  margin: 4px 0;
}

.dropdown-item--danger       { color: #dc2626; }
.dropdown-item--danger:hover { background: rgba(220, 38, 38, 0.07); }

/* ─── 나머지 기존 스타일 유지 ────────────────────────────────────────────── */

.version-skeleton {
  display: grid;
  align-content: start;
  gap: 0.75rem;
}

.version-skeleton__row {
  display: grid;
  gap: 0.45rem;
  border-radius: 0.9rem;
  border: 1px solid color-mix(in srgb, var(--border-color) 72%, transparent);
  background: color-mix(in srgb, var(--bg-input) 58%, var(--bg-elevated) 42%);
  padding: 0.8rem;
}

.version-skeleton__row span {
  display: block;
  height: 0.72rem;
  border-radius: 999px;
  background: linear-gradient(90deg, color-mix(in srgb, var(--border-color) 70%, transparent), color-mix(in srgb, var(--bg-elevated) 88%, transparent), color-mix(in srgb, var(--border-color) 70%, transparent));
  background-size: 220% 100%;
  animation: version-skeleton-pulse 1.25s ease-in-out infinite;
}

.version-skeleton__row span:first-child {
  width: 46%;
}

.version-skeleton__row span:last-child {
  width: 78%;
}

.version-error-panel__button {
  margin-top: 0.8rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--danger) 32%, transparent);
  background: var(--bg-elevated);
  color: var(--danger);
  font-weight: 800;
  padding: 0.48rem 0.8rem;
}

.version-error-panel__button:hover:not(:disabled) {
  background: var(--danger-soft);
}

.version-error-panel__button:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

@keyframes version-skeleton-pulse {
  0% { background-position: 120% 0; }
  100% { background-position: -120% 0; }
}

.workspace-assets {
  padding: 20px;
  border-bottom: 1px solid var(--editor-border);
}

.workspace-assets__header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.workspace-assets__summary,
.workspace-assets__hint {
  margin-top: 4px;
  font-size: 13px;
  color: #64748b;
}

.workspace-assets__summary--plain,
.workspace-assets__hint--plain { display: block; }

.workspace-assets__summary:not(.workspace-assets__summary--plain) { display: none; }

.workspace-assets__hint:not(.workspace-assets__hint--plain) { font-size: 0; }
.workspace-assets__hint:not(.workspace-assets__hint--plain)::before {
  content: "처음 파일을 추가하면 워크스페이스가 먼저 저장됩니다.";
  font-size: 13px;
}

.workspace-assets__actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.workspace-assets__actions .asset-action-btn:first-of-type { display: none; }

.workspace-assets__actions .asset-action-btn--secondary { font-size: 0; }
.workspace-assets__actions .asset-action-btn--secondary::after {
  content: "파일 추가";
  font-size: 14px;
}

.workspace-assets__error {
  margin-top: 12px;
  color: #dc2626;
  font-size: 13px;
  font-weight: 600;
}

.workspace-assets__loading,
.workspace-assets__empty {
  margin-top: 16px;
  padding: 18px;
  border: 1px dashed var(--editor-border);
  border-radius: 14px;
  font-size: 13px;
  color: #64748b;
  text-align: center;
}

.workspace-assets__group,
.workspace-assets__empty { display: none; }

.workspace-assets__loading { font-size: 0; }
.workspace-assets__loading::before {
  content: "첨부 파일을 불러오는 중입니다...";
  font-size: 13px;
}

.workspace-assets__group-header {
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 700;
  color: #64748b;
}

.workspace-image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 14px;
}

.workspace-image-card,
.workspace-file-card-wrap { position: relative; }

.workspace-image-card {
  overflow: hidden;
  border-radius: 16px;
  border: 1px solid var(--editor-border);
  background: color-mix(in srgb, var(--editor-bg) 96%, #eff6ff 4%);
}

.workspace-image-card__preview {
  display: block;
  aspect-ratio: 16 / 11;
  overflow: hidden;
}

.workspace-image-card__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.workspace-image-card__meta,
.workspace-file-card__meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
}

.workspace-image-card__meta strong,
.workspace-file-card__meta strong {
  font-size: 13px;
  line-height: 1.4;
  word-break: break-all;
}

.workspace-image-card__meta span,
.workspace-file-card__meta span {
  font-size: 12px;
  color: #64748b;
}

.workspace-file-list { display: grid; gap: 12px; }

.workspace-file-card {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  text-align: left;
  border: 1px solid var(--editor-border);
  border-radius: 16px;
  background: color-mix(in srgb, var(--editor-bg) 97%, #f8fafc 3%);
  padding: 12px 14px;
  cursor: pointer;
}

.workspace-file-card__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(37, 99, 235, 0.12);
  color: #2563eb;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 18px;
}

.asset-remove-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  border: none;
  background: rgba(15, 23, 42, 0.72);
  color: white;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  z-index: 2;
}

.asset-remove-btn--file { top: 12px; right: 12px; }
.asset-remove-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.workspace-floating-sidebar { position: sticky; top: 24px; }

.workspace-floating-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: calc(100vh - 48px);
  padding: 18px;
  border-radius: 18px;
  border: 1px solid var(--editor-border);
  background: color-mix(in srgb, var(--editor-bg) 96%, #eff6ff 4%);
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.08);
}

.workspace-floating-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.workspace-floating-panel__header h3 { margin: 0; font-size: 16px; font-weight: 800; }
.workspace-floating-panel__header p  { margin: 6px 0 0; font-size: 12px; line-height: 1.5; color: #64748b; }

.workspace-floating-panel__count {
  display: inline-flex;
  min-width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.12);
  color: #2563eb;
  font-size: 13px;
  font-weight: 800;
}

.workspace-floating-panel__empty {
  padding: 18px 14px;
  border-radius: 14px;
  border: 1px dashed var(--editor-border);
  text-align: center;
  font-size: 13px;
  color: #64748b;
}

.workspace-floating-list {
  display: grid;
  gap: 12px;
  overflow-y: auto;
  min-height: 0;
  padding-right: 2px;
}

.workspace-floating-item {
  position: relative;
  border: 1px solid var(--editor-border);
  border-radius: 16px;
  background: var(--editor-input-bg);
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.workspace-floating-item--active {
  border-color: rgba(37, 99, 235, 0.38);
  box-shadow: 0 12px 24px rgba(37, 99, 235, 0.08);
}

.workspace-floating-item__main {
  display: flex;
  width: 100%;
  gap: 12px;
  padding: 14px 44px 14px 14px;
  text-align: left;
  background: transparent;
  border: none;
  cursor: pointer;
}

.workspace-floating-item__icon {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 18px;
}

.workspace-floating-item__icon--image { background: rgba(14, 165, 233, 0.12); color: #0ea5e9; }
.workspace-floating-item__icon--file  { background: rgba(37, 99, 235, 0.12);  color: #2563eb; }

.workspace-floating-item__meta {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 4px;
}

.workspace-floating-item__title-row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.workspace-floating-item__title-row strong {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  line-height: 1.45;
  word-break: break-all;
}

.workspace-floating-item__meta span { font-size: 12px; color: #64748b; }

.workspace-floating-item__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 999px;
  padding: 4px 8px;
  background: rgba(15, 23, 42, 0.08);
  color: #334155;
  font-size: 11px;
  font-weight: 700;
}

.workspace-floating-item__remove {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  border: none;
  background: rgba(15, 23, 42, 0.72);
  color: white;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.workspace-floating-item__actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  padding: 0 14px 14px;
}

.workspace-floating-item__action {
  border: none;
  border-radius: 12px;
  padding: 11px 12px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.workspace-floating-item__action--drive    { background: rgba(6, 182, 212, 0.14); color: #0f766e; }
.workspace-floating-item__action--download { background: rgba(37, 99, 235, 0.12);  color: #1d4ed8; }

.editor-body {
  position: relative;
  min-height: 60vh;
  padding: 20px;
}

.loading-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.editor-holder {
  min-height: 48vh;
  border-radius: 12px;
  border: 1px solid var(--editor-border);
  padding: 18px;
  font-size: 16px;
  background: var(--editor-bg);
}

.cursors-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 100;
}

.remote-cursor {
  position: absolute;
  display: flex;
  align-items: flex-start;
  transition: none !important;
  will-change: transform;
}

.cursor-pointer {
  position: absolute;
  top: -2px;
  left: -2px;
  filter: drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.3));
}

.cursor-label {
  color: white;
  font-size: 12px;
  font-weight: 500;
  padding: 3px 8px;
  border-radius: 12px;
  white-space: nowrap;
  margin-top: 18px;
  margin-left: 10px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
}

:deep(.ce-block h1) { font-size: 40px !important; font-weight: 700; }

@media (max-width: 1100px) {
  .workspace-layout { grid-template-columns: minmax(0, 1fr); }
  .workspace-floating-sidebar { position: static; }
  .workspace-floating-panel   { max-height: none; }
}

@media (max-width: 900px) {
  .editor-header,
  .workspace-assets__header { flex-direction: column; align-items: stretch; }
  .workspace-assets__actions { justify-content: flex-start; }
}

@media (max-width: 640px) {
  .workspace-layout { padding: 0 12px 20px; }
  .workspace-floating-item__actions { grid-template-columns: 1fr; }
}
</style>
