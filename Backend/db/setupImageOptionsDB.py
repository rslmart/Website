import csv
import datetime
import os
import pymongo
import re

myclient = pymongo.MongoClient("mongodb://localhost:27017/")
mydb = myclient["mydatabase"]
mycol = mydb["imageOptions"]
mycol.drop()

keys = ['imageCount','season','resolution','basin','storm_name','type','sensor','beginDate','endDate','satellites','extensions']

def parseRow(row):
    try:
        rowDict = {}
        for i in range(len(keys)):
            if row[i] != '':
                if i == 4:
                    rowDict[keys[i]] = row[i].split('.')[1]
                elif i == 9 or i == 10:
                    rowDict[keys[i]] = row[i].strip('][').replace("'","").split(', ')
                elif i == 0 or i == 1:
                    rowDict[keys[i]] = int(row[i])
                elif 'Date' in keys[i]:
                    rowDict[keys[i]] = datetime.datetime.strptime(row[i], "%Y-%m-%d %H:%M:%S")
                else:
                    rowDict[keys[i]] = row[i]
        if 'beginDate' in rowDict and 'endDate' not in rowDict:
            rowDict['endDate'] = rowDict['beginDate']
        return rowDict
    except Exception as e:
        print(row)
        print(rowDict)
        print(e)
        exit()

print('Counting')
totalSize = sum(1 for line in open(os.path.join('..', 'Data', 'navy', 'options.csv')))

print('Inserting %d records' % totalSize)
with open(os.path.join('..', 'Data', 'navy', 'options.csv'), 'r') as csvfile:
    reader = csv.reader(csvfile)
    header = next(reader)  # skip header

    batch_size = 10000
    batch = []
    count = 0
    totalCount = 0

    withDate = 0

    for row in reader:
        if count >= batch_size:
            mycol.insert_many(batch)
            totalCount += count
            print('Inserted {:d} ({:.2f} %)'.format(totalCount, (totalCount / totalSize) * 100))
            batch = []
            count = 0
        rowDict = parseRow(row)
        if 'beginDate' not in rowDict:
            print(rowDict)
        else:
            batch.append(rowDict)
            count += 1
    if batch:
        mycol.insert_many(batch)

    print('Inserted {:d} ({:.2f} %)'.format(totalCount, (totalCount / totalSize) * 100))

