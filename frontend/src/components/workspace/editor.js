import EditorJS from '@editorjs/editorjs'
import Header from '@editorjs/header'
import List from '@editorjs/list'
import Quote from '@editorjs/quote'
import Table from '@editorjs/table'
import CodeTool from '@editorjs/code'
import Embed from '@editorjs/embed'
import ImageTool from '@editorjs/image'
import LinkTool from '@editorjs/link'
import InlineCode from '@editorjs/inline-code'
import Delimiter from '@editorjs/delimiter'
import Marker from '@editorjs/marker'
import Warning from '@editorjs/warning'

import AlignmentTuneTool from 'editorjs-text-alignment-blocktune'
import YouTubeEmbed from 'editorjs-youtube-embed'

import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

import { ref } from 'vue'
import postApi from '@/api/postApi'
import { getYjsStatusUrl, getYjsWebsocketUrl } from '@/utils/yjsUrl'
import loadpost from './loadpost'
import { createBlockBinding } from './collab/editorBinding.js'

export async function initEditor(holderElement, room, initialData, idx, initialTitle, isPrivate, options = {}) {
  if (!holderElement) throw new Error('holderElement is required')

  const ydoc = new Y.Doc()
  let provider = null
  let currentIdx = idx ?? null
  let realtimeStatusTimer = null

  if (!isPrivate) {
    provider = new WebsocketProvider(getYjsWebsocketUrl(), room, ydoc)
  }

  const yjsStatusUrl = !isPrivate ? getYjsStatusUrl() : null

  const stopRealtimeStatusLogging = () => {
    if (realtimeStatusTimer) {
      clearInterval(realtimeStatusTimer)
      realtimeStatusTimer = null
    }
  }

  const logRealtimeStatus = async () => {
    if (!yjsStatusUrl) {
      return
    }

    try {
      const response = await fetch(yjsStatusUrl, {
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`status request failed: ${response.status}`)
      }

      const status = await response.json()
      console.info(`[RealtimeStatus]
웹소켓 이름 = ${status.websocketName ?? 'unknown'}
Redis 이름 = ${status.redisName ?? 'unknown'}
Redis 주소 = ${status.redisEndpoint ?? 'unknown'}
Redis 연결 상태 = ${status.redisAvailable === true ? '연결됨' : '연결 안 됨'}`)
    } catch (error) {
      console.warn('[RealtimeStatus] status fetch failed', error)
    }
  }

  const startRealtimeStatusLogging = () => {
    if (!yjsStatusUrl || realtimeStatusTimer) {
      return
    }

    void logRealtimeStatus()
    realtimeStatusTimer = window.setInterval(() => {
      void logRealtimeStatus()
    }, 5000)
  }

  const yTitle       = ydoc.getText('title')
  const yPermissions = ydoc.getMap('permissions')
  const LOCAL_EDIT_ORIGIN = Symbol('local-edit-origin')
  let hasSeededInitialTitle = false

  // ─── 초기 데이터 파싱 ─────────────────────────────────────────────────────
  let initialParsedData = { blocks: [] }
  try {
    if (typeof initialData === 'string' && initialData.trim() !== '' && initialData !== '""') {
      initialParsedData = JSON.parse(initialData)
    } else if (initialData && typeof initialData === 'object' && initialData.blocks) {
      initialParsedData = initialData
    }
  } catch (e) {
    console.warn('Initial data parsing failed', e)
  }
  const initialBlocks = Array.isArray(initialParsedData.blocks) ? initialParsedData.blocks : []

  const runLocalTransaction = (callback) => {
    ydoc.transact(callback, LOCAL_EDIT_ORIGIN)
  }

  const seedInitialTitleIfNeeded = () => {
    if (hasSeededInitialTitle) {
      return
    }

    hasSeededInitialTitle = true
    const fallbackTitle = String(initialTitle ?? '')
    if (!fallbackTitle || yTitle.toString() !== '') {
      return
    }

    runLocalTransaction(() => {
      yTitle.insert(0, fallbackTitle)
    })
  }

  // ─── 협업 블록 바인딩 (Phase 1: 블록 단위 Y.Array<Y.Map>) ─────────────────
  // 단일 키 blob → 블록 단위 모델. 서로 다른 블록 동시 편집은 유실 없이 병합된다.
  // (같은 블록 동시 편집은 블록 단위 LWW — Phase 2 에서 블록당 Y.Text 로 개선 예정)
  let blockBinding = null
  let localPushTimer = null

  const scheduleLocalPush = () => {
    if (!blockBinding || blockBinding.isApplyingRemote()) {
      return
    }
    clearTimeout(localPushTimer)
    localPushTimer = setTimeout(() => {
      void blockBinding.pushLocal()
    }, 150)
  }

  const awareness        = provider ? provider.awareness : null
  const remoteCursorsRef = ref({})
  const activeUsersRef   = ref([])

  const colors = ['#FF6B6B', '#6BCB77', '#4D96FF', '#FF7BD1', '#FFD93D', '#8E6BFF']
  const myId    = Math.floor(Math.random() * colors.length)
  const myColor = colors[myId]

  let myName    = `사용자 ${myId + 1}`
  let myUserIdx = null
  const userRole = options?.userRole ?? 'READ'  // ✅ 옵션에서 역할 수신

  const token = localStorage.getItem('ACCESS_TOKEN')
  if (token) {
    try {
      const base64Url   = token.split('.')[1]
      const base64      = base64Url.replace(/-/g, '+').replace(/_/g, '/')
      const jsonPayload = decodeURIComponent(
        atob(base64).split('').map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
      )
      const payload = JSON.parse(jsonPayload)
      myName    = payload.name || payload.username || payload.nickname || myName
      myUserIdx = payload.idx ?? null  // ✅ 백엔드 유저 ID 추출
    } catch (e) {
      console.warn('토큰에서 사용자 정보를 읽어오는데 실패했습니다.', e)
    }
  }

  // ─── awareness 업데이트 핸들러 ────────────────────────────────────────────
  function runAwarenessUpdate() {
    if (!awareness) return
    const states   = awareness.getStates()
    const remotes  = {}
    const userList = []

    states.forEach((state, clientId) => {
      if (!state || !state.user) return

      userList.push({
        clientId: String(clientId),
        name:     state.user.name,
        color:    state.user.color,
        isMe:     clientId === ydoc.clientID,
        role:     state.user.role    ?? 'READ',  // ✅ 역할
        userIdx:  state.user.userIdx ?? null,     // ✅ 백엔드 유저 ID
      })

      if (clientId === ydoc.clientID) return

      const mouse = state.mouse || {}
      if (mouse.x != null) {
        remotes[clientId] = {
          name:  state.user.name,
          color: state.user.color,
          style: {
            position:   'absolute',
            left:       `${mouse.x}%`,
            top:        `${mouse.y}%`,
            willChange: 'left, top',
            transition: 'none',
          },
        }
      }
    })

    remoteCursorsRef.value = remotes
    activeUsersRef.value   = userList
  }

  if (awareness) {
    awareness.on('update', runAwarenessUpdate)
    awareness.setLocalState({
      user: {
        name:     myName,
        color:    myColor,
        clientId: ydoc.clientID,
        role:     userRole,   // ✅ 역할 공유
        userIdx:  myUserIdx,  // ✅ 백엔드 유저 ID 공유
      },
    })
  }

  yPermissions.observe(() => {
    if (yPermissions.get(String(ydoc.clientID)) === 'redirect') {
      window.location.href = '/workspace'
    }
  })

  // ─── 이미지 업로드 설정 ────────────────────────────────────────────────────
  const trackedImageAssets = new Map()
  const imageToolConfig = {
    class: ImageTool,
    config: {
      uploader: {
        async uploadByFile(files) {
          try {
            if (!currentIdx) {
              await savePost()
              if (!currentIdx) throw new Error('게시물 생성에 실패하여 이미지를 업로드할 수 없습니다.')
            }
            const result = await postApi.uploadEditorJsImage(currentIdx, files)
            if (result?.file?.assetIdx) {
              trackedImageAssets.set(result.file.assetIdx, true)
            }
            return result
          } catch (e) {
            console.error('[Editor] 이미지 업로드 실패:', e)
            return { success: 0, message: e.message || '업로드 중 오류가 발생했습니다.' }
          }
        },
      },
    },
  }

  const tools = {
    header:     { class: Header, tunes: ['alignment'], config: { levels: [1, 2, 3, 4], defaultLevel: 1 } },
    list:       { class: List, inlineToolbar: true, tunes: ['alignment'] },
    quote:      { class: Quote, inlineToolbar: true, tunes: ['alignment'] },
    table:      { class: Table, inlineToolbar: true },
    code:       { class: CodeTool },
    embed:      { class: Embed, inlineToolbar: false },
    image:      imageToolConfig,
    linkTool:   { class: LinkTool },
    inlineCode: { class: InlineCode },
    delimiter:  Delimiter,
    marker:     Marker,
    warning:    Warning,
    alignment:  { class: AlignmentTuneTool, config: { default: 'left' } },
    youtube:    { class: YouTubeEmbed },
  }

  let editor                = null
  let previousImageAssets   = new Map()
  let titleObserver         = null

  const isDirtyRef = ref(false)

  const markDirty = () => {
    isDirtyRef.value = true
  }

  const markSaved = () => {
    isDirtyRef.value = false
  }

  const refreshImageAssetSnapshot = (blocks = []) => {
    previousImageAssets = new Map(
      (blocks || [])
        .filter(b => b.type === 'image' && b.data?.file?.assetIdx)
        .map(b => [b.data.file.assetIdx, true])
    )
  }

  // ─── EditorJS 인스턴스 ────────────────────────────────────────────────────
  editor = new EditorJS({
    holder:      holderElement,
    placeholder: '명령어 "/" 로 블록 추가',
    data:        initialParsedData,
    tools,
    onReady: async () => {
      const initialSaved = await editor.save()
      refreshImageAssetSnapshot(initialSaved.blocks)
    },
    onChange: async () => {
      // 원격 변경을 에디터에 반영하는 중이면 로컬 푸시/이미지 추적 모두 건너뜀 (피드백 루프 방지)
      if (blockBinding && blockBinding.isApplyingRemote()) return
      markDirty()
      try {
        const saved = await editor.save()

        const currentImageAssets = new Map()
        saved.blocks
          .filter(b => b.type === 'image' && b.data?.file?.assetIdx)
          .forEach(b => currentImageAssets.set(b.data.file.assetIdx, true))

        for (const assetIdx of previousImageAssets.keys()) {
          if (!currentImageAssets.has(assetIdx) && currentIdx) {
            postApi.deleteEditorJsImage(currentIdx, assetIdx).catch(e =>
              console.warn('[Editor] 이미지 삭제 실패:', assetIdx, e)
            )
          }
        }

        previousImageAssets = currentImageAssets

        scheduleLocalPush()
      } catch (err) {
        console.error('editor save failed', err)
      }
    },
  })

  await editor.isReady

  // 에디터 준비 후 협업 바인딩 생성 + 초기 시드
  blockBinding = createBlockBinding({
    editor,
    ydoc,
    getSavedBlocks: async () => (await editor.save()).blocks,
  })

  const seedCollab = () => {
    seedInitialTitleIfNeeded()
    void blockBinding.seed(initialBlocks)
  }

  if (!provider) {
    seedCollab()
  } else {
    provider.on('status', ({ status }) => {
      if (status === 'connected') {
        startRealtimeStatusLogging()
        return
      }
      if (status === 'disconnected') {
        stopRealtimeStatusLogging()
      }
    })

    if (provider.synced) {
      seedCollab()
    } else {
      provider.once('sync', (isSynced) => {
        if (isSynced) seedCollab()
      })
    }
  }

  // ─── 타이틀 바인딩 ────────────────────────────────────────────────────────
  function bindTitleRef(titleRef) {
    if (!titleRef) return
    const current = yTitle.toString()
    if (current && titleRef.value !== current) {
      titleRef.value = current
    }

    const observer = (event) => {
      if (event?.transaction?.origin === LOCAL_EDIT_ORIGIN) return
      const t = yTitle.toString()
      if (titleRef.value !== t) titleRef.value = t
    }

    if (titleObserver) {
      yTitle.unobserve(titleObserver)
    }
    titleObserver = observer
    yTitle.observe(titleObserver)
  }

  function updateTitleFromLocal(val) {
    const nextTitle = String(val ?? '')
    const current = yTitle.toString()
    if (current !== nextTitle) {
      runLocalTransaction(() => {
        yTitle.delete(0, yTitle.length)
        if (nextTitle) {
          yTitle.insert(0, nextTitle)
        }
      })
    }
  }

  const generateUUID = () =>
    (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2)

  // ─── 저장 ─────────────────────────────────────────────────────────────────
  async function savePost() {
    if (!editor) return
    const idempotencyKey = generateUUID()
    try {
      await editor.isReady
      const savedData     = await editor.save()
      const resolvedTitle = yTitle.toString().trim() || (initialTitle ?? '').trim() || '제목 없음'
      const postData      = { idx: currentIdx, title: resolvedTitle, contents: JSON.stringify(savedData), idempotencyKey }
      const response      = await postApi.savePost(postData)
      const savedIdx      = response?.idx ?? null
      if (savedIdx != null) currentIdx = savedIdx
      await loadpost.side_list()
      markSaved()
      return response
    } catch (e) {
      console.error('savePost error:', e)
    }
  }

  // ─── 마우스 커서 트래킹 ────────────────────────────────────────────────────
  let animationFrameId = null

  function handleMouseMove(e) {
    if (animationFrameId || !awareness) return
    animationFrameId = requestAnimationFrame(() => {
      const shell = holderElement.closest('.editor-shell')
      if (!shell) { animationFrameId = null; return }
      const rect        = shell.getBoundingClientRect()
      const xPercentage = ((e.clientX - rect.left) / rect.width)  * 100
      const yPercentage = ((e.clientY - rect.top)  / rect.height) * 100
      awareness.setLocalStateField('mouse', { x: xPercentage, y: yPercentage })
      animationFrameId = null
    })
  }

  if (!isPrivate) {
    window.addEventListener('mousemove', handleMouseMove)
  }

  function updateUserPermission(clientId, status) {
    yPermissions.set(String(clientId), status)
  }

  // ─── 정리 ─────────────────────────────────────────────────────────────────
  function destroy() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId)
    window.removeEventListener('mousemove', handleMouseMove)
    clearTimeout(localPushTimer)
    stopRealtimeStatusLogging()
    if (blockBinding) {
      blockBinding.dispose()
      blockBinding = null
    }
    if (titleObserver) {
      yTitle.unobserve(titleObserver)
      titleObserver = null
    }
    try { if (provider) { provider.disconnect(); provider.destroy() } } catch (e) {}
    try { if (editor && typeof editor.destroy === 'function') editor.destroy() } catch (e) {}
    try { if (ydoc) ydoc.destroy() } catch (e) {}
  }
  window.__activeEditorDestroy = destroy

  return {
    editor,
    destroy,
    remoteCursorsRef,
    activeUsersRef,
    isDirtyRef,
    updateUserPermission,
    bindTitleRef,
    updateTitleFromLocal,
    savePost,
    markDirty,
    markSaved,
  }
}
