import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

export function getCategories() {
  return api.get('/categories').then(r => r.data)
}

export function getNotices(category, page = 1, size = 20) {
  return api.get('/notices', { params: { category, page, size } }).then(r => r.data)
}

export function getNoticeDetail(catKey, id) {
  return api.get(`/notices/${catKey}/${id}`).then(r => r.data)
}
