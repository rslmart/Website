import csv
import re
import pymongo
import datetime
import os

if __name__ == '__main__':
    myclient = pymongo.MongoClient("mongodb://localhost:27017/")
    mydb = myclient["mydatabase"]
    mycol = mydb["hurdat"]
    mycol.drop()
    filePath = os.path.join('..', 'Data', 'hurdat', 'hurdat2-1851-2019-052520.csv')

    print('Counting')
    totalSize = sum(1 for line in open(filePath))

    print('Inserting %d records' % totalSize)
    with open(filePath, 'r') as csvfile:
        reader = csv.reader(csvfile)
        batch_size = 1000
        batch = []
        count = 0
        totalCount = 0

        headerPattern = re.compile(r'AL[0-9]{6}')
        numberPattern = re.compile(r'[^0-9\.]')

        headerDict = {}
        for row in reader:
            if count >= batch_size:
                x = mycol.insert_many(batch)
                totalCount += count
                print('Inserted {:d} ({:.2f} %)'.format(totalCount, (totalCount / totalSize) * 100))
                batch = []
                count = 0
            # basin, cyclone number, year, name, number of entries, entries
            # entries stored as a list of dicts
            # record contain year, month, day, hours, minutes, recordType, systemStatus, lat, lon, wind, press, 34 ne,
            # se, sw, nw, 50, 64
            # dicts datetime, recordType, systemStatus, position, wind, press, 34 kn array, 50 kn array, 64 kn array
            if re.match(headerPattern, row[0]):  # Finds header
                headerDict = {'stormID': row[0], 'basin': row[0][:2], 'number': int(row[0][2:4]),
                              'season': int(row[0][4:9]), 'name': row[1], 'recordCount': int(row[2])}
            else:
                rowDict = dict(headerDict)
                rowDict['_id'] = f"{rowDict['stormID']}{row[0][4:]}{row[1]}"
                rowDict['datetime'] = datetime.datetime(
                    int(row[0][:4]), int(row[0][4:6]), int(row[0][6:]), int(row[1][:2]), int(row[1][2:]))
                rowDict['recordType'] = row[2]
                rowDict['systemStatus'] = row[3]
                rowDict['position'] = [float(re.sub(numberPattern, '', row[4])),
                                       float(f"-{re.sub(numberPattern, '', row[5])}")]
                keys = ['wind', 'pres', '34ne', '34se', '34sw', '34nw', '50ne', '50se', '50sw', '50nw', '64ne', '64se',
                        '64sw', '64nw']
                colNum = 6
                for key in keys:
                    if row[colNum] != '-999':
                        rowDict[key] = int(row[colNum])
                    colNum += 1
                batch.append(rowDict)
                count += 1
        if batch:
            x = mycol.insert_many(batch)
            pass
    mycol.find_one_and_update(
        {'_id': "1997216N200911997-08-05030000"},
        {'$set': {'pres': 996, 'newdelhi_pres': 996, 'wmo_pres': 996}}
    )