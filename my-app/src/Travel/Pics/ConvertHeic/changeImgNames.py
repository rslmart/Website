from os import listdir, rename, getcwd
from os.path import isfile, join

if __name__ == '__main__':
    img_path = getcwd()
    onlyfiles = [f for f in listdir(img_path) if isfile(join(img_path, f))]
    onlyfiles.sort(key = lambda x: x.replace('IMG_','').replace('.JPG',''))
    i = 0
    for file in onlyfiles:
        rename(file, "{}.JPG".format(i))
        i += 1