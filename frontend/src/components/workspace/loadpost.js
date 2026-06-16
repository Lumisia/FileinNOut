import postApi from "@/api/postApi";
import { ref } from 'vue';

// ─────────────────────────────────────────────────────────────────────────────
// 상태
// ─────────────────────────────────────────────────────────────────────────────

const personalItems = ref([]);
const sharedItems   = ref([]);
const isPersonalOpen = ref(true);
const isSharedOpen   = ref(true);
const currentPost    = ref({ title: '', contents: null });

// ─────────────────────────────────────────────────────────────────────────────
// 사이드바 목록
// apiCall → extractBody 를 거쳐 result.body 가 이미 unwrap 된 상태로 넘어옴
// allPosts() 반환값 = PostDto.ResList[]  (배열 그 자체)
// ─────────────────────────────────────────────────────────────────────────────

// 동시에 여러 side_list 호출이 일어날 때(예: 공개 링크 입장 시 Sidebar.onMounted 와
// WorkSpace 의 입장 후 갱신이 경쟁) 응답 도착 순서에 따라 오래된 결과가 최신 목록을
// 덮어쓰는 race 를 방지. 항상 "가장 마지막에 시작된 호출"의 결과만 반영한다.
let sideListSeq = 0;

const side_list = async () => {
    const seq = ++sideListSeq;
    try {
        // response = PostDto.ResList[]
        const response = await postApi.allPosts();

        // 이 호출 이후 더 최신 side_list 가 시작됐다면 결과를 버린다(stale 덮어쓰기 방지)
        if (seq !== sideListSeq) return response;

        console.log('목록 가져오기 성공:', response);

        const nextPersonal = [];
        const nextShared   = [];

        if (Array.isArray(response)) {
            response.forEach(item => {
                if (item.status && item.status.toUpperCase() !== 'PRIVATE') {
                    nextShared.push(item);
                } else {
                    nextPersonal.push(item);
                }
            });
        }

        personalItems.value = nextPersonal;
        sharedItems.value   = nextShared;

        return response;

    } catch (e) {
        // workspaceApi 에서 이미 [side_list] 실패 — [code] message 형태로 출력됨
        if (seq === sideListSeq) {
            personalItems.value = [];
            sharedItems.value   = [];
        }
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 워크스페이스 단건 조회
// getPost() 반환값 = PostDto.ResPost  (객체 그 자체)
// ─────────────────────────────────────────────────────────────────────────────

const read_post = async (idx) => {
    try {
        // data = PostDto.ResPost
        const data = await postApi.getPost(idx);
        console.log('워크스페이스 가져오기 성공:', data);

        let parsedContents;
        try {
            if (typeof data.contents === 'string' && data.contents.trim().startsWith('{')) {
                parsedContents = JSON.parse(data.contents);
            } else {
                parsedContents = data.contents;
            }
        } catch {
            console.warn('JSON 파싱 실패, 원본 데이터를 사용합니다.');
            parsedContents = data.contents;
        }

        currentPost.value = {
            idx:        data.idx,
            title:      data.title,
            contents:   parsedContents,
            type:       data.type,
            status:     data.status     ?? 'Private',
            uuid:       data.uuid       ?? data.UUID ?? '',
            accessRole: data.accessRole ?? data.level ?? 'ADMIN',
            level:      data.level      ?? data.accessRole ?? 'ADMIN',
        };

        return currentPost.value;

    } catch (e) {
        // workspaceApi 에서 이미 [getPost] 실패 — [code] message 형태로 출력됨
    }
};

// ─────────────────────────────────────────────────────────────────────────────

export default {
    personalItems,
    sharedItems,
    isPersonalOpen,
    isSharedOpen,
    currentPost,
    side_list,
    read_post,
}