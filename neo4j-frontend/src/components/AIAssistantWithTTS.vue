<template>
  <div id="app">
    <!-- 动态背景 -->
    <div class="dynamic-background">
      <div class="bg-gradient"></div>
    </div>

    <!-- 顶部栏 -->
    <div class="top-bar">
      <h1 class="app-title">文物领域智能语音助手</h1>
      <div class="top-actions">
        <button 
          class="action-btn" 
          :class="{ active: isConnected }"
          id="dbStatus" 
          title="数据库连接状态"
        >
          <i class="fas fa-database"></i>
        </button>
        <button 
          class="action-btn" 
          :class="{ active: isTTSEnabled }"
          @click="toggleTTS"
          id="ttsToggle" 
          title="语音播报"
        >
          <i class="fas fa-volume-up"></i>
        </button>
        <button 
          class="action-btn"
          @click="toggleHistory" 
          id="historyToggle" 
          title="对话记录"
        >
          <i class="fas fa-comments"></i>
        </button>
        <button 
          class="action-btn" 
          @click="toggleDebug"
          :class="{ active: debug }"
          id="settingsBtn" 
          title="调试模式"
        >
          <i class="fas fa-bug"></i>
        </button>
      </div>
    </div>

    <!-- 主要语音助手区域 -->
    <div class="voice-assistant-container">
      <!-- 语音助手动画 -->
      <div class="voice-orb" id="voiceOrb">
        <div 
          class="orb-core" 
          :class="{
            listening: isListening,
            speaking: isSpeakingOnlyTTS,
            thinking: isTyping && !isSpeakingOnlyTTS
          }"
          id="orbCore"
        ></div>
        <div 
          class="voice-wave" 
          :class="{
            listening: isListening,
            speaking: isSpeakingOnlyTTS
          }"
          id="voiceWave"
        >
          <div class="wave-ring"></div>
          <div class="wave-ring"></div>
          <div class="wave-ring"></div>
        </div>
        
        <!-- 频谱可视化 -->
        <div 
          class="spectrum-visualizer" 
          :class="{ active: isListening }"
          id="spectrumVisualizer"
          ref="spectrumVisualizer"
        >
          <!-- 动态生成频谱条 -->
        </div>
      </div>

      <!-- 状态文字 -->
      <div class="status-text" id="statusText">
        {{ interimTranscript || statusText }}
      </div>

      <!-- 主控制按钮 -->
      <div class="main-control">
        <button 
          class="secondary-btn" 
          @click="toggleQuickInput"
          id="keyboardBtn" 
          title="键盘输入"
        >
          <i class="fas fa-keyboard"></i>
        </button>
        
        <button 
          class="voice-button" 
          :class="{ active: isListening }"
          @click="toggleListening"
          :disabled="!speechRecognitionSupported"
          id="voiceBtn"
        >
          <i :class="getVoiceOverlayIcon"></i>
        </button>
        
        <button 
          class="secondary-btn" 
          @click="clearConversations"
          id="clearBtn" 
          title="清除对话"
        >
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>

    <!-- 对话记录面板 -->
    <div 
      class="conversation-panel" 
      :class="{ open: showHistory }"
      id="conversationPanel"
    >
      <div class="panel-header">
        <h2 class="panel-title">对话记录</h2>
        <button 
          class="close-panel" 
          @click="closeHistory"
          id="closePanelBtn"
        >
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="conversation-list" id="conversationList" ref="conversationList">
        <div 
          v-for="(msg, index) in chatMessages" 
          :key="index"
          class="conversation-item"
          :class="{ 'system-message': msg.role === 'system' }"
        >
          <div class="conversation-role">
            <i :class="getRoleIcon(msg.role)"></i>
            {{ getRoleName(msg.role) }}
            <span v-if="msg.source && msg.role === 'assistant'" class="source-badge">
              <i :class="getSourceIcon(msg.source)"></i>
              {{ getSourceName(msg.source) }}
            </span>
          </div>
          <div class="conversation-text">
            <!-- 显示主要内容 -->
            <div v-if="msg.mainContent" v-html="formatMessage(msg.mainContent)"></div>
            <div v-else v-html="formatMessage(msg.content)"></div>
            
            <!-- 调试模式下显示思考过程 -->
            <div v-if="debug && msg.hasThinking && msg.thinkingContent" class="thinking-block">
              <details>
                <summary>思考过程</summary>
                <pre>{{ msg.thinkingContent }}</pre>
              </details>
            </div>
            
            <!-- 调试模式下显示查询详情 -->
            <div v-if="debug && msg.queryDetails" class="query-details">
              <details>
                <summary>查询详情</summary>
                <pre>{{ JSON.stringify(msg.queryDetails, null, 2) }}</pre>
              </details>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 快捷输入区 -->
    <div 
      class="quick-input" 
      :class="{ visible: showQuickInput }"
      id="quickInput"
    >
      <textarea
        v-model="userInput"
        @keydown="handleKeydown"
        @input="autoGrowTextarea"
        ref="userInputArea"
        id="textInput" 
        placeholder="输入您的问题..." 
        rows="1"
      ></textarea>
      <button 
        class="send-btn" 
        @click="sendMessage"
        :disabled="!userInput.trim() || isTyping"
        id="sendBtn"
      >
        <i class="fas fa-paper-plane"></i>
      </button>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import axios from 'axios'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

export default {
  name: 'AIAssistantWithTTS',
  setup() {
    // API 配置
    const apiBaseUrl = ref('http://localhost:3000/api/data')
    const aiApiUrl = ref('http://210.27.197.62:11434/api/chat')
    const llmModel = ref('deepseek-r1:32b')
    
    // 聊天相关
    const chatMessages = ref([])
    const userInput = ref('')
    const statusText = ref('准备就绪，点击开始对话')
    
    // 状态管理
    const isTyping = ref(false)
    const isListening = ref(false)
    const isTTSEnabled = ref(true)
    const isSpeakingOnlyTTS = ref(false)
    const isConnected = ref(false)
    const showHistory = ref(false)
    const showQuickInput = ref(false)
    const debug = ref(false)
    const autoSendOnSpeechEnd = ref(true)
    
    // 语音相关
    const speechSynthesis = ref(null)
    const speechRecognition = ref(null)
    const speechRecognitionSupported = ref(true)
    const currentUtterance = ref(null)
    const voices = ref([])
    const selectedVoiceURI = ref(null)
    const interimTranscript = ref('')
    
    // UI引用
    const spectrumVisualizer = ref(null)
    const conversationList = ref(null)
    const userInputArea = ref(null)
    
    // 频谱动画
    const spectrumBars = ref([])
    const animationFrameId = ref(null)

    // 计算属性
    const getVoiceOverlayIcon = computed(() => {
      if (isListening.value) {
        return 'fas fa-stop'
      } else if (isTyping.value && !isSpeakingOnlyTTS.value) {
        return 'fas fa-spinner fa-spin'
      } else if (isSpeakingOnlyTTS.value) {
        return 'fas fa-volume-up'
      }
      return 'fas fa-microphone'
    })

    // 初始化应用
    const initializeApp = () => {
      // TTS 初始化
      if ('speechSynthesis' in window) {
        speechSynthesis.value = window.speechSynthesis
        loadVoices()
        if (speechSynthesis.value.onvoiceschanged !== undefined) {
          speechSynthesis.value.onvoiceschanged = loadVoices
        }
      } else {
        console.warn('浏览器不支持 SpeechSynthesis API。TTS 功能将不可用。')
        isTTSEnabled.value = false
      }
      
      // STT 初始化
      if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
        const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition
        speechRecognition.value = new SpeechRecognitionAPI()
        speechRecognition.value.continuous = false
        speechRecognition.value.interimResults = true
        speechRecognition.value.lang = 'zh-CN'
        
        speechRecognition.value.onstart = () => {
          isListening.value = true
          interimTranscript.value = ''
          if (speechSynthesis.value && speechSynthesis.value.speaking) {
            speechSynthesis.value.cancel()
            isSpeakingOnlyTTS.value = false
          }
        }
        
        speechRecognition.value.onresult = (event) => {
          let finalTranscript = ''
          interimTranscript.value = ''
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript
            if (event.results[i].isFinal) {
              finalTranscript += transcript
            } else {
              interimTranscript.value += transcript
            }
          }
          if (finalTranscript.trim() && isListening.value) {
            userInput.value = finalTranscript.trim()
          }
        }
        
        speechRecognition.value.onerror = (event) => {
          console.error('语音识别错误:', event.error)
          addSystemMessage(`语音识别遇到问题: ${event.error}`)
          isListening.value = false
          interimTranscript.value = ''
          isTyping.value = false
          isSpeakingOnlyTTS.value = false
        }
        
        speechRecognition.value.onend = () => {
          isListening.value = false
          nextTick(() => { interimTranscript.value = '' })
          if (userInput.value.trim() && autoSendOnSpeechEnd.value) {
            sendMessage()
          } else if (userInput.value.trim()) {
            if (userInputArea.value) userInputArea.value.focus()
          }
        }
      } else {
        speechRecognitionSupported.value = false
        addSystemMessage('抱歉，您的浏览器不支持语音输入功能。')
      }
      
      // 初始化消息和测试连接
      addSystemMessage('您好！我是文物领域智能语音助手，请问有什么可以帮您的？点击麦克风图标可以开始语音输入。')
      testDatabaseConnection()
    }

    // 创建频谱条
    const createSpectrumBars = () => {
      if (!spectrumVisualizer.value) return
      
      for (let i = 0; i < 30; i++) {
        const bar = document.createElement('div')
        bar.className = 'spectrum-bar'
        bar.style.height = '5px'
        spectrumVisualizer.value.appendChild(bar)
        spectrumBars.value.push(bar)
      }
    }

    // 频谱动画
    const startSpectrumAnimation = () => {
      const animate = () => {
        spectrumBars.value.forEach(bar => {
          const height = Math.random() * 60 + 5
          bar.style.height = `${height}px`
        })
        animationFrameId.value = requestAnimationFrame(animate)
      }
      animate()
    }

    const stopSpectrumAnimation = () => {
      if (animationFrameId.value) {
        cancelAnimationFrame(animationFrameId.value)
      }
      spectrumBars.value.forEach(bar => {
        bar.style.height = '5px'
      })
    }

    // STT 控制
    const toggleListening = () => {
      if (!speechRecognitionSupported.value || !speechRecognition.value) {
        addSystemMessage(speechRecognitionSupported.value ? '语音识别未正确初始化。' : '抱歉，您的浏览器不支持语音输入。')
        return
      }
      if (isListening.value) {
        speechRecognition.value.stop()
      } else {
        userInput.value = ''
        nextTick(() => { /* 触发 textarea 自动调整高度 */ })
        try {
          speechRecognition.value.start()
          startSpectrumAnimation()
        } catch (e) {
          console.error("无法启动语音识别: ", e)
          addSystemMessage("无法启动语音识别，请检查麦克风权限或配置。")
          isListening.value = false
        }
      }
    }

    // 发送消息 - 核心流程入口
    const sendMessage = async () => {
      if (isListening.value) {
        speechRecognition.value.stop()
      }
      const userMessage = userInput.value.trim()
      if (!userMessage || isTyping.value) return

      // 取消正在进行的TTS播报
      if (speechSynthesis.value && speechSynthesis.value.speaking) {
        speechSynthesis.value.cancel()
        isSpeakingOnlyTTS.value = false
      }

      chatMessages.value.push({ role: 'user', content: userMessage, mainContent: userMessage })
      userInput.value = ''
      nextTick(() => { autoGrowTextarea() })
      isTyping.value = true
      scrollToBottom()

      const thinkingSteps = initializeThinkingSteps(userMessage)

      try {
        // 实体提取
        thinkingSteps.entityExtraction.attempted = true
        const extractedEntities = await extractEntitiesWithLLM(userMessage, thinkingSteps)
        thinkingSteps.entityExtraction.results = extractedEntities

        let knowledgeContext = ''
        let kgResult = null
        let kgSource = 'none'

        // 知识图谱查询
        if (extractedEntities.length > 0 && isConnected.value) {
          thinkingSteps.knowledgeGraphLookup.attempted = true
          const entityToSearch = extractedEntities[0].name
          thinkingSteps.knowledgeGraphLookup.entityUsed = entityToSearch
          kgResult = await queryKnowledgeGraphDirectly(entityToSearch, thinkingSteps)
          if (!kgResult) {
            kgResult = await queryKnowledgeGraphSemantically(userMessage, thinkingSteps)
          }
          if (kgResult) {
            kgSource = thinkingSteps.knowledgeGraphLookup.queryType
            thinkingSteps.knowledgeGraphLookup.success = true
          }
        } else if (!isConnected.value) {
          thinkingSteps.knowledgeGraphLookup.resultSummary = '知识库未连接，跳过查询。'
        } else {
          thinkingSteps.knowledgeGraphLookup.resultSummary = '未提取到有效实体，跳过知识图谱查询。'
        }

        // 格式化知识图谱结果
        if (kgResult) {
          knowledgeContext = formatKnowledgeGraphResults(kgResult)
          thinkingSteps.knowledgeGraphLookup.resultSummary = `通过 ${kgSource} 方式查询 "${thinkingSteps.knowledgeGraphLookup.entityUsed}" 找到 ${kgResult.nodes?.length || 0} 个节点, ${kgResult.relationships?.length || 0} 条关系。`
          thinkingSteps.finalOutcome.source = 'knowledge_graph'
        } else {
          thinkingSteps.finalOutcome.source = 'model'
        }

        // 构建最终提示词并生成回答
        const finalPrompt = buildFinalPrompt(userMessage, knowledgeContext, thinkingSteps)
        thinkingSteps.answerGeneration.prompt = finalPrompt

        const assistantMessage = {
          role: 'assistant', 
          content: '', 
          mainContent: '', 
          thinkingContent: '', 
          hasThinking: false,
          source: thinkingSteps.finalOutcome.source, 
          thinkingSteps: thinkingSteps,
          queryDetails: debug.value ? kgResult : null
        }
        chatMessages.value.push(assistantMessage)
        scrollToBottom()

        await streamLLMResponse(finalPrompt, assistantMessage)

      } catch (error) {
        console.error('[sendMessage] 处理消息时发生顶层错误:', error)
        thinkingSteps.finalOutcome.source = 'error'
        thinkingSteps.finalOutcome.errorMessage = error.message
        isTyping.value = false
        isSpeakingOnlyTTS.value = false
        showError(error, thinkingSteps)
      } finally {
        isTyping.value = false
        isSpeakingOnlyTTS.value = false
        nextTick(() => scrollToBottom())
      }
    }

    // 初始化思考步骤
    const initializeThinkingSteps = (userInput) => {
      return {
        userInput: userInput,
        entityExtraction: { 
          method: 'LLM (专用实体提取)', 
          attempted: false, 
          rawInput: userInput, 
          prompt: null, 
          rawResponse: null, 
          results: [], 
          error: null 
        },
        knowledgeGraphLookup: { 
          attempted: false, 
          entityUsed: null, 
          queryType: 'none', 
          queryDetails: null, 
          success: false, 
          rawResult: null, 
          resultSummary: '未尝试知识图谱查询', 
          error: null 
        },
        answerGeneration: { 
          prompt: null, 
          llmResponse: null, 
          error: null 
        },
        finalOutcome: { 
          source: 'model', 
          errorMessage: null 
        }
      }
    }

    // 实体提取
    const extractEntitiesWithLLM = async (userMessage, thinkingSteps) => {
      const prompt = `任务：请从以下用户问题中，精准地提取出最核心的名词性实体（例如：人名、地名、组织名、物品名称、概念术语等）。
用户问题：
"${userMessage}"
提取要求：
1.  专注于识别问题指向的核心查询对象。
2.  必须忽略所有非实体词语，例如：疑问词（"谁", "什么", "哪里"），动词（"介绍", "是", "查询"），代词（"你", "我", "它"），连词（"和", "与"），语气助词（"啊", "呢", "吗"），以及描述性或指示性短语（"给我介绍一下", "的信息", "有关", "关于"）。
3.  目标是提取出用户真正想查询的那个"东西"或"人"的名字。
4.  示例：
    - 输入："你给我介绍一下鎏金天王铜造像" -> 输出：["鎏金天王铜造像"]
    - 输入："王海洋是谁？" -> 输出：["王海洋"]
    - 输入："查询北京大学和清华大学的关系" -> 输出：["北京大学", "清华大学"]
    - 输入："苹果公司的总部在哪里" -> 输出：["苹果公司"]
    - 输入："什么是人工智能" -> 输出：["人工智能"]
    - 输入："天安门广场" -> 输出：["天安门广场"]
    - 输入："我想了解图计算技术" -> 输出：["图计算技术"]
5.  以 JSON 格式返回结果，包含一个名为 "entities" 的数组，数组中的每个元素是提取到的实体字符串。
6.  如果分析后认为问题中没有明确的核心实体可供提取（例如闲聊或非常模糊的问题 "你好啊"），则返回空的 "entities" 数组。
7.  **！！！重要：绝对只输出 JSON 对象本身，前后不要包含任何解释性文字、说明、代码块标记（如 \`\`\`json ... \`\`\`）或其他任何非 JSON 内容。**
JSON 输出格式示例（仅包含实体名称字符串数组）：
{
  "entities": ["实体1", "实体2"]
}
或 (如果找不到)：
{
  "entities": []
}`
      
      thinkingSteps.entityExtraction.prompt = prompt
      try {
        const response = await axios.post(aiApiUrl.value, {
          model: llmModel.value,
          messages: [{ role: 'user', content: prompt }],
          stream: false,
          options: { response_format: { type: "json_object" } }
        })
        thinkingSteps.entityExtraction.rawResponse = JSON.stringify(response.data)
        const extractedData = extractJSONFromLLMResponse(response.data)
        if (extractedData && Array.isArray(extractedData.entities) && extractedData.entities.every(e => typeof e === 'string')) {
          const validEntities = extractedData.entities
            .map(name => name.trim())
            .filter(name => name.length >= 2 && name.length < 50)
          return validEntities.map(name => ({ name: name, confidence: null }))
        } else {
          thinkingSteps.entityExtraction.error = "LLM 返回格式不正确或未提取到实体"
          return []
        }
      } catch (error) {
        thinkingSteps.entityExtraction.error = `LLM API 调用失败: ${error.message}`
        return []
      }
    }

    // 从LLM响应中提取JSON
    const extractJSONFromLLMResponse = (response) => {
      if (!response) return null
      let jsonString = ''
      if (typeof response === 'object' && response.message?.content) {
        jsonString = response.message.content
      } else if (typeof response === 'string') {
        jsonString = response
      } else if (typeof response === 'object') {
        try { JSON.parse(JSON.stringify(response)); return response }
        catch { jsonString = JSON.stringify(response) }
      } else { return null }
      try { return JSON.parse(jsonString) } catch (e1) { /* ignore */ }
      try { const m = jsonString.match(/```(?:json)?\s*([\s\S]*?)\s*```/); if(m && m[1]) return JSON.parse(m[1]) } catch (e2) { /* ignore */ }
      try { const m = jsonString.match(/\{[\s\S]*\}/); if(m && m[0]) return JSON.parse(m[0]) } catch (e3) { /* ignore */ }
      return null
    }

    // 知识图谱直接查询
    const queryKnowledgeGraphDirectly = async (entityName, thinkingSteps) => {
      const encodedEntity = encodeURIComponent(entityName)
      const queryUrl = `${apiBaseUrl.value}/${encodedEntity}`
      thinkingSteps.knowledgeGraphLookup.queryType = 'direct_api'
      thinkingSteps.knowledgeGraphLookup.queryDetails = `GET ${queryUrl}`
      try {
        const response = await axios.get(queryUrl)
        thinkingSteps.knowledgeGraphLookup.rawResult = response.data
        const isValidResponse = response.data && ((Array.isArray(response.data) && response.data.length > 0) || (typeof response.data === 'object' && Object.keys(response.data).length > 0 && !Array.isArray(response.data)))
        if (isValidResponse) {
          const formattedResult = formatDirectQueryResult(response.data, entityName)
          formattedResult._source = 'direct_api'
          return formattedResult
        } else {
          thinkingSteps.knowledgeGraphLookup.resultSummary = `直接 API 查询 /${encodedEntity} 未返回有效数据。`
          return null
        }
      } catch (error) {
        if (error.response && error.response.status === 404) {
          thinkingSteps.knowledgeGraphLookup.resultSummary = `直接 API 查询 /${encodedEntity} 未找到实体 (404)。`
        } else {
          thinkingSteps.knowledgeGraphLookup.error = `直接 API 查询失败: ${error.message}`
          thinkingSteps.knowledgeGraphLookup.resultSummary = `直接 API 查询 /${encodedEntity} 失败。`
        }
        return null
      }
    }

    // 知识图谱语义查询
    const queryKnowledgeGraphSemantically = async (userMessage, thinkingSteps) => {
      const queryUrl = `${apiBaseUrl.value}/semantic-search`
      const requestBody = { question: userMessage }
      thinkingSteps.knowledgeGraphLookup.queryType = 'semantic_api'
      thinkingSteps.knowledgeGraphLookup.queryDetails = `POST ${queryUrl}\nBody: ${JSON.stringify(requestBody)}`
      try {
        const response = await axios.post(queryUrl, requestBody)
        thinkingSteps.knowledgeGraphLookup.rawResult = response.data
        if (response.data && Array.isArray(response.data.nodes) && response.data.nodes.length > 0) {
          response.data._source = 'semantic_api'
          thinkingSteps.knowledgeGraphLookup.error = null
          return response.data
        } else {
          if (!thinkingSteps.knowledgeGraphLookup.success) {
            thinkingSteps.knowledgeGraphLookup.resultSummary = `语义搜索 API 未找到 "${userMessage}" 的相关数据。`
          }
          return null
        }
      } catch (error) {
        if (!thinkingSteps.knowledgeGraphLookup.success) {
          thinkingSteps.knowledgeGraphLookup.error = `语义搜索 API 失败: ${error.message}`
          thinkingSteps.knowledgeGraphLookup.resultSummary = `语义搜索 API 调用失败。`
        }
        return null
      }
    }

    // 格式化直接查询结果
    const formatDirectQueryResult = (data, queriedEntityName) => {
      const result = { nodes: [], relationships: [], _source: 'direct_api' }
      const nodeMap = new Map()
      if (Array.isArray(data)) {
        data.forEach((item, index) => {
          if (item.node1 && item.node1.name) {
            const nodeId = `node1_${index}_${item.node1.name}`
            if (!nodeMap.has(item.node1.name)) {
              nodeMap.set(item.node1.name, nodeId)
              result.nodes.push({ id: nodeId, name: item.node1.name, labels: item.node1.labels || ['Entity'], properties: item.node1 })
            }
          }
          if (item.node2 && item.node2.name) {
            const nodeId = `node2_${index}_${item.node2.name}`
            if (!nodeMap.has(item.node2.name)) {
              nodeMap.set(item.node2.name, nodeId)
              result.nodes.push({ id: nodeId, name: item.node2.name, labels: item.node2.labels || ['Entity'], properties: item.node2 })
            }
          }
          if (item.relationship && item.node1?.name && item.node2?.name) {
            result.relationships.push({ 
              id: `rel_${index}_${item.relationship}`, 
              type: item.relationship, 
              startNode: nodeMap.get(item.node1.name), 
              endNode: nodeMap.get(item.node2.name), 
              properties: item.relationshipProperties || {} 
            })
          }
        })
      } else if (typeof data === 'object' && data !== null && data.name) {
        const nodeId = `node_${data.name}`
        if (!nodeMap.has(data.name)) {
          nodeMap.set(data.name, nodeId)
          result.nodes.push({ id: nodeId, name: data.name, labels: data.labels || ['Entity'], properties: data })
        }
      } else {
        const nodeId = `node_${queriedEntityName}`
        if (!nodeMap.has(queriedEntityName)) {
          nodeMap.set(queriedEntityName, nodeId)
          result.nodes.push({ id: nodeId, name: queriedEntityName, labels: ['Unknown'], properties: typeof data === 'object' ? data : { value: data } })
        }
      }
      return result
    }

    // 格式化知识图谱结果为LLM上下文
    const formatKnowledgeGraphResults = (data) => {
      let context = ''
      const nodesById = {}
      if (data.nodes && data.nodes.length > 0) {
        context += '【相关实体信息】:\n'
        data.nodes.forEach(node => {
          nodesById[node.id] = node
          context += `- 实体: ${node.name || node.id}`
          if (node.labels && node.labels.length > 0) context += ` (类型: ${node.labels.join(', ')})`
          const props = Object.entries(node.properties || {})
            .filter(([key]) => !['name','id','labels'].includes(key.toLowerCase()) && !key.toLowerCase().includes('embedding'))
            .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
            .join('; ')
          if (props) context += ` | 属性: ${props}\n`
          else context += '\n'
        })
      } else { 
        context += '【未找到相关实体信息】\n'
        return context.trim()
      }
      if (data.relationships && data.relationships.length > 0) {
        context += '\n【相关关系信息】:\n'
        data.relationships.forEach(rel => {
          const startNode = nodesById[rel.startNode] || { name: `[节点ID:${rel.startNode}]` }
          const endNode = nodesById[rel.endNode] || { name: `[节点ID:${rel.endNode}]` }
          context += `- (${startNode.name}) -[${rel.type}]-> (${endNode.name})`
          const props = Object.entries(rel.properties || {})
            .filter(([key]) => !key.toLowerCase().includes('embedding'))
            .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
            .join('; ')
          if (props) context += ` | 关系属性: ${props}\n`
          else context += '\n'
        })
      } else { 
        context += '\n【未找到相关关系信息】'
      }
      return context.trim()
    }

    // 构建最终提示词
    const buildFinalPrompt = (userMessage, knowledgeContext, thinkingSteps) => {
      const kgAttempted = thinkingSteps.knowledgeGraphLookup.attempted
      const kgSuccess = thinkingSteps.knowledgeGraphLookup.success
      const entityUsed = thinkingSteps.knowledgeGraphLookup.entityUsed || '用户询问的主题'
      const baseInstructions = `
【重要指令】:
1.  **分离思考与回答**：将你所有的分析、推理、步骤拆解等内部思考过程，**完全**放入 <think>...</think> 标签内。
2.  **最终答案**：在 <think> 标签之外，**只输出**直接面向用户的最终回答。这个回答必须简洁、流畅、完整且独立于思考过程。
3.  **禁止在最终答案中包含思考痕迹**：最终答案中不应出现诸如"首先，我需要..."、"接下来，..." 、"因此，..."、"我的分析是..."等引导思考过程的词语。直接给出结论或信息。
4.  **基于信息源**：如果提供了【知识图谱信息】，最终答案必须严格基于这些信息；如果没有，则基于你的通用知识。
5.  **自然语言**：使用自然、专业的语言。
6.  **Markdown格式**: 使用 Markdown 格式化回答（例如列表、加粗）。`

      if (knowledgeContext) {
        return `你是一个严谨的知识问答助手。请严格根据下面提供的【知识图谱信息】来回答【用户问题】。
【知识图谱信息】:
\`\`\`
${knowledgeContext}
\`\`\`
【用户问题】:
"${userMessage}"
${baseInstructions}
【补充要求 - 基于知识图谱】:
-   如果信息足够回答，请直接总结输出答案。
-   如果信息不足以回答问题的某个方面，请在最终答案中明确说明（例如："关于 ${entityUsed} 的[某方面]，我目前没有详细信息。"）。
-   **不要**在最终答案开头说"根据知识图谱..."，直接开始回答。`
      } else if (kgAttempted && !kgSuccess) {
        return `你是一个智能助手。用户询问了关于 "${entityUsed}" 的问题，但在知识库中未能找到相关信息（原因：${thinkingSteps.knowledgeGraphLookup.error || '未找到匹配项'}）。
【用户问题】:
"${userMessage}"
${baseInstructions}
【补充要求 - 查询失败】:
-   在最终答案中，首先告知用户在知识库中未找到关于 "${entityUsed}" 的具体信息。
-   然后，尝试基于你的通用知识库，对用户的问题提供一个可能的、一般性的回答（如果可以）。
-   如果通用知识也无法回答，请在最终答案中坦诚说明。`
      } else {
        return `你是一个乐于助人的智能助手。请根据你的通用知识回答以下用户问题。
【用户问题】:
"${userMessage}"
${baseInstructions}
【补充要求 - 通用回答】:
-   如果问题具体但你的知识库中没有信息，请在最终答案中坦诚告知。
-   回答应清晰、简洁。`
      }
    }

    // 流式处理LLM响应
    const streamLLMResponse = async (finalPrompt, assistantMessage) => {
      try {
        const response = await axios.post(aiApiUrl.value, {
          model: llmModel.value,
          messages: [{ role: 'user', content: finalPrompt }],
          stream: true,
        }, { responseType: 'text' })

        let streamedContent = ''
        let mainContentAccumulator = ''
        let thinkingContentAccumulator = ''
        let inThinkingBlock = false

        const lines = response.data.split('\n')

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const data = JSON.parse(line.replace('data: ', ''))
            let chunk = ''
            if (data.message?.content) chunk = data.message.content
            else if (data.response) chunk = data.response

            if (chunk) {
              streamedContent += chunk
              assistantMessage.content = streamedContent

              // 分离主内容和思考过程
              let currentChunkPos = 0
              while (currentChunkPos < chunk.length) {
                if (inThinkingBlock) {
                  const endTagIndex = chunk.indexOf('</think>', currentChunkPos)
                  if (endTagIndex !== -1) {
                    thinkingContentAccumulator += chunk.substring(currentChunkPos, endTagIndex)
                    inThinkingBlock = false
                    currentChunkPos = endTagIndex + '</think>'.length
                  } else {
                    thinkingContentAccumulator += chunk.substring(currentChunkPos)
                    currentChunkPos = chunk.length
                  }
                } else {
                  const startTagIndex = chunk.indexOf('<think>', currentChunkPos)
                  if (startTagIndex !== -1) {
                    mainContentAccumulator += chunk.substring(currentChunkPos, startTagIndex)
                    inThinkingBlock = true
                    currentChunkPos = startTagIndex + '<think>'.length
                  } else {
                    mainContentAccumulator += chunk.substring(currentChunkPos)
                    currentChunkPos = chunk.length
                  }
                }
              }
              assistantMessage.mainContent = mainContentAccumulator
              assistantMessage.thinkingContent = thinkingContentAccumulator
              assistantMessage.hasThinking = thinkingContentAccumulator.trim().length > 0

              scrollToBottom()
            }
            if (data.done) break
          } catch (e) {
            console.warn("非JSON行或解析错误:", line, e)
            if (!inThinkingBlock) mainContentAccumulator += line + '\n'
            else thinkingContentAccumulator += line + '\n'
            assistantMessage.mainContent = mainContentAccumulator
            assistantMessage.thinkingContent = thinkingContentAccumulator
            scrollToBottom()
          }
        }

        // 最终解析
        const finalParsed = parseThinkTags(streamedContent)
        assistantMessage.content = streamedContent.trim()
        assistantMessage.mainContent = finalParsed.mainContent
        assistantMessage.thinkingContent = finalParsed.thinkingContent
        assistantMessage.hasThinking = finalParsed.hasThinking
        if (assistantMessage.thinkingSteps) {
          assistantMessage.thinkingSteps.answerGeneration.llmResponse = streamedContent.trim()
          assistantMessage.thinkingSteps.finalOutcome.source = assistantMessage.source
        }

        scrollToBottom()

        // TTS播报
        if (isTTSEnabled.value && assistantMessage.mainContent && assistantMessage.role === 'assistant') {
          const textToSpeak = cleanTextForSpeech(assistantMessage.mainContent)
          startSpeaking(textToSpeak)
        }

      } catch (error) {
        const finalErrorMessage = `抱歉，我在尝试回答时遇到了一个内部错误。(${error.message})`
        if (assistantMessage) {
          assistantMessage.content = finalErrorMessage
          assistantMessage.mainContent = `抱歉，我在尝试回答时遇到了一个内部错误。`
          assistantMessage.source = 'error'
          if (assistantMessage.thinkingSteps) {
            assistantMessage.thinkingSteps.answerGeneration.error = `LLM API 调用失败: ${error.message}`
            assistantMessage.thinkingSteps.finalOutcome.source = 'error'
            assistantMessage.thinkingSteps.finalOutcome.errorMessage = error.message
          }
        } else {
          chatMessages.value.push({ 
            role: 'assistant', 
            content: finalErrorMessage, 
            mainContent: `抱歉，我在尝试回答时遇到了一个内部错误。`, 
            source: 'error', 
            hasThinking: false 
          })
        }
        if (isTTSEnabled.value) {
          startSpeaking(cleanTextForSpeech(finalErrorMessage))
        }
        scrollToBottom()
      } finally {
        isTyping.value = false
      }
    }

    // 解析思考标签
    const parseThinkTags = (text) => {
      if (!text) return { mainContent: '', thinkingContent: '', hasThinking: false }
      let mainContent = ''
      let thinkingContent = ''
      let lastIndex = 0
      const thinkRegex = /<think>([\s\S]*?)<\/think>/g
      let match
      while ((match = thinkRegex.exec(text)) !== null) {
        mainContent += text.substring(lastIndex, match.index)
        thinkingContent += match[1].trim() + '\n\n'
        lastIndex = thinkRegex.lastIndex
      }
      mainContent += text.substring(lastIndex)
      mainContent = mainContent.trim()
      thinkingContent = thinkingContent.trim()
      return { mainContent, thinkingContent, hasThinking: thinkingContent.length > 0 }
    }

    // TTS播报
    const startSpeaking = (text) => {
      if (!isTTSEnabled.value || !speechSynthesis.value || !text || text.trim().length === 0) {
        console.log("TTS skipped: disabled, no synthesis, or empty text.")
        return
      }

      if (speechSynthesis.value.speaking) {
        speechSynthesis.value.cancel()
        console.log("TTS cancelled previous speech.")
      }

      currentUtterance.value = new SpeechSynthesisUtterance(text)
      if (selectedVoiceURI.value) {
        const voice = voices.value.find(v => v.voiceURI === selectedVoiceURI.value)
        if (voice) currentUtterance.value.voice = voice
      }
      if(!currentUtterance.value.voice || !currentUtterance.value.voice.lang.startsWith('zh')) {
        currentUtterance.value.lang = 'zh-CN'
      }

      currentUtterance.value.onend = () => {
        currentUtterance.value = null
        isSpeakingOnlyTTS.value = false
        console.log('TTS finished speaking.')
      }
      currentUtterance.value.onerror = (event) => {
        console.error('TTS Error:', event.error)
        currentUtterance.value = null
        isSpeakingOnlyTTS.value = false
      }

      isSpeakingOnlyTTS.value = true
      console.log('TTS starting speech:', text)
      speechSynthesis.value.speak(currentUtterance.value)
    }

    // 加载语音
    const loadVoices = () => {
      if (!speechSynthesis.value) return
      voices.value = speechSynthesis.value.getVoices()
      const chineseVoice = voices.value.find(voice => voice.lang.startsWith('zh-CN') && voice.localService)
      if (chineseVoice) {
        selectedVoiceURI.value = chineseVoice.voiceURI
      } else {
        const anyChineseVoice = voices.value.find(voice => voice.lang.startsWith('zh-CN'))
        if(anyChineseVoice) selectedVoiceURI.value = anyChineseVoice.voiceURI
      }
    }

    // 清理文本以便TTS播报
    const cleanTextForSpeech = (markdownText) => {
      if (!markdownText) return ''
      let text = markdownText
      text = text.replace(/```[\s\S]*?```/g, ' (代码部分) ')
      text = text.replace(/`([^`]+)`/g, '$1')
      text = text.replace(/!\[(.*?)\]\(.*?\)/g, '(图片: $1) ')
      text = text.replace(/\[(.*?)\]\(.*?\)/g, '$1')
      text = text.replace(/^#{1,6}\s+/gm, '')
      text = text.replace(/(\*\*|__)(.*?)\1/g, '$2')
      text = text.replace(/(\*|_)(.*?)\1/g, '$2')
      text = text.replace(/^(-{3,}|\*{3,}|_{3,})$/gm, '')
      text = text.replace(/^\s*[*+-]\s+/gm, ' ')
      text = text.replace(/^\s*\d+\.\s+/gm, ' ')
      text = text.replace(/<\/?[^>]+(>|$)/g, "")
      text = text.replace(/(\r\n|\n|\r)/gm, " ").replace(/\s+/g, ' ').trim()
      return text
    }

    // 系统消息
    const addSystemMessage = (content) => {
      const message = {
        role: 'system', 
        content: content, 
        mainContent: content,
        source: 'system', 
        timestamp: new Date()
      }
      chatMessages.value.push(message)
      nextTick(() => { scrollToBottom() })
      if (isTTSEnabled.value && speechSynthesis.value && content) {
        startSpeaking(cleanTextForSpeech(content))
      }
    }

    // 显示错误
    const showError = (error, thinkingSteps) => {
      const errorMessage = error.response?.data?.error || error.response?.data?.message || error.message
      const errorDetails = debug.value ? `\n\n调试信息：${JSON.stringify(error.response?.data || error, null, 2)}` : ''
      const fullUserMessage = `抱歉，处理您的请求时遇到了问题：${errorMessage}${errorDetails}`

      const errorMsgObject = {
        role: 'assistant',
        content: fullUserMessage, 
        mainContent: `抱歉，处理您的请求时遇到了问题：${errorMessage}`,
        source: 'error', 
        thinkingSteps: thinkingSteps
      }
      chatMessages.value.push(errorMsgObject)
      nextTick(() => { scrollToBottom() })
      if (isTTSEnabled.value && speechSynthesis.value) {
        startSpeaking(cleanTextForSpeech(errorMsgObject.mainContent))
      }
    }

    // 测试数据库连接
    const testDatabaseConnection = async () => {
      try {
        const response = await axios.get(apiBaseUrl.value, { timeout: 5000 })
        if (response.status === 200) {
          isConnected.value = true
          addSystemMessage('✅ 知识库连接成功！')
        } else { 
          throw new Error(`连接测试返回状态码: ${response.status}`)
        }
      } catch (error) {
        isConnected.value = false
        addSystemMessage('⚠️ 无法连接到知识库，部分功能可能受限。')
      }
    }

    // 格式化消息（Markdown渲染）
    const formatMessage = (content) => {
      if (!content) return ''
      const html = marked(content)
      return DOMPurify.sanitize(html)
    }

    // UI辅助方法
    const autoGrowTextarea = () => {
      if (userInputArea.value) {
        userInputArea.value.style.height = 'auto'
        userInputArea.value.style.height = userInputArea.value.scrollHeight + 'px'
      }
    }

    const handleKeydown = (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        sendMessage()
      }
    }

    const scrollToBottom = () => {
      nextTick(() => {
        if (conversationList.value) {
          conversationList.value.scrollTop = conversationList.value.scrollHeight
        }
      })
    }

    const toggleTTS = () => {
      isTTSEnabled.value = !isTTSEnabled.value
      if (!isTTSEnabled.value && speechSynthesis.value && speechSynthesis.value.speaking) {
        speechSynthesis.value.cancel()
        isSpeakingOnlyTTS.value = false
      }
    }

    const toggleHistory = () => {
      showHistory.value = !showHistory.value
    }

    const closeHistory = () => {
      showHistory.value = false
    }

    const toggleQuickInput = () => {
      showQuickInput.value = !showQuickInput.value
      if (showQuickInput.value) {
        nextTick(() => {
          if (userInputArea.value) userInputArea.value.focus()
        })
      }
    }

    const toggleDebug = () => {
      debug.value = !debug.value
    }

    const clearConversations = () => {
      if (confirm('确定要清除所有对话记录吗？')) {
        chatMessages.value = []
      }
    }

    // 图标和名称辅助方法
    const getRoleIcon = (role) => {
      switch (role) {
        case 'user': return 'fas fa-user'
        case 'assistant': return 'fas fa-robot'
        case 'system': return 'fas fa-info-circle'
        default: return 'fas fa-comment'
      }
    }

    const getRoleName = (role) => {
      switch (role) {
        case 'user': return '您'
        case 'assistant': return '助手'
        case 'system': return '系统'
        default: return '未知'
      }
    }

    const getSourceIcon = (source) => {
      switch (source) {
        case 'knowledge_graph': return 'fas fa-database'
        case 'model': return 'fas fa-brain'
        case 'error': return 'fas fa-exclamation-triangle'
        default: return 'fas fa-question-circle'
      }
    }

    const getSourceName = (source) => {
      switch (source) {
        case 'knowledge_graph': return '知识库'
        case 'model': return '通用模型'
        case 'error': return '错误'
        default: return '未知'
      }
    }

    // 生命周期
    onMounted(() => {
      initializeApp()
      createSpectrumBars()
    })

    onUnmounted(() => {
      if (animationFrameId.value) {
        cancelAnimationFrame(animationFrameId.value)
      }
      if (speechRecognition.value && isListening.value) {
        speechRecognition.value.stop()
      }
      if (speechSynthesis.value && speechSynthesis.value.speaking) {
        speechSynthesis.value.cancel()
      }
    })

    return {
      // 数据
      chatMessages,
      userInput,
      statusText,
      interimTranscript,
      
      // 状态
      isTyping,
      isListening,
      isTTSEnabled,
      isSpeakingOnlyTTS,
      isConnected,
      showHistory,
      showQuickInput,
      debug,
      speechRecognitionSupported,
      
      // 计算属性
      getVoiceOverlayIcon,
      
      // refs
      spectrumVisualizer,
      conversationList,
      userInputArea,
      
      // 方法
      toggleListening,
      sendMessage,
      toggleTTS,
      toggleHistory,
      closeHistory,
      toggleQuickInput,
      toggleDebug,
      clearConversations,
      formatMessage,
      autoGrowTextarea,
      handleKeydown,
      getRoleIcon,
      getRoleName,
      getSourceIcon,
      getSourceName
    }
  }
}
</script>

<style scoped>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #000;
  color: #fff;
  height: 100vh;
  overflow: hidden;
}

#app {
  height: 100vh;
  display: flex;
  flex-direction: column;
  position: relative;
}

/* 动态背景 */
.dynamic-background {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  background: #000;
  overflow: hidden;
}

.bg-gradient {
  position: absolute;
  width: 150%;
  height: 150%;
  top: -25%;
  left: -25%;
  background: radial-gradient(circle at 30% 40%, rgba(59, 130, 246, 0.3), transparent 50%),
              radial-gradient(circle at 70% 60%, rgba(139, 92, 246, 0.3), transparent 50%),
              radial-gradient(circle at 50% 50%, rgba(34, 197, 94, 0.2), transparent 70%);
  animation: gradientShift 20s ease-in-out infinite;
}

@keyframes gradientShift {
  0%, 100% { transform: rotate(0deg) scale(1); }
  33% { transform: rotate(120deg) scale(1.1); }
  66% { transform: rotate(240deg) scale(0.9); }
}

/* 顶部栏 */
.top-bar {
  position: relative;
  z-index: 10;
  padding: 20px 30px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
}

.app-title {
  font-size: 20px;
  font-weight: 600;
  opacity: 0.9;
}

.top-actions {
  display: flex;
  gap: 15px;
}

.action-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(1.05);
}

.action-btn.active {
  background: rgba(59, 130, 246, 0.3);
  color: #3b82f6;
  border-color: rgba(59, 130, 246, 0.5);
}

/* 主要语音助手区域 */
.voice-assistant-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 5;
}

/* 语音助手动画 */
.voice-orb {
  position: relative;
  width: 200px;
  height: 200px;
  margin-bottom: 40px;
}

.orb-core {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 120px;
  height: 120px;
  background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.3), transparent),
              linear-gradient(135deg, #1e293b, #334155);
  border-radius: 50%;
  box-shadow: 0 0 60px rgba(59, 130, 246, 0.4),
              inset 0 0 30px rgba(0, 0, 0, 0.3);
  transition: all 0.3s ease;
}

.orb-core.listening {
  background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.4), transparent),
              linear-gradient(135deg, #3b82f6, #2563eb);
  box-shadow: 0 0 80px rgba(59, 130, 246, 0.6),
              inset 0 0 30px rgba(0, 0, 0, 0.2);
}

.orb-core.speaking {
  background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.4), transparent),
              linear-gradient(135deg, #22c55e, #16a34a);
  box-shadow: 0 0 80px rgba(34, 197, 94, 0.6),
              inset 0 0 30px rgba(0, 0, 0, 0.2);
}

.orb-core.thinking {
  background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.4), transparent),
              linear-gradient(135deg, #8b5cf6, #7c3aed);
  box-shadow: 0 0 80px rgba(139, 92, 246, 0.6),
              inset 0 0 30px rgba(0, 0, 0, 0.2);
}

/* 语音波纹 */
.voice-wave {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  height: 100%;
  border-radius: 50%;
  pointer-events: none;
}

.wave-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 120px;
  height: 120px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  opacity: 0;
}

.listening .wave-ring {
  animation: waveExpand 2s ease-out infinite;
  border-color: rgba(59, 130, 246, 0.6);
}

.speaking .wave-ring {
  animation: waveExpand 1.5s ease-out infinite;
  border-color: rgba(34, 197, 94, 0.6);
}

.wave-ring:nth-child(1) { animation-delay: 0s; }
.wave-ring:nth-child(2) { animation-delay: 0.5s; }
.wave-ring:nth-child(3) { animation-delay: 1s; }

@keyframes waveExpand {
  0% {
    width: 120px;
    height: 120px;
    opacity: 1;
  }
  100% {
    width: 300px;
    height: 300px;
    opacity: 0;
  }
}

/* 频谱可视化 */
.spectrum-visualizer {
  position: absolute;
  bottom: -60px;
  left: 50%;
  transform: translateX(-50%);
  width: 300px;
  height: 80px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.spectrum-visualizer.active {
  opacity: 1;
}

.spectrum-bar {
  width: 4px;
  background: linear-gradient(to top, rgba(59, 130, 246, 0.8), rgba(139, 92, 246, 0.8));
  border-radius: 2px;
  transform-origin: bottom;
  transition: height 0.1s ease;
}

/* 状态文字 */
.status-text {
  margin-top: 80px;
  font-size: 18px;
  color: rgba(255, 255, 255, 0.8);
  text-align: center;
  min-height: 30px;
}

/* 主控制按钮 */
.main-control {
  margin-top: 40px;
  display: flex;
  align-items: center;
  gap: 20px;
}

.voice-button {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid rgba(255, 255, 255, 0.3);
  color: #fff;
  font-size: 32px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  backdrop-filter: blur(10px);
}

.voice-button:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(1.05);
}

.voice-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.voice-button.active {
  background: rgba(239, 68, 68, 0.8);
  border-color: #ef4444;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
  70% { box-shadow: 0 0 0 20px rgba(239, 68, 68, 0); }
  100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
}

.secondary-btn {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.6);
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
}

.secondary-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

/* 对话记录面板 */
.conversation-panel {
  position: fixed;
  top: 0;
  right: -400px;
  width: 400px;
  height: 100vh;
  background: rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(20px);
  border-left: 1px solid rgba(255, 255, 255, 0.1);
  transition: right 0.3s ease;
  z-index: 15;
  display: flex;
  flex-direction: column;
}

.conversation-panel.open {
  right: 0;
}

.panel-header {
  padding: 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-title {
  font-size: 18px;
  font-weight: 600;
}

.close-panel {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.close-panel:hover {
  background: rgba(255, 255, 255, 0.2);
}

.conversation-list {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.conversation-item {
  margin-bottom: 16px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.conversation-item.system-message {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.3);
}

.conversation-role {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.conversation-role i {
  font-size: 14px;
}

.source-badge {
  margin-left: auto;
  font-size: 11px;
  padding: 2px 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.conversation-text {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.6;
}

/* Markdown 样式 */
.conversation-text :deep(h1),
.conversation-text :deep(h2),
.conversation-text :deep(h3),
.conversation-text :deep(h4),
.conversation-text :deep(h5),
.conversation-text :deep(h6) {
  margin-top: 16px;
  margin-bottom: 8px;
  font-weight: 600;
}

.conversation-text :deep(p) {
  margin-bottom: 8px;
}

.conversation-text :deep(ul),
.conversation-text :deep(ol) {
  padding-left: 20px;
  margin-bottom: 8px;
}

.conversation-text :deep(code) {
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 4px;
  border-radius: 3px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.9em;
}

.conversation-text :deep(pre) {
  background: rgba(0, 0, 0, 0.5);
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  margin-bottom: 8px;
}

.conversation-text :deep(pre code) {
  background: none;
  padding: 0;
}

.conversation-text :deep(blockquote) {
  border-left: 3px solid rgba(255, 255, 255, 0.3);
  padding-left: 12px;
  margin: 8px 0;
  color: rgba(255, 255, 255, 0.7);
}

.conversation-text :deep(a) {
  color: #3b82f6;
  text-decoration: none;
}

.conversation-text :deep(a:hover) {
  text-decoration: underline;
}

/* 调试信息样式 */
.thinking-block,
.query-details {
  margin-top: 12px;
  padding: 8px;
  background: rgba(139, 92, 246, 0.1);
  border: 1px solid rgba(139, 92, 246, 0.3);
  border-radius: 6px;
}

.thinking-block summary,
.query-details summary {
  cursor: pointer;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  user-select: none;
}

.thinking-block pre,
.query-details pre {
  margin-top: 8px;
  font-size: 11px;
  background: rgba(0, 0, 0, 0.3);
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
}

/* 快捷输入区 */
.quick-input {
  position: fixed;
  bottom: 30px;
  left: 50%;
  transform: translateX(-50%);
  width: 90%;
  max-width: 600px;
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 30px;
  padding: 12px 20px;
  display: flex;
  align-items: flex-end;
  gap: 12px;
  opacity: 0;
  transform: translateX(-50%) translateY(100px);
  transition: all 0.3s ease;
  z-index: 10;
}

.quick-input.visible {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

.quick-input textarea {
  flex: 1;
  background: none;
  border: none;
  color: #fff;
  font-size: 16px;
  outline: none;
  resize: none;
  font-family: inherit;
  line-height: 1.5;
  max-height: 120px;
  overflow-y: auto;
  padding: 0;
}

.quick-input textarea::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.send-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #3b82f6;
  border: none;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.send-btn:hover:not(:disabled) {
  background: #2563eb;
  transform: scale(1.05);
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .conversation-panel {
    width: 100%;
    right: -100%;
  }

  .voice-orb {
    width: 150px;
    height: 150px;
  }

  .orb-core {
    width: 100px;
    height: 100px;
  }

  .spectrum-visualizer {
    width: 250px;
  }
  
  .quick-input {
    width: 95%;
    bottom: 20px;
  }
}

/* 滚动条样式 */
.conversation-list::-webkit-scrollbar,
.quick-input textarea::-webkit-scrollbar {
  width: 6px;
}

.conversation-list::-webkit-scrollbar-track,
.quick-input textarea::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
}

.conversation-list::-webkit-scrollbar-thumb,
.quick-input textarea::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.conversation-list::-webkit-scrollbar-thumb:hover,
.quick-input textarea::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}
</style>