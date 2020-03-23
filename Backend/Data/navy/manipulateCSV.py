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
    if (isfile('tcdat.csv')):
        os.remove('tcdat.csv')
    for file in onlyfiles:
        print(file)
        with open(os.path.join(mypath, file)) as csvFile:
            reader = csv.reader(csvFile)
            next(reader)
            with open('tcdat.csv', 'a') as tcdatCSV:
                for row in reader:
                    if len(row) > 7:
                        print(row)
                    storm = row[2].split('.')
                    stormNumber = storm[0][:2]
                    stormAgency = ''
                    if len(storm[1]) > 0:
                        stormAgency = storm[0][2:]
                    stormName = storm[1]
                    toWrite = row[0:2] + [stormNumber, stormAgency, stormName] + row[3:]
                    imageUrl = filter(lambda x: x != 'none', row)
                    imageUrl = '/'.join(imageUrl)
                    imageUrl = 'https://www.nrlmry.navy.mil/tcdat/' + imageUrl
                    if len((','.join(toWrite) + ',' + imageUrl).split(',')) == 12:
                        toWrite[-1] = toWrite[-1].replace(',', '.')
                        imageUrl = imageUrl.replace(',', '{replace}')
                    if 'LATEST' not in imageUrl:
                        tcdatCSV.write(','.join(toWrite) + ',' + imageUrl + '\n')

if __name__ == '__main__':
    try:
        combineCSVs()
    except KeyboardInterrupt:
        pass