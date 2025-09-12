# 🚀 Project Cheat Sheet

## ✅ Start Docker
- Mac/Windows → open Docker Desktop (whale 🐳, wait until it’s blue).  
- Linux → start Docker:
  ```bash
  sudo systemctl start docker
  ```

---

## ✅ Run the App
From project root (where `docker-compose.yml` lives):  

```bash
docker compose up
```

- Rebuild (after editing `requirements.txt` or `package.json`):
  ```bash
  docker compose up --build
  ```
- Run in background:
  ```bash
  docker compose up -d
  ```

---

## ✅ Stop the App
```bash
docker compose down
```

---

## ✅ Git Workflow
Typical daily commands:  
```bash
git status              # see changes
git add .               # stage everything
git commit -m "message" # save snapshot
git push                # send to GitHub
```

---

## ✅ Where to Check
- **Frontend** → http://localhost:3000  
- **Backend** → http://localhost:8000 (docs: http://localhost:8000/docs)

---

## ✅ When to Rebuild
- Changed **backend/requirements.txt** or **frontend/package.json** → `docker compose up --build`  
- Changed only code (Python/React/TSX files) → just `docker compose up`, no rebuild needed  

---

⚡ Bonus: to see running containers
```bash
docker ps
```

⚡ Logs (if running with `-d`):
```bash
docker compose logs -f
```
