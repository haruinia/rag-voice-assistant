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

    // 事件回调函数 - 使用箭头函数并添加默认实现避免ESLint警告
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
      console.log('Token response:', data); // 添加日志
      
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

    this.isRecording = true;
    this.taskId = null; // 重置任务ID
    this.onRecognitionStarted();

    this.ws = new WebSocket(`${ASR_WEBSOCKET_URL}?token=${token}`);

    this.ws.onopen = () => {
      console.log('ASR WebSocket connected. Sending StartRecognition command...');
      const startCommand = {
        header: {
          appkey: this.appKey,
          message_id: this._uuid(),
          name: 'StartRecognition',
          namespace: 'SpeechRecognizer',
        },
        payload: {
          format: 'PCM',
          sample_rate: 16000,
          enable_intermediate_result: true,
          enable_punctuation_prediction: true,
          enable_inverse_text_normalization: true,
          // --- VAD参数优化 ---
          // 开启VAD（静音检测）
          "enable_voice_activity_detection": true,
          // 最大开始说话前的静音时间，单位毫秒。超过这个时间不说话，任务会自动结束。
          "max_speech_start_silence": 8000,
          // 说完一句话后的最大静音时间，单位毫秒。超过这个时间，即认为一句话结束。
          "max_speech_end_silence": 3000, // 结束静音时间可以短一些，比如3秒
        },
      };
      console.log('Sending command:', JSON.stringify(startCommand, null, 2));
      this.ws.send(JSON.stringify(startCommand));
    };

    this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        console.log('Received WebSocket message:', JSON.stringify(msg, null, 2)); // 打印详细消息
      
        // 先检查是否是错误消息
        if (msg.header.status && msg.header.status !== 20000000) {
          console.error('Received error from server:', msg.header.status, msg.header.status_text);
          this.onError(`语音识别服务错误: ${msg.header.status_text || '未知错误'}`);
          this.stop();
          return;
        }
      
        // 处理 RecognitionStarted
        if (msg.header.name === 'RecognitionStarted') {
          console.log('Recognition started. Task ID:', msg.header.task_id); // 注意：task_id 可能在 header 中
          this.taskId = msg.header.task_id || msg.payload?.task_id; // 兼容两种可能的位置
          this._startMicrophone();
          return;
        }
      
        // 对于其他消息，暂时不检查 task_id（调试用）
        // 或者使用更宽松的检查
        if (msg.header.name === 'RecognitionResultChanged') {
          console.log('Recognition result changed:', msg.payload.result);
          this.onRecognitionResultChange(msg.payload.result);
        } else if (msg.header.name === 'RecognitionCompleted') {
          console.log('Recognition completed:', msg.payload.result);
          this.onRecognitionCompleted(msg.payload.result);
          this.stop();
        }
      };

    this.ws.onerror = (event) => {
      console.error('WebSocket Error Event:', event); // 增加错误事件日志
      this.onError('语音识别连接失败');
      this.stop();
    };

    this.ws.onclose = (event) => {
      console.log('WebSocket Closed Event:', event.code, event.reason); // 增加关闭事件日志
      if (this.isRecording) {
        this.stop();
      }
    };
  }

  stop() {
    if (!this.isRecording) return;
    console.log('Stop method called.'); // 增加stop日志
    this.isRecording = false;

    if (this.recorder) {
      this.recorder.stop();
      this.recorder = null;
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.taskId) {
       const stopCommand = {
        header: {
          appkey: this.appKey,
          message_id: this._uuid(),
          name: 'StopRecognition',
          namespace: 'SpeechRecognizer',
          task_id: this.taskId
        }
      };
      this.ws.send(JSON.stringify(stopCommand));
    }
    this.ws = null;
    this.taskId = null;
    this.onRecordingStop();
  }

  _startMicrophone() {
    console.log('Starting microphone...');
    
    // 存储上次处理的位置
    let lastSendIdx = 0;
    
    this.recorder = Recorder({
      type: 'pcm',
      sampleRate: 16000,
      bitRate: 16,
      onProcess: (buffers) => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          // 发送新增的音频数据
          for (let i = lastSendIdx; i < buffers.length; i++) {
            this.ws.send(buffers[i]);
          }
          lastSendIdx = buffers.length;
        }
      },
    });
  
    this.recorder.open(() => {
      lastSendIdx = 0; // 重置索引
      this.recorder.start();
      console.log('Microphone started successfully.');
    }, (msg, isUserNotAllow) => {
      if (isUserNotAllow) {
        this.onError('您已拒绝麦克风权限，无法使用语音功能。');
      } else {
        this.onError(`麦克风启动失败: ${msg}`);
      }
      this.stop();
    });
  }

  async synthesize(text) {
    if (this.audioPlayer) {
        this.audioPlayer.pause();
        this.audioPlayer = null;
    }
    
    const token = await this._getToken();
    if (!token) return;

    const params = new URLSearchParams({
      appkey: this.appKey,
      token: token,
      text: text,
      voice: 'xiaomei',
      format: 'wav',
      sample_rate: 24000,
      speech_rate: -86,
      pitch_rate: -68,
      volume: 50
    });

    this.onTTSSpeaking(true);
    
    try {
        this.audioPlayer = new Audio(`${TTS_HTTP_URL}?${params.toString()}`);
        this.audioPlayer.play();
        this.audioPlayer.onended = () => { this.onTTSSpeaking(false); this.audioPlayer = null; };
        this.audioPlayer.onerror = (e) => {
            console.error('TTS audio playback error:', e);
            this.onError('语音播报失败');
            this.onTTSSpeaking(false);
            this.audioPlayer = null;
        }
    } catch (e) {
        console.error('TTS synthesis error:', e);
        this.onError('语音合成请求失败');
        this.onTTSSpeaking(false);
    }
  }

  _uuid() {
    const uuidWithHyphens = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
    return uuidWithHyphens.replace(/-/g, '');
  }
}