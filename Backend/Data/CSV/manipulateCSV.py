import csv
import os
from os.path import isfile, join

def printCSV(csvPath):
    with open(csvPath) as csvFile:
        reader = csv.reader(csvFile)
        for row in reader:
            print(row)

def combineCSVs():
    mypath = './tcXX'
    onlyfiles = [f for f in os.listdir(mypath) if isfile(join(mypath, f))]
    os.remove('tcdat.csv')
    for file in onlyfiles:
        print(file)
        with open(os.path.join(mypath, file)) as csvFile:
            reader = csv.reader(csvFile)
            with open('tcdat.csv', 'a') as tcdatCSV:
                for row in reader:
                    if row != ['season', 'basin', 'storm', 'type', 'satellite', 'resolution', 'image']:
                        imageUrl = filter(lambda x: x != 'none', row)
                        imageUrl = '/'.join(imageUrl)
                        imageUrl = 'https://www.nrlmry.navy.mil/tcdat/' + imageUrl
                        tcdatCSV.write(','.join(row) + ',' + imageUrl + '\n')

if __name__ == '__main__':
    try:
        combineCSVs()
    except KeyboardInterrupt:
        pass