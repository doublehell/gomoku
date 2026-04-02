import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ChatMessage } from '@/types'

export const useChatStore = defineStore('chat', () => {
  const messages = ref<ChatMessage[]>([])
  const isExpanded = ref(true)

  function addMessage(msg: ChatMessage) {
    messages.value.push(msg)
    // Keep only last 100 messages
    if (messages.value.length > 100) {
      messages.value = messages.value.slice(-100)
    }
  }

  function clear() {
    messages.value = []
  }

  function toggle() {
    isExpanded.value = !isExpanded.value
  }

  return {
    messages,
    isExpanded,
    addMessage,
    clear,
    toggle
  }
})