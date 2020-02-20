from pathlib import Path
import urllib.request
import os

def createFilePath(filePath):
    Path(filePath).mkdir(parents=True, exist_ok=True)


def downloadCSV(url, filePath, fileName):
    createFilePath(filePath)
    # https://stackoverflow.com/questions/19602931/basic-http-file-downloading-and-saving-to-disk-in-python
    urllib.request.urlretrieve(url, os.path.join(filePath, fileName))
