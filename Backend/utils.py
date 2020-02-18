from pathlib import Path
from contextlib import closing
import csv
import requests
import os

def createFilePath(filePath):
    Path(filePath).mkdir(parents=True, exist_ok=True)


def downloadCSV(url, filePath, fileName):
    createFilePath(filePath)
    # https://stackoverflow.com/questions/35371043/use-python-requests-to-download-csv\
    with open(os.path.join(filePath,fileName), 'w') as file:
        writer = csv.writer(file)
        with closing(requests.get(url, stream=True)) as r:
            reader = csv.reader(r.iter_lines(), delimiter=',', quotechar='"')
            for row in reader:
                writer.writerow(row)
