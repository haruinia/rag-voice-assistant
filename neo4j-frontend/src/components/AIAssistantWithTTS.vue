<template>
  <div id="app-ai-assistant">
    <!-- 动态背景 - 保持与 App.vue 接近 -->
    <div class="ai-background">
      <div class="bg-gradient"></div>
      <div class="bg-particles"></div>
    </div>

    <!-- 顶部栏 - 风格与 App.vue 的 nav-bar 接近 -->
    <div class="top-bar-ai">
      <h1 class="app-title-ai">文物领域智能语音助手</h1>
      <div class="top-actions-ai">
        <!-- 数据库连接状态 -->
        <button
          class="action-btn-ai"
          :class="{ 'active-db': isConnected }"
          title="数据库连接状态"
          disabled
        >
          <i class="fas fa-database"></i>
        </button>
        <!-- 语音播报开关 -->
        <button
          class="action-btn-ai"
          :class="{ 'active-tts': isTTSEnabled }"
          @click="toggleTTS"
          :title="isTTSEnabled ? '关闭语音播报' : '开启语音播报'"
        >
          <i :class="isTTSEnabled ? 'fas fa-volume-up' : 'fas fa-volume-mute'"></i>
        </button>
        <!-- 对话记录开关 -->
        <button
          class="action-btn-ai"
          @click="toggleHistory"
          title="对话记录"
          :class="{ 'active-history': showHistory }"
        >
          <i class="fas fa-comments"></i>
        </button>
        <!-- 调试模式开关 -->
        <button
          class="action-btn-ai"
          @click="toggleDebug"
          :class="{ 'active-debug': debug }"
          title="切换调试模式"
        >
          <i class="fas fa-bug"></i>
        </button>
      </div>
    </div>

    <!-- 主要语音助手区域 -->
    <div class="voice-assistant-container-new">
      <!-- 语音助手动画 -->
      <div class="voice-orb-new">
        <div
          class="orb-core-new"
          :class="{
            'listening-new': isListening,
            'speaking-new': isSpeakingOnlyTTS,
            'thinking-new': isTyping && !isSpeakingOnlyTTS && !isListening
          }"
        ></div>
        <div
          class="voice-wave-new"
          :class="{
            'listening-new': isListening,
            'speaking-new': isSpeakingOnlyTTS
          }"
        >
          <div class="wave-ring-new"></div>
          <div class="wave-ring-new"></div>
          <div class="wave-ring-new"></div>
        </div>

        <!-- 频谱可视化 -->
        <div
          class="spectrum-visualizer-new"
          :class="{ active: isListening }"
          ref="spectrumVisualizer"
        >
          <!-- 动态生成频谱条 -->
        </div>
      </div>

      <!-- 状态文字 -->
      <div class="status-text-new">
        {{ getStatusText }}
      </div>

      <!-- 主控制按钮 -->
      <div class="main-control-new">
        <button
          class="secondary-btn-new"
          @click="toggleQuickInput"
          title="键盘输入"
          :class="{ 'active-input': showQuickInput }"
        >
          <i class="fas fa-keyboard"></i>
        </button>

        <button
          class="voice-button-new"
          :class="{ 'active-listening': isListening }"
          @click="toggleListening"
          :disabled="!speechRecognitionSupported || isTyping"
        >
          <i :class="getVoiceOverlayIcon"></i>
        </button>

        <button
          class="secondary-btn-new"
          @click="clearConversations"
          title="清除对话"
        >
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>

    <!-- 对话记录面板 -->
    <div
      class="conversation-panel-new"
      :class="{ open: showHistory }"
    >
      <div class="panel-header-new">
        <h2 class="panel-title-new">对话记录</h2>
        <button
          class="close-panel-new"
          @click="closeHistory"
        >
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="conversation-list-new" ref="conversationList">
        <div
          v-for="(msg, index) in chatMessages"
          :key="index"
          class="conversation-item-new"
          :class="{ 'system-message-new': msg.role === 'system', 'user-message-new': msg.role === 'user', 'assistant-message-new': msg.role === 'assistant' }"
        >
          <div class="conversation-role-new">
            <i :class="getRoleIcon(msg.role)"></i>
            {{ getRoleName(msg.role) }}
            <span v-if="msg.source && msg.role === 'assistant'" class="source-badge-new">
              <i :class="getSourceIcon(msg.source)"></i>
              {{ getSourceName(msg.source) }}
            </span>
          </div>
          <div class="conversation-text-new">
            <!-- 显示主要内容 -->
            <div v-if="msg.mainContent" v-html="formatMessage(msg.mainContent)"></div>
            <div v-else v-html="formatMessage(msg.content)"></div>

            <!-- 调试模式下显示思考过程 -->
            <div v-if="debug && msg.hasThinking && msg.thinkingContent" class="thinking-block-new">
              <details>
                <summary>思考过程</summary>
                <pre>{{ msg.thinkingContent }}</pre>
              </details>
            </div>

            <!-- 调试模式下显示查询详情 -->
            <div v-if="debug && msg.queryDetails" class="query-details-new">
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
      class="quick-input-new"
      :class="{ visible: showQuickInput }"
    >
      <textarea
        v-model="userInput"
        @keydown="handleKeydown"
        @input="autoGrowTextarea"
        ref="userInputArea"
        placeholder="输入您的问题..."
        rows="1"
      ></textarea>
      <button
        class="send-btn-new"
        @click="sendMessage"
        :disabled="!userInput.trim() || isTyping"
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
    // internalStatusText 用于存储非 interimTranscript 的状态文本
    const internalStatusText = ref('准备就绪，点击麦克风开始对话');

    // 状态管理
    const isTyping = ref(false) // AI正在思考/生成文本
    const isListening = ref(false) // 用户正在语音输入
    const isTTSEnabled = ref(true) // TTS是否开启
    const isSpeakingOnlyTTS = ref(false) // AI是否正在纯粹进行TTS播报 (不是生成文本时)
    const isConnected = ref(false) // 知识库连接状态
    const showHistory = ref(false) // 是否显示对话历史面板
    const showQuickInput = ref(false) // 是否显示快捷输入框
    const debug = ref(false) // 调试模式开关
    const autoSendOnSpeechEnd = ref(true) // 语音识别结束后是否自动发送

    // 语音相关
    const speechSynthesis = ref(null) // Web Speech API: 语音合成实例
    const speechRecognition = ref(null) // Web Speech API: 语音识别实例
    const speechRecognitionSupported = ref(true) // 浏览器是否支持语音识别
    const currentUtterance = ref(null) // 当前正在播报的 SpeechSynthesisUtterance
    const voices = ref([]) // 可用的语音列表
    const selectedVoiceURI = ref(null) // 选中的语音URI
    const interimTranscript = ref('') // 语音识别的临时结果 (实时显示在UI上)

    // UI引用
    const spectrumVisualizer = ref(null) // 频谱可视化容器
    const conversationList = ref(null) // 对话列表容器
    const userInputArea = ref(null) // 文本输入框

    // 频谱动画
    const spectrumBars = ref([]) // 存储动态生成的频谱条DOM元素
    const animationFrameId = ref(null) // requestAnimationFrame 的ID，用于停止动画

    // 计算属性
    const getVoiceOverlayIcon = computed(() => {
      if (isListening.value) {
        return 'fas fa-stop' // 用户正在录音时显示停止图标
      } else if (isTyping.value && !isSpeakingOnlyTTS.value) {
        return 'fas fa-spinner fa-spin' // AI正在思考或生成文本时显示加载图标
      } else if (isSpeakingOnlyTTS.value) {
        return 'fas fa-volume-up' // AI正在播报时显示音量图标
      }
      return 'fas fa-microphone' // 默认显示麦克风图标
    })

    const getStatusText = computed(() => {
        if (interimTranscript.value) {
            return `"${interimTranscript.value}"`; // 优先显示语音识别的临时结果
        } else if (isListening.value) {
            return '正在听取您的语音...';
        } else if (isTyping.value && !isSpeakingOnlyTTS.value) {
            return '正在思考...'; // AI思考中，用动画表示，无需具体文字
        } else if (isSpeakingOnlyTTS.value) {
            return '正在为您播报回答...';
        }
        return internalStatusText.value; // 显示内部状态文本
    });

    // **核心逻辑方法 - STT -> 文本 -> 实体提取 -> 知识图谱查询 -> LLM 回答 -> TTS**

    // 1. STT (Speech-to-Text) 核心触发与控制
    const toggleListening = () => {
      if (!speechRecognitionSupported.value || !speechRecognition.value) {
        addSystemMessage(speechRecognitionSupported.value ? '语音识别未正确初始化。' : '抱歉，您的浏览器不支持语音输入。')
        return
      }
      if (isListening.value) {
        speechRecognition.value.stop() // 停止录音
        stopSpectrumAnimation() // 停止频谱动画
      } else {
        userInput.value = '' // 清空输入框准备接收语音
        nextTick(() => { autoGrowTextarea() }) // 触发 textarea 自动调整高度
        try {
          speechRecognition.value.start() // 开始录音
          startSpectrumAnimation() // 开始频谱动画
        } catch (e) {
          console.error("无法启动语音识别: ", e)
          addSystemMessage("无法启动语音识别，请检查麦克风权限或配置。")
          isListening.value = false
        }
      }
    }

    // 2. 文本处理与核心流程编排 (sendMessage 是整个流程的入口)
    const sendMessage = async () => {
      if (isListening.value) {
        speechRecognition.value.stop() // 确保语音识别停止
        stopSpectrumAnimation() // 确保频谱动画停止
      }
      const userMessage = userInput.value.trim()
      if (!userMessage || isTyping.value) return // 如果消息为空或AI正在忙碌，则不处理

      // 在发送新消息前，取消任何正在进行的TTS播报
      if (speechSynthesis.value && speechSynthesis.value.speaking) {
        speechSynthesis.value.cancel()
        isSpeakingOnlyTTS.value = false
      }

      chatMessages.value.push({ role: 'user', content: userMessage, mainContent: userMessage })
      userInput.value = '' // 清空输入框
      nextTick(() => { autoGrowTextarea() }) // 重置文本框高度
      isTyping.value = true // 设置AI正在处理状态，显示思考动画
      scrollToBottom() // 滚动到底部

      const thinkingSteps = initializeThinkingSteps(userMessage) // 初始化思考过程追踪

      try {
        // 2.1 大模型实体提取
        thinkingSteps.entityExtraction.attempted = true
        const extractedEntities = await extractEntitiesWithLLM(userMessage, thinkingSteps)
        thinkingSteps.entityExtraction.results = extractedEntities

        let knowledgeContext = ''
        let kgResult = null
        let kgSource = 'none'

        // 2.2 知识图谱查询（如果提取到实体且知识库已连接）
        if (extractedEntities.length > 0 && isConnected.value) {
          thinkingSteps.knowledgeGraphLookup.attempted = true
          const entityToSearch = extractedEntities[0].name // 使用第一个提取到的实体进行查询
          thinkingSteps.knowledgeGraphLookup.entityUsed = entityToSearch
          kgResult = await queryKnowledgeGraphDirectly(entityToSearch, thinkingSteps) // 尝试直接查询
          if (!kgResult) {
            kgResult = await queryKnowledgeGraphSemantically(userMessage, thinkingSteps) // 如果直接查询失败，尝试语义搜索
          }
          if (kgResult) {
            kgSource = thinkingSteps.knowledgeGraphLookup.queryType // 记录查询类型
            thinkingSteps.knowledgeGraphLookup.success = true
          }
        } else if (!isConnected.value) {
          thinkingSteps.knowledgeGraphLookup.resultSummary = '知识库未连接，跳过查询。'
        } else {
          thinkingSteps.knowledgeGraphLookup.resultSummary = '未提取到有效实体，跳过知识图谱查询。'
        }

        // 格式化知识图谱结果为LLM上下文
        if (kgResult) {
          knowledgeContext = formatKnowledgeGraphResults(kgResult)
          thinkingSteps.knowledgeGraphLookup.resultSummary = `通过 ${kgSource} 方式查询 "${thinkingSteps.knowledgeGraphLookup.entityUsed}" 找到 ${kgResult.nodes?.length || 0} 个节点, ${kgResult.relationships?.length || 0} 条关系。`
          thinkingSteps.finalOutcome.source = 'knowledge_graph'
        } else {
          thinkingSteps.finalOutcome.source = 'model' // 如果没有知识图谱结果，则基于通用模型
        }

        // 2.3 LLM Prompt 构建与回答生成
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
          queryDetails: debug.value ? kgResult : null // 调试模式下显示查询详情
        }
        chatMessages.value.push(assistantMessage)
        scrollToBottom()

        await streamLLMResponse(finalPrompt, assistantMessage) // 调用LLM获取流式回答

      } catch (error) {
        console.error('[sendMessage] 处理消息时发生顶层错误:', error)
        thinkingSteps.finalOutcome.source = 'error'
        thinkingSteps.finalOutcome.errorMessage = error.message
        isTyping.value = false // 停止思考动画
        isSpeakingOnlyTTS.value = false // 停止播报状态
        showError(error, thinkingSteps) // 显示错误信息
      } finally {
        isTyping.value = false // 无论成功失败，都停止思考动画
        isSpeakingOnlyTTS.value = false // 确保播报状态也重置
        nextTick(() => scrollToBottom())
      }
    }

    // 辅助方法：初始化思考步骤 (用于调试)
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

    // 3. 大模型实体提取
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
  "entities": []}`

      thinkingSteps.entityExtraction.prompt = prompt
      try {
        const response = await axios.post(aiApiUrl.value, {
          model: llmModel.value,
          messages: [{ role: 'user', content: prompt }],
          stream: false, // 实体提取请求通常不需要流式响应
          options: { response_format: { type: "json_object" } }
        })
        thinkingSteps.entityExtraction.rawResponse = JSON.stringify(response.data)
        const extractedData = extractJSONFromLLMResponse(response.data)
        if (extractedData && Array.isArray(extractedData.entities) && extractedData.entities.every(e => typeof e === 'string')) {
          const validEntities = extractedData.entities
            .map(name => name.trim())
            .filter(name => name.length >= 2 && name.length < 50) // 过滤掉过短或过长的实体
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

    // 辅助方法：从LLM响应中提取JSON (LLM有时会包裹在代码块中)
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

    // 4. 知识图谱查询
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

    // 辅助方法：格式化直接查询结果 (如果需要的话)
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

    // 辅助方法：格式化知识图谱结果为 LLM 可用的上下文
    const formatKnowledgeGraphResults = (data) => {
      let context = ''
      const nodesById = new Map() // 使用 Map 代替对象，以防键名冲突
      if (data.nodes && data.nodes.length > 0) {
        context += '【相关实体信息】:\n'
        data.nodes.forEach(node => {
          nodesById.set(node.id, node) // 确保用 .set()
          context += `- 实体: ${node.name || node.id}`
          if (node.labels && node.labels.length > 0) context += ` (类型: ${node.labels.join(', ')})`
          const props = Object.entries(node.properties || {})
            .filter(([key]) => !['name', 'id', 'labels'].includes(key.toLowerCase()) && !key.toLowerCase().includes('embedding'))
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
          const startNode = nodesById.get(rel.startNode) || { name: `[节点ID:${rel.startNode}]` }
          const endNode = nodesById.get(rel.endNode) || { name: `[节点ID:${rel.endNode}]` }
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

    // 5. LLM Prompt 构建
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

    // 6. LLM 回答（流式处理）
    const streamLLMResponse = async (finalPrompt, assistantMessage) => {
      try {
        const response = await axios.post(aiApiUrl.value, {
          model: llmModel.value,
          messages: [{ role: 'user', content: finalPrompt }],
          stream: true, // 保持此设置，以匹配LLM服务器的预期行为
        }, { responseType: 'text' }) // 明确声明期望文本响应

        let streamedContent = ''
        let mainContentAccumulator = ''
        let thinkingContentAccumulator = ''
        let inThinkingBlock = false

        // 将完整的响应文本按行分割进行处理
        const lines = response.data.split('\n')

        for (const line of lines) {
          if (!line.trim()) continue // 跳过空行
          try {
            // Ollama 的 stream 响应可能会在每行前加 'data: '
            const data = JSON.parse(line.replace('data: ', ''))
            let chunk = ''
            if (data.message?.content) chunk = data.message.content
            else if (data.response) chunk = data.response // 兼容其他LLM的响应格式

            if (chunk) {
              streamedContent += chunk
              assistantMessage.content = streamedContent // 完整的原始内容

              // 分离主内容和思考过程 (旧逻辑保留)
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

              // nextTick() 在这里不再强制更新，而是让Vue的响应式系统自行处理
              // 我们只需要确保滚动到底部
              scrollToBottom()
            }
            if (data.done) break //  LLM响应结束标志
          } catch (e) {
            // 如果某一行不是有效的JSON（例如，可能是LLM在不规范格式下输出的文本），
            // 则将其作为普通文本追加到相应的内容累加器中
            console.warn("非JSON行或解析错误:", line, e)
            if (!inThinkingBlock) mainContentAccumulator += line + '\n'
            else thinkingContentAccumulator += line + '\n'
            assistantMessage.mainContent = mainContentAccumulator
            assistantMessage.thinkingContent = thinkingContentAccumulator
            scrollToBottom()
          }
        }

        // 流式响应结束后，对所有内容进行最终解析，确保思考过程和主内容彻底分离
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

        // 7. TTS (Text-to-Speech) 播报
        // 确保仅在最终内容完整且TTS启用时播报一次
        if (isTTSEnabled.value && assistantMessage.mainContent && assistantMessage.role === 'assistant') {
          const textToSpeak = cleanTextForSpeech(assistantMessage.mainContent)
          startSpeaking(textToSpeak) // 调用统一的播报方法
        }

      } catch (error) {
        // 处理LLM API调用失败或解析失败的错误
        const finalErrorMessage = `抱歉，我在尝试回答时遇到了一个内部错误。(${error.message})`
        if (assistantMessage) {
          assistantMessage.content = finalErrorMessage
          assistantMessage.mainContent = `抱歉，我在尝试回答时遇到了一个内部错误。` // TTS播报时更简洁
          assistantMessage.source = 'error'
          // 调试信息
          if (assistantMessage.thinkingSteps) {
            assistantMessage.thinkingSteps.answerGeneration.error = `LLM API 调用失败: ${error.message}`
            assistantMessage.thinkingSteps.finalOutcome.source = 'error'
            assistantMessage.thinkingSteps.finalOutcome.errorMessage = error.message
          }
        } else {
          // 如果还没有 assistantMessage 对象（极少发生），直接添加系统错误消息
          chatMessages.value.push({ role: 'assistant', content: finalErrorMessage, mainContent: `抱歉，我在尝试回答时遇到了一个内部错误。`, source: 'error', hasThinking: false })
        }
        if (isTTSEnabled.value) {
          startSpeaking(cleanTextForSpeech(finalErrorMessage)) // 播报错误消息
        }
        scrollToBottom()
      } finally {
        isTyping.value = false // 无论成功或失败，都停止AI思考的动画状态
      }
    }

    // 辅助方法：解析 LLM 响应中的 <think> 标签，分离思考过程和主内容
    const parseThinkTags = (text) => {
      if (!text) return { mainContent: '', thinkingContent: '', hasThinking: false }
      let mainContent = ''
      let thinkingContent = ''
      let lastIndex = 0
      const thinkRegex = /<think>([\s\S]*?)<\/think>/g
      let match
      while ((match = thinkRegex.exec(text)) !== null) {
        mainContent += text.substring(lastIndex, match.index)
        thinkingContent += match[1].trim() + '\n\n' // 提取思考内容
        lastIndex = thinkRegex.lastIndex
      }
      mainContent += text.substring(lastIndex) // 获取 <think> 标签之后的所有内容
      mainContent = mainContent.trim()
      thinkingContent = thinkingContent.trim()
      return { mainContent: mainContent, thinkingContent: thinkingContent, hasThinking: thinkingContent.length > 0 }
    }

    // 7. TTS (Text-to-Speech) 核心播报逻辑
    // 统一的语音播报方法，确保只播报一次并管理状态
    const startSpeaking = (text) => {
      // 检查 TTS 是否启用、speechSynthesis 实例是否存在、文本是否为空
      if (!isTTSEnabled.value || !speechSynthesis.value || !text || text.trim().length === 0) {
        console.log("TTS skipped: disabled, no synthesis, or empty text.")
        return
      }

      // 立即取消任何正在进行的播报，防止重叠和重复播报
      if (speechSynthesis.value.speaking) {
        speechSynthesis.value.cancel()
        console.log("TTS cancelled previous speech.")
      }

      currentUtterance.value = new SpeechSynthesisUtterance(text)
      // 尝试使用之前加载的选中语音
      if (selectedVoiceURI.value) {
        const voice = voices.value.find(v => v.voiceURI === selectedVoiceURI.value)
        if (voice) currentUtterance.value.voice = voice
      }
      // 如果没有指定语音或指定语音不支持中文，强制设置为中文
      if (!currentUtterance.value.voice || !currentUtterance.value.voice.lang.startsWith('zh')) {
        currentUtterance.value.lang = 'zh-CN'
      }

      // 设置播报结束和出错的回调，以正确管理状态
      currentUtterance.value.onend = () => {
        currentUtterance.value = null
        isSpeakingOnlyTTS.value = false // 播报结束，重置状态
        console.log('TTS finished speaking.')
      }
      currentUtterance.value.onerror = (event) => {
        console.error('TTS Error:', event.error)
        currentUtterance.value = null
        isSpeakingOnlyTTS.value = false // 播报出错，重置状态
      }

      // 启动播报前设置状态，表示AI正在播报
      isSpeakingOnlyTTS.value = true
      console.log('TTS starting speech:', text)
      speechSynthesis.value.speak(currentUtterance.value)
    }

    // 辅助方法：加载可用语音 (通常在 mounted 中调用一次)
    const loadVoices = () => {
      if (!speechSynthesis.value) return
      voices.value = speechSynthesis.value.getVoices();
      // 优先选择本地服务的中文语音
      const chineseVoice = voices.value.find(voice => voice.lang.startsWith('zh-CN') && voice.localService);
      if (chineseVoice) {
        selectedVoiceURI.value = chineseVoice.voiceURI;
      } else {
         // 如果没有本地服务，选择任何可用的中文语音
         const anyChineseVoice = voices.value.find(voice => voice.lang.startsWith('zh-CN'));
         if(anyChineseVoice) selectedVoiceURI.value = anyChineseVoice.voiceURI;
      }
    }

    // 辅助方法：清理文本以便TTS更好地播报 (移除Markdown、HTML等)
    const cleanTextForSpeech = (markdownText) => {
      if (!markdownText) return ''
      let text = markdownText
      // 移除代码块 (如 ```js ... ```)
      text = text.replace(/```[\s\S]*?```/g, ' (代码部分) ');
      // 移除行内代码 (如 `console.log`)
      text = text.replace(/`([^`]+)`/g, '$1');
      // 移除图片 markdown (如 ![alt](url))
      text = text.replace(/!\[(.*?)\]\(.*?\)/g, '(图片: $1) ');
      // 移除链接 markdown (如 [text](url))
      text = text.replace(/\[(.*?)\]\(.*?\)/g, '$1');
      // 移除Markdown标题 (如 # Title)
      text = text.replace(/^#{1,6}\s+/gm, '');
      // 移除加粗/斜体标记 (**strong**, *em*)
      text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
      text = text.replace(/(\*|_)(.*?)\1/g, '$2');
      // 移除水平线 (---, ***, ___)
      text = text.replace(/^(-{3,}|\*{3,}|_{3,})$/gm, '');
      // 移除列表标记 (* item, - item, 1. item)
      text = text.replace(/^\s*[*+-]\s+/gm, ' ');
      text = text.replace(/^\s*\d+\.\s+/gm, ' ');
      // 移除所有HTML标签
      text = text.replace(/<\/?[^>]+(>|$)/g, "");
      // 替换所有换行符和多个连续空格为单个空格，并去除首尾空格
      text = text.replace(/(\r\n|\n|\r)/gm, " ").replace(/\s+/g, ' ').trim();
      return text
    }

    // --- UI/辅助功能方法 ---

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
        mainContent: `抱歉，我在尝试回答时遇到了一个内部错误。`, // TTS播报时更简洁
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
      // marked.parse() 用于将 Markdown 转换为 HTML
      const html = marked.parse(content)
      // DOMPurify.sanitize() 用于清理 HTML，防止 XSS 攻击
      return DOMPurify.sanitize(html)
    }

    // 文本输入框自动调整高度
    const autoGrowTextarea = () => {
      if (userInputArea.value) {
        userInputArea.value.style.height = 'auto'
        userInputArea.value.style.height = userInputArea.value.scrollHeight + 'px'
      }
    }

    // 键盘事件处理 (Enter 发送，Shift+Enter 换行)
    const handleKeydown = (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault() // 阻止默认换行
        sendMessage()
      }
      // 触发自动调整高度，以防 Shift+Enter 换行时需要调整
      nextTick(() => { autoGrowTextarea() })
    }

    // 滚动到对话列表底部
    const scrollToBottom = () => {
      nextTick(() => {
        if (conversationList.value) {
          conversationList.value.scrollTop = conversationList.value.scrollHeight
        }
      })
    }

    // 对话记录面板显示/隐藏
    const toggleTTS = () => { // 确保此函数在 setup 返回
      isTTSEnabled.value = !isTTSEnabled.value
      if (!isTTSEnabled.value && speechSynthesis.value && speechSynthesis.value.speaking) {
        speechSynthesis.value.cancel()
        isSpeakingOnlyTTS.value = false
      }
    }

    // 对话记录面板显示/隐藏
    const toggleHistory = () => {
      showHistory.value = !showHistory.value
    }

    // 关闭对话记录面板
    const closeHistory = () => {
      showHistory.value = false
    }

    // 快捷输入区显示/隐藏
    const toggleQuickInput = () => {
      showQuickInput.value = !showQuickInput.value
      if (showQuickInput.value) {
        nextTick(() => {
          if (userInputArea.value) userInputArea.value.focus() // 显示时自动聚焦输入框
        })
      }
    }

    // 调试模式开关
    const toggleDebug = () => {
      debug.value = !debug.value
    }

    // 清除对话记录
    const clearConversations = () => {
      if (confirm('确定要清除所有对话记录吗？此操作不可撤销。')) {
        chatMessages.value = []
        addSystemMessage('所有对话记录已清除。')
      }
    }

    // 图标和名称辅助方法 (用于显示角色和来源信息)
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
        case 'system': return 'fas fa-info-circle' // 系统消息也有来源图标
        default: return 'fas fa-question-circle'
      }
    }

    const getSourceName = (source) => {
      switch (source) {
        case 'knowledge_graph': return '知识库'
        case 'model': return '通用模型'
        case 'error': return '错误'
        case 'system': return '系统'
        default: return '未知'
      }
    }

    // **频谱动画实现**
    // 创建频谱条DOM元素
    const createSpectrumBars = () => {
      if (!spectrumVisualizer.value) return

      // 防止重复创建
      if (spectrumBars.value.length > 0) return;

      const numBars = 30; // 频谱条数量
      for (let i = 0; i < numBars; i++) {
        const bar = document.createElement('div')
        bar.className = 'spectrum-bar-new' // 使用新的类名
        bar.style.height = '5px' // 初始高度
        // 加入动画延迟，使其看起来更自然
        bar.style.animationDelay = `${i * 0.03}s`;
        spectrumVisualizer.value.appendChild(bar)
        spectrumBars.value.push(bar)
      }
    }

    // 启动频谱动画
    const startSpectrumAnimation = () => {
      // 停止任何之前的动画帧请求
      if (animationFrameId.value) {
        cancelAnimationFrame(animationFrameId.value)
      }
      const animate = () => {
        if (!isListening.value) { // 只有在正在监听时才进行动画
            stopSpectrumAnimation();
            return;
        }
        spectrumBars.value.forEach(bar => {
          // 根据实际音频数据调整高度会更好，这里用随机值模拟
          const height = Math.random() * 60 + 5 // 5px - 65px
          bar.style.height = `${height}px`
        })
        animationFrameId.value = requestAnimationFrame(animate)
      }
      animationFrameId.value = requestAnimationFrame(animate) // 首次启动动画
    }

    // 停止频谱动画并重置高度
    const stopSpectrumAnimation = () => {
      if (animationFrameId.value) {
        cancelAnimationFrame(animationFrameId.value)
        animationFrameId.value = null
      }
      spectrumBars.value.forEach(bar => {
        bar.style.height = '5px' // 重置为初始高度
      })
    }

    // 初始化应用，在 mounted 时调用一次
    const initializeApp = () => {
      // TTS 初始化
      if ('speechSynthesis' in window) {
        speechSynthesis.value = window.speechSynthesis
        loadVoices() // 加载可用语音
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
          stopSpectrumAnimation(); // 错误时停止动画
        }

        speechRecognition.value.onend = () => {
          isListening.value = false
          stopSpectrumAnimation(); // 结束时停止动画
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

    // 生命周期钩子
    onMounted(() => {
      initializeApp() // 初始化 TTS, STT, 欢迎消息, 数据库连接
      createSpectrumBars() // 创建频谱条 DOM 元素
    })

    onUnmounted(() => {
      // 组件卸载时清理所有活动状态
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

    // 返回给模板的数据和方法
    return {
      // 数据
      chatMessages,
      userInput,
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
      getStatusText, // 新增的计算属性

      // Refs
      spectrumVisualizer,
      conversationList,
      userInputArea,

      // 方法 (所有在模板中使用的都必须返回)
      toggleListening,
      sendMessage,
      toggleTTS, // 确保返回
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
      getSourceName,
    }
  }
}
</script>

<style scoped>
/* 定义 CSS 变量以便于主题管理，与 App.vue 保持一致 */
:root {
  --primary-blue: #2196f3;
  --primary-blue-dark: #1976d2;
  --secondary-blue: #03a9f4;
  --accent-green: #4caf50;
  --accent-purple: #9c27b0;
  --background-light: #e3f2fd;
  --background-medium: #bbdefb;
  --background-dark: #90caf9;
  --text-dark: #424242;
  --text-light: #fff;
  --border-light: rgba(255, 255, 255, 0.1);
  --border-dark: rgba(0, 0, 0, 0.1);
  --shadow-light: rgba(33, 150, 243, 0.1);
  --shadow-medium: rgba(33, 150, 243, 0.3);
}

/* 全局重置和基础样式 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

/* #app-ai-assistant 容器，占据整个视口，并启用 Flex 布局 */
#app-ai-assistant {
  height: 100vh;
  display: flex;
  flex-direction: column;
  position: relative; /* 用于子元素的定位上下文 */
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  color: var(--text-dark); /* 默认文本颜色改为深色 */
  background: var(--background-light); /* 默认背景改为浅色 */
  overflow: hidden; /* 防止内容溢出造成滚动条 */
}

/* 动态背景层 - 与 App.vue 共享动画和颜色 */
.ai-background {
  position: fixed; /* 固定在视口 */
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0; /* 确保在最底层 */
  background: linear-gradient(135deg, var(--background-light) 0%, var(--background-medium) 50%, var(--background-dark) 100%);
  overflow: hidden;
}

.bg-gradient {
  position: absolute;
  width: 120%; /* 确保覆盖整个屏幕并有溢出空间进行动画 */
  height: 120%;
  top: -10%;
  left: -10%;
  /* 径向渐变，形成多个模糊光点效果 */
  background:
    radial-gradient(circle at 20% 30%, rgba(33, 150, 243, 0.3) 0%, transparent 50%), /* 蓝色 */
    radial-gradient(circle at 80% 70%, rgba(3, 169, 244, 0.2) 0%, transparent 50%), /* 浅蓝色 */
    radial-gradient(circle at 40% 80%, rgba(0, 188, 212, 0.2) 0%, transparent 50%); /* 青色 */
  filter: blur(40px);
  animation: gradientFlow 20s ease-in-out infinite; /* 渐变动画 */
  transition: transform 0.3s ease-out; /* 鼠标视差效果 */
}

@keyframes gradientFlow {
  0%, 100% {
    transform: rotate(0deg) scale(1);
    filter: blur(40px) brightness(1);
  }
  33% {
    transform: rotate(120deg) scale(1.1);
    filter: blur(45px) brightness(1.1);
  }
  66% {
    transform: rotate(240deg) scale(0.95);
    filter: blur(35px) brightness(0.95);
  }
}

/* 粒子效果 */
.bg-particles {
  position: absolute;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.bg-particles::before,
.bg-particles::after {
  content: '';
  position: absolute;
  width: 4px;
  height: 4px;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 50%;
  box-shadow:
    20px 50px 0 rgba(255, 255, 255, 0.6),
    100px 150px 0 rgba(255, 255, 255, 0.7),
    200px 80px 0 rgba(255, 255, 255, 0.5),
    300px 200px 0 rgba(255, 255, 255, 0.6),
    400px 120px 0 rgba(255, 255, 255, 0.7),
    500px 180px 0 rgba(255, 255, 255, 0.5);
  animation: particleFloat 30s linear infinite;
}

.bg-particles::after {
  animation-delay: -15s;
  left: 50%;
}

@keyframes particleFloat {
  from {
    transform: translateY(100vh) translateX(0);
  }
  to {
    transform: translateY(-100vh) translateX(100px);
  }
}

/* 顶部栏 */
.top-bar-ai {
  position: relative; /* 确保在背景之上 */
  z-index: 10;
  padding: 20px 30px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(255, 255, 255, 0.95); /* 浅色半透明背景 */
  backdrop-filter: blur(20px); /* 磨砂玻璃效果 */
  box-shadow: 0 2px 20px var(--shadow-light); /* 蓝色系阴影 */
  border-bottom: 1px solid rgba(33, 150, 243, 0.1);
  flex-shrink: 0;
}

.app-title-ai {
  font-size: 20px;
  font-weight: 600;
  opacity: 0.9;
  background: linear-gradient(135deg, var(--primary-blue-dark) 0%, var(--primary-blue) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.top-actions-ai {
  display: flex;
  gap: 15px;
}

.action-btn-ai {
  width: 40px;
  height: 40px;
  border-radius: 12px; /* 方形圆角按钮 */
  background: rgba(var(--primary-blue-dark), 0.05); /* 浅蓝背景 */
  border: 1px solid rgba(var(--primary-blue-dark), 0.2);
  color: var(--primary-blue-dark); /* 蓝色图标 */
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  flex-shrink: 0;
  font-size: 18px;
}

.action-btn-ai:hover:not(:disabled) {
  background: rgba(var(--primary-blue-dark), 0.1);
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(var(--primary-blue), 0.2);
}
.action-btn-ai:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.action-btn-ai.active-db {
  background: rgba(var(--accent-green), 0.2); /* 绿色 */
  color: var(--accent-green);
  border-color: rgba(var(--accent-green), 0.5);
}
.action-btn-ai.active-tts {
  background: rgba(var(--primary-blue), 0.2); /* 蓝色 */
  color: var(--primary-blue);
  border-color: rgba(var(--primary-blue), 0.5);
}
.action-btn-ai.active-history {
  background: rgba(var(--primary-blue), 0.2); /* 蓝色 */
  color: var(--primary-blue);
  border-color: rgba(var(--primary-blue), 0.5);
}
.action-btn-ai.active-debug {
  background: rgba(var(--accent-purple), 0.2); /* 紫色 */
  color: var(--accent-purple);
  border-color: rgba(var(--accent-purple), 0.5);
}


/* 主要语音助手区域 */
.voice-assistant-container-new {
  flex: 1; /* 占据剩余垂直空间 */
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 5;
  padding: 20px; /* 增加内边距防止内容贴边 */
}

/* 语音助手动画 Orb */
.voice-orb-new {
  position: relative;
  width: 200px; /* Orb 外部尺寸 */
  height: 200px;
  margin-bottom: 40px;
}

.orb-core-new {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 120px; /* Orb 核心尺寸 */
  height: 120px;
  background: linear-gradient(135deg, var(--background-light), var(--background-medium)); /* 浅色系背景 */
  border-radius: 50%;
  box-shadow: 0 0 40px rgba(var(--primary-blue), 0.2), /* 浅蓝色辉光 */
              inset 0 0 20px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
  border: 2px solid rgba(var(--primary-blue), 0.1);
}

.orb-core-new.listening-new {
  background: linear-gradient(135deg, var(--primary-blue), var(--primary-blue-dark)); /* 监听状态蓝色渐变 */
  box-shadow: 0 0 60px rgba(var(--primary-blue), 0.5),
              inset 0 0 30px rgba(0, 0, 0, 0.2);
  border-color: rgba(var(--primary-blue), 0.5);
}

.orb-core-new.speaking-new {
  background: linear-gradient(135deg, var(--accent-green), #388e3c); /* 播报状态绿色渐变 */
  box-shadow: 0 0 60px rgba(var(--accent-green), 0.5),
              inset 0 0 30px rgba(0, 0, 0, 0.2);
  border-color: rgba(var(--accent-green), 0.5);
}

.orb-core-new.thinking-new {
  background: linear-gradient(135deg, var(--accent-purple), #7b1fa2); /* 思考状态紫色渐变 */
  box-shadow: 0 0 60px rgba(var(--accent-purple), 0.5),
              inset 0 0 30px rgba(0, 0, 0, 0.2);
  border-color: rgba(var(--accent-purple), 0.5);
}

/* 语音波纹 */
.voice-wave-new {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  height: 100%;
  border-radius: 50%;
  pointer-events: none;
}

.wave-ring-new {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 120px;
  height: 120px;
  border: 2px solid rgba(var(--primary-blue), 0.2);
  border-radius: 50%;
  opacity: 0; /* 默认隐藏 */
}

/* 监听状态的波纹动画 */
.voice-wave-new.listening-new .wave-ring-new {
  animation: waveExpand 2s ease-out infinite;
  border-color: rgba(var(--primary-blue), 0.6); /* 蓝色波纹 */
}

/* 播报状态的波纹动画 */
.voice-wave-new.speaking-new .wave-ring-new {
  animation: waveExpand 1.5s ease-out infinite;
  border-color: rgba(var(--accent-green), 0.6); /* 绿色波纹 */
}

.wave-ring-new:nth-child(1) { animation-delay: 0s; }
.wave-ring-new:nth-child(2) { animation-delay: 0.5s; }
.wave-ring-new:nth-child(3) { animation-delay: 1s; }

@keyframes waveExpand {
  0% {
    width: 120px;
    height: 120px;
    opacity: 1;
  }
  100% {
    width: 300px; /* 展开到更大尺寸 */
    height: 300px;
    opacity: 0;
  }
}

/* 频谱可视化 */
.spectrum-visualizer-new {
  position: absolute;
  bottom: -60px; /* 位于 Orb 下方 */
  left: 50%;
  transform: translateX(-50%);
  width: 300px;
  height: 80px;
  display: flex;
  align-items: flex-end; /* 条从底部生长 */
  justify-content: center;
  gap: 4px; /* 条之间间隔 */
  opacity: 0; /* 默认隐藏 */
  transition: opacity 0.3s ease;
}

.spectrum-visualizer-new.active {
  opacity: 1; /* 激活时显示 */
}

.spectrum-bar-new {
  width: 4px;
  background: linear-gradient(to top, var(--primary-blue), var(--secondary-blue)); /* 渐变色频谱条 */
  border-radius: 2px;
  transform-origin: bottom; /* 确保从底部缩放 */
  transition: height 0.1s ease; /* 高度变化平滑过渡 */
}


/* 状态文字 */
.status-text-new {
  margin-top: 80px; /* 位于 Orb 之后 */
  font-size: 18px;
  color: var(--text-dark); /* 文本颜色为深色 */
  text-align: center;
  min-height: 30px; /* 保持高度稳定 */
}

/* 主控制按钮 */
.main-control-new {
  margin-top: 40px;
  display: flex;
  align-items: center;
  gap: 20px;
}

.voice-button-new {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: var(--background-medium); /* 浅蓝色背景 */
  border: 2px solid var(--primary-blue);
  color: var(--primary-blue); /* 默认蓝色图标 */
  font-size: 32px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  box-shadow: 0 4px 12px rgba(var(--primary-blue), 0.2);
  flex-shrink: 0;
}

.voice-button-new:hover:not(:disabled) {
  background: var(--background-dark);
  transform: scale(1.05);
  box-shadow: 0 6px 16px rgba(var(--primary-blue), 0.3);
}

.voice-button-new:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.voice-button-new.active-listening {
  background: linear-gradient(135deg, #ef4444, #dc2626); /* 激活状态为红色渐变 */
  border-color: #dc2626;
  color: var(--text-light);
  animation: pulse-red 1.5s ease-in-out infinite; /* 激活状态脉冲动画 */
  box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4);
}

@keyframes pulse-red {
  0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
  70% { box-shadow: 0 0 0 20px rgba(239, 68, 68, 0); }
  100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
}

.secondary-btn-new {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: var(--background-light); /* 浅背景 */
  border: 1px solid var(--primary-blue);
  color: var(--primary-blue); /* 蓝色图标 */
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(var(--primary-blue), 0.1);
}

.secondary-btn-new:hover:not(:disabled) {
  background: var(--background-medium);
  color: var(--primary-blue-dark);
  box-shadow: 0 4px 12px rgba(var(--primary-blue), 0.2);
}
.secondary-btn-new.active-input {
  background: linear-gradient(135deg, var(--primary-blue), var(--primary-blue-dark));
  color: var(--text-light);
  border-color: var(--primary-blue-dark);
  box-shadow: 0 4px 12px rgba(var(--primary-blue), 0.3);
}
.secondary-btn-new:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}


/* 对话记录面板 */
.conversation-panel-new {
  position: fixed;
  top: 0;
  right: -400px; /* 默认隐藏在右侧 */
  width: 400px;
  height: 100vh;
  background: rgba(255, 255, 255, 0.98); /* 接近白色，更明亮 */
  backdrop-filter: blur(20px);
  border-left: 1px solid rgba(var(--primary-blue), 0.1);
  transition: right 0.3s ease; /* 平滑过渡 */
  z-index: 15; /* 高于其他内容 */
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.1);
  color: var(--text-dark); /* 面板内文本颜色 */
}

.conversation-panel-new.open {
  right: 0; /* 显示时移入视图 */
}

.panel-header-new {
  padding: 20px;
  border-bottom: 1px solid rgba(var(--primary-blue), 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(90deg, var(--background-light), var(--background-medium)); /* 渐变标题背景 */
}

.panel-title-new {
  font-size: 18px;
  font-weight: 600;
  color: var(--primary-blue-dark);
}

.close-panel-new {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(var(--primary-blue), 0.1);
  border: none;
  color: var(--primary-blue);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.close-panel-new:hover {
  background: rgba(var(--primary-blue), 0.2);
}

.conversation-list-new {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.conversation-item-new {
  margin-bottom: 16px;
  padding: 12px;
  background: var(--background-light); /* 默认消息背景 */
  border-radius: 12px;
  border: 1px solid var(--background-medium);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.conversation-item-new.system-message-new {
  background: rgba(var(--accent-green), 0.1); /* 系统消息背景绿色 */
  border-color: rgba(var(--accent-green), 0.3);
}
.conversation-item-new.user-message-new {
  background: rgba(var(--primary-blue), 0.1); /* 用户消息背景蓝色 */
  border-color: rgba(var(--primary-blue), 0.3);
}
.conversation-item-new.assistant-message-new {
  background: rgba(var(--accent-purple), 0.1); /* 助手消息背景紫色 */
  border-color: rgba(var(--accent-purple), 0.3);
}


.conversation-role-new {
  font-size: 12px;
  color: var(--text-dark);
  opacity: 0.6;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.conversation-role-new i {
  font-size: 14px;
  color: var(--primary-blue); /* 图标颜色 */
}

.source-badge-new {
  margin-left: auto; /* 推到右侧 */
  font-size: 11px;
  padding: 2px 8px;
  background: rgba(var(--primary-blue), 0.1);
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--primary-blue-dark);
}

.conversation-text-new {
  font-size: 14px;
  color: var(--text-dark);
  line-height: 1.6;
}

/* Markdown 渲染后的样式 (使用 :deep() 穿透 scoped CSS) */
.conversation-text-new :deep(h1),
.conversation-text-new :deep(h2),
.conversation-text-new :deep(h3),
.conversation-text-new :deep(h4),
.conversation-text-new :deep(h5),
.conversation-text-new :deep(h6) {
  margin-top: 16px;
  margin-bottom: 8px;
  font-weight: 600;
  color: var(--primary-blue-dark);
}

.conversation-text-new :deep(p) {
  margin-bottom: 8px;
}

.conversation-text-new :deep(ul),
.conversation-text-new :deep(ol) {
  padding-left: 20px;
  margin-bottom: 8px;
}

.conversation-text-new :deep(code) {
  background: rgba(var(--primary-blue), 0.05);
  padding: 2px 4px;
  border-radius: 3px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.9em;
  color: var(--primary-blue-dark); /* 代码颜色 */
}

.conversation-text-new :deep(pre) {
  background: rgba(var(--primary-blue-dark), 0.08);
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  margin-bottom: 8px;
}

.conversation-text-new :deep(pre code) {
  background: none;
  padding: 0;
  color: inherit;
}

.conversation-text-new :deep(blockquote) {
  border-left: 3px solid rgba(var(--primary-blue), 0.3);
  padding-left: 12px;
  margin: 8px 0;
  color: var(--text-dark);
  opacity: 0.7;
}

.conversation-text-new :deep(a) {
  color: var(--primary-blue);
  text-decoration: none;
}

.conversation-text-new :deep(a:hover) {
  text-decoration: underline;
}

/* 调试信息样式 */
.thinking-block-new,
.query-details-new {
  margin-top: 12px;
  padding: 8px;
  background: rgba(var(--accent-purple), 0.1); /* 紫色系背景 */
  border: 1px solid rgba(var(--accent-purple), 0.3);
  border-radius: 6px;
  color: var(--text-dark);
  font-size: 0.8em; /* 调试信息小字体 */
}

.thinking-block-new summary,
.query-details-new summary {
  cursor: pointer;
  font-size: 1em; /* 继承父元素字体大小 */
  color: var(--primary-blue-dark);
  opacity: 0.7;
  user-select: none;
}

.thinking-block-new pre,
.query-details-new pre {
  margin-top: 8px;
  font-size: 0.9em; /* 调试代码更小 */
  background: rgba(0, 0, 0, 0.05); /* 浅色背景 */
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
  color: var(--primary-blue-dark); /* 绿色系调试文本 */
}

/* 快捷输入区 */
.quick-input-new {
  position: fixed;
  bottom: 30px;
  left: 50%;
  transform: translateX(-50%); /* 居中 */
  width: 90%;
  max-width: 600px;
  background: rgba(255, 255, 255, 0.9); /* 更明亮的背景 */
  backdrop-filter: blur(20px);
  border: 1px solid rgba(var(--primary-blue), 0.1);
  border-radius: 30px; /* 圆角胶囊形状 */
  padding: 12px 20px;
  display: flex;
  align-items: flex-end; /* 与按钮对齐 */
  gap: 12px;
  opacity: 0; /* 默认隐藏 */
  transform: translateX(-50%) translateY(100px); /* 默认位于屏幕外下方 */
  transition: all 0.3s ease; /* 平滑过渡 */
  z-index: 10;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.quick-input-new.visible {
  opacity: 1;
  transform: translateX(-50%) translateY(0); /* 显示时移入视图 */
}

.quick-input-new textarea {
  flex: 1;
  background: none;
  border: none;
  color: var(--text-dark); /* 文本颜色 */
  font-size: 16px;
  outline: none;
  resize: none;
  font-family: inherit;
  line-height: 1.5;
  max-height: 120px; /* 限制最大高度 */
  overflow-y: auto;
  padding: 0;
}

.quick-input-new textarea::placeholder {
  color: var(--text-dark);
  opacity: 0.4;
}

.send-btn-new {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary-blue), var(--primary-blue-dark)); /* 蓝色渐变发送按钮 */
  border: none;
  color: var(--text-light);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(var(--primary-blue), 0.2);
}

.send-btn-new:hover:not(:disabled) {
  background: linear-gradient(135deg, var(--secondary-blue), var(--primary-blue));
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(var(--primary-blue), 0.3);
}

.send-btn-new:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: linear-gradient(135deg, rgba(var(--primary-blue), 0.5), rgba(var(--primary-blue-dark), 0.5));
  box-shadow: none;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .top-bar-ai {
    padding: 15px 20px;
  }
  .app-title-ai {
    font-size: 18px;
  }
  .action-btn-ai {
    width: 36px;
    height: 36px;
    border-radius: 8px; /* 小屏幕下圆角小一点 */
  }

  .voice-orb-new {
    width: 150px;
    height: 150px;
  }

  .orb-core-new {
    width: 100px;
    height: 100px;
  }
  .voice-wave-new .wave-ring-new {
    width: 100px;
    height: 100px;
  }
  @keyframes waveExpand {
    0% {
      width: 100px;
      height: 100px;
      opacity: 1;
    }
    100% {
      width: 250px;
      height: 250px;
      opacity: 0;
    }
  }

  .spectrum-visualizer-new {
    width: 250px;
    bottom: -40px; /* 调整位置 */
  }

  .status-text-new {
    font-size: 16px;
    margin-top: 60px;
  }

  .main-control-new {
    gap: 15px;
  }
  .voice-button-new {
    width: 60px;
    height: 60px;
    font-size: 24px;
  }
  .secondary-btn-new {
    width: 40px;
    height: 40px;
    font-size: 18px;
  }

  .conversation-panel-new {
    width: 100%;
    right: -100%; /* 确保在小屏幕下完全隐藏 */
  }

  .quick-input-new {
    width: 95%;
    bottom: 20px;
    padding: 10px 15px;
  }
  .quick-input-new textarea {
    font-size: 14px;
  }
  .send-btn-new {
    width: 32px;
    height: 32px;
  }
}

/* 滚动条样式 */
.conversation-list-new::-webkit-scrollbar,
.quick-input-new textarea::-webkit-scrollbar,
.thinking-block-new pre::-webkit-scrollbar,
.query-details-new pre::-webkit-scrollbar {
  width: 6px;
  height: 6px; /* For horizontal scrollbars */
}

.conversation-list-new::-webkit-scrollbar-track,
.quick-input-new textarea::-webkit-scrollbar-track,
.thinking-block-new pre::-webkit-scrollbar-track,
.query-details-new pre::-webkit-scrollbar-track {
  background: rgba(var(--primary-blue), 0.05);
  border-radius: 3px;
}

.conversation-list-new::-webkit-scrollbar-thumb,
.quick-input-new textarea::-webkit-scrollbar-thumb,
.thinking-block-new pre::-webkit-scrollbar-thumb,
.query-details-new pre::-webkit-scrollbar-thumb {
  background: rgba(var(--primary-blue), 0.2);
  border-radius: 3px;
}

.conversation-list-new::-webkit-scrollbar-thumb:hover,
.quick-input-new textarea::-webkit-scrollbar-thumb:hover,
.thinking-block-new pre::-webkit-scrollbar-thumb:hover,
.query-details-new pre::-webkit-scrollbar-thumb:hover {
  background: rgba(var(--primary-blue), 0.3);
}
</style>