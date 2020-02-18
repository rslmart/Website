import csv
import os
import pymongo

myclient = pymongo.MongoClient("mongodb://localhost:27017/")
mydb = myclient["mydatabase"]
mycol = mydb["images"]
mycol.drop()


def isInt(s):
    try:
        int(s)
        return True
    except ValueError:
        return False


def parseRow(row):
    keys = ['season', 'basin', 'storm_number', 'storm_agency', 'storm_name', 'type', 'sensor', 'resolution', 'image',
            'imageUrl']
    rowDict = {}
    try:
        if len(row) == 12:
            # fix image
            row[8] = row[8] + '.' + row[9]
            # image url
            row[10] = row[10] + ',' + row[11]
            row = row[:9] + [row[10]]
        for i in range(len(row)):
            rowDict[keys[i]] = row[i]
        additionalKeys = ['year', 'month', 'day', 'hour', 'minute', 'second', 'satellite', 'extension']
        image = row[8].split('.')
        if len(image[0]) >= 8:
            if isInt(image[0][-8:-4]):
                rowDict['year'] = int(image[0][-8:-4])
            if isInt(image[0][-4:-2]):
                rowDict['month'] = int(image[0][-4:-2])
            if isInt(image[0][-2:]):
                rowDict['day'] = int(image[0][-2:])
        if len(image[1]) >= 4:
            if isInt(image[1][:2]):
                rowDict['hour'] = int(image[1][:2])
            if isInt(image[1][2:4]):
                rowDict['minute'] = int(image[1][2:4])
            if len(image[1]) >= 6:
                if isInt(image[1][4:]):
                    rowDict['second'] = int(image[1][4:])
        if len(image[2]) > 0:
            rowDict['satellite'] = image[2]
        rowDict['extension'] = image[-1]
        return rowDict
    except Exception as e:
        print(e)
        print(row)
    # print(rowDict)


print('Counting')
totalSize = sum(1 for line in open(os.path.join('..', 'Data', 'navy', 'tcdat.csv')))

print('Inserting %d records' % totalSize)
with open(os.path.join('..', 'Data', 'navy', 'tcdat.csv'), 'r') as csvfile:
    reader = csv.reader(csvfile)
    header = next(reader)  # skip header

    batch_size = 500
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
        batch.append(parseRow(row))
        count += 1
    if batch:
        x = mycol.insert_many(batch)
        pass
