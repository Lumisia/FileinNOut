import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoginView from './LoginView.vue'

const { login } = vi.hoisted(() => ({ login: vi.fn() }))

vi.mock('@/api/user', () => ({
  default: { login },
}))

vi.mock('@/stores/useAuthStore', () => ({
  useAuthStore: () => ({ login: vi.fn() }),
}))

vi.mock('@/stores/useToastStore', () => ({
  useToastStore: () => ({ error: vi.fn() }),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/utils/backendUrl', () => ({
  apiPath: (path) => path,
}))

const mountLogin = () =>
  mount(LoginView, {
    global: {
      stubs: {
        RouterLink: {
          template: '<a><slot /></a>',
        },
      },
    },
  })

describe('LoginView public demo accounts', () => {
  beforeEach(() => {
    login.mockReset()
  })

  it('shows three accounts with identity and both permission levels', () => {
    const wrapper = mountLogin()
    const options = wrapper.findAll('[data-testid="demo-account"]')

    expect(options).toHaveLength(3)
    expect(wrapper.text()).toContain('표시 이름')
    expect(wrapper.text()).toContain('이메일')
    expect(wrapper.text()).toContain('전역 권한')
    expect(wrapper.text()).toContain('워크스페이스 권한')
    expect(wrapper.text()).toContain('Demo 관리자')
    expect(wrapper.text()).toContain('demo.editor@fileinnout.com')
    expect(wrapper.text()).toContain('ROLE_USER')
    expect(wrapper.text()).toContain('READ')
    expect(wrapper.text()).not.toContain('ROLE_ADMIN')
  })

  it('fills the form without logging in when an account is selected', async () => {
    const wrapper = mountLogin()
    const editor = wrapper.findAll('[data-testid="demo-account"]')[1]

    await editor.trigger('click')

    expect(wrapper.get('input[type="email"]').element.value).toBe('demo.editor@fileinnout.com')
    expect(wrapper.get('input[type="password"]').element.value).toBe('Demo1234!')
    expect(editor.attributes('aria-pressed')).toBe('true')
    expect(login).not.toHaveBeenCalled()
  })

  it('fully disables Google and Kakao while leaving Naver available', () => {
    const wrapper = mountLogin()

    expect(wrapper.get('[data-testid="oauth-google"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="oauth-kakao"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="oauth-naver"]').attributes('disabled')).toBeUndefined()
  })
})
