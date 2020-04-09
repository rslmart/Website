import csv
import pymongo
import datetime
import re
import os
import pickle
from multiprocessing import Pool
import traceback

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
                images = list(imagesDB.find(
                    {'$and': [{'season': season}, {'basin': basin}, {'storm_name': storm}]}).sort('date'))
                ibtracs = list(ibtracsDB.find({'sid': id}).sort('date'))
                print(season, basin, storm, mapping[season][basin][storm], len(images), len(ibtracs))
                pointer = 0
                for image in images:
                    try:
                        matched = False
                        while not matched:
                            if ((pointer + 1 == len(ibtracs) - 1 and image['date'] >= ibtracs[pointer + 1]['date']) or
                                    (pointer == 0 and image['date'] <= ibtracs[pointer]['date']) or
                                    (ibtracs[pointer]['date'] <= image['date'] <= ibtracs[pointer + 1]['date'])):
                                firstDiff = abs(ibtracs[pointer]['date'] - image['date'])
                                secondDiff = abs(ibtracs[pointer + 1]['date'] - image['date'])
                                correctPointer = 0
                                if firstDiff <= secondDiff:
                                    correctPointer = pointer
                                else:
                                    correctPointer = pointer + 1
                                image['ibtracs'] = ibtracs[correctPointer]['_id']
                                # TODO: Only add image if it is within 30 minutes of the ibtracs point
                                if 'imageIds' in ibtracs[correctPointer]:
                                    ibtracs[correctPointer]['imageIds'].append(image['_id'])
                                else:
                                    ibtracs[correctPointer]['imageIds'] = [image['_id']]
                                matched = True
                            else:
                                pointer += 1
                    except Exception:
                        print("Pointer: ", pointer, "Length: ", len(ibtracs))
                        print("Image Date: ", image['date'])
                        print("First Ibtracs Date: ", ibtracs[0]['date'])
                        print("Ibtracs Dates: ", [str(a['date']) for a in ibtracs[pointer - 1:]])
                        print(traceback.format_exc())

                    imagesDB.replace_one({'_id': image['_id']}, image)
                for ibtrac in ibtracs:
                    if 'imageIds' in ibtrac:
                        ibtrac['imageIds'] = list(set(ibtrac['imageIds']))
                        ibtracsDB.replace_one({'_id': ibtrac['_id']}, ibtrac)

if __name__ == '__main__':
    with Pool(4) as p:
        result = p.map(main, mapping.keys())
