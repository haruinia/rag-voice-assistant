// src/router/index.js
import { createRouter, createWebHistory } from 'vue-router'
import GraphView from '../components/GraphView.vue'
import AIChat from '../views/AIChat.vue'
import AIAssistantWithTTS from '../components/AIAssistantWithTTS.vue'

const routes = [
  {
    path: '/',
    name: 'graph',
    component: GraphView
  },
  {
    path: '/ai-chat',
    name: 'ai-chat',
    component: AIChat
  },
  {
    path: '/ai-chat-tts',
    name: 'ai-chat-tts',
    // Use the new component with TTS functionality
    component: AIAssistantWithTTS
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 添加这一行，导出 router 实例
export default router; // <--- 添加这行代码