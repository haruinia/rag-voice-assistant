import Recorder from 'recorder-core';
// 引入PCM格式支持，这是阿里云ASR需要的格式
import 'recorder-core/src/engine/pcm';

const ASR_WEBSOCKET_URL = "wss://nls-gateway.cn-shanghai.aliyuncs.com/ws/v1";
const TTS_HTTP_URL = "https://nls-gateway.cn-shanghai.aliyuncs.com/stream/v1/tts";

export class AlibabaSpeechService {
  constructor(config) {
    this.appKey = config.appKey;
    this.tokenApiUrl = config.tokenApiUrl;
    this.token = null;

    // 状态和回调
    this.isRecording = false;
    this.ws = null;
    this.recorder = null;
    this.taskId = null;
    this.audioPlayer = null;

    // 添加TTS错误防护
    this.ttsErrorCount = 0;
    this.maxTtsErrors = 3;
    this.lastTtsError = 0;

    // ASR连接重试机制
    this.asrRetryCount = 0;
    this.maxAsrRetries = 3;

    // 事件回调函数
    this.onRecognitionStarted = () => {};
    this.onRecognitionResultChange = (text) => { console.log('Recognition result:', text); };
    this.onRecognitionCompleted = (text) => { console.log('Recognition completed:', text); };
    this.onError = (error) => { console.error('Speech service error:', error); };
    this.onRecordingStop = () => {};
    this.onTTSSpeaking = (speaking) => { console.log('TTS speaking:', speaking); };
  }

  async _getToken() {
    try {
      const response = await fetch(this.tokenApiUrl);
      const data = await response.json();
      console.log('Token response:', data);
      
      if (data.success && data.token) {
        this.token = data.token;
        console.log('Token obtained successfully');
        return this.token;
      }
      throw new Error(data.error || 'Failed to fetch token');
    } catch (error) {
      console.error('Error getting speech token:', error);
      this.onError(`获取语音服务凭证失败: ${error.message}`);
      return null;
    }
  }

  async start() {
    if (this.isRecording) return;

    const token = await this._getToken();
    if (!token) return;

    console.log('=== Starting ASR with token ===');
    console.log('Token:', token);
    console.log('AppKey:', this.appKey);

    this.isRecording = true;
    // *** 关键修复：提前生成task_id ***
    this.taskId = this._uuid();
    this.onRecognitionStarted();

    // 使用更标准的WebSocket连接方式
    const wsUrl = `${ASR_WEBSOCKET_URL}?token=${encodeURIComponent(token)}`;
    console.log('Connecting to WebSocket:', wsUrl);
    
    try {
      this.ws = new WebSocket(wsUrl);
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      this.onError('语音识别连接创建失败');
      this.isRecording = false;
      return;
    }

    this.ws.onopen = () => {
      console.log('ASR WebSocket connected. Sending StartTranscription command...');
      
      // 生成32位无连字符UUID
      const messageId = this._uuid();
      console.log('Generated message_id:', messageId);
      console.log('Generated task_id:', this.taskId);
      console.log('AppKey:', this.appKey);
      
      // *** 关键修复：使用正确的协议格式 ***
      const startCommand = {
        header: {
          appkey: this.appKey,
          message_id: messageId,
          task_id: this.taskId, // *** 修复：必须包含task_id ***
          name: 'StartTranscription', // *** 修复：正确的指令名称 ***
          namespace: 'SpeechTranscriber' // *** 修复：正确的命名空间 ***
        },
        payload: {
          format: 'PCM',
          sample_rate: 16000,
          enable_intermediate_result: true,
          enable_punctuation_prediction: true,
          enable_inverse_text_normalization: true
        }
      };
      
      console.log('Sending command:', JSON.stringify(startCommand, null, 2));
      
      try {
        this.ws.send(JSON.stringify(startCommand));
        console.log('StartTranscription command sent successfully');
      } catch (error) {
        console.error('Failed to send StartTranscription command:', error);
        this.onError('发送语音识别命令失败');
        this.stop();
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        console.log('Received WebSocket message:', JSON.stringify(msg, null, 2));
      
        // 检查是否是错误消息
        if (msg.header.status && msg.header.status !== 20000000) {
          console.error('Received error from server:');
          console.error('  Status:', msg.header.status);
          console.error('  Status Text:', msg.header.status_text);
          console.error('  Task ID:', msg.header.task_id);
          console.error('  Message ID:', msg.header.message_id);
          
          this.onError(`语音识别服务错误: ${msg.header.status_text || '未知错误'}`);
          this.stop();
          return;
        }
      
        // *** 修复：处理正确的事件名称 ***
        // 处理 TranscriptionStarted (替代之前的RecognitionStarted)
        if (msg.header.name === 'TranscriptionStarted') {
          console.log('=== Transcription Started Successfully ===');
          console.log('  Task ID:', msg.header.task_id);
          console.log('  Session ID:', msg.payload?.session_id);
          
          console.log('Starting microphone with task_id:', this.taskId);
          this._startMicrophone();
          this.asrRetryCount = 0; // 重置重试计数
          return;
        }
      
        // 处理识别结果变化 (TranscriptionResultChanged 替代 RecognitionResultChanged)
        if (msg.header.name === 'TranscriptionResultChanged') {
          console.log('Transcription result changed:', msg.payload.result);
          this.onRecognitionResultChange(msg.payload.result);
        } 
        // 处理句子结束事件
        else if (msg.header.name === 'SentenceEnd') {
          console.log('Sentence ended:', msg.payload.result);
          this.onRecognitionCompleted(msg.payload.result);
        }
        // 处理转写完成 (TranscriptionCompleted 替代 RecognitionCompleted)
        else if (msg.header.name === 'TranscriptionCompleted') {
          console.log('Transcription completed');
          this.stop();
        }
        
      } catch (parseError) {
        console.error('Failed to parse WebSocket message:', parseError);
        console.error('Raw message:', event.data);
        this.onError('语音识别消息解析失败');
      }
    };

    this.ws.onerror = (event) => {
      console.error('WebSocket Error Event:', event);
      this.onError('语音识别连接失败');
      this.stop();
    };

    this.ws.onclose = (event) => {
      console.log('WebSocket Closed Event:', event.code, event.reason);
      if (this.isRecording) {
        this.stop();
      }
    };
  }

  stop() {
    if (!this.isRecording) return;
    console.log('Stop method called. Current task_id:', this.taskId);
    this.isRecording = false;

    // 先停止录音
    if (this.recorder) {
      console.log('Stopping recorder...');
      this.recorder.stop();
      this.recorder = null;
    }

    // 发送停止命令（只有在有有效task_id时才发送）
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      if (this.taskId) {
        console.log('Sending StopTranscription command with task_id:', this.taskId);
        // *** 修复：使用正确的停止指令格式 ***
        const stopCommand = {
          header: {
            appkey: this.appKey,
            message_id: this._uuid(),
            task_id: this.taskId,
            name: 'StopTranscription', // *** 修复：正确的指令名称 ***
            namespace: 'SpeechTranscriber' // *** 修复：正确的命名空间 ***
          }
        };
        
        try {
          this.ws.send(JSON.stringify(stopCommand));
        } catch (e) {
          console.warn('Failed to send stop command:', e);
        }
      } else {
        console.warn('No task_id available, closing WebSocket directly');
      }
      
      // 延迟关闭WebSocket
      setTimeout(() => {
        if (this.ws) {
          this.ws.close();
          this.ws = null;
        }
      }, 100);
    } else {
      this.ws = null;
    }
    
    this.taskId = null;
    this.onRecordingStop();
    
    // 同时停止TTS播放
    this._cleanupAudio();
  }

  _startMicrophone() {
    console.log('Starting microphone with task_id:', this.taskId);
    
    // 存储上次处理的位置
    let lastSendIdx = 0;
    
    // 使用阿里云推荐的录音配置，增强兼容性
    this.recorder = Recorder({
      type: 'pcm',
      sampleRate: 16000,    // 阿里云标准采样率
      bitRate: 16,          // 16位深度
      numChannels: 1,       // 单声道
      
      // 音频数据处理
      onProcess: (buffers, powerLevel, bufferDuration, bufferSampleRate) => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN && this.taskId) {
          try {
            // 发送新增的音频数据
            for (let i = lastSendIdx; i < buffers.length; i++) {
              const buffer = buffers[i];
              
              // 确保buffer是有效的
              if (buffer && buffer.byteLength > 0) {
                // 可选：对音频数据进行预处理
                const processedBuffer = this._preprocessAudioBuffer(buffer);
                this.ws.send(processedBuffer);
                
                if (i % 20 === 0) { // 每20个chunk记录一次日志，避免日志过多
                  console.log(`Sent audio chunk ${i}, size: ${processedBuffer.byteLength} bytes, power: ${powerLevel.toFixed(2)}`);
                }
              }
            }
            lastSendIdx = buffers.length;
          } catch (sendError) {
            console.error('Error sending audio data:', sendError);
            this.onError('音频数据发送失败');
          }
        } else if (!this.taskId) {
          console.warn('Cannot send audio data: no task_id available');
        }
      }
    });

    this.recorder.open(() => {
      lastSendIdx = 0; // 重置索引
      this.recorder.start();
      console.log('=== Microphone Started Successfully ===');
      console.log('  - Sample Rate: 16kHz');
      console.log('  - Bit Depth: 16-bit');
      console.log('  - Channels: Mono');
      console.log('  - Format: PCM');
    }, (msg, isUserNotAllow) => {
      if (isUserNotAllow) {
        this.onError('您已拒绝麦克风权限，无法使用语音功能。');
      } else {
        this.onError(`麦克风启动失败: ${msg}`);
      }
      this.stop();
    });
  }

  // 音频预处理方法
  _preprocessAudioBuffer(buffer) {
    // 基本验证
    if (!buffer || buffer.byteLength === 0) {
      return buffer;
    }
    
    // 目前直接返回原始buffer，未来可以添加：
    // 1. 音量标准化
    // 2. 简单的降噪
    // 3. 格式验证
    return buffer;
  }

  async synthesize(text) {
    console.log('=== TTS Synthesize Start ===', text);
    
    // 防止TTS错误无限循环
    const now = Date.now();
    if (now - this.lastTtsError < 5000) { // 5秒内
      this.ttsErrorCount++;
      if (this.ttsErrorCount >= this.maxTtsErrors) {
        console.warn('TTS error limit reached, skipping synthesis');
        this.onTTSSpeaking(false);
        return;
      }
    } else {
      this.ttsErrorCount = 0; // 重置错误计数
    }
    
    // 停止并清理之前的音频
    this._cleanupAudio();
    
    const token = await this._getToken();
    if (!token) {
      console.error('No token available for TTS');
      this.onTTSSpeaking(false);
      return;
    }

    // 尝试多种音频格式，优先使用兼容性更好的mp3
    const formats = [
      { format: 'mp3', sample_rate: 16000 },
      { format: 'wav', sample_rate: 24000 },
      { format: 'pcm', sample_rate: 16000 }
    ];

    this.onTTSSpeaking(true);
    
    for (let i = 0; i < formats.length; i++) {
      const formatConfig = formats[i];
      
      try {
        const params = new URLSearchParams({
          appkey: this.appKey,
          token: token,
          text: text,
          voice: 'xiaomei',
          format: formatConfig.format,
          sample_rate: formatConfig.sample_rate,
          speech_rate: -86,
          pitch_rate: -68,
          volume: 50
        });

        const audioUrl = `${TTS_HTTP_URL}?${params.toString()}`;
        console.log(`TTS: Trying format ${formatConfig.format} at ${formatConfig.sample_rate}Hz`);
        console.log('TTS URL:', audioUrl);

        // 创建新的音频实例
        const audio = new Audio();
        this.audioPlayer = audio;
        
        // 设置超时，避免音频加载卡死
        const timeoutId = setTimeout(() => {
          if (this.audioPlayer === audio) {
            console.warn(`TTS: Format ${formatConfig.format} timeout`);
            this._handleTtsError('音频加载超时');
          }
        }, 10000); // 10秒超时
        
        // 成功播放的Promise
        const playSuccess = new Promise((resolve, reject) => {
          audio.onplay = () => {
            clearTimeout(timeoutId);
            console.log(`TTS: Successfully playing with format ${formatConfig.format}`);
            this.onTTSSpeaking(true);
            resolve();
          };
          
          audio.onended = () => {
            clearTimeout(timeoutId);
            console.log('TTS: Audio playback ended');
            this.onTTSSpeaking(false);
            this._cleanupAudio();
            resolve();
          };
          
          audio.onerror = (e) => {
            clearTimeout(timeoutId);
            console.warn(`TTS: Format ${formatConfig.format} failed:`, e, audio.error);
            reject(new Error(`Format ${formatConfig.format} not supported`));
          };
          
          audio.onpause = () => {
            console.log('TTS: Audio paused');
            this.onTTSSpeaking(false);
          };
        });
        
        // 设置音频源并尝试播放
        audio.src = audioUrl;
        
        try {
          const playPromise = audio.play();
          if (playPromise && typeof playPromise.catch === 'function') {
            await playPromise;
          }
          
          // 如果到这里没有抛出异常，说明格式支持，等待播放完成
          await playSuccess;
          return; // 成功播放，退出循环
          
        } catch (playError) {
          console.warn(`TTS: Play failed for format ${formatConfig.format}:`, playError);
          
          // 如果不是最后一个格式，继续尝试下一个
          if (i < formats.length - 1) {
            this._cleanupAudio();
            continue;
          } else {
            throw playError; // 最后一个格式也失败了
          }
        }
        
      } catch (error) {
        console.warn(`TTS: Format ${formatConfig.format} failed:`, error.message);
        
        // 如果不是最后一个格式，继续尝试
        if (i < formats.length - 1) {
          this._cleanupAudio();
          continue;
        }
        
        // 所有格式都失败了
        this._handleTtsError('所有音频格式都不支持');
        return;
      }
    }
  }

  // 安全的TTS错误处理，防止无限循环
  _handleTtsError(errorMessage) {
    this.lastTtsError = Date.now();
    this.ttsErrorCount++;
    
    console.error('TTS Error:', errorMessage);
    this.onTTSSpeaking(false);
    this._cleanupAudio();
    
    // 只在错误次数不多时才调用onError，防止无限循环
    if (this.ttsErrorCount < this.maxTtsErrors) {
      // 延迟调用，避免立即重试
      setTimeout(() => {
        this.onError('TTS播放失败，建议关闭语音播报或检查网络连接');
      }, 1000);
    } else {
      console.warn('TTS error limit reached, not calling onError to prevent loop');
    }
  }

  // 安全清理音频的方法
  _cleanupAudio() {
    if (this.audioPlayer) {
      try {
        // 移除所有事件监听器
        this.audioPlayer.onplay = null;
        this.audioPlayer.onended = null;
        this.audioPlayer.onerror = null;
        this.audioPlayer.onpause = null;
        this.audioPlayer.oncanplay = null;
        this.audioPlayer.onloadeddata = null;
        
        // 停止播放
        if (!this.audioPlayer.paused) {
          this.audioPlayer.pause();
        }
        
        // 重置播放位置
        this.audioPlayer.currentTime = 0;
        
        // 清理src
        this.audioPlayer.src = '';
        this.audioPlayer.load(); // 强制清理资源
        
      } catch (e) {
        console.warn('Error during audio cleanup:', e);
      } finally {
        this.audioPlayer = null;
      }
    }
  }

  _uuid() {
    // 阿里云要求无连字符的32位十六进制字符串
    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
    
    // 移除连字符，阿里云只接受32位纯十六进制
    const cleanUuid = uuid.replace(/-/g, '');
    console.log('Generated clean UUID:', cleanUuid);
    return cleanUuid;
  }
}