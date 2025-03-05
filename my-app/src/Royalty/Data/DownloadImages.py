import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin
import json
import os
from PIL import Image
import imghdr


def download_image_from_page(image_id, save_path, max_retries=3):
    headers = {'User-Agent': 'MonarchyBot/0.1 (makoa1693@gmail.com)'}
    page_url = f"https://commons.wikimedia.org/wiki/File:{image_id}"

    for attempt in range(max_retries + 1):
        try:
            # 1. Fetch the webpage with retry
            response = requests.get(page_url, headers=headers)
            response.raise_for_status()

            # 2. Parse HTML to find the <img> tag
            soup = BeautifulSoup(response.content, 'html.parser')
            img_tag = soup.find('img', {'alt': f'File:{image_id}'})

            if not img_tag:
                raise ValueError(f"Image tag for {image_id} not found")

            # 3. Get the src attribute with proper URL joining
            img_url = img_tag.get('src')
            full_img_url = urljoin(page_url, img_url)  # Fixed base URL

            # 4. Download the image with retry
            img_response = requests.get(full_img_url, headers=headers, stream=True)
            img_response.raise_for_status()

            # Save the image
            with open(save_path, 'wb') as f:
                for chunk in img_response.iter_content(chunk_size=8192):
                    f.write(chunk)

            print(f"Image downloaded to {save_path}")
            return  # Success - exit function

        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 403:
                print(f"403 Forbidden error (attempt {attempt + 1}/{max_retries})")
            else:
                raise  # Re-raise non-403 errors
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout):
            print(f"Network error (attempt {attempt + 1}/{max_retries})")

        # Exponential backoff if we have retries left
        if attempt < max_retries:
            wait_time = 2 ** attempt  # Exponential backoff (1s, 2s, 4s, etc.)
            print(f"Retrying in {wait_time} seconds...")
            time.sleep(wait_time)

    # If all retries failed
    raise Exception(f"Failed to download image after {max_retries} attempts")

def download_all_monarch_iamges():
    with open('./data/monarchy_data.json', 'r') as file:
        data = json.load(file)
    for person in data.values():

        if 'image' in person and len(person['image']) > 0:
            image_path = '../../../public/monarchy/{}.{}'.format(person['id'], person['image'][0].split('.')[-1])
            if not os.path.exists(image_path):
                try:
                    download_image_from_page(person['image'][0], image_path)
                except Exception as e:
                    print("Error downloading image:", person['id'], person['image'][0], e)

def convert_to_jpg(directory, quality=85):
    """
    Convert all non-JPG images in a directory to JPG format.

    Args:
        directory (str): Path to directory containing images
        quality (int): JPEG quality setting (1-100)
    """
    converted_count = 0
    error_count = 0

    for filename in os.listdir(directory):
        file_path = os.path.join(directory, filename)

        # Skip directories and non-image files
        if os.path.isdir(file_path):
            continue

        # Verify it's an image file
        try:
            image_type = imghdr.what(file_path)
            if not image_type:
                continue  # Not an image file
        except Exception as e:
            print(f"Skipping {filename}: {str(e)}")
            continue

        # Skip existing JPG files
        if image_type.lower() in ['jpeg', 'jpg']:
            continue

        # Generate new filename
        base_name = os.path.splitext(filename)[0]
        output_path = os.path.join(directory, f"{base_name}.jpg")

        try:
            with Image.open(file_path) as img:
                # Convert to RGB if necessary (for PNG transparency)
                if img.mode in ('RGBA', 'P'):
                    img = img.convert('RGB')

                # Save as JPG
                img.save(output_path, 'JPEG', quality=quality)
                converted_count += 1
                print(f"Converted {filename} to {base_name}.jpg")

        except Exception as e:
            error_count += 1
            print(f"Error converting {filename}: {str(e)}")

    print(f"\nConversion complete! {converted_count} files converted, {error_count} errors")

if __name__ == '__main__':
    convert_to_jpg('../../../public/monarchy')