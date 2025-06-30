<!-- Language Switch | 语言切换 -->
<p align="right">
  <a href="#en-section"><img src="https://img.shields.io/badge/English-EN-blue?style=for-the-badge" alt="English"></a>
  <a href="#zh-section"><img src="https://img.shields.io/badge/简体中文-ZH-brightgreen?style=for-the-badge" alt="简体中文"></a>
</p>

# 🌏 Cultural Heritage Intelligent Platform / 文物保护智能平台

---

## 🇬🇧 English (EN)
<a id="en-section"></a>

### Project Overview
A modern, intelligent knowledge management and interaction platform for the field of cultural heritage protection. This system integrates knowledge graph visualization, intelligent Q&A, voice assistant, and IoT device management, supporting both web and hardware endpoints.

---

### 🚀 Features
- **Knowledge Graph Visualization & Management**  
  Full CRUD for Neo4j nodes and relationships, with interactive graph visualization.
- **Intelligent Q&A Assistant**  
  Integrates LLMs and the knowledge graph for domain-specific Q&A.
- **Voice Assistant**  
  Supports speech recognition (ASR) and synthesis (TTS), enabling voice-based AI interaction.
- **Hardware Device Management**  
  Real-time monitoring and control of IoT devices (e.g., M5EchoBase, S3R).
- **Modern Web UI**  
  Responsive, user-friendly, and visually appealing web interface.

---

### 📁 Directory Structure
```text
Knowledge-management-system/
├── neo4j-backend/      # Backend service (Node.js + Express + Neo4j)
├── neo4j-frontend/     # Frontend project (Vue 3)
├── MED_BBK_9K/         # Example dataset (optional)
└── ...                 # Other files
```

---

### ⚙️ Requirements
**Backend**
- Node.js >= 14
- Neo4j database (self-hosted, configure connection)
- Main dependencies: `express`, `neo4j-driver`, `axios`, `multer`, `fluent-ffmpeg`, `@alicloud/pop-core`, `alibabacloud-nls`, `dotenv`, `cors`

**Frontend**
- Node.js >= 14
- npm >= 6
- Main dependencies: `vue@3`, `vue-router@4`, `axios`, `cytoscape`, `@fortawesome/fontawesome-free`, `lodash`, `marked`, `moment`, `recorder-core`

---

### 🛠️ Installation & Deployment
**1. Clone the Repository**
```bash
git clone <your-repo-url>
cd Knowledge-management-system
```
**2. Backend Setup**
```bash
cd neo4j-backend
npm install
```
- Create a `.env` file:
  ```env
  ALI_ACCESS_KEY_ID=your_aliyun_access_key_id
  ALI_ACCESS_KEY_SECRET=your_aliyun_access_key_secret
  ALI_APP_KEY=your_aliyun_speech_app_key
  ```
- Configure Neo4j connection in `api/data.js` (set your own host, username, and password).
- Start the backend server:
  ```bash
  node server.js
  ```
  Default port: `3000`.

**3. Frontend Setup**
```bash
cd ../neo4j-frontend
npm install
npm run serve
```
Default access: [http://localhost:8080](http://localhost:8080)

---

### 🖥️ Main Pages & Features
- **Graph Browser** (Home): Visualize, query, and edit the Neo4j knowledge graph.
- **AI Assistant**: Text-based Q&A, combining knowledge graph and LLM for entity extraction, knowledge retrieval, and reasoning.
- **Voice Assistant**: Voice input and output, integrated with Alibaba Cloud ASR/TTS.
- **Hardware Device Management**: Real-time monitoring and remote control of M5EchoBase, S3R, and other IoT devices.

---

### 🏭 Production Deployment
- Use `pm2`, `docker`, or similar tools to run the backend as a service.
- Build the frontend with `npm run build` and deploy the static files to Nginx, Apache, or cloud hosting.
- Deploy Neo4j separately and secure it properly.
- Keep all keys and configuration files secure in production.

---

### 📌 Additional Notes
- To customize LLM API endpoints or Neo4j connection, edit the relevant config files.
- Example dataset is in `MED_BBK_9K/` for testing or demo purposes.
- For detailed API and component documentation, refer to the source code comments.

---

### 📬 Contact
For further assistance or customization, please contact the project maintainer.

---


## 🇨🇳 简体中文 (ZH)
<a id="zh-section"></a>

### 项目简介
本项目是一个面向文物保护领域的智能知识管理与交互平台，集成了知识图谱可视化、智能问答、语音助手、硬件设备管理等多种功能。系统采用前后端分离架构，后端基于 Node.js + Express + Neo4j，前端基于 Vue 3 实现，支持与大语言模型（如 Ollama/DeepSeek）和阿里云语音服务集成，适用于文物知识管理、智能问答、语音交互及物联网设备监控等场景。

---

### 🚀 主要特性
- **知识图谱可视化与管理**  
  支持Neo4j图数据库的节点、关系的增删查改，图形化展示与交互。
- **智能问答助手**  
  集成大语言模型，结合知识图谱实现文物领域的智能问答。
- **语音助手**  
  支持语音识别（ASR）、语音合成（TTS），可通过语音与AI助手交互。
- **硬件设备管理**  
  对接M5EchoBase、S3R等物联网设备，实时监控设备状态，远程控制设备行为。
- **现代Web界面**  
  响应式设计，界面美观现代，交互友好。

---

### 📁 目录结构
```text
Knowledge-management-system/
├── neo4j-backend/      # 后端服务（Node.js + Express + Neo4j）
├── neo4j-frontend/     # 前端项目（Vue 3）
├── MED_BBK_9K/         # 示例数据集（可选）
└── ...                 # 其他文件
```

---

### ⚙️ 环境依赖
**后端**
- Node.js >= 14
- Neo4j 数据库（需自行部署并配置）
- 主要依赖：express, neo4j-driver, axios, multer, fluent-ffmpeg, @alicloud/pop-core, alibabacloud-nls, dotenv, cors

**前端**
- Node.js >= 14
- npm >= 6
- 主要依赖：vue@3, vue-router@4, axios, cytoscape, @fortawesome/fontawesome-free, lodash, marked, moment, recorder-core

---

### 🛠️ 安装与部署
**1. 克隆项目**
```bash
git clone <你的仓库地址>
cd Knowledge-management-system
```
**2. 配置后端**
```bash
cd neo4j-backend
npm install
```
- 新建 `.env` 文件：
  ```env
  ALI_ACCESS_KEY_ID=你的阿里云AccessKeyId
  ALI_ACCESS_KEY_SECRET=你的阿里云AccessKeySecret
  ALI_APP_KEY=你的阿里云语音服务AppKey
  ```
- 在 `api/data.js` 中配置 Neo4j 数据库连接（修改为你的主机、用户名、密码）。
- 启动后端服务：
  ```bash
  node server.js
  ```
  默认端口：`3000`。

**3. 配置前端**
```bash
cd ../neo4j-frontend
npm install
npm run serve
```
默认访问地址：[http://localhost:8080](http://localhost:8080)

---

### 🖥️ 主要页面与功能说明
- **图数据浏览器**（首页）：可视化浏览、查询、编辑Neo4j知识图谱。
- **智能助手**：文本问答，结合知识图谱和大模型，支持实体抽取、知识检索、推理等。
- **语音助手**：支持语音输入、语音播报，集成阿里云ASR/TTS服务。
- **硬件设备管理**：实时监控和远程控制M5EchoBase、S3R等设备，支持设备状态流、语音对话下发等。

---

### 🏭 生产部署建议
- 后端可使用 `pm2`、`docker` 等方式守护进程或容器化部署。
- 前端可使用 `npm run build` 生成静态文件，部署到 Nginx、Apache 或云服务。
- Neo4j 数据库建议单独部署并做好安全加固。
- 生产环境请妥善保管密钥与配置文件，避免泄露。

---

### 📌 其他说明
- 若需自定义大模型API地址、Neo4j连接等，请在相关配置文件中修改。
- 示例数据集位于 `MED_BBK_9K/`，可用于测试或演示。
- 详细API接口和前端组件说明请参考源码注释。

---

### 📬 联系方式
如需进一步帮助或有定制需求，请联系项目维护者。

--- 
