文物保护智能平台（Knowledge Management System）
项目简介
本项目是一个面向文物保护领域的智能知识管理与交互平台，集成了知识图谱可视化、智能问答、语音助手、硬件设备管理等多种功能。系统采用前后端分离架构，后端基于 Node.js + Express + Neo4j，前端基于 Vue 3 实现，支持与大语言模型（如 Ollama/DeepSeek）和阿里云语音服务集成，适用于文物知识管理、智能问答、语音交互及物联网设备监控等场景。
主要功能
知识图谱可视化与管理：支持Neo4j图数据库的节点、关系的增删查改，图形化展示与交互。
智能问答助手：集成大语言模型，结合知识图谱实现文物领域的智能问答。
语音助手：支持语音识别（ASR）、语音合成（TTS），可通过语音与AI助手交互。
硬件设备管理：对接M5EchoBase、S3R等物联网设备，实时监控设备状态，远程控制设备行为。
多端适配：支持Web端操作，界面美观现代，交互友好。
目录结构
Apply to README.md
其他文件
环境依赖
后端
Node.js >= 14
Neo4j 数据库（需自行部署并配置）
主要依赖：express, neo4j-driver, axios, multer, fluent-ffmpeg, @alicloud/pop-core, alibabacloud-nls, dotenv, cors
前端
Node.js >= 14
npm >= 6
主要依赖：vue@3, vue-router@4, axios, cytoscape, @fortawesome/fontawesome-free, lodash, marked, moment, recorder-core
安装与部署
1. 克隆项目
Apply to README.md
Run
system
2. 配置后端
进入后端目录：
Apply to README.md
Run
backend
安装依赖：
Apply to README.md
Run
install
配置环境变量（新建 .env 文件，参考如下）：
Apply to README.md
你的阿里云语音服务AppKey
配置 Neo4j 数据库连接（在 api/data.js 中修改 neo4j.driver 的连接地址、用户名、密码为你的实际配置）。
启动后端服务：
Apply to README.md
Run
js
默认监听端口为 3000。
3. 配置前端
进入前端目录：
Apply to README.md
Run
frontend
安装依赖：
Apply to README.md
Run
install
启动开发服务器：
Apply to README.md
Run
serve
默认访问地址为 http://localhost:8080。
主要页面与功能说明
图数据浏览器（首页）：可视化浏览、查询、编辑Neo4j知识图谱。
智能助手：文本问答，结合知识图谱和大模型，支持实体抽取、知识检索、推理等。
语音助手：支持语音输入、语音播报，集成阿里云ASR/TTS服务。
硬件设备管理：实时监控和远程控制M5EchoBase、S3R等设备，支持设备状态流、语音对话下发等。
生产部署建议
后端可使用 pm2、docker 等方式守护进程或容器化部署。
前端可使用 npm run build 生成静态文件，部署到 Nginx、Apache 或云服务。
Neo4j 数据库建议单独部署并做好安全加固。
生产环境请妥善保管密钥与配置文件，避免泄露。
其他说明
若需自定义大模型API地址、Neo4j连接等，请在相关配置文件中修改。
示例数据集位于 MED_BBK_9K/，可用于测试或演示。
详细API接口和前端组件说明请参考源码注释。
如需进一步帮助或有定制需求，请联系项目维护者。
