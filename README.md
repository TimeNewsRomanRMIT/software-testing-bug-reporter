# How to Run the Project

## 1) Install Docker
Make sure **Docker** is installed and running in the background.  
Get Docker: https://docs.docker.com/get-docker/

---

## 2) Clone the Repository
Open **Terminal** and run:
```bash
git clone https://github.com/TimeNewsRomanRMIT/software-testing-bug-reporter.git
cd software-testing-bug-reporter
```

---

## 3) Start the Application
With **Docker** running, execute:
```bash
docker compose up --build
```
The first run may take a few minutes as Docker builds images and installs dependencies.

**Optional – run in background:**
```bash
docker compose up --build -d
```

---

## 4) Open the Website
Visit:
```
http://localhost
```
(No port number required.)

---

## 5) Stop the Application
In the Terminal where it’s running, press **Ctrl + C**.

To stop and remove containers:
```bash
docker compose down
```
