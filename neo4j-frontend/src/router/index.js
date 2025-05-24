import { createRouter, createWebHistory } from 'vue-router'
import GraphView from '../components/GraphView.vue'
import AIChat from '../views/AIChat.vue'

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
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router 