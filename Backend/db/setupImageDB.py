import csv
import datetime
import os
import pymongo
import re

myclient = pymongo.MongoClient("mongodb://localhost:27017/")
mydb = myclient["mydatabase"]
mycol = mydb["images"]
mycol.drop()

ibtracs2imagesBasin = {'EP': 'EPAC',
                       'NA': 'ATL',
                       'NI': 'IO',
                       'SA': 'SHEM',
                       'SI': 'SHEM',
                       'SP': 'SHEM',
                       'WP': 'WPAC'}

def isInt(s):
    try:
        int(s)
        return True
    except ValueError:
        return False


def parseRow(row):
    keys = ['season', 'basin', 'storm_number', 'storm_agency', 'storm_name', 'type', 'sensor', 'resolution', 'image',
            'image_url']
    rowDict = {}
    try:
        if len(row) == 12:
            # fix image
            row[8] = row[8] + '.' + row[9]
            # image url
            row[10] = row[10] + ',' + row[11]
            row = row[:9] + [row[10]]
        for i in range(len(row)):
            if keys[i] == 'image_url':
                row[i] = row[i].replace(':', ',')
            rowDict[keys[i]] = row[i]
            if keys[i] == 'season':
                if row[i][2] == '9':
                    rowDict[keys[i]] = int('19' + row[i][2:])
                else:
                    rowDict[keys[i]] = int('20' + row[i][2:])
        additionalKeys = ['year', 'month', 'day', 'hour', 'minute', 'second', 'satellite', 'extension']
        # from_date = datetime.datetime(2010, 12, 31, 12, 30, 30, 125000)
        # to_date = datetime.datetime(2011, 12, 31, 12, 30, 30, 125000)
        #
        # for post in posts.find({"date": {"$gte": from_date, "$lt": to_date}}):
        #     print(post)
        image = row[8].split('.')
        if len(image[0]) >= 8:
            if isInt(image[0][-8:-4]):
                rowDict['year'] = int(image[0][-8:-4])
                if isInt(image[0][-4:-2]):
                    rowDict['month'] = int(image[0][-4:-2])
                    if isInt(image[0][-2:]):
                        rowDict['day'] = int(image[0][-2:])
                        date = datetime.datetime(rowDict['year'], rowDict['month'], rowDict['day'])
                        if len(image[1]) >= 4:
                            if isInt(image[1][:2]):
                                rowDict['hour'] = int(image[1][:2])
                                date = datetime.datetime(rowDict['year'], rowDict['month'], rowDict['day'], rowDict['hour'])
                            if isInt(image[1][2:4]):
                                rowDict['minute'] = int(image[1][2:4])
                                date = datetime.datetime(rowDict['year'], rowDict['month'], rowDict['day'], rowDict['hour'],
                                                         rowDict['minute'])
                                if len(image[1]) >= 6:
                                    if isInt(image[1][4:]):
                                        rowDict['second'] = int(image[1][4:])
                                        date = datetime.datetime(rowDict['year'], rowDict['month'], rowDict['day'],
                                                                 rowDict['hour'], rowDict['minute'], rowDict['second'])
                        rowDict['date'] = date
        if len(image[2]) > 0:
            rowDict['satellite'] = image[2]
            if re.fullmatch('[\d]{8}$', image[2]):
                rowDict['satellite'] = image[4]
        rowDict['extension'] = image[-1]
        return rowDict
    except Exception as e:
        print(e)
        print(rowDict)
        print(row)
    # print(rowDict)


print('Counting')
totalSize = sum(1 for line in open(os.path.join('..', 'Data', 'navy', 'tcdat.csv')))

print('Inserting %d records' % totalSize)
with open(os.path.join('..', 'Data', 'navy', 'tcdat.csv'), 'r') as csvfile:
    reader = csv.reader(csvfile)
    header = next(reader)  # skip header

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
        batch.append(parseRow(row))
        count += 1
    if batch:
        x = mycol.insert_many(batch)
        pass
