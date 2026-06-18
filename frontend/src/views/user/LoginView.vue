<script setup>
import { reactive, ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/api/user'
import { useAuthStore } from '@/stores/useAuthStore'
import { apiPath } from '@/utils/backendUrl'
import { useToastStore } from '@/stores/useToastStore'

const router = useRouter()
const authStore = useAuthStore()
const toast = useToastStore()

const isLoading = ref(false)
const loginErrorMessage = ref('')

const loginForm = reactive({
  email: '',
  password: '',
})

const demoPassword = 'Demo1234!'
const selectedDemoEmail = ref('')
const demoAccounts = [
  {
    name: 'Demo 관리자',
    email: 'demo.admin@fileinnout.com',
    globalRole: 'ROLE_USER',
    workspaceRole: 'ADMIN',
  },
  {
    name: 'Demo 편집자',
    email: 'demo.editor@fileinnout.com',
    globalRole: 'ROLE_USER',
    workspaceRole: 'WRITE',
  },
  {
    name: 'Demo 뷰어',
    email: 'demo.viewer@fileinnout.com',
    globalRole: 'ROLE_USER',
    workspaceRole: 'READ',
  },
]

const loginInputError = reactive({
  email: { errorMessage: null, isValid: false, touched: false },
  password: { errorMessage: null, isValid: false, touched: false },
})

// 1. 순수 유효성 검사 로직 (재사용성 및 실시간 체크)
const checkEmailValidity = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return email !== '' && emailRegex.test(email)
}

const checkPasswordValidity = (password) => {
  return password.length > 0
}

// 2. 버튼 활성화를 위한 Computed (입력값 실시간 반영)
const isFormValid = computed(() => {
  return checkEmailValidity(loginForm.email) && checkPasswordValidity(loginForm.password)
})

// 3. 입력 중 실시간 상태 업데이트 (watch 활용)
watch(
  () => loginForm.email,
  (newVal) => {
    loginInputError.email.isValid = checkEmailValidity(newVal)
    if (loginInputError.email.touched) validateEmail()
  },
)

watch(
  () => loginForm.password,
  (newVal) => {
    loginInputError.password.isValid = checkPasswordValidity(newVal)
    if (loginInputError.password.touched) validatePassword()
  },
)

// 4. Blur 시점에 실행될 상세 유효성 검사
const validateEmail = () => {
  loginInputError.email.touched = true
  if (loginForm.email === '') {
    loginInputError.email.errorMessage = '이메일을 입력해 주세요.'
  } else if (!checkEmailValidity(loginForm.email)) {
    loginInputError.email.errorMessage = '올바른 이메일 형식이 아닙니다.'
  } else {
    loginInputError.email.errorMessage = null
  }
}

const validatePassword = () => {
  loginInputError.password.touched = true
  if (!checkPasswordValidity(loginForm.password)) {
    loginInputError.password.errorMessage = '비밀번호를 입력해 주세요.'
  } else {
    loginInputError.password.errorMessage = null
  }
}

const handleLogin = async () => {
  if (!isFormValid.value) return
  isLoading.value = true

  try {
    const res = await api.login(loginForm)
    console.log('응답 헤더 전체:', res.headers)
    // axios는 헤더 키를 소문자로 정규화함. authorization이 있는지 확인.
    const authHeader = res.headers['authorization'] || res.headers['Authorization']
    const accessToken = authHeader?.replace('Bearer ', '') || res.data?.accessToken
    console.log('추출된 토큰:', accessToken) // 👈 여기서 null이나 undefined가 나오면 '범인'입니다.
    if (accessToken) {
      // Pinia 스토어에 토큰 저장 (이때 localStorage에도 저장됨)
      authStore.login(accessToken)

      // 즉시 이동
      router.push({ name: 'main' })
    } else {
      toast.error('회원 정보가 일치하지 않습니다.')
    }
  } catch (error) {
    loginErrorMessage.value = '로그인 정보가 일치하지 않습니다.'
  } finally {
    isLoading.value = false
  }
}

// UI Helper: Input 클래스 맵핑
const getInputClass = (field) => {
  const state = loginInputError[field]
  if (!state.touched) return 'border-gray-200 focus:border-indigo-500 focus:ring-indigo-500/20'
  return state.isValid
    ? 'border-gray-200 focus:border-indigo-500 focus:ring-indigo-500/20'
    : 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/20'
}

const loginWithNaver = () => {
  window.location.href = apiPath('/oauth2/authorization/naver')
}

const selectDemoAccount = (account) => {
  loginForm.email = account.email
  loginForm.password = demoPassword
  selectedDemoEmail.value = account.email
  loginErrorMessage.value = ''
  loginInputError.email.errorMessage = null
  loginInputError.password.errorMessage = null
}
</script>

<template>
  <div class="min-h-screen bg-gray-100 px-4 py-8 sm:px-6 lg:flex lg:items-center lg:justify-center">
    <main
      class="mx-auto grid w-full max-w-[1080px] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-[0_16px_50px_rgba(15,23,42,0.08)] lg:grid-cols-[460px_minmax(0,1fr)]"
    >
      <section class="p-6 sm:p-9 lg:p-10">
        <div class="mb-8 text-center">
          <router-link to="/" class="group inline-flex flex-col items-center">
            <div
              class="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-600 shadow-md shadow-indigo-100 transition group-hover:bg-indigo-700"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-7 w-7 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2.5"
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                />
              </svg>
            </div>
            <h1
              class="text-2xl font-extrabold text-gray-900 transition group-hover:text-indigo-700"
            >
              FileInNOut
            </h1>
          </router-link>
          <p class="mt-1 text-sm font-medium text-gray-500">FileInNOut에 로그인하세요</p>
        </div>

        <form class="space-y-4" novalidate @submit.prevent="handleLogin">
          <div class="space-y-1.5">
            <label class="flex items-center text-sm font-bold text-gray-700" for="login-email">
              <span>이메일</span>
              <span
                v-if="loginInputError.email.errorMessage"
                class="ml-auto text-[11px] font-bold text-rose-500 animate-slide-down"
              >
                {{ loginInputError.email.errorMessage }}
              </span>
            </label>
            <input
              id="login-email"
              v-model="loginForm.email"
              type="email"
              autocomplete="username"
              placeholder="workspace@example.com"
              :class="[
                'w-full rounded-lg border-2 bg-gray-50 px-4 py-3 text-sm outline-none transition-all focus:ring-4',
                getInputClass('email'),
              ]"
              @blur="validateEmail"
            />
          </div>

          <div class="space-y-1.5">
            <label class="flex items-center text-sm font-bold text-gray-700" for="login-password">
              <span>비밀번호</span>
              <span
                v-if="loginInputError.password.errorMessage"
                class="ml-auto text-[11px] font-bold text-rose-500 animate-slide-down"
              >
                {{ loginInputError.password.errorMessage }}
              </span>
            </label>
            <input
              id="login-password"
              v-model="loginForm.password"
              type="password"
              autocomplete="current-password"
              placeholder="••••••••"
              :class="[
                'w-full rounded-lg border-2 bg-gray-50 px-4 py-3 text-sm outline-none transition-all focus:ring-4',
                getInputClass('password'),
              ]"
              @blur="validatePassword"
            />
          </div>

          <div
            v-if="loginErrorMessage"
            class="flex items-center gap-3 rounded-lg border border-rose-100 bg-rose-50 p-3 animate-fade-in"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5 flex-shrink-0 text-rose-500"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fill-rule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clip-rule="evenodd"
              />
            </svg>
            <p class="text-xs font-bold leading-tight text-rose-600">{{ loginErrorMessage }}</p>
          </div>

          <button
            type="submit"
            :disabled="!isFormValid || isLoading"
            class="mt-2 flex min-h-12 w-full items-center justify-center rounded-lg bg-indigo-600 py-3 font-bold text-white shadow-md shadow-indigo-100 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:shadow-none"
          >
            <span v-if="!isLoading">로그인</span>
            <svg
              v-else
              class="h-5 w-5 animate-spin text-white"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              />
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </button>
        </form>

        <div class="my-5 flex items-center gap-3" aria-hidden="true">
          <span class="h-px flex-1 bg-gray-200" />
          <span class="text-xs font-semibold text-gray-400">또는</span>
          <span class="h-px flex-1 bg-gray-200" />
        </div>

        <div class="space-y-2">
          <button
            data-testid="oauth-google"
            type="button"
            disabled
            class="flex min-h-11 w-full cursor-not-allowed items-center justify-center gap-3 rounded-lg border border-gray-200 bg-gray-100 py-2.5 text-sm font-bold text-gray-400 opacity-75"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" class="grayscale">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Google 계정으로 계속하기
          </button>

          <button
            data-testid="oauth-naver"
            type="button"
            class="flex min-h-11 w-full items-center justify-center gap-3 rounded-lg border border-[#03C75A] bg-[#03C75A] py-2.5 text-sm font-bold text-white transition hover:bg-[#02b350] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200"
            @click="loginWithNaver"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="white">
              <path d="M16.273 12.845 7.376 0H0v24h7.726V11.156L16.624 24H24V0h-7.727v12.845Z" />
            </svg>
            네이버 계정으로 계속하기
          </button>

          <button
            data-testid="oauth-kakao"
            type="button"
            disabled
            class="flex min-h-11 w-full cursor-not-allowed items-center justify-center gap-3 rounded-lg border border-gray-200 bg-gray-100 py-2.5 text-sm font-bold text-gray-400 opacity-75"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" class="opacity-50">
              <path
                fill="currentColor"
                d="M12 3c5.799 0 10.5 3.664 10.5 8.185 0 4.52-4.701 8.184-10.5 8.184a13.5 13.5 0 0 1-1.727-.11l-4.408 2.883c-.501.265-.678.236-.472-.413l.892-3.678c-2.88-1.46-4.785-3.99-4.785-6.866C1.5 6.665 6.201 3 12 3Z"
              />
            </svg>
            카카오 계정으로 계속하기
          </button>
        </div>

        <div class="mt-7 text-center text-sm font-medium text-gray-500">
          <p>
            아직 회원이 아니신가요?
            <RouterLink
              :to="{ name: 'signup' }"
              class="ml-1 font-bold text-indigo-600 transition-colors hover:text-indigo-700"
              >회원가입</RouterLink
            >
          </p>
          <p class="mt-1">
            <RouterLink
              :to="{ name: 'FindMember' }"
              class="font-bold text-indigo-600 transition-colors hover:text-indigo-700"
              >아이디 / 비밀번호 찾기</RouterLink
            >
          </p>
        </div>
      </section>

      <aside
        class="border-t border-gray-200 bg-gray-50 p-6 sm:p-9 lg:border-l lg:border-t-0 lg:p-10"
      >
        <div class="mb-6">
          <p class="text-xs font-bold uppercase text-indigo-600">Public portfolio</p>
          <h2 class="mt-1 text-xl font-extrabold text-gray-900">Demo 계정</h2>
          <p class="mt-2 text-sm text-gray-500">
            공통 비밀번호
            <code class="rounded bg-gray-200 px-1.5 py-0.5 font-bold text-gray-700">{{
              demoPassword
            }}</code>
          </p>
        </div>

        <div class="space-y-3">
          <button
            v-for="account in demoAccounts"
            :key="account.email"
            data-testid="demo-account"
            type="button"
            :aria-pressed="selectedDemoEmail === account.email"
            class="grid w-full grid-cols-1 gap-3 rounded-lg border bg-white p-4 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200 sm:grid-cols-2"
            :class="
              selectedDemoEmail === account.email
                ? 'border-indigo-500 shadow-sm'
                : 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/30'
            "
            @click="selectDemoAccount(account)"
          >
            <span class="min-w-0">
              <span class="block text-[11px] font-bold text-gray-400">표시 이름</span>
              <span class="mt-0.5 block text-sm font-extrabold text-gray-900">{{
                account.name
              }}</span>
            </span>
            <span class="min-w-0">
              <span class="block text-[11px] font-bold text-gray-400">이메일</span>
              <span class="mt-0.5 block break-all text-xs font-semibold text-gray-700">{{
                account.email
              }}</span>
            </span>
            <span>
              <span class="block text-[11px] font-bold text-gray-400">전역 권한</span>
              <span
                class="mt-1 inline-flex rounded bg-gray-200 px-2 py-1 text-[11px] font-extrabold text-gray-700"
                >{{ account.globalRole }}</span
              >
            </span>
            <span>
              <span class="block text-[11px] font-bold text-gray-400">워크스페이스 권한</span>
              <span
                class="mt-1 inline-flex rounded bg-indigo-100 px-2 py-1 text-[11px] font-extrabold text-indigo-700"
                >{{ account.workspaceRole }}</span
              >
            </span>
          </button>
        </div>
      </aside>
    </main>
  </div>
</template>

<style scoped>
@keyframes slide-down {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes fade-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

.animate-slide-down {
  animation: slide-down 0.2s ease-out forwards;
}

.animate-fade-in {
  animation: fade-in 0.3s ease-out forwards;
}

input {
  -webkit-tap-highlight-color: transparent;
}
</style>
