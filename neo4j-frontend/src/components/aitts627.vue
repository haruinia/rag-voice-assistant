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
        <!-- 语音识别模式切换 -->
        <button
          class="action-btn-ai"
          @click="toggleASRMode"
          :class="{ 'active-browser': useBrowserASR }"
          :title="useBrowserASR ? '切换到阿里云语音识别' : '切换到浏览器语音识别'"
        >
          <i :class="useBrowserASR ? 'fas fa-globe' : 'fas fa-cloud'"></i>
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
          :disabled="isTyping"
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
import { AlibabaSpeechService } from './AlibabaSpeechService.js'
import axios from 'axios'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

export default {
  name: 'AIAssistantWithTTS',
  setup() {
    // --- START: API CONFIGURATION ---
    // 知识库 API，保持不变
    const apiBaseUrl = ref('http://localhost:3000/api/data');

    // --- MODIFIED: Corrected environment variable access for Vue CLI/Webpack ---
    // DeepSeek API 配置
    // 从 .env.local 文件安全地读取 API Key (使用 process.env)
    const deepSeekApiKey = ref(process.env.VUE_APP_DEEPSEEK_API_KEY);
    // DeepSeek 官方 API 端点
    const aiApiUrl = ref('https://api.deepseek.com/v1/chat/completions');
    // DeepSeek 官方推荐的聊天模型
    const llmModel = ref('deepseek-chat');
    // --- END: API CONFIGURATION ---

    // 语音服务配置
    const alibabaSpeechConfig = {
      appKey: 'yXfaTeWXf28V9pEh',
      tokenApiUrl: 'http://localhost:3000/api/get-speech-token',
    };
    const speechService = ref(null);

    // 语音识别模式
    const useBrowserASR = ref(false); // 是否使用浏览器原生语音识别
    const browserRecognition = ref(null); // 浏览器语音识别实例

    // 聊天相关
    const chatMessages = ref([])
    const userInput = ref('')
    const internalStatusText = ref('准备就绪，点击麦克风开始对话');

    // 状态管理
    const isTyping = ref(false)
    const isListening = ref(false)
    const isTTSEnabled = ref(true)
    const isSpeakingOnlyTTS = ref(false)
    const isConnected = ref(false)
    const showHistory = ref(false)
    const showQuickInput = ref(false)
    const debug = ref(false)
    const interimTranscript = ref('')
    
    // 音频解锁相关状态
    const isAudioUnlocked = ref(false);
    const queuedWelcomeMessage = ref(null);

    // UI引用和频谱动画
    const spectrumVisualizer = ref(null)
    const conversationList = ref(null)
    const userInputArea = ref(null)
    const spectrumBars = ref([])
    const animationFrameId = ref(null)

    // 音频解锁函数
    const tryUnlockAudio = () => {
      if (isAudioUnlocked.value) return;
      isAudioUnlocked.value = true;
      console.log('Audio context unlock attempted.');
      
      if (queuedWelcomeMessage.value) {
        console.log('Playing queued welcome message.');
        startSpeaking(queuedWelcomeMessage.value, true);
        queuedWelcomeMessage.value = null;
      }
    };
    
    // TTS 播报函数
    const startSpeaking = (text, isSystemMessage = false) => {
      if (!isTTSEnabled.value || !text || text.trim().length === 0) {
        return;
      }
      
      if (isSystemMessage && !isAudioUnlocked.value) {
        console.log(`Audio not unlocked. Queuing welcome message: "${text}"`);
        queuedWelcomeMessage.value = text;
        return;
      }
      
      if (!speechService.value) {
          console.error("Speech service not available to speak.");
          return;
      }

      const cleanedText = cleanTextForSpeech(text);
      if (cleanedText) {
        speechService.value.synthesize(cleanedText);
      }
    };

    // 计算属性
    const getVoiceOverlayIcon = computed(() => {
        if (isListening.value) { return 'fas fa-stop' }
        else if (isTyping.value && !isSpeakingOnlyTTS.value) { return 'fas fa-spinner fa-spin' }
        else if (isSpeakingOnlyTTS.value) { return 'fas fa-volume-up' }
        return 'fas fa-microphone'
    });
    const getStatusText = computed(() => {
        if (interimTranscript.value) { return `"${interimTranscript.value}"`; }
        else if (isListening.value) { return '正在听取您的语音...'; }
        else if (isTyping.value && !isSpeakingOnlyTTS.value) { return '正在思考...'; }
        else if (isSpeakingOnlyTTS.value) { return '正在为您播报回答...'; }
        return internalStatusText.value;
    });

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
      startSpeaking(cleanTextForSpeech(content), true);
    }

    // 初始化浏览器语音识别
    const initBrowserSpeechRecognition = () => {
      if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
        console.log('Browser does not support Web Speech API');
        return null;
      }

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.lang = 'zh-CN';
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onstart = () => {
        console.log('Browser speech recognition started');
        isListening.value = true;
        startSpectrumAnimation();
      };

      recognition.onresult = (event) => {
        const current = event.resultIndex;
        const transcript = event.results[current][0].transcript;
        interimTranscript.value = transcript;
        
        if (event.results[current].isFinal) {
          userInput.value = transcript;
          sendMessage();
        }
      };

      recognition.onerror = (event) => {
        console.error('Browser speech recognition error:', event.error);
        let errorMessage = '';
        switch (event.error) {
          case 'network':
            errorMessage = '网络错误：无法连接到语音识别服务。请检查网络连接或尝试使用阿里云语音识别。';
            break;
          case 'no-speech':
            errorMessage = '未检测到语音输入，请重试。';
            break;
          case 'audio-capture':
            errorMessage = '无法访问麦克风，请检查麦克风权限。';
            break;
          case 'not-allowed':
            errorMessage = '麦克风权限被拒绝，请在浏览器设置中允许访问麦克风。';
            break;
          default:
            errorMessage = `语音识别错误: ${event.error}`;
        }
        addSystemMessage(errorMessage);
        isListening.value = false;
        stopSpectrumAnimation();
      };

      recognition.onend = () => {
        console.log('Browser speech recognition ended');
        isListening.value = false;
        interimTranscript.value = '';
        stopSpectrumAnimation();
      };

      return recognition;
    };

    // toggleListening 函数，支持两种语音识别方式
    const toggleListening = () => {
      tryUnlockAudio();

      if (isListening.value) {
        // 停止监听
        if (useBrowserASR.value && browserRecognition.value) {
          console.log('Stopping browser speech recognition');
          browserRecognition.value.stop();
        } else if (speechService.value) {
          console.log('User clicked stop button.');
          speechService.value.stop();
        }
        return;
      }

      if (isTyping.value || isSpeakingOnlyTTS.value) {
        console.log('Cannot start listening while AI is busy.');
        return;
      }

      console.log('Starting a new listening session...');
      userInput.value = ''; 
      interimTranscript.value = '';
      nextTick(() => { autoGrowTextarea() });

      // 根据配置选择使用哪种语音识别
      if (useBrowserASR.value) {
        if (!browserRecognition.value) {
          browserRecognition.value = initBrowserSpeechRecognition();
        }
        if (browserRecognition.value) {
          try {
            browserRecognition.value.start();
          } catch (e) {
            console.error('Failed to start browser speech recognition:', e);
            addSystemMessage('启动语音识别失败，请重试。');
          }
        } else {
          addSystemMessage('您的浏览器不支持语音识别功能。');
        }
      } else {
        if (!speechService.value) {
          addSystemMessage('语音服务未初始化。');
          return;
        }
        speechService.value.start();
      }
    };

    // 切换语音识别模式
    const toggleASRMode = () => {
      useBrowserASR.value = !useBrowserASR.value;
      const mode = useBrowserASR.value ? '浏览器内置语音识别' : '阿里云语音识别';
      addSystemMessage(`已切换到${mode}模式。`);
      
      // 如果正在录音，先停止
      if (isListening.value) {
        if (useBrowserASR.value && speechService.value) {
          speechService.value.stop();
        } else if (!useBrowserASR.value && browserRecognition.value) {
          browserRecognition.value.stop();
        }
      }
    };

    const sendMessage = async () => {
      tryUnlockAudio();
      if (isListening.value) {
        if (useBrowserASR.value && browserRecognition.value) {
          browserRecognition.value.stop();
        } else if (speechService.value) {
          speechService.value.stop();
        }
      }
      const userMessage = userInput.value.trim()
      if (!userMessage || isTyping.value) return

      if (isSpeakingOnlyTTS.value && speechService.value) {
        if(speechService.value.audioPlayer) speechService.value.audioPlayer.pause();
      }
      
      if (!deepSeekApiKey.value) {
        addSystemMessage('⚠️ 错误：未配置 DeepSeek API Key。请检查 .env.local 文件并重启服务。');
        return;
      }

      chatMessages.value.push({ role: 'user', content: userMessage, mainContent: userMessage })
      userInput.value = ''
      nextTick(() => { autoGrowTextarea() })
      isTyping.value = true
      scrollToBottom()

      const thinkingSteps = initializeThinkingSteps(userMessage)

      try {
        thinkingSteps.entityExtraction.attempted = true
        const extractedEntities = await extractEntitiesWithLLM(userMessage, thinkingSteps)
        thinkingSteps.entityExtraction.results = extractedEntities

        let knowledgeContext = ''
        let kgResult = null
        let kgSource = 'none'

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

        if (kgResult) {
          knowledgeContext = formatKnowledgeGraphResults(kgResult)
          thinkingSteps.knowledgeGraphLookup.resultSummary = `通过 ${kgSource} 方式查询 "${thinkingSteps.knowledgeGraphLookup.entityUsed}" 找到 ${kgResult.nodes?.length || 0} 个节点, ${kgResult.relationships?.length || 0} 条关系。`
          thinkingSteps.finalOutcome.source = 'knowledge_graph'
        } else {
          thinkingSteps.finalOutcome.source = 'model'
        }

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
  "entities": []}`;

      thinkingSteps.entityExtraction.prompt = prompt;
      try {
        const response = await axios.post(
          aiApiUrl.value,
          {
            model: llmModel.value,
            messages: [{ role: 'user', content: prompt }],
            stream: false,
            response_format: { type: "json_object" }
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${deepSeekApiKey.value}`
            }
          }
        );
        
        const llmContent = response.data.choices[0].message.content;
        thinkingSteps.entityExtraction.rawResponse = llmContent;
        
        const extractedData = extractJSONFromLLMResponse(llmContent);
        if (extractedData && Array.isArray(extractedData.entities) && extractedData.entities.every(e => typeof e === 'string')) {
          const validEntities = extractedData.entities
            .map(name => name.trim())
            .filter(name => name.length >= 2 && name.length < 50);
          return validEntities.map(name => ({ name: name, confidence: null }));
        } else {
          thinkingSteps.entityExtraction.error = "LLM 返回格式不正确或未提取到实体";
          return [];
        }
      } catch (error) {
        console.error('实体提取失败:', error.response?.data || error.message);
        const errorMessage = error.response?.data?.error?.message || error.message;
        thinkingSteps.entityExtraction.error = `LLM API 调用失败: ${errorMessage}`;
        return [];
      }
    }

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
    const formatKnowledgeGraphResults = (data) => {
      let context = ''
      const nodesById = new Map()
      if (data.nodes && data.nodes.length > 0) {
        context += '【相关实体信息】:\n'
        data.nodes.forEach(node => {
          nodesById.set(node.id, node)
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

    const streamLLMResponse = async (finalPrompt, assistantMessage) => {
      try {
        const response = await axios.post(
          aiApiUrl.value,
          {
            model: llmModel.value,
            messages: [{ role: 'user', content: finalPrompt }],
            stream: true,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${deepSeekApiKey.value}`
            },
            responseType: 'text' // Important for streaming
          }
        );

        let streamedContent = '';
        let mainContentAccumulator = '';
        let thinkingContentAccumulator = '';
        let inThinkingBlock = false;

        const lines = response.data.split('\n');

        for (const line of lines) {
          if (!line.trim() || !line.startsWith('data: ')) {
            continue;
          }

          if (line === 'data: [DONE]') {
            break;
          }
          
          try {
            const data = JSON.parse(line.substring(6));
            const chunk = data.choices[0]?.delta?.content || '';

            if (chunk) {
              streamedContent += chunk;
              assistantMessage.content = streamedContent;

              let currentChunkPos = 0;
              while (currentChunkPos < chunk.length) {
                if (inThinkingBlock) {
                  const endTagIndex = chunk.indexOf('</think>', currentChunkPos);
                  if (endTagIndex !== -1) {
                    thinkingContentAccumulator += chunk.substring(currentChunkPos, endTagIndex);
                    inThinkingBlock = false;
                    currentChunkPos = endTagIndex + '</think>'.length;
                  } else {
                    thinkingContentAccumulator += chunk.substring(currentChunkPos);
                    currentChunkPos = chunk.length;
                  }
                } else {
                  const startTagIndex = chunk.indexOf('<think>', currentChunkPos);
                  if (startTagIndex !== -1) {
                    mainContentAccumulator += chunk.substring(currentChunkPos, startTagIndex);
                    inThinkingBlock = true;
                    currentChunkPos = startTagIndex + '<think>'.length;
                  } else {
                    mainContentAccumulator += chunk.substring(currentChunkPos);
                    currentChunkPos = chunk.length;
                  }
                }
              }
              assistantMessage.mainContent = mainContentAccumulator;
              assistantMessage.thinkingContent = thinkingContentAccumulator;
              assistantMessage.hasThinking = thinkingContentAccumulator.trim().length > 0;

              scrollToBottom();
            }
            if (data.choices[0]?.finish_reason) {
              break;
            }
          } catch (e) {
            console.warn("非JSON行或解析错误:", line, e);
          }
        }

        const finalParsed = parseThinkTags(streamedContent);
        assistantMessage.content = streamedContent.trim();
        assistantMessage.mainContent = finalParsed.mainContent;
        assistantMessage.thinkingContent = finalParsed.thinkingContent;
        assistantMessage.hasThinking = finalParsed.hasThinking;
        if (assistantMessage.thinkingSteps) {
          assistantMessage.thinkingSteps.answerGeneration.llmResponse = streamedContent.trim();
          assistantMessage.thinkingSteps.finalOutcome.source = assistantMessage.source;
        }

        scrollToBottom();

        if (isTTSEnabled.value && assistantMessage.mainContent && assistantMessage.role === 'assistant') {
          startSpeaking(cleanTextForSpeech(assistantMessage.mainContent), false);
        }

      } catch (error) {
        console.error('LLM 流式响应失败:', error.response?.data || error.message);
        const errorMessage = error.response?.data?.error?.message || error.message;
        const finalErrorMessage = `抱歉，我在尝试回答时遇到了一个内部错误。(${errorMessage})`;
        
        if (assistantMessage) {
          assistantMessage.content = finalErrorMessage;
          assistantMessage.mainContent = `抱歉，我在尝试回答时遇到了一个内部错误。`;
          assistantMessage.source = 'error';
          if (assistantMessage.thinkingSteps) {
            assistantMessage.thinkingSteps.answerGeneration.error = `LLM API 调用失败: ${errorMessage}`;
            assistantMessage.thinkingSteps.finalOutcome.source = 'error';
            assistantMessage.thinkingSteps.finalOutcome.errorMessage = errorMessage;
          }
        } else {
          chatMessages.value.push({ role: 'assistant', content: finalErrorMessage, mainContent: `抱歉，我在尝试回答时遇到了一个内部错误。`, source: 'error', hasThinking: false });
        }
        if (isTTSEnabled.value) {
          startSpeaking(cleanTextForSpeech(finalErrorMessage), false);
        }
        scrollToBottom();
      } finally {
        isTyping.value = false;
      }
    };

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
      return { mainContent: mainContent, thinkingContent: thinkingContent, hasThinking: thinkingContent.length > 0 }
    }
    const cleanTextForSpeech = (markdownText) => {
      if (!markdownText) return ''
      let text = markdownText
      text = text.replace(/```[\s\S]*?```/g, ' (代码部分) ');
      text = text.replace(/`([^`]+)`/g, '$1');
      text = text.replace(/!\[(.*?)\]\(.*?\)/g, '(图片: $1) ');
      text = text.replace(/\[(.*?)\]\(.*?\)/g, '$1');
      text = text.replace(/^#{1,6}\s+/gm, '');
      text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
      text = text.replace(/(\*|_)(.*?)\1/g, '$2');
      text = text.replace(/^(-{3,}|\*{3,}|_{3,})$/gm, '');
      text = text.replace(/^\s*[*+-]\s+/gm, ' ');
      text = text.replace(/^\s*\d+\.\s+/gm, ' ');
      text = text.replace(/<\/?[^>]+(>|$)/g, "");
      text = text.replace(/(\r\n|\n|\r)/gm, " ").replace(/\s+/g, ' ').trim();
      return text
    }
    const showError = (error, thinkingSteps) => {
      const errorMessage = error.response?.data?.error?.message || error.response?.data?.message || error.message
      const errorDetails = debug.value ? `\n\n调试信息：${JSON.stringify(error.response?.data || error, null, 2)}` : ''
      const fullUserMessage = `抱歉，处理您的请求时遇到了问题：${errorMessage}${errorDetails}`

      const errorMsgObject = {
        role: 'assistant',
        content: fullUserMessage,
        mainContent: `抱歉，我在尝试回答时遇到了一个内部错误。`,
        source: 'error',
        thinkingSteps: thinkingSteps
      }
      chatMessages.value.push(errorMsgObject)
      nextTick(() => { scrollToBottom() })
      if (isTTSEnabled.value) {
        startSpeaking(cleanTextForSpeech(errorMsgObject.mainContent), false)
      }
    }
    const testDatabaseConnection = async () => {
      try {
        const response = await axios.get(apiBaseUrl.value, { timeout: 5000 })
        if (response.status === 200) {
          isConnected.value = true
          addSystemMessage('文物保护智能平台连接成功！')
        } else {
          throw new Error(`连接测试返回状态码: ${response.status}`)
        }
      } catch (error) {
        isConnected.value = false
        addSystemMessage('⚠️ 无法连接到知识库，部分功能可能受限。')
      }
    }
    const formatMessage = (content) => {
      if (!content) return ''
      const html = marked.parse(content)
      return DOMPurify.sanitize(html)
    }
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
      nextTick(() => { autoGrowTextarea() })
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
      if (!isTTSEnabled.value && speechService.value) {
        if(speechService.value.audioPlayer) speechService.value.audioPlayer.pause();
      }
    }
    const toggleHistory = () => {
      showHistory.value = !showHistory.value
    }
    const closeHistory = () => {
      showHistory.value = false
    }
    const toggleQuickInput = () => {
      tryUnlockAudio();
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
      if (confirm('确定要清除所有对话记录吗？此操作不可撤销。')) {
        chatMessages.value = []
        addSystemMessage('所有对话记录已清除。')
      }
    }
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
        case 'system': return 'fas fa-info-circle'
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
    const createSpectrumBars = () => {
      if (!spectrumVisualizer.value) return
      if (spectrumBars.value.length > 0) return;
      const numBars = 30;
      for (let i = 0; i < numBars; i++) {
        const bar = document.createElement('div')
        bar.className = 'spectrum-bar-new'
        bar.style.height = '5px'
        bar.style.animationDelay = `${i * 0.03}s`;
        spectrumVisualizer.value.appendChild(bar)
        spectrumBars.value.push(bar)
      }
    }
    const startSpectrumAnimation = () => {
      if (animationFrameId.value) {
        cancelAnimationFrame(animationFrameId.value)
      }
      const animate = () => {
        if (!isListening.value) {
            stopSpectrumAnimation();
            return;
        }
        spectrumBars.value.forEach(bar => {
          const height = Math.random() * 60 + 5
          bar.style.height = `${height}px`
        })
        animationFrameId.value = requestAnimationFrame(animate)
      }
      animationFrameId.value = requestAnimationFrame(animate)
    }
    const stopSpectrumAnimation = () => {
      if (animationFrameId.value) {
        cancelAnimationFrame(animationFrameId.value)
        animationFrameId.value = null
      }
      spectrumBars.value.forEach(bar => {
        bar.style.height = '5px'
      })
    }
    
    const initializeApp = () => {
      // Check for API Key on load
      if (!deepSeekApiKey.value) {
        console.error("VUE_APP_DEEPSEEK_API_KEY is not set in your .env.local file.");
        addSystemMessage('⚠️ 错误：未配置大模型 API Key。请在 .env.local 文件中设置 VUE_APP_DEEPSEEK_API_KEY 并重启服务。');
      }

      // 检测浏览器语音识别支持
      const hasBrowserSpeechSupport = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
      
      // 先尝试初始化阿里云语音服务
      speechService.value = new AlibabaSpeechService(alibabaSpeechConfig);
      
      // 设置阿里云语音服务的回调
      speechService.value.onRecognitionStarted = () => { 
        isListening.value = true; 
        startSpectrumAnimation(); 
      };
      speechService.value.onRecognitionResultChange = (text) => { 
        interimTranscript.value = text; 
      };
      speechService.value.onRecognitionCompleted = (text) => {
        if (text && text.trim()) {
          userInput.value = text.trim();
          sendMessage();
        }
      };
      speechService.value.onRecordingStop = () => { 
        isListening.value = false; 
        interimTranscript.value = ''; 
        stopSpectrumAnimation(); 
      };
      speechService.value.onTTSSpeaking = (speaking) => { 
        isSpeakingOnlyTTS.value = speaking; 
      };
      speechService.value.onError = (error) => { 
        addSystemMessage(`语音服务遇到问题: ${error}`); 
        isListening.value = false; 
        isSpeakingOnlyTTS.value = false; 
        stopSpectrumAnimation(); 
        
        // 如果阿里云服务失败，提示用户可以切换到浏览器语音识别
        if (!useBrowserASR.value && hasBrowserSpeechSupport) {
          addSystemMessage('您可以尝试切换到浏览器内置语音识别（点击云朵按钮切换）。');
        }
      };

      // 欢迎消息
      let welcomeMessage = '您好！我是文物领域智能语音助手，请问有什么可以帮您的？';
      if (!hasBrowserSpeechSupport) {
        welcomeMessage += '\n提示：您的浏览器不支持内置语音识别，建议使用Chrome或Edge浏览器。';
      } else {
        welcomeMessage += '点击麦克风图标可以开始语音输入。';
      }
      addSystemMessage(welcomeMessage);
      
      testDatabaseConnection();
    }

    onMounted(() => {
      initializeApp()
      createSpectrumBars()
    });

    onUnmounted(() => {
      if (animationFrameId.value) { cancelAnimationFrame(animationFrameId.value) }
      if (speechService.value && speechService.value.isRecording) { speechService.value.stop(); }
      if (browserRecognition.value) { browserRecognition.value.abort(); }
    });

    return {
      chatMessages, userInput, interimTranscript, isTyping, isListening, isTTSEnabled,
      isSpeakingOnlyTTS, isConnected, showHistory, showQuickInput, debug, useBrowserASR,
      speechRecognitionSupported: ref(true),
      getVoiceOverlayIcon, getStatusText, spectrumVisualizer, conversationList, userInputArea,
      toggleListening, sendMessage, toggleTTS, toggleHistory, closeHistory, toggleQuickInput,
      toggleDebug, toggleASRMode, clearConversations, formatMessage, autoGrowTextarea, handleKeydown,
      getRoleIcon, getRoleName, getSourceIcon, getSourceName,
    };
  }
}
</script>

<style scoped>
/* 样式部分保持不变，所以省略以节省空间 */
/* The <style> part remains unchanged. */
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
/* 顶部栏 */
.top-bar-ai {
  position: relative; /* 确保在背景之上 */
  z-index: 10;
  padding: 20px 30px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: transparent; /* 完全透明背景，融合到动态背景中 */
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
.action-btn-ai.active-browser {
  background: rgba(255, 152, 0, 0.2); /* 橙色 */
  color: #ff9800;
  border-color: rgba(255, 152, 0, 0.5);
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
  top: 80px; /* 从顶部栏下方开始 */
  right: -400px; /* 默认隐藏在右侧 */
  width: 400px;
  height: calc(100vh - 80px); /* 高度适应新的起始位置 */
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(20px);
  border-left: 1px solid rgba(var(--primary-blue), 0.1);
  border-top: 1px solid rgba(var(--primary-blue), 0.1); /* 添加顶部边框 */
  border-top-left-radius: 12px; /* 左上角圆角 */
  transition: right 0.3s ease;
  z-index: 15;
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.1);
  color: var(--text-dark);
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