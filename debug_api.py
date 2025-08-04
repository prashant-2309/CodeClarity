import requests

def test_releases():
    bucket_name = "72249023-cc-demo"
    base_url = "http://localhost:8000"
    
    print("=== TESTING RELEASE DETECTION ===\n")
    
    # Test releases endpoint
    response = requests.get(f"{base_url}/api/v1/browse/projects/{bucket_name}/releases")
    print(f"Releases API Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"Found {len(data['releases'])} releases:")
        
        for release in data['releases']:
            print(f"\n  Release: {release['release_tag']}")
            print(f"  Release Note: {'✅' if release['release_note'] else '❌'}")
            print(f"  MR Docs: {release['mr_docs_count']}")
            
            # Test individual release files
            files_response = requests.get(f"{base_url}/api/v1/browse/projects/{bucket_name}/releases/{release['release_tag']}/files")
            if files_response.status_code == 200:
                files_data = files_response.json()
                print(f"  Files API: ✅")
                print(f"    Release Note: {'✅' if files_data['release_note'] else '❌'}")
                print(f"    MR Docs: {len(files_data['mr_docs'])}")
                
                # Show MR doc names
                for mr_doc in files_data['mr_docs']:
                    print(f"      - {mr_doc['display_name']}")
            else:
                print(f"  Files API: ❌ {files_response.status_code}")
    else:
        print(f"Error: {response.text}")

if __name__ == "__main__":
    test_releases()