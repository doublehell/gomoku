<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import { useChatStore } from '@/stores/chat'
import { usePlayerStore } from '@/stores/player'

const chatStore = useChatStore()
const playerStore = usePlayerStore()

const emit = defineEmits<{
  (e: 'send', message: string): void
}>()

const message = ref('')
const messagesContainer = ref<HTMLElement | null>(null)

function send() {
  const text = message.value.trim()
  if (!text) return

  emit('send', text)
  message.value = ''
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

watch(() => chatStore.messages.length, scrollToBottom)
</script>

<template>
  <div class="bg-white rounded-2xl shadow-xl overflow-hidden">
    <div
      class="p-4 border-b border-gray-200 cursor-pointer flex items-center justify-between"
      @click="chatStore.toggle"
    >
      <h2 class="text-lg font-semibold text-gray-700">聊天室</h2>
      <button class="text-gray-500">
        <svg v-if="chatStore.isExpanded" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
        <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>

    <div v-show="chatStore.isExpanded" class="flex flex-col" style="max-height: 300px;">
      <div
        ref="messagesContainer"
        class="flex-1 overflow-y-auto p-4 bg-gray-50"
        style="max-height: 220px;"
      >
        <div v-if="chatStore.messages.length === 0" class="text-center text-gray-400 py-8">
          還沒有聊天記錄
        </div>
        <div v-else class="space-y-2">
          <div
            v-for="(msg, index) in chatStore.messages"
            :key="index"
            class="text-sm"
          >
            <span class="text-gray-400">[{{ msg.time }}]</span>
            <span class="font-medium" :class="msg.name === playerStore.name ? 'text-amber-600' : 'text-blue-600'">
              {{ msg.name }}:
            </span>
            <span class="text-gray-700">{{ msg.message }}</span>
          </div>
        </div>
      </div>

      <form @submit.prevent="send" class="p-4 bg-white border-t border-gray-200">
        <div class="flex gap-2">
          <input
            v-model="message"
            type="text"
            placeholder="輸入訊息..."
            maxlength="200"
            class="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
          />
          <button
            type="submit"
            class="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
          >
            傳送
          </button>
        </div>
      </form>
    </div>
  </div>
</template>