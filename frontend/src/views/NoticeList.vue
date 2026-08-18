<template>
  <div class="main-area">
    <div class="list-panel">
      <div class="list-toolbar">
        {{ totalItems }} 条 · {{ totalPages }} 页 · {{ pageSize }}/页
      </div>

      <div class="notice-scroll">
        <div v-if="loading" class="empty-state">加载中...</div>
        <div v-else-if="!items.length" class="empty-state">暂无数据</div>
        <template v-else>
          <div
            v-for="n in items"
            :key="n.id"
            class="notice-row"
            :class="{ active: activeId === n.id }"
            @click="openDetail(n)"
          >
            <div class="date-box">
              <div class="date-day">{{ parseDay(n.date) }}</div>
              <div class="date-ym">{{ parseYM(n.date) }}</div>
            </div>
            <div class="notice-body">
              <div class="notice-title">{{ n.title }}</div>
              <div class="notice-desc">{{ (n.desc || '').substring(0, 80) }}</div>
            </div>
            <div class="arrow">›</div>
          </div>
        </template>
      </div>

      <div class="pagination-bar">
        <span>第 {{ page }} 页 / 共 {{ totalPages }} 页</span>
        <div class="page-btns">
          <button class="page-btn" :disabled="page <= 1" @click="goPage(page - 1)">‹</button>
          <button
            v-for="p in visiblePages"
            :key="p"
            class="page-btn"
            :class="{ active: p === page }"
            @click="goPage(p)"
          >{{ p }}</button>
          <button class="page-btn" :disabled="page >= totalPages" @click="goPage(page + 1)">›</button>
        </div>
      </div>
    </div>

    <!-- Detail slide-in panel -->
    <div class="detail-panel" :class="{ open: detailOpen }">
      <div class="detail-header">
        <button class="btn-back" @click="closeDetail">←</button>
        <div class="detail-info">
          <div class="detail-title">{{ detailNotice?.title || '--' }}</div>
          <div class="detail-meta">{{ detailNotice?.date || '--' }}</div>
        </div>
        <a
          v-if="detailNotice?.url"
          :href="detailNotice.url"
          target="_blank"
          rel="noopener"
          class="btn-original"
        >查看原文 ↗</a>
      </div>
      <div class="detail-content" ref="detailContentRef">
        <div v-if="detailLoading" class="detail-loading">加载中...</div>
        <div v-else v-html="sanitizedContent"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DOMPurify from 'dompurify'
import { getNotices, getNoticeDetail } from '../api'

const props = defineProps({ category: String })
const route = useRoute()
const router = useRouter()

const PAGE_SIZE = 20
const pageSize = PAGE_SIZE

const items = ref([])
const page = ref(1)
const totalPages = ref(1)
const totalItems = ref(0)
const loading = ref(false)

const activeId = ref(null)
const detailOpen = ref(false)
const detailNotice = ref(null)
const detailLoading = ref(false)
const detailHtml = ref('')
const detailContentRef = ref(null)

// ── [Fix #4] Abort controller for category page loading ──
let pageAbort = null

// ── [Fix #5] Request counter for detail panel race condition ──
let detailRequestId = 0

// ── Pagination visible range ──
const visiblePages = computed(() => {
  const total = totalPages.value
  const cur = page.value
  let start = Math.max(1, cur - 3)
  let end = Math.min(total, start + 6)
  if (end - start < 6) start = Math.max(1, end - 6)
  const pages = []
  if (start > 1) { pages.push(1); if (start > 2) pages.push('...') }
  for (let p = start; p <= end; p++) pages.push(p)
  if (end < total) { if (end < total - 1) pages.push('...'); pages.push(total) }
  return pages.filter(p => p !== '...')
})

// ── [Fix #1] Sanitize HTML before rendering ──
const sanitizedContent = computed(() => {
  let html = processAttachments(detailHtml.value || '')
  if (!html) return ''
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ['style'],
    ADD_ATTR: ['download', 'target'],
  })
})

// ── Parse content: replace file attachments with download buttons ──
function processAttachments(html) {
  if (!html) return ''

  html = html.replace(
    /<a([^>]*?)class="file-attachment"([^>]*?)>([\s\S]*?)<\/a>/gi,
    (match, pre, post, text) => {
      const urlMatch = match.match(/data-download-url="([^"]*)"/) || match.match(/href="([^"]*)"/)
      const url = urlMatch ? urlMatch[1] : ''
      const extMatch = url.match(/\.([a-zA-Z0-9]{2,5})(\?|$)/)
      const ext = extMatch ? '.' + extMatch[1] : ''
      const cleanText = text.trim().replace(/<[^>]*>/g, '').replace(/📎/g, '').trim()
      const hasExt = /\.\w{2,5}$/.test(cleanText)
      const filename = hasExt ? cleanText : cleanText + ext
      const proxyUrl = `/api/download?url=${encodeURIComponent(url)}&name=${encodeURIComponent(filename)}`
      return `${cleanText} <a class="btn-original" href="${proxyUrl}">下载 ↗</a>`
    }
  )

  return html
}

// ── [Fix #3] Safe parse helpers ──
function parseDay(date) {
  if (!date) return ''
  const parts = String(date).split('.')
  return parts.length >= 3 ? parts[2] : ''
}
function parseYM(date) {
  if (!date) return ''
  const parts = String(date).split('.')
  return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : String(date)
}

// ── [Fix #4] Load page with abort support ──
async function loadPage(p) {
  if (loading.value) return
  loading.value = true

  // Cancel previous in-flight request
  if (pageAbort) pageAbort.abort()
  const controller = new AbortController()
  pageAbort = controller

  try {
    const data = await getNotices(props.category || 'tzgg', p, PAGE_SIZE)
    // If aborted (another request started), discard result
    if (controller.signal.aborted) return

    items.value = data.data
    page.value = data.page
    totalPages.value = data.totalPages
    totalItems.value = data.totalItems
  } catch (err) {
    if (controller.signal.aborted) return
    // [Fix #6] Reset all pagination state on error
    items.value = []
    page.value = 1
    totalPages.value = 1
    totalItems.value = 0
  } finally {
    if (!controller.signal.aborted) loading.value = false
  }
}

function goPage(p) {
  if (p < 1 || p > totalPages.value) return
  loadPage(p)
}

// ── [Fix #5] Open detail with stale-request guard ──
async function openDetail(notice) {
  const reqId = ++detailRequestId

  activeId.value = notice.id
  detailOpen.value = true
  detailNotice.value = notice
  detailLoading.value = true
  detailHtml.value = ''

  try {
    const data = await getNoticeDetail(notice.category, notice.id)
    // If a newer request was made, discard this result
    if (reqId !== detailRequestId) return
    detailHtml.value = data.contentHtml || '<p>暂无内容</p>'
  } catch {
    if (reqId !== detailRequestId) return
    detailHtml.value = '<p>加载失败</p>'
  }

  if (reqId !== detailRequestId) return
  detailLoading.value = false

  await nextTick()
  if (detailContentRef.value) detailContentRef.value.scrollTop = 0
}

function closeDetail() {
  detailOpen.value = false
  activeId.value = null
  detailNotice.value = null
}

onMounted(() => loadPage(1))
watch(() => props.category, () => { closeDetail(); loadPage(1) })

// [Fix #4] Cleanup on unmount
onUnmounted(() => {
  if (pageAbort) pageAbort.abort()
  detailRequestId++ // invalidate any pending detail request
})
</script>

<style scoped>
.main-area {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
  position: relative;
}
.list-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}
.notice-scroll {
  flex: 1;
  overflow-y: auto;
}
</style>
