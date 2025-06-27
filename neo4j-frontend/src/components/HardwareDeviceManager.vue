<template>
  <div class="hardware-manager">
    <!-- 动态背景 -->
    <div class="background-gradient"></div>

    <!-- 头部 -->
    <div class="header">
      <h1 class="title">硬件设备管理</h1>
      <p class="subtitle">管理和监控您的 M5EchoBase 和 S3R 设备</p>
    </div>

    <!-- 统计卡片 -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon">
          <i class="fas fa-microchip"></i>
        </div>
        <div class="stat-info">
          <p class="stat-label">设备总数</p>
          <p class="stat-value">{{ devices.length }}</p>
        </div>
      </div>
      
      <div class="stat-card">
        <div class="stat-icon online">
          <i class="fas fa-wifi"></i>
        </div>
        <div class="stat-info">
          <p class="stat-label">在线设备</p>
          <p class="stat-value">{{ onlineDevices }}</p>
        </div>
      </div>
      
      <div class="stat-card">
        <div class="stat-icon listening">
          <i class="fas fa-microphone"></i>
        </div>
        <div class="stat-info">
          <p class="stat-label">正在监听</p>
          <p class="stat-value">{{ listeningDevices }}</p>
        </div>
      </div>
      
      <div class="stat-card">
        <div class="stat-icon speaking">
          <i class="fas fa-volume-up"></i>
        </div>
        <div class="stat-info">
          <p class="stat-label">正在播放</p>
          <p class="stat-value">{{ speakingDevices }}</p>
        </div>
      </div>
    </div>

    <div class="main-content">
      <!-- 设备列表 -->
      <div class="device-section">
        <div class="section-header">
          <h2 class="section-title">设备列表</h2>
          <button @click="fetchDevices" class="refresh-btn" :disabled="loading">
            <i class="fas fa-sync-alt" :class="{ 'fa-spin': loading }"></i>
            刷新
          </button>
        </div>
        
        <div class="device-list">
          <div v-if="loading" class="loading-state">
            <i class="fas fa-spinner fa-spin"></i>
            <p>加载设备列表...</p>
          </div>
          
          <div v-else-if="devices.length === 0" class="empty-state">
            <i class="fas fa-mobile-alt"></i>
            <p>未发现设备</p>
            <p class="empty-subtitle">请连接您的 M5EchoBase 或 S3R 设备</p>
          </div>
          
          <div v-else class="device-cards">
            <div
              v-for="device in devices"
              :key="device.id"
              class="device-card"
              :class="{ 
                'selected': selectedDevice?.id === device.id,
                'online': device.isConnected,
                'offline': !device.isConnected
              }"
              @click="selectDevice(device)"
            >
              <div class="device-header">
                <div class="device-info">
                  <div class="device-icon">
                    <i class="fas fa-mobile-alt"></i>
                    <div class="status-dot" :class="getStatusClass(device)"></div>
                  </div>
                  <div class="device-details">
                    <h3 class="device-name">{{ device.id }}</h3>
                    <p class="device-status">{{ getStatusText(device) }}</p>
                  </div>
                </div>
                
                <div class="device-indicators">
                  <i v-if="device.isListening" class="fas fa-microphone indicator listening"></i>
                  <i v-if="device.isSpeaking" class="fas fa-volume-up indicator speaking"></i>
                  <i 
                    class="fas indicator" 
                    :class="device.isConnected ? 'fa-wifi online' : 'fa-wifi-slash offline'"
                  ></i>
                </div>
              </div>
              
              <div v-if="device.lastSeen" class="device-footer">
                <p class="last-seen">
                  最后活跃: {{ formatTime(device.lastSeen) }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 设备控制面板 -->
      <div class="control-section">
        <div class="section-header">
          <h2 class="section-title">
            设备控制
            <span v-if="selectedDevice" class="selected-device">
              - {{ selectedDevice.id }}
            </span>
          </h2>
        </div>
        
        <div class="control-panel">
          <div v-if="!selectedDevice" class="no-selection">
            <i class="fas fa-hand-pointer"></i>
            <p>请选择一个设备进行控制</p>
          </div>
          
          <div v-else class="control-content">
            <!-- 设备状态显示 -->
            <div class="status-display">
              <h3 class="control-subtitle">设备状态</h3>
              <div class="status-grid">
                <div class="status-item">
                  <div class="status-dot" :class="getStatusClass(selectedDevice)"></div>
                  <span>{{ getStatusText(selectedDevice) }}</span>
                </div>
                <div class="status-item">
                  <i class="fas fa-clock"></i>
                  <span>{{ connectionStatus === 'connected' ? '已连接' : '未连接' }}</span>
                </div>
              </div>
            </div>

            <!-- 控制按钮 -->
            <div class="control-buttons">
              <h3 class="control-subtitle">设备控制</h3>
              <div class="button-grid">
                <button
                  @click="sendControlCommand('start_listening')"
                  :disabled="selectedDevice.isListening"
                  class="control-btn start-btn"
                >
                  <i class="fas fa-microphone"></i>
                  开始监听
                </button>
                
                <button
                  @click="sendControlCommand('stop_listening')"
                  :disabled="!selectedDevice.isListening"
                  class="control-btn stop-btn"
                >
                  <i class="fas fa-microphone-slash"></i>
                  停止监听
                </button>
                
                <button
  @click="reconnectDevice"
  class="control-btn"
  style="background: linear-gradient(135deg, #2196F3, #1976D2);"
>
  <i class="fas fa-sync"></i>
  重新连接
</button>

                <button
                  @click="sendControlCommand('stop_speaking')"
                  :disabled="!selectedDevice.isSpeaking"
                  class="control-btn mute-btn"
                >
                  <i class="fas fa-volume-mute"></i>
                  停止播放
                </button>
                
                <button
                  @click="sendControlCommand('reset')"
                  class="control-btn reset-btn"
                >
                  <i class="fas fa-redo"></i>
                  重置设备
                </button>
              </div>
            </div>

            <!-- 测试功能 -->
            <div class="test-section">
              <h3 class="control-subtitle">功能测试</h3>
              <button
                @click="testConversation"
                :disabled="!selectedDevice.isConnected"
                class="test-btn"
              >
                <i class="fas fa-comments"></i>
                测试对话功能
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 事件日志 -->
    <div class="log-section">
      <div class="section-header">
        <h2 class="section-title">事件日志</h2>
        <button @click="clearLogs" class="clear-btn">
          <i class="fas fa-trash"></i>
          清空日志
        </button>
      </div>
      
      <div class="log-container">
        <div v-if="eventLogs.length === 0" class="empty-logs">
          <i class="fas fa-clipboard-list"></i>
          <p>暂无事件日志</p>
        </div>
        
        <div v-else class="log-list">
          <div
            v-for="log in eventLogs"
            :key="log.id"
            class="log-item"
            :class="log.type"
          >
            <div class="log-icon">
              <i 
                class="fas" 
                :class="{
                  'fa-exclamation-circle': log.type === 'error',
                  'fa-check-circle': log.type === 'success',
                  'fa-info-circle': log.type === 'info'
                }"
              ></i>
            </div>
            <div class="log-content">
              <span class="log-time">{{ log.timestamp }}</span>
              <span class="log-message">{{ log.message }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted } from 'vue'

export default {
  name: 'HardwareDeviceManager',
  setup() {
    // 响应式数据
    const devices = ref([])
    const selectedDevice = ref(null)
    const loading = ref(true)
    const connectionStatus = ref('disconnected')
    const eventLogs = ref([])
    const eventSource = ref(null)

    // 计算属性
    const onlineDevices = computed(() => {
      return devices.value.filter(d => d.isConnected).length
    })

    const listeningDevices = computed(() => {
      return devices.value.filter(d => d.isListening).length
    })

    const speakingDevices = computed(() => {
      return devices.value.filter(d => d.isSpeaking).length
    })

// 2. 修复 fetchDevices 函数，自动选择第一个设备
const fetchDevices = async () => {
  loading.value = true
  try {
    const response = await fetch('http://localhost:3000/api/hardware/devices')
    const data = await response.json()
    if (data.success) {
      devices.value = data.devices
      
      // 如果有设备且没有选中设备，自动选择第一个
      if (devices.value.length > 0 && !selectedDevice.value) {
        selectDevice(devices.value[0])
      }
      
      addEventLog('success', `获取到 ${devices.value.length} 个设备`)
    }
  } catch (error) {
    console.error('Failed to fetch devices:', error)
    addEventLog('error', '获取设备列表失败: ' + error.message)
  } finally {
    loading.value = false
  }
}

  // 1. 修复 selectDevice 函数，自动连接设备
const selectDevice = (device) => {
  selectedDevice.value = device
  addEventLog('info', `选择设备: ${device.id}`)
  
  // 自动连接到设备流，无论设备当前状态如何
  connectToDeviceStream(device.id)
}


// 3. 改进 connectToDeviceStream 函数
const connectToDeviceStream = (deviceId) => {
  if (eventSource.value) {
    eventSource.value.close()
  }

  addEventLog('info', `连接设备事件流: ${deviceId}`)
  
  const es = new EventSource(`http://localhost:3000/api/hardware/devices/${deviceId}/stream`)
  eventSource.value = es

  es.onopen = () => {
    connectionStatus.value = 'connected'
    addEventLog('success', `成功连接到设备 ${deviceId}`)
    
    // 强制更新设备状态为在线
    updateDeviceInList(deviceId, { isConnected: true, status: 'online' })
  }

  es.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      handleDeviceEvent(deviceId, data)
    } catch (error) {
      console.error('Failed to parse device event:', error)
      addEventLog('error', '解析设备事件失败')
    }
  }

  es.onerror = (error) => {
    console.error('SSE Error:', error)
    connectionStatus.value = 'error'
    addEventLog('error', `设备 ${deviceId} 连接失败，将重试...`)
    
    // 自动重试连接
    setTimeout(() => {
      if (!eventSource.value || eventSource.value.readyState === EventSource.CLOSED) {
        addEventLog('info', `重试连接设备 ${deviceId}`)
        connectToDeviceStream(deviceId)
      }
    }, 5000)
  }
}


// 4. 新增辅助函数：更新设备列表中的设备状态
const updateDeviceInList = (deviceId, updates) => {
  const deviceIndex = devices.value.findIndex(d => d.id === deviceId)
  if (deviceIndex !== -1) {
    devices.value[deviceIndex] = { 
      ...devices.value[deviceIndex], 
      ...updates,
      lastSeen: new Date()
    }
    
    // 同时更新选中的设备
    if (selectedDevice.value && selectedDevice.value.id === deviceId) {
      selectedDevice.value = { ...selectedDevice.value, ...updates }
    }
  } else {
    // 如果设备不在列表中，添加它
    const newDevice = {
      id: deviceId,
      status: 'online',
      isConnected: true,
      isListening: false,
      isSpeaking: false,
      currentTask: null,
      lastSeen: new Date(),
      ...updates
    }
    devices.value.push(newDevice)
    addEventLog('success', `发现新设备: ${deviceId}`)
  }
}

// 5. 改进 handleDeviceEvent 函数
const handleDeviceEvent = (deviceId, data) => {
  switch (data.type) {
    case 'connected':
      addEventLog('success', `设备 ${deviceId} 已连接`)
      updateDeviceInList(deviceId, { isConnected: true, status: 'online' })
      break
    case 'status':
      updateDeviceInList(deviceId, data)
      addEventLog('info', `设备 ${deviceId} 状态: ${getStatusText(data)}`)
      break
    case 'heartbeat':
      // 心跳更新最后活跃时间
      updateDeviceInList(deviceId, { lastSeen: new Date() })
      break
    default:
      addEventLog('info', `设备 ${deviceId}: ${data.type}`)
  }
}

const reconnectDevice = () => {
  if (selectedDevice.value) {
    addEventLog('info', `手动重连设备: ${selectedDevice.value.id}`)
    connectToDeviceStream(selectedDevice.value.id)
  }
}

    const updateDeviceStatus = (deviceId, statusData) => {
      const deviceIndex = devices.value.findIndex(d => d.id === deviceId)
      if (deviceIndex !== -1) {
        devices.value[deviceIndex] = { 
          ...devices.value[deviceIndex], 
          ...statusData, 
          isConnected: true 
        }
        
        // 更新选中设备的状态
        if (selectedDevice.value && selectedDevice.value.id === deviceId) {
          selectedDevice.value = { ...selectedDevice.value, ...statusData, isConnected: true }
        }
      }
    }

    const sendControlCommand = async (action) => {
      if (!selectedDevice.value) return

      try {
        const response = await fetch(`http://localhost:3000/api/hardware/devices/${selectedDevice.value.id}/control`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action }),
        })

        const data = await response.json()
        if (data.success) {
          addEventLog('success', `命令 ${action} 已发送到 ${selectedDevice.value.id}`)
        } else {
          addEventLog('error', `发送命令 ${action} 失败: ${data.error}`)
        }
      } catch (error) {
        console.error('Control command failed:', error)
        addEventLog('error', `控制命令失败: ${error.message}`)
      }
    }

    const testConversation = async () => {
      if (!selectedDevice.value) return

      try {
        const testMessage = '你好，请介绍一下文物保护的重要性'
        
        const response = await fetch(`http://localhost:3000/api/hardware/devices/${selectedDevice.value.id}/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            message: testMessage,
            sessionId: `test-${Date.now()}`
          }),
        })

        const data = await response.json()
        if (data.success) {
          addEventLog('success', `测试对话完成 - ${selectedDevice.value.id}`)
          addEventLog('info', `问: ${testMessage}`)
          addEventLog('info', `答: ${data.response.substring(0, 100)}...`)
        } else {
          addEventLog('error', `测试对话失败: ${data.error}`)
        }
      } catch (error) {
        console.error('Test conversation failed:', error)
        addEventLog('error', `测试对话失败: ${error.message}`)
      }
    }

    const addEventLog = (type, message) => {
      const newLog = {
        id: Date.now(),
        type,
        message,
        timestamp: new Date().toLocaleTimeString()
      }
      eventLogs.value.unshift(newLog)
      if (eventLogs.value.length > 50) {
        eventLogs.value = eventLogs.value.slice(0, 50)
      }
    }

    const clearLogs = () => {
      eventLogs.value = []
    }

    const getStatusClass = (device) => {
      if (!device.isConnected) return 'offline'
      if (device.currentTask) return 'processing'
      if (device.isListening) return 'listening'
      if (device.isSpeaking) return 'speaking'
      return 'online'
    }

    const getStatusText = (device) => {
      if (!device.isConnected) return '离线'
      if (device.currentTask) return `处理中: ${device.currentTask}`
      if (device.isListening) return '监听中'
      if (device.isSpeaking) return '播放中'
      return '在线'
    }

    const formatTime = (timeString) => {
      return new Date(timeString).toLocaleString()
    }

    // 生命周期
onMounted(() => {
  fetchDevices()
  
  // 定期检查和更新设备状态
  const interval = setInterval(() => {
    fetchDevices()
    
    // 如果有选中设备但连接断开，尝试重连
    if (selectedDevice.value && connectionStatus.value !== 'connected') {
      addEventLog('info', '检测到连接断开，尝试重连...')
      connectToDeviceStream(selectedDevice.value.id)
    }
  }, 10000) // 每10秒检查一次
  
  return () => clearInterval(interval)
})


    onUnmounted(() => {
      if (eventSource.value) {
        eventSource.value.close()
      }
    })

    return {
      // 数据
      devices,
      selectedDevice,
      loading,
      connectionStatus,
      eventLogs,
      
      // 计算属性
      onlineDevices,
      listeningDevices,
      speakingDevices,
      
      // 方法
      fetchDevices,
      selectDevice,
      sendControlCommand,
      testConversation,
      addEventLog,
      clearLogs,
      getStatusClass,
      getStatusText,
      formatTime
    }
  }
}
</script>

<style scoped>
.hardware-manager {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
  position: relative;
  overflow-x: hidden;
}

.background-gradient {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: 
    radial-gradient(circle at 20% 30%, rgba(255, 255, 255, 0.1) 0%, transparent 50%),
    radial-gradient(circle at 80% 70%, rgba(255, 255, 255, 0.08) 0%, transparent 50%);
  z-index: 0;
  pointer-events: none;
}

.header {
  text-align: center;
  margin-bottom: 30px;
  position: relative;
  z-index: 1;
}

.title {
  font-size: 2.5rem;
  font-weight: 700;
  color: white;
  margin-bottom: 10px;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.subtitle {
  font-size: 1.1rem;
  color: rgba(255, 255, 255, 0.9);
  margin: 0;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
  position: relative;
  z-index: 1;
}

.stat-card {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  padding: 20px;
  display: flex;
  align-items: center;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.stat-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.15);
}

.stat-icon {
  width: 60px;
  height: 60px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 15px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  font-size: 24px;
}

.stat-icon.online {
  background: linear-gradient(135deg, #4CAF50, #45a049);
}

.stat-icon.listening {
  background: linear-gradient(135deg, #FF9800, #F57C00);
}

.stat-icon.speaking {
  background: linear-gradient(135deg, #9C27B0, #7B1FA2);
}

.stat-info {
  flex: 1;
}

.stat-label {
  font-size: 0.9rem;
  color: #666;
  margin: 0 0 5px 0;
}

.stat-value {
  font-size: 2rem;
  font-weight: 700;
  color: #333;
  margin: 0;
}

.main-content {
  display: grid;
  grid-template-columns: 1fr 400px;
  gap: 30px;
  margin-bottom: 30px;
  position: relative;
  z-index: 1;
}

.device-section, .control-section, .log-section {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  padding: 25px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 2px solid #f0f0f0;
}

.section-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: #333;
  margin: 0;
}

.selected-device {
  font-size: 1rem;
  color: #667eea;
  font-weight: normal;
}

.refresh-btn, .clear-btn {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.refresh-btn:hover, .clear-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.refresh-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.loading-state, .empty-state, .no-selection, .empty-logs {
  text-align: center;
  padding: 40px 20px;
  color: #666;
}

.loading-state i, .empty-state i, .no-selection i, .empty-logs i {
  font-size: 48px;
  color: #ddd;
  margin-bottom: 15px;
}

.empty-subtitle {
  font-size: 0.9rem;
  color: #999;
  margin-top: 5px;
}

.device-cards {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.device-card {
  border: 2px solid #e0e0e0;
  border-radius: 12px;
  padding: 20px;
  cursor: pointer;
  transition: all 0.3s ease;
  background: white;
}

.device-card:hover {
  border-color: #667eea;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.device-card.selected {
  border-color: #667eea;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.1), rgba(118, 75, 162, 0.1));
}

.device-card.offline {
  opacity: 0.7;
}

.device-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.device-info {
  display: flex;
  align-items: center;
  gap: 15px;
}

.device-icon {
  position: relative;
  font-size: 24px;
  color: #667eea;
}

.status-dot {
  position: absolute;
  top: -5px;
  right: -5px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid white;
}

.status-dot.online {
  background-color: #4CAF50;
}

.status-dot.offline {
  background-color: #f44336;
}

.status-dot.listening {
  background-color: #FF9800;
  animation: pulse 1.5s infinite;
}

.status-dot.speaking {
  background-color: #9C27B0;
  animation: pulse 1.5s infinite;
}

.status-dot.processing {
  background-color: #2196F3;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.2); opacity: 0.7; }
  100% { transform: scale(1); opacity: 1; }
}

.device-name {
  font-size: 1.1rem;
  font-weight: 600;
  color: #333;
  margin: 0;
}

.device-status {
  font-size: 0.9rem;
  color: #666;
  margin: 0;
}

.device-indicators {
  display: flex;
  gap: 10px;
}

.indicator {
  font-size: 16px;
}

.indicator.listening {
  color: #FF9800;
}

.indicator.speaking {
  color: #9C27B0;
}

.indicator.online {
  color: #4CAF50;
}

.indicator.offline {
  color: #f44336;
}

.device-footer {
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px solid #f0f0f0;
}

.last-seen {
  font-size: 0.8rem;
  color: #999;
  margin: 0;
}

.control-panel {
  min-height: 400px;
}

.control-content {
  display: flex;
  flex-direction: column;
  gap: 25px;
}

.control-subtitle {
  font-size: 1.1rem;
  font-weight: 600;
  color: #333;
  margin: 0 0 15px 0;
}

.status-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  color: #666;
}

.button-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.control-btn {
  padding: 12px 16px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-weight: 500;
}

.start-btn {
  background: linear-gradient(135deg, #4CAF50, #45a049);
  color: white;
}

.stop-btn {
  background: linear-gradient(135deg, #f44336, #d32f2f);
  color: white;
}

.mute-btn {
  background: linear-gradient(135deg, #FF9800, #F57C00);
  color: white;
}

.reset-btn {
  background: linear-gradient(135deg, #9E9E9E, #757575);
  color: white;
}

.control-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.control-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.test-btn {
  width: 100%;
  padding: 15px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  transition: all 0.3s ease;
  font-weight: 500;
}

.test-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.test-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.log-section {
  position: relative;
  z-index: 1;
}

.log-container {
  max-height: 300px;
  overflow-y: auto;
}

.log-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.log-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  font-size: 14px;
}

.log-item.error {
  background: rgba(244, 67, 54, 0.1);
  color: #d32f2f;
}

.log-item.success {
  background: rgba(76, 175, 80, 0.1);
  color: #388e3c;
}

.log-item.info {
  background: rgba(33, 150, 243, 0.1);
  color: #1976d2;
}

.log-icon {
  margin-top: 2px;
}

.log-content {
  flex: 1;
}

.log-time {
  font-weight: 600;
  margin-right: 10px;
}

.log-message {
  opacity: 0.9;
}

/* 响应式设计 */
@media (max-width: 1200px) {
  .main-content {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }
  
  .button-grid {
    grid-template-columns: 1fr;
  }
  
  .status-grid {
    grid-template-columns: 1fr;
  }
  
  .title {
    font-size: 2rem;
  }
  
  .hardware-manager {
    padding: 15px;
  }
}

/* 滚动条样式 */
.log-container::-webkit-scrollbar {
  width: 6px;
}

.log-container::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

.log-container::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 3px;
}

.log-container::-webkit-scrollbar-thumb:hover {
  background: #555;
}
</style>