<template>
  <div class="app">
    <!-- 动态背景 -->
    <div class="app-background">
      <div class="bg-gradient"></div>
      <div class="bg-particles"></div>
    </div>
    
    <!-- 导航栏 -->
    <nav class="nav-bar">
      <div class="nav-content">
        <!-- Logo/标题区域 -->
        <div class="nav-brand">
          <div class="brand-icon">
            <i class="fas fa-landmark"></i>
          </div>
          <h1 class="brand-title">文物保护智能平台</h1>
        </div>
        
        <!-- 导航链接 -->
        <div class="nav-links">
          <router-link to="/" class="nav-item" active-class="active">
            <div class="nav-item-icon">
              <i class="fas fa-project-diagram"></i>
            </div>
            <span class="nav-item-text">图数据浏览器</span>
            <div class="nav-item-indicator"></div>
          </router-link>
          
          <router-link to="/ai-chat" class="nav-item" active-class="active">
            <div class="nav-item-icon">
              <i class="fas fa-robot"></i>
            </div>
            <span class="nav-item-text">智能助手</span>
            <div class="nav-item-indicator"></div>
          </router-link>
          
          <router-link to="/ai-chat-tts" class="nav-item" active-class="active">
            <div class="nav-item-icon">
              <i class="fas fa-microphone"></i>
            </div>
            <span class="nav-item-text">语音助手</span>
            <div class="nav-item-indicator"></div>
          </router-link>
        </div>
        
        <!-- 右侧操作区 -->
        <div class="nav-actions">
          <button class="nav-action-btn" title="通知">
            <i class="fas fa-bell"></i>
            <span class="notification-badge">3</span>
          </button>
          <button class="nav-action-btn" title="设置">
            <i class="fas fa-cog"></i>
          </button>
        </div>
      </div>
    </nav>
    
    <!-- 主内容区域 -->
    <main class="main-content">
      <transition name="page-fade" mode="out-in">
        <router-view></router-view>
      </transition>
    </main>
  </div>
</template>

<script>
export default {
  name: 'App',
  mounted() {
    // 添加鼠标移动视差效果
    document.addEventListener('mousemove', this.handleMouseMove);
  },
  beforeUnmount() {
    document.removeEventListener('mousemove', this.handleMouseMove);
  },
  methods: {
    handleMouseMove(e) {
      const x = e.clientX / window.innerWidth;
      const y = e.clientY / window.innerHeight;
      
      const gradient = document.querySelector('.bg-gradient');
      if (gradient) {
        gradient.style.transform = `translate(${x * 20 - 10}px, ${y * 20 - 10}px)`;
      }
    }
  }
};
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  overflow-x: hidden;
}

.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  position: relative;
  background: #f0f7ff;
}

/* 动态背景 */
.app-background {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: -1;
  overflow: hidden;
  background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 50%, #90caf9 100%);
}

.bg-gradient {
  position: absolute;
  width: 120%;
  height: 120%;
  top: -10%;
  left: -10%;
  background: 
    radial-gradient(circle at 20% 30%, rgba(33, 150, 243, 0.3) 0%, transparent 50%),
    radial-gradient(circle at 80% 70%, rgba(3, 169, 244, 0.2) 0%, transparent 50%),
    radial-gradient(circle at 40% 80%, rgba(0, 188, 212, 0.2) 0%, transparent 50%);
  filter: blur(40px);
  animation: gradientFlow 20s ease-in-out infinite;
  transition: transform 0.3s ease-out;
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

/* 导航栏 */
.nav-bar {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  box-shadow: 0 2px 20px rgba(33, 150, 243, 0.1);
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  border-bottom: 1px solid rgba(33, 150, 243, 0.1);
}

.nav-content {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 24px;
  height: 70px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* Logo/品牌区域 */
.nav-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-icon {
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #2196f3 0%, #1976d2 100%);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 20px;
  box-shadow: 0 4px 12px rgba(33, 150, 243, 0.3);
  animation: iconGlow 3s ease-in-out infinite;
}

@keyframes iconGlow {
  0%, 100% { 
    box-shadow: 0 4px 12px rgba(33, 150, 243, 0.3);
    transform: scale(1);
  }
  50% { 
    box-shadow: 0 4px 20px rgba(33, 150, 243, 0.5);
    transform: scale(1.05);
  }
}

.brand-title {
  font-size: 20px;
  font-weight: 600;
  background: linear-gradient(135deg, #1976d2 0%, #0d47a1 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* 导航链接 */
.nav-links {
  display: flex;
  gap: 8px;
  flex: 1;
  justify-content: center;
}

.nav-item {
  position: relative;
  padding: 12px 24px;
  text-decoration: none;
  color: #424242;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  background: transparent;
  overflow: hidden;
}

.nav-item::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
  opacity: 0;
  transition: opacity 0.3s ease;
  z-index: -1;
}

.nav-item:hover::before {
  opacity: 1;
}

.nav-item:hover {
  color: #1976d2;
  transform: translateY(-2px);
}

.nav-item-icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  transition: all 0.3s ease;
}

.nav-item:hover .nav-item-icon {
  transform: scale(1.2) rotate(5deg);
}

.nav-item-text {
  font-size: 15px;
  font-weight: 500;
  white-space: nowrap;
}

.nav-item-indicator {
  position: absolute;
  bottom: 0;
  left: 50%;
  width: 0;
  height: 3px;
  background: linear-gradient(90deg, #2196f3 0%, #03a9f4 100%);
  transform: translateX(-50%);
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 3px 3px 0 0;
}

.nav-item.active {
  color: #1976d2;
  background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
}

.nav-item.active .nav-item-indicator {
  width: 80%;
}

.nav-item.active .nav-item-icon {
  animation: iconBounce 0.5s ease;
}

@keyframes iconBounce {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.3); }
}

/* 右侧操作区 */
.nav-actions {
  display: flex;
  gap: 12px;
}

.nav-action-btn {
  position: relative;
  width: 40px;
  height: 40px;
  border: none;
  background: rgba(33, 150, 243, 0.1);
  color: #1976d2;
  border-radius: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  transition: all 0.3s ease;
}

.nav-action-btn:hover {
  background: rgba(33, 150, 243, 0.2);
  transform: scale(1.1) rotate(-5deg);
}

.notification-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 20px;
  height: 20px;
  background: linear-gradient(135deg, #f44336 0%, #e91e63 100%);
  color: white;
  font-size: 11px;
  font-weight: bold;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: badgePulse 2s ease-in-out infinite;
}

@keyframes badgePulse {
  0%, 100% { 
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(244, 67, 54, 0.4);
  }
  50% { 
    transform: scale(1.1);
    box-shadow: 0 0 0 8px rgba(244, 67, 54, 0);
  }
}

/* 主内容区域 */
.main-content {
  margin-top: 70px;
  flex: 1;
  position: relative;
  z-index: 1;
}

/* 页面切换动画 */
.page-fade-enter-active,
.page-fade-leave-active {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.page-fade-enter-from {
  opacity: 0;
  transform: translateY(20px);
}

.page-fade-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}

/* 响应式设计 */
@media (max-width: 768px) {
  .nav-content {
    padding: 0 16px;
    height: 60px;
  }
  
  .brand-title {
    font-size: 16px;
  }
  
  .nav-links {
    gap: 4px;
  }
  
  .nav-item {
    padding: 8px 16px;
  }
  
  .nav-item-text {
    font-size: 14px;
  }
  
  .nav-item-icon {
    font-size: 14px;
    width: 20px;
    height: 20px;
  }
  
  .nav-actions {
    gap: 8px;
  }
  
  .nav-action-btn {
    width: 36px;
    height: 36px;
    font-size: 16px;
  }
}

@media (max-width: 480px) {
  .nav-item-text {
    display: none;
  }
  
  .nav-item {
    padding: 8px 12px;
  }
  
  .brand-title {
    display: none;
  }
}
</style>