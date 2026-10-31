# 🎬 Cinematic AI Color Engine

A professional Hollywood Digital Intermediate (DI) color-grading web application powered by **WebGL shaders** and **Google Gemini Multimodal AI**. It analyzes image exposure, dynamic range, and color histograms to produce 3 bespoke cinematic grades at 60 FPS, with non-destructive Director trim controls and 4K full-resolution GPU export.

---

## 🚀 Quick Start with Docker (Recommended)

Run the entire stack (FastAPI backend + Nginx-powered React frontend) with **one command**. No local Python or Node.js installation required!

### 1. Clone the repository
```bash
git clone https://github.com/your-username/ai-colour-grader.git
cd ai-colour-grader
```

### 2. Start with Docker Compose
```bash
docker compose up --build
```

### 3. Open in your browser
- **Web Application:** [http://localhost:3001](http://localhost:3001)
- **FastAPI Documentation:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **API Health Check:** [http://localhost:8000/api/health](http://localhost:8000/api/health)

To stop the containers:
```bash
docker compose down
```

---

## 🔑 Bring-Your-Own-Key (BYOK) Architecture
- **Free Built-in Presets:** You can use the app immediately with zero configuration using built-in Hollywood DI presets.
- **Live Gemini AI Grading:** To enable real-time multimodal scene analysis, click **"Connect Free Gemini Key"** in the top-right header and paste a free API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
- **Privacy & Security:** Your API key is stored strictly inside your browser's local storage and is sent only to grade your uploaded images. It is never stored or tracked on the server.

---

## 💻 Manual Local Development (Without Docker)

If you prefer running services directly on your host machine:

### Backend Setup (FastAPI)
```bash
cd backend
python -m venv venv

# Windows:
.\venv\Scripts\activate
# macOS / Linux:
# source venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend Setup (React + Vite)
```bash
# In the root project directory:
npm install
npm run dev
```
Open [http://localhost:5173](http://localhost:5173).

---

## 🛠️ Tech Stack
- **Frontend:** React 19, TypeScript, Vite, WebGL 2.0 Shaders (Oklab Gamut Mapping)
- **Backend:** FastAPI, Python 3.12, Google GenAI SDK, Pillow, NumPy
- **Containerization:** Docker, Docker Compose, Nginx (Alpine) Reverse Proxy
