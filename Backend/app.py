from flask import Flask, jsonify, request
import pymongo
from flask_cors import CORS
from multiprocessing import Pool
import time

app = Flask(__name__)
CORS(app)

myclient = pymongo.MongoClient("mongodb://localhost:27017/")
mydb = myclient["mydatabase"]
imagesCol = mydb["images"]
ibtracsCol = mydb["ibtracs"]


def func(item):
    a = pymongo.MongoClient("mongodb://localhost:27017/")["mydatabase"]["images"].find(item[1])
    return a.distinct(item[0])

@app.route('/')
def hello_world():
    return 'Hello World!'

@app.route('/images/imageCount', methods=['POST'])
def imageCount():
    query = request.get_json()
    print(query)
    return jsonify({'count': imagesCol.find(query).count()})

@app.route('/images/allOptions', methods=['GET'])
def imageAllOptions():
    keys = ['season', 'basin', 'storm_number', 'storm_agency', 'storm_name', 'type', 'sensor', 'resolution', 'satellite', 'satellite']
    options = {}
    for key in keys:
        options[key] = imagesCol.distinct(key)
    return jsonify({'options': options})

@app.route('/images/options', methods=['POST'])
def imageOptions():
    requestTime = time.time()
    keys = ['season', 'basin', 'storm_number', 'storm_agency', 'storm_name', 'type', 'sensor', 'resolution', 'satellite', 'extension']
    requestJson = request.get_json()
    print(requestJson)
    queryResult = imagesCol.find(requestJson["query"])
    # Expensive, takes 7 secs with 1M records
    beginDate = queryResult.sort([("date" , 1)]).limit(1)[0]['date']
    endDate = queryResult.sort([("date" , -1)]).limit(1)[0]['date']
    print(beginDate, endDate)
    options = {}
    arr = [(key, requestJson["query"]) for key in keys if key not in requestJson["keys"]]
    with Pool(4) as p:
        result = p.map(func, arr)
    for i in range(len(arr)):
        options[arr[i][0]] = result[i]
    return jsonify({
        'requestTime': requestTime,
        'options': options,
        'beginDate': str(beginDate),
        'endDate': str(endDate)
    })

@app.route('/images/query', methods=['POST'])
def imageQuery():
    requestJson = request.get_json()
    print(requestJson)
    query = requestJson["query"]
    output = []
    count = 0
    for s in imagesCol.find(query):
        del s['_id']
        del s['date']
        output.append(s)
        count += 1
        if count > 2000:
             break
    print(output)
    return jsonify({'imageItems': output})


if __name__ == '__main__':
    app.run()