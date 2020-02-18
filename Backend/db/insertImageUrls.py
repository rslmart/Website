import csv
import os
#import pymongo

#myclient = pymongo.MongoClient("mongodb://localhost:27017/")
#mydb = myclient["mydatabase"]
#mycol = mydb["imageUrls"]

def parseRow(row):
    keys = ['season', 'basin', 'storm', 'type', 'sensor', 'resolution', 'image', 'imageUrl']
    print(row)
    rowDict = {}
    for i in range(len(row)):
        if i == 2:
            rowDict[keys[i]] = row[i]
        else:
            rowDict[keys[i]] = row[i]
    additionalKeys = ['year', 'month', 'day', 'hour', 'minute', 'second', 'satellite', 'extension']
    image = row[6].split('.')
    if len(image[0]) >= 8:
        rowDict['year'] = image[0][-8:-4]
        rowDict['month'] = image[0][-4:-2]
        rowDict['day'] = image[0][-2:]
    if len(image[1]) >= 4:
        rowDict['hour'] = image[1][:2]
        rowDict['minute'] = image[1][2:4]
        if len(image[1]) >= 6:
            rowDict['second'] = image[1][4:]
    if len(image[2]) > 0:
        rowDict['satellite'] = image[2]
    rowDict['extension'] = image[-1]
    print(rowDict)

with open(os.path.join('..','Data','navy','tcdat.csv'), 'r') as csvfile:
    reader = csv.reader(csvfile)
    header = next(reader)  # skip header

    batch_size = 100
    batch = []
    count = 0

    for row in reader:
        if count >= batch_size:
            # put in db
            batch = []
            count = 0
        batch.append(parseRow(row))
        count += 1
        break
    if batch:
        pass

# x = mycol.insert_many(mylist)

#print list of the _id values of the inserted documents:
#print(x.inserted_ids)