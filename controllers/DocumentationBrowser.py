from fastapi import APIRouter, HTTPException
from google.cloud import storage
from typing import List, Dict, Any
import re
from datetime import datetime

browser_router = APIRouter(prefix="/api/v1/browse", tags=["Documentation Browser"])

@browser_router.get("/projects")
async def get_projects():
    """Get all available projects (buckets)"""
    try:
        storage_client = storage.Client()
        buckets = list(storage_client.list_buckets())
        
        projects = []
        for bucket in buckets:
            # Parse bucket name: "project_id-project_name"
            if '-' in bucket.name:
                parts = bucket.name.split('-', 1)
                if len(parts) == 2 and parts[0].isdigit():
                    projects.append({
                        "project_id": int(parts[0]),
                        "project_name": parts[1],
                        "bucket_name": bucket.name,
                        "display_name": f"{parts[1]} (ID: {parts[0]})"
                    })
        
        return {"projects": projects}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch projects: {str(e)}")

@browser_router.get("/projects/{bucket_name}/releases")
async def get_releases(bucket_name: str):
    """Get all releases for a project"""
    try:
        storage_client = storage.Client()
        bucket = storage_client.bucket(bucket_name)
        
        print(f"Checking bucket: {bucket_name}")
        
        # Get all blobs in releases/ to find release folders
        all_release_blobs = list(bucket.list_blobs(prefix="releases/"))
        
        # Extract unique release tags from blob paths
        release_tags = set()
        for blob in all_release_blobs:
            # Path format: releases/v1.2/filename or releases/v1.2/mr_docs/filename
            path_parts = blob.name.split('/')
            if len(path_parts) >= 3 and path_parts[0] == "releases":
                release_tag = path_parts[1]
                if release_tag:  # Make sure it's not empty
                    release_tags.add(release_tag)
        
        print(f"Found release tags: {release_tags}")
        
        releases = []
        for release_tag in release_tags:
            print(f"Processing release: {release_tag}")
            
            # Find release note file
            release_note_file = None
            release_note_blobs = [blob for blob in all_release_blobs 
                                if blob.name.startswith(f"releases/{release_tag}/") 
                                and blob.name.endswith('.md') 
                                and 'release-note' in blob.name.lower()]
            
            if release_note_blobs:
                blob = release_note_blobs[0]
                release_note_file = {
                    "name": blob.name,
                    "created": blob.time_created,
                    "size": blob.size
                }
                print(f"  Found release note: {blob.name}")
            
            # Count MR docs in mr_docs folder
            mr_docs_blobs = [blob for blob in all_release_blobs 
                           if blob.name.startswith(f"releases/{release_tag}/mr_docs/") 
                           and blob.name.endswith('.md')]
            mr_docs_count = len(mr_docs_blobs)
            
            print(f"  Found {mr_docs_count} MR docs")
            
            releases.append({
                "release_tag": release_tag,
                "release_note": release_note_file,
                "mr_docs_count": mr_docs_count,
                "path": f"releases/{release_tag}/"
            })
        
        # Sort by release tag (newest first)
        releases.sort(key=lambda x: x["release_tag"], reverse=True)
        
        print(f"Returning {len(releases)} releases")
        return {"releases": releases, "bucket_name": bucket_name}
    except Exception as e:
        print(f"Error in get_releases: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch releases: {str(e)}")

@browser_router.get("/projects/{bucket_name}/releases/{release_tag}/files")
async def get_release_files(bucket_name: str, release_tag: str):
    """Get all files for a specific release"""
    try:
        storage_client = storage.Client()
        bucket = storage_client.bucket(bucket_name)
        
        print(f"Getting files for release: {release_tag}")
        
        # Get all blobs for this release
        release_blobs = list(bucket.list_blobs(prefix=f"releases/{release_tag}/"))
        
        # Find release note
        release_note = None
        for blob in release_blobs:
            if (blob.name.endswith('.md') and 
                'release-note' in blob.name.lower() and 
                'mr_docs' not in blob.name):
                release_note = {
                    "file_path": blob.name,
                    "display_name": f"Release Note - {release_tag}",
                    "type": "release_note",
                    "created": blob.time_created.isoformat(),
                    "size": blob.size
                }
                print(f"  Found release note: {blob.name}")
                break
        
        # Get MR documentation files from mr_docs folder
        mr_docs = []
        for blob in release_blobs:
            if blob.name.startswith(f"releases/{release_tag}/mr_docs/") and blob.name.endswith('.md'):
                display_name = format_mr_filename(blob.name)
                mr_docs.append({
                    "file_path": blob.name,
                    "display_name": display_name,
                    "type": "mr_documentation", 
                    "created": blob.time_created.isoformat(),
                    "size": blob.size
                })
                print(f"  Found MR doc: {blob.name} -> {display_name}")
        
        # Sort MR docs by creation time (newest first)
        mr_docs.sort(key=lambda x: x["created"], reverse=True)
        
        print(f"Returning release note: {release_note is not None}, MR docs: {len(mr_docs)}")
        
        return {
            "release_tag": release_tag,
            "release_note": release_note,
            "mr_docs": mr_docs,
            "bucket_name": bucket_name
        }
    except Exception as e:
        print(f"Error in get_release_files: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch release files: {str(e)}")

@browser_router.get("/projects/{bucket_name}/current-release")
async def get_current_release_files(bucket_name: str):
    """Get files in current_release folder"""
    try:
        storage_client = storage.Client()
        bucket = storage_client.bucket(bucket_name)
        
        blobs = list(bucket.list_blobs(prefix="current_release/"))
        files = []
        
        for blob in blobs:
            if blob.name.endswith('.md'):
                display_name = format_mr_filename(blob.name)
                files.append({
                    "file_path": blob.name,
                    "display_name": display_name,
                    "type": "current_mr_documentation",
                    "created": blob.time_created.isoformat(),
                    "size": blob.size
                })
        
        # Sort by creation time (newest first)
        files.sort(key=lambda x: x["created"], reverse=True)
        
        return {
            "files": files,
            "bucket_name": bucket_name,
            "total_files": len(files)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch current release files: {str(e)}")

@browser_router.get("/projects/{bucket_name}/files/{file_path:path}")
async def get_file_signed_url(bucket_name: str, file_path: str):
    """Generate a signed URL for direct access to the file"""
    try:
        storage_client = storage.Client()
        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(file_path)
        
        if not blob.exists():
            raise HTTPException(status_code=404, detail="File not found")
        
        # Generate signed URL valid for 1 hour
        signed_url = blob.generate_signed_url(
            version="v4",
            expiration=datetime.utcnow() + timedelta(hours=1),
            method="GET"
        )
        
        return {
            "file_path": file_path,
            "signed_url": signed_url,
            "created": blob.time_created.isoformat(),
            "size": blob.size,
            "bucket_name": bucket_name,
            "expires_in": "1 hour"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate signed URL: {str(e)}")

# Add a new endpoint for preview (if you want inline preview option)
@browser_router.get("/projects/{bucket_name}/files/{file_path:path}/preview")
async def get_file_preview(bucket_name: str, file_path: str):
    """Get file content for inline preview (optional)"""
    try:
        storage_client = storage.Client()
        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(file_path)
        
        if not blob.exists():
            raise HTTPException(status_code=404, detail="File not found")
        
        # Limit preview to reasonable size (e.g., 50KB)
        if blob.size > 50000:
            raise HTTPException(status_code=413, detail="File too large for preview")
        
        content = blob.download_as_text()
        
        return {
            "file_path": file_path,
            "content": content,
            "created": blob.time_created.isoformat(),
            "size": blob.size,
            "bucket_name": bucket_name
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch file preview: {str(e)}")

def format_mr_filename(file_path: str) -> str:
    """Convert complex filename to user-friendly display name"""
    # Extract filename from path
    filename = file_path.split('/')[-1].replace('.md', '')
    
    # Parse: timestamp_sha_branch format
    parts = filename.split('_')
    
    if len(parts) >= 3:
        timestamp = parts[0]
        # Convert timestamp to readable date
        try:
            if len(timestamp) >= 8:  # YYYYMMDD format
                dt = datetime.strptime(timestamp[:8], "%Y%m%d")
                date_str = dt.strftime("%B %d, %Y")
            else:
                date_str = "Unknown Date"
        except:
            date_str = "Unknown Date"
        
        # Get branch name (everything after second underscore)
        branch_name = "_".join(parts[2:])
        
        # Clean up branch name
        branch_display = branch_name.replace('-', ' ').replace('_', ' ').title()
        
        return f"{branch_display} - {date_str}"
    
    # Fallback for unexpected formats
    return filename.replace('_', ' ').replace('-', ' ').title()


@browser_router.get("/projects/{bucket_name}/files/{file_path:path}")
async def get_file_access(bucket_name: str, file_path: str):
    """Get file access - tries signed URL first, falls back to direct content"""
    try:
        storage_client = storage.Client()
        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(file_path)
        
        if not blob.exists():
            raise HTTPException(status_code=404, detail="File not found")
        
        # Try to generate signed URL first
        try:
            signed_url = blob.generate_signed_url(
                version="v4",
                expiration=datetime.utcnow() + timedelta(hours=1),
                method="GET"
            )
            
            return {
                "access_type": "signed_url",
                "file_path": file_path,
                "signed_url": signed_url,
                "created": blob.time_created.isoformat(),
                "size": blob.size,
                "bucket_name": bucket_name,
                "expires_in": "1 hour"
            }
        except Exception as signed_url_error:
            print(f"Signed URL generation failed: {signed_url_error}")
            print("Falling back to direct content serving...")
            
            # Fallback: serve content directly through API
            content = blob.download_as_text()
            
            return {
                "access_type": "direct_content",
                "file_path": file_path,
                "content": content,
                "created": blob.time_created.isoformat(),
                "size": blob.size,
                "bucket_name": bucket_name,
                "fallback_reason": "Signed URL not available with current authentication"
            }
            
    except Exception as e:
        print(f"Error in get_file_access: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to access file: {str(e)}")

# Keep the preview endpoint as backup
@browser_router.get("/projects/{bucket_name}/files/{file_path:path}/download")
async def download_file_content(bucket_name: str, file_path: str):
    """Direct download endpoint"""
    try:
        storage_client = storage.Client()
        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(file_path)
        
        if not blob.exists():
            raise HTTPException(status_code=404, detail="File not found")
        
        content = blob.download_as_text()
        
        # Return content with proper headers for download
        from fastapi.responses import Response
        
        filename = file_path.split('/')[-1]
        headers = {
            "Content-Disposition": f"attachment; filename={filename}",
            "Content-Type": "text/markdown"
        }
        
        return Response(content=content, headers=headers)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to download file: {str(e)}")