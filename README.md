# 🌏 Cultural Heritage Intelligent Platform

A modern, intelligent knowledge management and interaction platform for the field of cultural heritage protection. This system integrates knowledge graph visualization, intelligent Q&A, voice assistant, and IoT device management, supporting both web and hardware endpoints.

---

## 🚀 Features

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

## 📁 Directory Structure

```text
Knowledge-management-system/
├── neo4j-backend/      # Backend service (Node.js + Express + Neo4j)
├── neo4j-frontend/     # Frontend project (Vue 3)
└── ...                 # Other files
```

---

## ⚙️ Requirements

### Backend
- Node.js >= 14
- Neo4j database (self-hosted, configure connection)
- Main dependencies: `express`, `neo4j-driver`, `axios`, `multer`, `fluent-ffmpeg`, `@alicloud/pop-core`, `alibabacloud-nls`, `dotenv`, `cors`

### Frontend
- Node.js >= 14
- npm >= 6
- Main dependencies: `vue@3`, `vue-router@4`, `axios`, `cytoscape`, `@fortawesome/fontawesome-free`, `lodash`, `marked`, `moment`, `recorder-core`

---

## 🛠️ Installation & Deployment

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd Knowledge-management-system
```

### 2. Backend Setup

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

### 3. Frontend Setup

```bash
cd ../neo4j-frontend
npm install
npm run serve
```

Default access: [http://localhost:8080](http://localhost:8080)

---

## 🖥️ Main Pages & Features

- **Graph Browser** (Home): Visualize, query, and edit the Neo4j knowledge graph.
- **AI Assistant**: Text-based Q&A, combining knowledge graph and LLM for entity extraction, knowledge retrieval, and reasoning.
- **Voice Assistant**: Voice input and output, integrated with Alibaba Cloud ASR/TTS.
- **Hardware Device Management**: Real-time monitoring and remote control of M5EchoBase, S3R, and other IoT devices.

---

## 🏭 Production Deployment

- Use `pm2`, `docker`, or similar tools to run the backend as a service.
- Build the frontend with `npm run build` and deploy the static files to Nginx, Apache, or cloud hosting.
- Deploy Neo4j separately and secure it properly.
- Keep all keys and configuration files secure in production.

---

## 📌 Additional Notes

- To customize LLM API endpoints or Neo4j connection, edit the relevant config files.
- Example dataset is in `MED_BBK_9K/` for testing or demo purposes.
- For detailed API and component documentation, refer to the source code comments.

---

## 📬 Contact

For further assistance or customization, please contact the project maintainer.

--- 
