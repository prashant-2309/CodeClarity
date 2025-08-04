// Global state
let currentView = 'projects';
let currentProject = null;
let currentRelease = null;
let navigationStack = [];

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    showProjects();
});

// Utility functions
function showLoading(message = 'Loading...') {
    document.getElementById('content').innerHTML = `<div class="loading">${message}</div>`;
}

function showError(message) {
    document.getElementById('content').innerHTML = `<div class="error">Error: ${message}</div>`;
}

function updateBreadcrumb(path) {
    const breadcrumb = document.getElementById('breadcrumb');
    breadcrumb.textContent = path;
    breadcrumb.style.display = 'block';
}

function formatFileSize(bytes) {
    return (bytes / 1024).toFixed(1) + ' KB';
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Navigation functions
function goBack() {
    if (navigationStack.length > 0) {
        const previousView = navigationStack.pop();
        previousView();
    }
    
    if (navigationStack.length === 0) {
        document.getElementById('backBtn').style.display = 'none';
    }
}

// Main view functions
function showProjects() {
    currentView = 'projects';
    navigationStack = [];
    updateBreadcrumb('Projects');
    document.getElementById('backBtn').style.display = 'none';
    showLoading('Loading projects...');
    
    fetch('/api/v1/browse/projects')
        .then(response => {
            if (!response.ok) throw new Error('Failed to fetch projects');
            return response.json();
        })
        .then(data => {
            const content = document.getElementById('content');
            if (data.projects.length === 0) {
                content.innerHTML = `
                    <div class="card">
                        <h2>No Projects Found</h2>
                        <p>No projects found. Create some documentation first by running your GitLab CI/CD pipeline!</p>
                    </div>
                `;
                return;
            }

            let html = `
                <div class="stats">
                    <div class="stat-card">
                        <div class="stat-number">${data.projects.length}</div>
                        <div class="stat-label">Projects Available</div>
                    </div>
                </div>
            `;
            
            data.projects.forEach(project => {
                html += `
                    <div class="card project-card" onclick="showReleases('${project.bucket_name}', '${project.display_name}')">
                        <div class="project-name">📁 ${project.display_name}</div>
                        <div class="project-id">Bucket: ${project.bucket_name}</div>
                    </div>
                `;
            });
            content.innerHTML = html;
        })
        .catch(error => {
            showError('Failed to load projects: ' + error.message);
        });
}

function showReleases(bucketName, displayName) {
    currentView = 'releases';
    currentProject = { bucket: bucketName, name: displayName };
    navigationStack.push(() => showProjects());
    updateBreadcrumb(`Projects > ${displayName}`);
    document.getElementById('backBtn').style.display = 'inline-block';
    showLoading('Loading releases...');
    
    Promise.all([
        fetch(`/api/v1/browse/projects/${bucketName}/releases`),
        fetch(`/api/v1/browse/projects/${bucketName}/current-release`)
    ]).then(responses => {
        return Promise.all(responses.map(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
        }));
    }).then(([releasesData, currentData]) => {
        const content = document.getElementById('content');
        let html = `
            <div class="stats">
                <div class="stat-card">
                    <div class="stat-number">${releasesData.releases.length}</div>
                    <div class="stat-label">Published Releases</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${currentData.total_files}</div>
                    <div class="stat-label">Unreleased MRs</div>
                </div>
            </div>
        `;

        // Current Release Section
        if (currentData.total_files > 0) {
            html += `
                <div class="card release-card" onclick="showCurrentRelease('${bucketName}')">
                    <div class="release-tag">📝 Current Release (Unreleased MRs)</div>
                    <div class="release-info">${currentData.total_files} MR documentation files ready for next release</div>
                </div>
            `;
        }

        // Released Versions
        releasesData.releases.forEach(release => {
            html += `
                <div class="card release-card" onclick="showReleaseFiles('${bucketName}', '${release.release_tag}')">
                    <div class="release-tag">🏷️ ${release.release_tag}</div>
                    <div class="release-info">
                        Release Note: ${release.release_note ? '✅ Available' : '❌ Missing'} | 
                        MR Documents: ${release.mr_docs_count}
                    </div>
                </div>
            `;
        });

        if (releasesData.releases.length === 0 && currentData.total_files === 0) {
            html += `
                <div class="card">
                    <h2>No Documentation Found</h2>
                    <p>This project doesn't have any documentation yet. Start by creating merge requests and running your CI/CD pipeline!</p>
                </div>
            `;
        }

        content.innerHTML = html;
    }).catch(error => {
        showError('Failed to load releases: ' + error.message);
    });
}

function showCurrentRelease(bucketName) {
    currentView = 'current-release';
    navigationStack.push(() => showReleases(bucketName, currentProject.name));
    updateBreadcrumb(`Projects > ${currentProject.name} > Current Release`);
    showLoading('Loading current release files...');
    
    fetch(`/api/v1/browse/projects/${bucketName}/current-release`)
        .then(response => {
            if (!response.ok) throw new Error('Failed to fetch current release');
            return response.json();
        })
        .then(data => {
            const content = document.getElementById('content');
            let html = `
                <div class="stats">
                    <div class="stat-card">
                        <div class="stat-number">${data.files.length}</div>
                        <div class="stat-label">MR Documents</div>
                    </div>
                </div>
            `;

            if (data.files.length === 0) {
                html += `
                    <div class="card">
                        <h2>No Current MRs</h2>
                        <p>No unreleased merge request documentation found. Create some MRs to see documentation here!</p>
                    </div>
                `;
            } else {
                data.files.forEach(file => {
                    html += `
                        <div class="card file-card" onclick="showFileContent('${bucketName}', '${file.file_path}', '${file.display_name}')">
                            <div class="file-name">📄 ${file.display_name}</div>
                            <div class="file-meta">Created: ${formatDate(file.created)} | Size: ${formatFileSize(file.size)}</div>
                        </div>
                    `;
                });
            }

            content.innerHTML = html;
        })
        .catch(error => {
            showError('Failed to load current release files: ' + error.message);
        });
}

function showReleaseFiles(bucketName, releaseTag) {
    currentView = 'release-files';
    currentRelease = releaseTag;
    navigationStack.push(() => showReleases(bucketName, currentProject.name));
    updateBreadcrumb(`Projects > ${currentProject.name} > ${releaseTag}`);
    showLoading('Loading release files...');
    
    fetch(`/api/v1/browse/projects/${bucketName}/releases/${releaseTag}/files`)
        .then(response => {
            if (!response.ok) throw new Error('Failed to fetch release files');
            return response.json();
        })
        .then(data => {
            const content = document.getElementById('content');
            let html = `
                <div class="stats">
                    <div class="stat-card">
                        <div class="stat-number">${data.mr_docs.length}</div>
                        <div class="stat-label">MR Documents</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number">${data.release_note ? 1 : 0}</div>
                        <div class="stat-label">Release Note</div>
                    </div>
                </div>
            `;

            // Release Note
            if (data.release_note) {
                html += `
                    <div class="card file-card" onclick="showFileContent('${bucketName}', '${data.release_note.file_path}', '${data.release_note.display_name}')">
                        <div class="file-name">📋 ${data.release_note.display_name}</div>
                        <div class="file-meta">Created: ${formatDate(data.release_note.created)} | Size: ${formatFileSize(data.release_note.size)}</div>
                    </div>
                `;
            }

            // MR Documentation
            if (data.mr_docs.length === 0 && !data.release_note) {
                html += `
                    <div class="card">
                        <h2>No Files Found</h2>
                        <p>This release doesn't have any documentation files yet.</p>
                    </div>
                `;
            } else {
                data.mr_docs.forEach(file => {
                    html += `
                        <div class="card file-card" onclick="showFileContent('${bucketName}', '${file.file_path}', '${file.display_name}')">
                            <div class="file-name">📄 ${file.display_name}</div>
                            <div class="file-meta">Created: ${formatDate(file.created)} | Size: ${formatFileSize(file.size)}</div>
                        </div>
                    `;
                });
            }

            content.innerHTML = html;
        })
        .catch(error => {
            showError('Failed to load release files: ' + error.message);
        });
}

// Update the showFileContent function
function showFileContent(bucketName, filePath, displayName) {
    // Show loading state while generating signed URL
    const content = document.getElementById('content');
    content.innerHTML = `
        <div class="card">
            <h2>📄 ${displayName}</h2>
            <div class="loading">Generating secure access link...</div>
        </div>
    `;
    
    // Generate signed URL
    fetch(`/api/v1/browse/projects/${bucketName}/files/${encodeURIComponent(filePath)}`)
        .then(response => {
            if (!response.ok) throw new Error('Failed to generate access link');
            return response.json();
        })
        .then(data => {
            // Show file info with options
            content.innerHTML = `
                <div class="card">
                    <h2>📄 ${displayName}</h2>
                    <div class="file-meta" style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                        <strong>Created:</strong> ${formatDate(data.created)} | 
                        <strong>Size:</strong> ${formatFileSize(data.size)} | 
                        <strong>Path:</strong> <code>${data.file_path}</code>
                    </div>
                    
                    <div class="file-actions" style="margin-bottom: 20px;">
                        <button class="action-btn primary" onclick="openFileInNewTab('${data.signed_url}', '${displayName}')">
                            🔗 Open Document
                        </button>
                        <button class="action-btn secondary" onclick="downloadFile('${data.signed_url}', '${displayName}')">
                            💾 Download
                        </button>
                        <button class="action-btn secondary" onclick="showFilePreview('${bucketName}', '${filePath}', '${displayName}')">
                            👁️ Preview
                        </button>
                    </div>
                    
                    <div class="file-info">
                        <p><strong>Direct Access:</strong> This link expires in ${data.expires_in}</p>
                        <p><strong>Security:</strong> Authenticated access via Google Cloud Storage</p>
                    </div>
                </div>
            `;
        })
        .catch(error => {
            content.innerHTML = `
                <div class="card">
                    <h2>📄 ${displayName}</h2>
                    <div class="error">Failed to generate access link: ${error.message}</div>
                    <button class="action-btn secondary" onclick="goBack()">← Go Back</button>
                </div>
            `;
        });
}

// New function to open file in new tab
function openFileInNewTab(signedUrl, displayName) {
    // Open in new tab with descriptive title
    const newTab = window.open(signedUrl, '_blank');
    if (newTab) {
        newTab.document.title = `CodeClarity - ${displayName}`;
    } else {
        // Fallback if popup blocker prevents new tab
        showNotification('Popup blocked. Please allow popups or copy the link manually.', 'warning');
    }
}

// New function to download file
function downloadFile(signedUrl, displayName) {
    const link = document.createElement('a');
    link.href = signedUrl;
    link.download = displayName + '.md';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotification('Download started!', 'success');
}

// New function for inline preview
function showFilePreview(bucketName, filePath, displayName) {
    const content = document.getElementById('content');
    
    // Update current view to show preview
    content.innerHTML = `
        <div class="card">
            <h2>📄 ${displayName} - Preview</h2>
            <div class="loading">Loading preview...</div>
        </div>
    `;
    
    fetch(`/api/v1/browse/projects/${bucketName}/files/${encodeURIComponent(filePath)}/preview`)
        .then(response => {
            if (!response.ok) {
                if (response.status === 413) {
                    throw new Error('File too large for preview (max 50KB)');
                }
                throw new Error('Failed to load preview');
            }
            return response.json();
        })
        .then(data => {
            content.innerHTML = `
                <div class="card">
                    <h2>📄 ${displayName} - Preview</h2>
                    <div class="file-meta" style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                        <strong>Created:</strong> ${formatDate(data.created)} | 
                        <strong>Size:</strong> ${formatFileSize(data.size)}
                    </div>
                    
                    <div class="file-actions" style="margin-bottom: 20px;">
                        <button class="action-btn secondary" onclick="showFileContent('${bucketName}', '${filePath}', '${displayName}')">
                            ← Back to File Options
                        </button>
                    </div>
                    
                    <div class="content-viewer">
                        <pre>${data.content}</pre>
                    </div>
                </div>
            `;
        })
        .catch(error => {
            content.innerHTML = `
                <div class="card">
                    <h2>📄 ${displayName} - Preview</h2>
                    <div class="error">Preview failed: ${error.message}</div>
                    <div class="file-actions" style="margin-top: 15px;">
                        <button class="action-btn secondary" onclick="showFileContent('${bucketName}', '${filePath}', '${displayName}')">
                            ← Back to File Options
                        </button>
                    </div>
                </div>
            `;
        });
}

// New notification function
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 1000;
        animation: slideIn 0.3s ease-out;
    `;
    
    switch(type) {
        case 'success':
            notification.style.background = '#4CAF50';
            break;
        case 'warning':
            notification.style.background = '#ff9800';
            break;
        case 'error':
            notification.style.background = '#f44336';
            break;
        default:
            notification.style.background = '#2196F3';
    }
    
    document.body.appendChild(notification);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Keep all your other existing functions...