import csv
import os
import pymongo

myclient = pymongo.MongoClient("mongodb://localhost:27017/")
mydb = myclient["mydatabase"]
mycol = mydb["ibtracs"]
filePath = os.path.join('..', 'Data', 'ibtracs', 'ibtracs.ALL.csv')

def isInt(s):
    try:
        int(s)
        return True
    except ValueError:
        return False

def isFloat(s):
    try:
        float(s)
        return True
    except ValueError:
        return False

def parseRow(header, row):
    rowDict = {}
    for i in range(len(header)):
        if isInt(row[i]):
            rowDict[header[i]] = int(row[i])
        elif isFloat(row[i]):
            rowDict[header[i]] = float(row[i])
        else:
            if row[i].strip():
                rowDict[header[i]] = row[i]
    return rowDict

print('Counting')
totalSize = sum(1 for line in open(filePath))

print('Inserting %d records' % totalSize)
with open(filePath, 'r') as csvfile:
    reader = csv.reader(csvfile)
    header = map(lambda h: h.lower(), next(reader))  # skip header
    units = next(reader)

    batch_size = 10000
    batch = []
    count = 0
    totalCount = 0

    for row in reader:
        if count >= batch_size:
            x = mycol.insert_many(batch)
            totalCount += count
            print('Inserted {:d} ({:.2f} %)'.format(totalCount, (totalCount / totalSize) * 100))
            batch = []
            count = 0
        batch.append(parseRow(header, row))
        count += 1
    if batch:
        x = mycol.insert_many(batch)
        pass