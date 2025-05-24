<template>
  <div class="ai-chat-view">
    <AIAssistant />
  </div>
</template>

<script>
import AIAssistant from '@/components/AIAssistant.vue';

export default {
  name: 'AIChat',
  components: {
    AIAssistant
  }
};
</script>

<style scoped>
.ai-chat-view {
  min-height: calc(100vh - 60px);
  /* background: #f5f7fa; */
  background-image: url('@/assets/506.jpg');
  background-size: cover;
  background-position: center;
  display: flex;
  flex-direction: column;
}

.ai-chat-view > * {
  flex: 1;
}
</style> 