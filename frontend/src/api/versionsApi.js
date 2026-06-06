import { api } from '@/plugins/axiosinterceptor'

export async function fetchPostVersions(postId) {
  const response = await api.get(`/workspace/${postId}/versions`)
  return response?.data?.result ?? []
}

export async function fetchPostVersion(postId, versionNum) {
  const response = await api.get(`/workspace/${postId}/versions/${versionNum}`)
  return response?.data?.result ?? null
}
