from exif import Image
import json
from os import listdir, getcwd
from os.path import isfile, join

def is_jsonable(x):
    try:
        json.dumps(x)
        return True
    except:
        return False

def decimal_coords(coords, ref):
 decimal_degrees = coords[0] + coords[1] / 60 + coords[2] / 3600
 if ref == 'S' or ref == 'W':
     decimal_degrees = -decimal_degrees
 return decimal_degrees

if __name__ == '__main__':
    img_path = getcwd()
    pics_info = {}
    onlyfiles = [f for f in listdir(img_path) if isfile(join(img_path, f))]
    for file in onlyfiles:
        print(file)
        with open(join(img_path, file), 'rb') as src:
            img = Image(src)
            if img.has_exif:
                try:
                    info = {}
                    for key in img.list_all():
                        if is_jsonable(img.get(key)):
                            info[key] = img.get(key)
                    info['lat'] = decimal_coords(img.gps_latitude, img.gps_latitude_ref)
                    info['lon'] = decimal_coords(img.gps_longitude, img.gps_longitude_ref)
                    pics_info[file] = info
                except AttributeError:
                    print('No Coordinates')
            else:
                print('The Image has no EXIF information')
    print(pics_info)
    with open(join(img_path, 'data.json'), 'w') as fp:
        json.dump(pics_info, fp)