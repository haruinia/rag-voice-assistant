<template>
  <div class="app">
    <nav class="nav-bar">
      <router-link to="/" class="nav-item" active-class="active">
        <i class="fas fa-project-diagram"></i>
        图数据浏览器
      </router-link>
      <router-link to="/ai-chat" class="nav-item" active-class="active">
        <i class="fas fa-robot"></i>
        基于知识增强大模型的文物保护领域智能助手
      </router-link>
       <router-link to="/ai-chat-tts" class="nav-item" active-class="active">
        <i class="fas fa-robot"></i>
        基于TTS知识增强大模型的文物保护领域智能助手
      </router-link>
    </nav>  
    <main class="main-content">
      <router-view></router-view>
    </main>
  </div>
</template>

<script>
export default {
  name: 'App'
};
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.nav-bar {
  background: #1976d2;
  padding: 12px 24px;
  display: flex;
  gap: 24px;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
}

.nav-item {
  color: white;
  text-decoration: none;
  padding: 8px 16px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.nav-item.active {
  background: rgba(255, 255, 255, 0.2);
  font-weight: 500;
}

.main-content {
  margin-top: 60px; /* 导航栏的高度 */
  flex: 1;
  overflow: auto;
}

/* 确保 Font Awesome 图标正确显示 */
.fas {
  width: 16px;
  text-align: center;
}

/* 使用 Flexbox 来布局 DataList 和 GraphView 组件 */
.container {
  display: flex;
  flex-direction: row; /* 横向排列 */
  width: 100%;
  height: 100vh; /* 全屏高度 */
}

.data-list {
  flex: 1; /* 占据剩余空间 */
  overflow: auto; /* 如果内容过多，允许滚动 */
  padding: 20px; /* 内边距 */
  box-sizing: border-box; /* 包括内边距和边框在内的宽高计算 */
}

.graph-view {
  flex: 2; /* 占据两倍于 DataList 的空间 */
  padding: 20px; /* 内边距 */
  box-sizing: border-box; /* 包括内边距和边框在内的宽高计算 */
}
</style>
