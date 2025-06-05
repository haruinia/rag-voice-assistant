<template>
  <div class="voice-assistant">
    <h2>语音文物助手</h2>
    <div class="chat-history">
      <div v-for="(msg, idx) in messages" :key="idx" :class="msg.role">
        <span>{{ msg.role === 'user' ? '你' : '助手' }}：</span>
        <span>{{ msg.text }}</span>
        <button v-if="msg.role === 'assistant'" @click="speak(msg.text)">🔊 播放语音</button>
      </div>
    </div>
    <div class="input-area">
      <input v-model="input" placeholder="你可以输入或用语音提问..." @keyup.enter="send" />
      <button @click="send">发送</button>
      <button @mousedown="startListening" @mouseup="stopListening" @mouseleave="stopListening">
        🎤 按住说话
      </button>
      <span v-if="listening">正在聆听...</span>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
// 假设你有一个文物助手的API方法
// import { askArtifactAssistant } from '@/api/artifactAssistant'

const input = ref('')
const messages = ref([
  { role: 'assistant', text: '你好，我是文物助手，请问有什么可以帮您？' }
])
const listening = ref(false)
let recognition = null

// 1. 语音识别（STT）
if ('webkitSpeechRecognition' in window) {
  recognition = new window.webkitSpeechRecognition()
  recognition.lang = 'zh-CN'
  recognition.continuous = false
  recognition.interimResults = false

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript
    input.value = transcript
    listening.value = false
  }
  recognition.onstart = () => {
    listening.value = true
  }
  recognition.onend = () => {
    listening.value = false
  }
  recognition.onerror = () => {
    listening.value = false
  }
}

function startListening() {
  if (recognition) recognition.start()
}
function stopListening() {
  if (recognition) recognition.stop()
}

// 2. 语音合成（TTS）
function speak(text) {
  if ('speechSynthesis' in window) {
    const utter = new window.SpeechSynthesisUtterance(text)
    utter.lang = 'zh-CN'
    window.speechSynthesis.speak(utter)
  }
}

// 3. 发送消息
async function send() {
  const question = input.value.trim()
  if (!question) return
  messages.value.push({ role: 'user', text: question })
  input.value = ''
  // 这里调用你原有的文物助手接口
  // const answer = await askArtifactAssistant(question)
  // 假设返回 answer
  const answer = await mockAskArtifactAssistant(question)
  messages.value.push({ role: 'assistant', text: answer })
  speak(answer)
}

// 4. mock方法，实际请替换为你自己的接口
async function mockAskArtifactAssistant(q) {
  // 这里模拟接口返回
  return '这是文物助手的回复："' + q + '"'
}
</script>

<style scoped>
.voice-assistant {
  max-width: 600px;
  margin: 40px auto;
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 24px;
  background: #fafbfc;
}
.chat-history {
  min-height: 200px;
  margin-bottom: 16px;
  max-height: 300px;
  overflow-y: auto;
}
.user {
  text-align: right;
  color: #333;
  margin: 8px 0;
}
.assistant {
  text-align: left;
  color: #1976d2;
  margin: 8px 0;
}
.input-area {
  display: flex;
  gap: 8px;
  align-items: center;
}
input {
  flex: 1;
  padding: 8px;
}
button {
  padding: 6px 12px;
  cursor: pointer;
}
</style> 