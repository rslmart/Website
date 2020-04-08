import csv
import pymongo
import datetime
import re
import os
import pickle
from multiprocessing import Pool

with open('stormMapping.p', 'rb') as file:
    mapping = pickle.load(file)

def main(season):
    myclient = pymongo.MongoClient("mongodb://localhost:27017/")
    mydb = myclient["mydatabase"]
    ibtracsDB = mydb["ibtracs"]
    imagesDB = mydb["images"]
    for basin in mapping[season]:
        for storm in mapping[season][basin]:
            id = mapping[season][basin][storm]
            if id != '':
                print(season, basin, storm, mapping[season][basin][storm])
                images = list(imagesDB.find(
                    {'$and': [{'season': season}, {'basin': basin}, {'storm_name': storm}]}).sort('date'))
                ibtracs = list(ibtracsDB.find({'sid': id}).sort('date'))
                pointer = 0
                for image in images:
                    matched = False
                    while not matched:
                        if ((ibtracs[pointer]['date'] < image['date'] < ibtracs[pointer + 1]['date']) or
                                (pointer + 2 == len(ibtracs) and image['date'] < ibtracs[pointer]['date']) or
                                (pointer == 0 and image['date'] > ibtracs[pointer]['date'])):
                            try:
                                firstDiff = abs(ibtracs[pointer]['date'] - image['date'])
                                secondDiff = abs(ibtracs[pointer + 1]['date'] - image['date'])
                                correctPointer = 0
                                if firstDiff <= secondDiff:
                                    correctPointer = pointer
                                else:
                                    correctPointer = pointer + 1
                                images['ibtracs'] = ibtracs[correctPointer]['_id']
                                if 'imageIds' in ibtracs[correctPointer]:
                                    ibtracs[correctPointer]['imageIds'].push(image['_id'])
                                else:
                                    ibtracs[correctPointer]['imageIds'] = [image['_id']]
                            except Exception as e:
                                print(e)
                                print(correctPointer, pointer, len(ibtracs))
                                print(ibtracs[pointer:])
                                exit()
                            matched = True
                        else:
                            pointer += 1
                    imagesDB.replace_one({'_id': image['_id']}, image)
                for ibtrac in ibtracs:
                    ibtrac['imageIds'] = list(set(ibtrac['imageIds']))
                    ibtracsDB.replace_one({'_id': ibtrac['_id']}, ibtrac)

if __name__ == '__main__':
    with Pool(4) as p:
        result = p.map(main, mapping.keys())
