from PIL import Image
from pillow_heif import register_heif_opener
from os import listdir
from os.path import isfile, join

register_heif_opener()

mypath = './from'

if __name__ == '__main__':
    onlyfiles = [f for f in listdir(mypath) if isfile(join(mypath, f))]
    for file in onlyfiles:
        print("Converting {}".format(file))
        image = Image.open(join(mypath, file))
        print(image.info)
        image.save(join('./to', file.replace('.HEIC', '.jpg')), format("JPEG"))