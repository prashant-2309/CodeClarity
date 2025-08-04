from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from controllers.GitlabController import gitlab_router
from controllers.DocumentationBrowser import browser_router
import uvicorn

# Create FastAPI application instance
app = FastAPI(
    title="CodeClarity API",
    description="API for GitLab MR documentation generation and browsing",
    version="1.1.0"
)

app.include_router(gitlab_router)
app.include_router(browser_router)

# Serve static files (HTML, CSS, JS)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def root():
    return {"message": "CodeClarity API is running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

# Add this route to serve the frontend
@app.get("/browse")
async def browse_documentation():
    """Serve the documentation browser UI"""
    return FileResponse("static/index.html")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)